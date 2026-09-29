'use client'

/**
 * Browser side of a multi-guest room (LiveKit SFU). Used by the host tab and by
 * every guest booth once an episode has 2+ live invites.
 *
 * What it gives the rest of the studio:
 *  - one persistent MediaStream per remote guest (audio + optional video), so
 *    the editor can hand each guest its own lane capture and the live
 *    compositor its own tile;
 *  - the same control-message wire shape as the P2P data channel
 *    ({ t: 'sig', kind, payload }, validated with parseSignal), addressed per
 *    guest with LiveKit's destinationIdentities;
 *  - host → guest audio as two named tracks (talkback, cue) that the booth
 *    routes to its headphone mix exactly as the two P2P m-lines were;
 *  - the same ping/pong clock offset the booth uses to place its backup.
 *
 * Keys never come here: the server mints a short-lived token per join.
 */

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'
import { parseSignal } from '@/lib/podcast/guest-signal-schema'
import { GUEST_CONTROL_KINDS } from '@/lib/podcast/guest-types'
import {
  HOST_IDENTITY,
  ROOM_CONTROL_TOPIC,
  ROOM_TRACK_CUE,
  ROOM_TRACK_TALKBACK,
  inviteIdFromIdentity,
  isHostIdentity,
  type RoomRole,
} from '@/lib/podcast/rooms/types'

export type RoomPeer = {
  identity: string
  /** Invite id for a guest participant; null for the host. */
  inviteId: string | null
  name: string
  /** One stream per peer for the peer's lifetime; tracks are added/removed in place. */
  stream: MediaStream
  audioLive: boolean
  videoLive: boolean
}

export type RoomConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

type SigMessage = { t: 'sig'; kind: string; payload: Record<string, unknown> }
type PingMessage = { t: 'ping'; id: number; a: number }
type PongMessage = { t: 'pong'; id: number; a: number; b: number }
type WireMessage = SigMessage | PingMessage | PongMessage

export type StudioRoomOptions = {
  url: string
  token: string
  role: RoomRole
  /** Control message from a remote participant (already validated for the sender's role). */
  onControl: (from: { identity: string; inviteId: string | null }, kind: string, payload: Record<string, unknown>) => void
  /** Remote guests (never the host) whenever the set or their tracks change. */
  onPeers?: (peers: RoomPeer[]) => void
  onState?: (state: RoomConnectionState, detail?: string) => void
  /** Guest booth: host audio lines by name (talkback / cue). */
  onHostAudio?: (talk: MediaStream | null, cue: MediaStream | null) => void
  /** Guest booth: play the other guests' mics through hidden audio elements. */
  playPeerAudio?: boolean
  /** Guest booth: ping the host to learn the clock offset. */
  measureClock?: boolean
}

export type StudioRoom = {
  connect: () => Promise<void>
  disconnect: () => void
  state: () => RoomConnectionState
  /** Publish (or replace) the mic track. null unpublishes. */
  publishMic: (track: MediaStreamTrack | null) => Promise<void>
  /** Publish (or replace) the camera track. null unpublishes. */
  publishCamera: (track: MediaStreamTrack | null) => Promise<void>
  /** Host only: talkback / cue lines to every guest. null unpublishes that line. */
  publishLine: (name: typeof ROOM_TRACK_TALKBACK | typeof ROOM_TRACK_CUE, track: MediaStreamTrack | null) => Promise<void>
  /**
   * Send one control signal. Host: `to` = guest identities (omit = everyone).
   * Guest: always to the host. Returns false when not connected.
   */
  sendControl: (kind: string, payload: Record<string, unknown>, to?: string[]) => boolean
  peers: () => RoomPeer[]
  /** Guest side: host clock minus local clock (ms), best sample; null until measured. */
  offsetMs: () => number | null
  rttMs: () => number | null
  /** Resume audio playback after a tap when the browser blocked autoplay. */
  startAudio: () => Promise<void>
  canPlaybackAudio: () => boolean
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function mapState(state: ConnectionState): RoomConnectionState {
  if (state === ConnectionState.Connected) return 'connected'
  if (state === ConnectionState.Connecting) return 'connecting'
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) return 'reconnecting'
  return 'disconnected'
}

type PeerState = RoomPeer & {
  participant: RemoteParticipant
  sinks: Map<string, HTMLAudioElement>
}

export function createStudioRoom(opts: StudioRoomOptions): StudioRoom {
  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    // Audio must arrive untouched: the host records each guest lane from these tracks.
    audioCaptureDefaults: { autoGainControl: false, echoCancellation: true, noiseSuppression: false },
    publishDefaults: { dtx: false, red: true, simulcast: false },
  })
  const peers = new Map<string, PeerState>()
  const published = new Map<string, LocalTrackPublication>()
  const hostLines: { talk: MediaStream | null; cue: MediaStream | null } = { talk: null, cue: null }
  let pingTimer: number | null = null
  let burstTimer: number | null = null
  let pingId = 0
  const samples: { rtt: number; offset: number }[] = []
  let current: RoomConnectionState = 'disconnected'
  let closed = false

  const setState = (next: RoomConnectionState, detail?: string) => {
    if (current === next && !detail) return
    current = next
    opts.onState?.(next, detail)
  }

  const emitPeers = () => {
    opts.onPeers?.(snapshot())
  }

  function snapshot(): RoomPeer[] {
    return [...peers.values()]
      .filter((p) => !isHostIdentity(p.identity))
      .map(({ identity, inviteId, name, stream, audioLive, videoLive }) => ({
        identity,
        inviteId,
        name,
        stream,
        audioLive,
        videoLive,
      }))
  }

  function peerFor(participant: RemoteParticipant): PeerState {
    let peer = peers.get(participant.identity)
    if (!peer) {
      peer = {
        identity: participant.identity,
        inviteId: inviteIdFromIdentity(participant.identity),
        name: participant.name || 'Guest',
        stream: new MediaStream(),
        audioLive: false,
        videoLive: false,
        participant,
        sinks: new Map(),
      }
      peers.set(participant.identity, peer)
    } else {
      peer.participant = participant
      if (participant.name) peer.name = participant.name
    }
    return peer
  }

  function refreshLive(peer: PeerState) {
    peer.audioLive = peer.stream.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted)
    peer.videoLive = peer.stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)
  }

  /** Hidden element holding a remote track (Chrome feeds Web Audio only from tracks an element plays). */
  function holdTrack(peer: PeerState, track: RemoteTrack, audible: boolean) {
    const el = track.attach() as HTMLAudioElement
    el.muted = !audible
    el.setAttribute('data-fitf-room-sink', peer.identity)
    el.style.display = 'none'
    document.body.appendChild(el)
    void el.play().catch(() => {})
    peer.sinks.set(track.sid || track.mediaStreamTrack.id, el)
  }

  function releaseTrack(peer: PeerState, track: RemoteTrack) {
    const key = track.sid || track.mediaStreamTrack.id
    const el = peer.sinks.get(key)
    if (el) {
      track.detach(el)
      el.remove()
      peer.sinks.delete(key)
    }
  }

  function hostLineFor(pub: RemoteTrackPublication) {
    const name = pub.trackName
    if (name === ROOM_TRACK_TALKBACK) return 'talk' as const
    if (name === ROOM_TRACK_CUE) return 'cue' as const
    return null
  }

  function emitHostAudio() {
    opts.onHostAudio?.(
      hostLines.talk?.getAudioTracks().length ? hostLines.talk : null,
      hostLines.cue?.getAudioTracks().length ? hostLines.cue : null,
    )
  }

  function onSubscribed(track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) {
    const peer = peerFor(participant)
    const mst = track.mediaStreamTrack
    if (isHostIdentity(participant.identity)) {
      if (track.kind !== Track.Kind.Audio) return
      const line = hostLineFor(pub)
      if (!line) return
      const stream = hostLines[line] || new MediaStream()
      stream.getAudioTracks().forEach((t) => stream.removeTrack(t))
      stream.addTrack(mst)
      hostLines[line] = stream
      holdTrack(peer, track, false)
      emitHostAudio()
      return
    }
    if (track.kind === Track.Kind.Audio) {
      peer.stream.getAudioTracks().forEach((t) => peer.stream.removeTrack(t))
      peer.stream.addTrack(mst)
      holdTrack(peer, track, Boolean(opts.playPeerAudio))
    } else if (track.kind === Track.Kind.Video) {
      peer.stream.getVideoTracks().forEach((t) => peer.stream.removeTrack(t))
      peer.stream.addTrack(mst)
    } else {
      return
    }
    const bump = () => {
      refreshLive(peer)
      emitPeers()
    }
    mst.onmute = bump
    mst.onunmute = bump
    mst.onended = bump
    bump()
  }

  function onUnsubscribed(track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) {
    const peer = peers.get(participant.identity)
    if (!peer) return
    releaseTrack(peer, track)
    if (isHostIdentity(participant.identity)) {
      const line = hostLineFor(pub)
      if (line && hostLines[line]) {
        hostLines[line]!.getTracks().forEach((t) => hostLines[line]!.removeTrack(t))
        emitHostAudio()
      }
      return
    }
    const mst = track.mediaStreamTrack
    if (peer.stream.getTracks().includes(mst)) peer.stream.removeTrack(mst)
    refreshLive(peer)
    emitPeers()
  }

  function onParticipantLeft(participant: RemoteParticipant) {
    const peer = peers.get(participant.identity)
    if (!peer) return
    peer.sinks.forEach((el) => el.remove())
    peer.sinks.clear()
    peer.stream.getTracks().forEach((t) => peer.stream.removeTrack(t))
    peers.delete(participant.identity)
    if (isHostIdentity(participant.identity)) {
      hostLines.talk = null
      hostLines.cue = null
      emitHostAudio()
      return
    }
    emitPeers()
  }

  function post(msg: WireMessage, to?: string[]) {
    if (room.state !== ConnectionState.Connected) return false
    try {
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(msg)), {
        reliable: true,
        topic: ROOM_CONTROL_TOPIC,
        destinationIdentities: to && to.length ? to : undefined,
      })
      return true
    } catch {
      return false
    }
  }

  const hostOnly = () => [HOST_IDENTITY]

  function onData(payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) {
    if (topic !== ROOM_CONTROL_TOPIC || !participant || payload.byteLength > 16 * 1024) return
    let msg: WireMessage
    try {
      msg = JSON.parse(decoder.decode(payload)) as WireMessage
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    const fromHost = isHostIdentity(participant.identity)
    if (msg.t === 'ping' && Number.isFinite(msg.a)) {
      // Only the host answers pings (guests measure against the host clock).
      if (opts.role === 'host') post({ t: 'pong', id: Number(msg.id) || 0, a: Number(msg.a), b: Date.now() }, [participant.identity])
      return
    }
    if (msg.t === 'pong' && fromHost && Number.isFinite(msg.a) && Number.isFinite(msg.b)) {
      const c = Date.now()
      const rtt = c - msg.a
      if (rtt < 0 || rtt > 10_000) return
      samples.push({ rtt, offset: msg.b - (msg.a + c) / 2 })
      if (samples.length > 12) samples.shift()
      return
    }
    if (msg.t === 'sig') {
      if (!GUEST_CONTROL_KINDS.has(String(msg.kind))) return
      // A guest booth only takes orders from the host; the host only takes guest kinds from guests.
      if (opts.role === 'guest' && !fromHost) return
      if (opts.role === 'host' && fromHost) return
      const parsed = parseSignal(fromHost ? 'admin' : 'guest', msg.kind, msg.payload)
      if (!parsed) return
      opts.onControl({ identity: participant.identity, inviteId: inviteIdFromIdentity(participant.identity) }, parsed.kind, parsed.payload)
    }
  }

  const ping = () => post({ t: 'ping', id: ++pingId, a: Date.now() }, hostOnly())

  function startClock() {
    stopClock()
    if (!opts.measureClock) return
    let burst = 0
    burstTimer = window.setInterval(() => {
      ping()
      if (++burst >= 5 && burstTimer != null) {
        window.clearInterval(burstTimer)
        burstTimer = null
      }
    }, 250)
    pingTimer = window.setInterval(ping, 20_000)
  }

  function stopClock() {
    if (pingTimer != null) window.clearInterval(pingTimer)
    if (burstTimer != null) window.clearInterval(burstTimer)
    pingTimer = null
    burstTimer = null
  }

  room
    .on(RoomEvent.TrackSubscribed, onSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    .on(RoomEvent.TrackMuted, (pub, participant) => {
      const peer = peers.get(participant.identity)
      if (peer && !isHostIdentity(participant.identity)) {
        refreshLive(peer)
        emitPeers()
      }
      void pub
    })
    .on(RoomEvent.TrackUnmuted, (pub, participant) => {
      const peer = peers.get(participant.identity)
      if (peer && !isHostIdentity(participant.identity)) {
        refreshLive(peer)
        emitPeers()
      }
      void pub
    })
    .on(RoomEvent.ParticipantConnected, (participant) => {
      peerFor(participant)
      if (!isHostIdentity(participant.identity)) emitPeers()
    })
    .on(RoomEvent.ParticipantDisconnected, onParticipantLeft)
    .on(RoomEvent.DataReceived, onData)
    .on(RoomEvent.ConnectionStateChanged, (state) => {
      const mapped = mapState(state)
      setState(mapped)
      if (mapped === 'connected') startClock()
      else stopClock()
    })
    .on(RoomEvent.Disconnected, (reason) => {
      stopClock()
      setState('disconnected', reason != null ? String(reason) : undefined)
    })

  async function replacePublication(key: string, track: MediaStreamTrack | null, publishOpts: Parameters<typeof room.localParticipant.publishTrack>[1]) {
    const existing = published.get(key)
    if (existing) {
      published.delete(key)
      try {
        const local = existing.track
        if (local) await room.localParticipant.unpublishTrack(local, false)
      } catch {
        /* already gone */
      }
    }
    if (!track || closed) return
    if (room.state !== ConnectionState.Connected) return
    const pub = await room.localParticipant.publishTrack(track, publishOpts)
    published.set(key, pub)
  }

  /** Republish what we hold after a fresh connect (reconnects keep publications; connect() does not). */
  const held: { mic: MediaStreamTrack | null; camera: MediaStreamTrack | null; talkback: MediaStreamTrack | null; cue: MediaStreamTrack | null } = {
    mic: null,
    camera: null,
    talkback: null,
    cue: null,
  }

  async function publishHeld() {
    if (held.mic) await replacePublication('mic', held.mic, { source: Track.Source.Microphone, name: 'mic', dtx: false, red: true })
    if (held.camera) await replacePublication('camera', held.camera, { source: Track.Source.Camera, name: 'camera', simulcast: false })
    if (held.talkback) await replacePublication(ROOM_TRACK_TALKBACK, held.talkback, { source: Track.Source.Unknown, name: ROOM_TRACK_TALKBACK, dtx: false })
    if (held.cue) await replacePublication(ROOM_TRACK_CUE, held.cue, { source: Track.Source.Unknown, name: ROOM_TRACK_CUE, dtx: false, red: true })
  }

  return {
    async connect() {
      if (closed) throw new Error('Room closed')
      setState('connecting')
      try {
        await room.connect(opts.url, opts.token, { autoSubscribe: true })
      } catch (err) {
        setState('disconnected', err instanceof Error ? err.message : 'Could not join the room')
        throw err
      }
      room.remoteParticipants.forEach((p) => peerFor(p))
      emitPeers()
      await publishHeld()
    },
    disconnect() {
      closed = true
      stopClock()
      peers.forEach((peer) => {
        peer.sinks.forEach((el) => el.remove())
        peer.sinks.clear()
      })
      peers.clear()
      published.clear()
      void room.disconnect(true).catch(() => {})
      setState('disconnected')
    },
    state: () => current,
    async publishMic(track) {
      held.mic = track
      await replacePublication('mic', track, { source: Track.Source.Microphone, name: 'mic', dtx: false, red: true })
    },
    async publishCamera(track) {
      held.camera = track
      await replacePublication('camera', track, { source: Track.Source.Camera, name: 'camera', simulcast: false })
    },
    async publishLine(name, track) {
      held[name] = track
      await replacePublication(name, track, { source: Track.Source.Unknown, name, dtx: false, red: name === ROOM_TRACK_CUE })
    },
    sendControl(kind, payload, to) {
      if (!GUEST_CONTROL_KINDS.has(kind)) return false
      return post({ t: 'sig', kind, payload }, opts.role === 'guest' ? hostOnly() : to)
    },
    peers: snapshot,
    offsetMs: () => (samples.length ? samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset : null),
    rttMs: () => (samples.length ? samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).rtt : null),
    startAudio: () => room.startAudio(),
    canPlaybackAudio: () => room.canPlaybackAudio,
  }
}

/** Plain-language help when the room cannot be joined. */
export function roomConnectionHelp(detail?: string | null) {
  const base = 'We could not connect you to the panel room. This is usually the network, not you. Press "Try again"; if it keeps happening, try another Wi-Fi network or your phone\'s hotspot.'
  return detail ? `${base} (${detail})` : base
}
