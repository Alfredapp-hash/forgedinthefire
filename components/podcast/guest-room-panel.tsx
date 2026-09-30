'use client'

/**
 * Host side of a panel show (2+ remote guests) through the episode room (SFU).
 *
 * Mirrors the one-guest P2P panel's contract with the editor / live room, but
 * per guest: every guest gets a lane (onRemoteGuests), its own tally / mute /
 * talkback / cue via the room's data channel (same control schema as the P2P
 * data channel), and its own tile in the booth / live compositor. Guest 1 also
 * arrives on onRemoteStream so the existing single-guest wiring keeps working.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Coffee,
  Copy,
  Headphones,
  Link2,
  MicOff,
  Music2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserX,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react'
import { Button, Chip, Select, laneColor, toast } from '@/components/studio-ui'
import { openInputStream, stopStreams } from '@/lib/podcast/capture'
import {
  GUEST_DURABLE_KINDS,
  describeGuestTally,
  type GuestInviteAdmin,
  type GuestRoomPublic,
  type GuestTallyPhase,
} from '@/lib/podcast/guest-types'
import {
  createAdminInvite,
  fetchHostRoomToken,
  fetchInviteConsent,
  listAdminInvites,
  pushAdminSignal,
  revokeAdminInvite,
  setAdminInviteState,
  type AdminConsentRecord,
} from '@/lib/podcast/guest-signal'
import { SignalDeduper, stampControl } from '@/lib/podcast/guest/control-channel'
import { createStudioRoom, roomConnectionHelp, type RoomConnectionState, type RoomPeer, type StudioRoom } from '@/lib/podcast/rooms/client'
import { assignGuestLanes } from '@/lib/podcast/rooms/layout'
import { ROOM_TRACK_CUE, ROOM_TRACK_TALKBACK, guestIdentity, type InviteCapacity } from '@/lib/podcast/rooms/types'

export type RemoteGuestLane = {
  inviteId: string
  /** SessionPerson id in the editor ("guest" for the first guest). */
  personId: string
  index: number
  name: string
  /** The guest's room stream (mic + optional camera); null until they are in the room. */
  stream: MediaStream | null
  video: boolean
}

export type GuestRoomPanelProps = {
  episodeId: string
  room: GuestRoomPublic
  invites: GuestInviteAdmin[]
  capacity: InviteCapacity | null
  onInvites: (invites: GuestInviteAdmin[], capacity?: InviteCapacity | null, room?: GuestRoomPublic | null) => void
  recording: boolean
  recTally?: GuestTallyPhase
  hostStream: MediaStream | null
  cueStream?: MediaStream | null
  onCueToGuest?: (on: boolean) => void
  onRemoteStream: (stream: MediaStream | null) => void
  onRemoteGuests?: (lanes: RemoteGuestLane[]) => void
  /** Live room: fold every guest's audio into the onRemoteStream stream (one Program guest bus). */
  mergeGuestAudio?: boolean
  onRemoteVideo?: (live: boolean) => void
  onGuestName: (name: string | null) => void
  onTakeUrl: (url: string | null) => void
  onCameraUrl?: (url: string | null) => void
  recordStartSessionSec?: number | null
  recordStartedAt?: number | null
  safePause?: boolean
  onGuestPause?: (state: { requested: boolean; withdrawn: boolean }) => void
  /** Link of an invite just created by the wrapper (shown once). */
  initialFreshUrl?: string | null
}

const TONE: Record<string, string> = {
  live: 'text-lane-cohost-2',
  rec: 'text-heart',
  wait: 'text-lane-cohost-1',
  warn: 'text-lane-cohost-1',
  fail: 'text-heart',
  idle: 'text-silver',
}
const HINT = 'studio-type-label normal-case tracking-normal text-silver'

type GuestUi = {
  muted: boolean
  muteLocked: boolean
  camOn: boolean
  camLocked: boolean
  pauseAsk: boolean
  withdrew: boolean
  pause: boolean
}

const EMPTY_UI: GuestUi = { muted: false, muteLocked: false, camOn: false, camLocked: false, pauseAsk: false, withdrew: false, pause: false }

/** Mixes every guest's mic into one track for the live room's Program guest bus. */
function createGuestBusMix() {
  const ctx = new AudioContext()
  void ctx.resume()
  const dest = ctx.createMediaStreamDestination()
  const sources = new Map<string, MediaStreamAudioSourceNode>()
  return {
    stream: dest.stream,
    update(streams: Map<string, MediaStream>) {
      for (const [id, src] of sources) {
        if (!streams.has(id)) {
          src.disconnect()
          sources.delete(id)
        }
      }
      for (const [id, stream] of streams) {
        if (sources.has(id) || !stream.getAudioTracks().length) continue
        try {
          const src = ctx.createMediaStreamSource(stream)
          src.connect(dest)
          sources.set(id, src)
        } catch {
          /* no audio yet */
        }
      }
      void ctx.resume()
    },
    stop() {
      sources.forEach((s) => s.disconnect())
      sources.clear()
      void ctx.close().catch(() => {})
    },
  }
}

export function GuestRoomPanel({
  episodeId,
  room,
  invites,
  capacity,
  onInvites,
  recording,
  recTally = 'waiting',
  hostStream,
  cueStream = null,
  onCueToGuest,
  onRemoteStream,
  onRemoteGuests,
  mergeGuestAudio = false,
  onRemoteVideo,
  onGuestName,
  onTakeUrl,
  onCameraUrl,
  recordStartSessionSec = null,
  recordStartedAt = null,
  safePause = false,
  onGuestPause,
  initialFreshUrl = null,
}: GuestRoomPanelProps) {
  const [state, setState] = useState<RoomConnectionState>('disconnected')
  const [detail, setDetail] = useState<string | null>(null)
  const [peers, setPeers] = useState<RoomPeer[]>([])
  const [ui, setUi] = useState<Record<string, GuestUi>>({})
  const [talkback, setTalkback] = useState(false)
  const [cueToGuest, setCueToGuest] = useState(false)
  const [hostPause, setHostPause] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freshUrl, setFreshUrl] = useState<string | null>(initialFreshUrl)
  const [copied, setCopied] = useState(false)
  const [hours, setHours] = useState(24)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [consents, setConsents] = useState<Record<string, AdminConsentRecord | null>>({})
  const roomRef = useRef<StudioRoom | null>(null)
  const dedupeRef = useRef(new Map<string, SignalDeduper>())
  const talkbackMicRef = useRef<MediaStream | null>(null)
  const busRef = useRef<ReturnType<typeof createGuestBusMix> | null>(null)
  const mergedRef = useRef<MediaStream | null>(null)
  /** Last stream handed to onRemoteStream, so lane refreshes do not re-announce the same guest. */
  const lastRemoteRef = useRef<MediaStream | null>(null)
  const recordClockRef = useRef<{ sessionSec: number | null; hostAt: number | null }>({ sessionSec: null, hostAt: null })
  const recordingRef = useRef(recording)
  const tallyRef = useRef(recTally)
  const talkbackRef = useRef(false)
  const cueRef = useRef(false)
  const pauseRef = useRef(false)
  const uiRef = useRef(ui)
  uiRef.current = ui
  talkbackRef.current = talkback
  cueRef.current = cueToGuest
  pauseRef.current = hostPause || safePause

  const liveInvites = useMemo(
    () => invites.filter((i) => !i.revoked && !i.expired).slice().sort((a, b) => a.id.localeCompare(b.id)),
    [invites],
  )
  // Lane order follows the order the links were made (invites arrive newest first from the API).
  const ordered = useMemo(() => [...invites].reverse().filter((i) => !i.revoked && !i.expired), [invites])
  const lanes = useMemo(() => assignGuestLanes(ordered.map((i) => ({ inviteId: i.id, name: i.guestName }))), [ordered])
  const peerByInvite = useMemo(() => new Map(peers.filter((p) => p.inviteId).map((p) => [p.inviteId as string, p])), [peers])
  const tally = describeGuestTally(recTally)
  const cueLive = cueToGuest && Boolean(cueStream?.getAudioTracks().some((t) => t.readyState === 'live'))

  const identityFor = (inviteId: string) => guestIdentity(inviteId)

  /** Control to one guest (or all): data channel first; durable kinds also go to the signal table. */
  const sendControl = useCallback((inviteIds: string[], kind: string, payload: Record<string, unknown> = {}) => {
    const stamped = stampControl(payload)
    const sent = roomRef.current?.sendControl(kind, stamped, inviteIds.map(identityFor)) ?? false
    if (!sent || GUEST_DURABLE_KINDS.has(kind)) {
      return Promise.all(inviteIds.map((id) => pushAdminSignal(id, kind, stamped).catch(() => undefined))).then(() => undefined)
    }
    return Promise.resolve()
  }, [])

  const allLive = useCallback(() => liveInvites.map((i) => i.id), [liveInvites])

  function recordPayload(on: boolean, phase: GuestTallyPhase) {
    const clock = recordClockRef.current
    return on ? { on, phase, sessionSec: clock.sessionSec, hostAt: clock.hostAt } : { on, phase }
  }

  function restateTo(inviteId: string) {
    const g = uiRef.current[inviteId] || EMPTY_UI
    void sendControl([inviteId], 'tally', { phase: tallyRef.current })
    if (talkbackRef.current) void sendControl([inviteId], 'talkback', { on: true })
    if (cueRef.current) void sendControl([inviteId], 'cue', { on: true, live: cueLiveNow() })
    if (recordingRef.current) void sendControl([inviteId], 'record', recordPayload(true, tallyRef.current))
    if (g.muteLocked) void sendControl([inviteId], 'mute', { on: true })
    if (g.camLocked) void sendControl([inviteId], 'camera', { on: false })
    if (pauseRef.current || g.pause) void sendControl([inviteId], 'pause', { on: true, slate: safePause })
  }

  const cueStreamRef = useRef<MediaStream | null>(cueStream)
  cueStreamRef.current = cueStream
  function cueLiveNow() {
    return cueRef.current && Boolean(cueStreamRef.current?.getAudioTracks().some((t) => t.readyState === 'live'))
  }

  const patchUi = (inviteId: string, patch: Partial<GuestUi>) =>
    setUi((prev) => ({ ...prev, [inviteId]: { ...(prev[inviteId] || EMPTY_UI), ...patch } }))

  const laneName = (inviteId: string) => lanes.find((l) => l.inviteId === inviteId)?.name || 'A guest'

  const handleControl = useCallback(
    (from: { identity: string; inviteId: string | null }, kind: string, payload: Record<string, unknown>) => {
      const inviteId = from.inviteId
      if (!inviteId) return
      let dedupe = dedupeRef.current.get(inviteId)
      if (!dedupe) {
        dedupe = new SignalDeduper()
        dedupeRef.current.set(inviteId, dedupe)
      }
      if (!dedupe.accept(kind, payload)) return
      if (kind === 'camera') patchUi(inviteId, { camOn: Boolean(payload.on) })
      if (kind === 'mute') patchUi(inviteId, { muted: Boolean(payload.on) })
      if (kind === 'pause') {
        if (payload.withdrawn) {
          patchUi(inviteId, { withdrew: true })
          toast({ title: `${laneName(inviteId)} asked to withdraw their recording`, description: 'The episode is flagged for review.', tone: 'error', duration: 0 })
        } else {
          const on = Boolean(payload.on)
          patchUi(inviteId, { pauseAsk: on })
          if (on) toast({ title: `${laneName(inviteId)} needs a moment`, description: 'Their mic is off on their side.', tone: 'neutral' })
        }
      }
      if (kind === 'hangup') {
        patchUi(inviteId, { muted: false, camOn: false, pauseAsk: false })
        dedupe.reset()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Connect to the room (once per room name); reconnects inside the SDK are automatic.
  useEffect(() => {
    let cancelled = false
    let handle: StudioRoom | null = null
    const knownPeers = new Set<string>()
    ;(async () => {
      try {
        const join = await fetchHostRoomToken(episodeId)
        if (cancelled) return
        if (!join.room || !join.token) {
          setError(join.reason || 'The room is not open yet')
          return
        }
        handle = createStudioRoom({
          url: join.room.url,
          token: join.token,
          role: 'host',
          onControl: handleControl,
          onPeers: (list) => {
            setPeers(list)
            for (const p of list) {
              if (p.inviteId && !knownPeers.has(p.identity)) {
                knownPeers.add(p.identity)
                restateTo(p.inviteId)
                void setAdminInviteState(p.inviteId, 'connected').catch(() => {})
                toast({ title: `${p.name || 'A guest'} joined the room`, tone: 'success' })
              }
            }
            for (const id of [...knownPeers]) if (!list.some((p) => p.identity === id)) knownPeers.delete(id)
          },
          onState: (next, why) => {
            setState(next)
            setDetail(why || null)
          },
        })
        roomRef.current = handle
        await handle.connect()
        if (cancelled) return
        pushLines()
      } catch (err) {
        if (!cancelled) setError(roomConnectionHelp(err instanceof Error ? err.message : null))
      }
    })()
    return () => {
      cancelled = true
      handle?.disconnect()
      if (roomRef.current === handle) roomRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId, room.name])

  // Invite list refresh (names, states, take URLs) while the room is open.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const data = await listAdminInvites(episodeId)
        if (!cancelled) onInvites(data.invites, data.capacity ?? null, data.room ?? null)
      } catch {
        /* next tick */
      }
    }
    const timer = window.setInterval(tick, 6000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [episodeId, onInvites])

  // Consent notes per guest, once they have joined.
  const consentKey = liveInvites.map((i) => `${i.id}:${i.consentAt || ''}:${i.state}`).join('|')
  useEffect(() => {
    let cancelled = false
    for (const inv of liveInvites) {
      if (inv.state === 'pending') continue
      void fetchInviteConsent(inv.id)
        .then((data) => {
          if (!cancelled) setConsents((prev) => ({ ...prev, [inv.id]: data.consents[0] || null }))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentKey])

  function emitRemote(stream: MediaStream | null) {
    if (lastRemoteRef.current === stream) return
    lastRemoteRef.current = stream
    onRemoteStream(stream)
  }

  // Lanes → editor / live room.
  useEffect(() => {
    const out: RemoteGuestLane[] = lanes.map((lane) => {
      const peer = peerByInvite.get(lane.inviteId)
      return {
        inviteId: lane.inviteId,
        personId: lane.personId,
        index: lane.index,
        name: lane.name,
        stream: peer?.stream && (peer.audioLive || peer.videoLive) ? peer.stream : null,
        video: Boolean(peer?.videoLive),
      }
    })
    onRemoteGuests?.(out)
    const first = out[0]
    onGuestName(first?.name || null)
    onRemoteVideo?.(Boolean(first?.video))
    if (mergeGuestAudio) {
      const streams = new Map<string, MediaStream>()
      for (const g of out) if (g.stream) streams.set(g.inviteId, g.stream)
      if (streams.size === 0) {
        busRef.current?.stop()
        busRef.current = null
        mergedRef.current = null
        emitRemote(null)
      } else {
        if (!busRef.current) busRef.current = createGuestBusMix()
        busRef.current.update(streams)
        const merged = mergedRef.current || new MediaStream(busRef.current.stream.getAudioTracks())
        merged.getVideoTracks().forEach((t) => merged.removeTrack(t))
        const video = first?.stream?.getVideoTracks()[0]
        if (video) merged.addTrack(video)
        mergedRef.current = merged
        emitRemote(merged)
      }
    } else {
      emitRemote(first?.stream || null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, peerByInvite, mergeGuestAudio])

  useEffect(() => {
    const first = ordered[0]
    onTakeUrl(first?.takeUrl || null)
    onCameraUrl?.(first?.cameraUrl || null)
  }, [ordered, onTakeUrl, onCameraUrl])

  useEffect(() => {
    const anyAsk = Object.values(ui).some((g) => g.pauseAsk)
    const anyWithdrew = Object.values(ui).some((g) => g.withdrew)
    onGuestPause?.({ requested: anyAsk, withdrawn: anyWithdrew })
  }, [ui, onGuestPause])

  useEffect(() => {
    return () => {
      busRef.current?.stop()
      busRef.current = null
      releaseTalkbackMic()
      onRemoteStream(null)
      onRemoteGuests?.([])
      onRemoteVideo?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function releaseTalkbackMic() {
    const mic = talkbackMicRef.current
    if (mic && mic !== hostStream) stopStreams([mic])
    talkbackMicRef.current = null
  }

  /** Host → guests audio lines: talkback (host mic) and cue (live mix). */
  function pushLines() {
    const r = roomRef.current
    if (!r) return
    const talk = talkbackRef.current ? (hostStream || talkbackMicRef.current)?.getAudioTracks().find((t) => t.readyState === 'live') || null : null
    const cue = cueRef.current ? cueStreamRef.current?.getAudioTracks().find((t) => t.readyState === 'live') || null : null
    void r.publishLine(ROOM_TRACK_TALKBACK, talk).catch(() => {})
    void r.publishLine(ROOM_TRACK_CUE, cue).catch(() => {})
  }

  useEffect(() => {
    pushLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostStream, talkback, cueToGuest, cueStream, state])

  useEffect(() => {
    onCueToGuest?.(cueToGuest)
  }, [cueToGuest, onCueToGuest])

  useEffect(() => {
    if (!liveInvites.length) return
    void sendControl(allLive(), 'cue', { on: cueToGuest, live: cueLive })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueToGuest, cueLive])

  useEffect(() => {
    if (recordingRef.current === recording) return
    recordingRef.current = recording
    if (recording) {
      const sessionSec =
        typeof recordStartSessionSec === 'number' && Number.isFinite(recordStartSessionSec) ? Math.max(0, recordStartSessionSec) : null
      recordClockRef.current = { sessionSec, hostAt: recordStartedAt || Date.now() }
    }
    void sendControl(allLive(), 'record', recordPayload(recording, recording ? recTally : 'stopped'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  useEffect(() => {
    if (tallyRef.current === recTally) return
    tallyRef.current = recTally
    void sendControl(allLive(), 'tally', { phase: recTally })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recTally])

  const pauseOn = hostPause || safePause
  const pauseSentRef = useRef(false)
  useEffect(() => {
    if (pauseSentRef.current === pauseOn) return
    pauseSentRef.current = pauseOn
    void sendControl(allLive(), 'pause', { on: pauseOn, slate: safePause })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseOn, safePause])

  async function setTalkbackOn(on: boolean) {
    setError(null)
    try {
      if (on && !hostStream && !talkbackMicRef.current) talkbackMicRef.current = await openInputStream(undefined, false)
      if (!on) releaseTalkbackMic()
      talkbackRef.current = on
      setTalkback(on)
      pushLines()
      await sendControl(allLive(), 'talkback', { on })
    } catch (err) {
      setTalkback(false)
      setError(err instanceof Error ? err.message : 'Could not start talkback')
    }
  }

  async function setGuestMute(inviteId: string, on: boolean) {
    patchUi(inviteId, { muteLocked: on, muted: on })
    await sendControl([inviteId], 'mute', { on })
  }

  async function setGuestCamera(inviteId: string, on: boolean) {
    patchUi(inviteId, { camLocked: !on, camOn: on ? uiRef.current[inviteId]?.camOn || false : false })
    await sendControl([inviteId], 'camera', { on })
  }

  async function setGuestPause(inviteId: string, on: boolean) {
    patchUi(inviteId, { pause: on, pauseAsk: on ? uiRef.current[inviteId]?.pauseAsk || false : false })
    await sendControl([inviteId], 'pause', { on: on || pauseRef.current, slate: safePause })
  }

  async function addGuest() {
    setBusy(true)
    setError(null)
    try {
      const data = await createAdminInvite(episodeId, hours, undefined, true)
      onInvites([data.invite, ...invites.filter((i) => i.id !== data.invite.id)], data.capacity ?? capacity, data.room ?? room)
      setFreshUrl(data.invite.url || null)
      setCopied(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add a guest')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(inviteId: string) {
    setConfirmRevoke(null)
    setBusy(true)
    try {
      await sendControl([inviteId], 'hangup', {})
      const data = await revokeAdminInvite(inviteId)
      onInvites(invites.map((i) => (i.id === data.invite.id ? data.invite : i)))
      if (freshUrl && invites.find((i) => i.id === inviteId)?.url === freshUrl) setFreshUrl(null)
      setUi((prev) => {
        const next = { ...prev }
        delete next[inviteId]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!freshUrl) return
    try {
      await navigator.clipboard.writeText(freshUrl)
      setCopied(true)
      toast({ title: 'Guest link copied', description: 'Send it only to that guest.', tone: 'success' })
    } catch {
      setError('Copy failed — select the link and copy it')
    }
  }

  async function reconnect() {
    setError(null)
    const r = roomRef.current
    if (!r) return
    try {
      await r.connect()
      pushLines()
    } catch (err) {
      setError(roomConnectionHelp(err instanceof Error ? err.message : null))
    }
  }

  const stateLabel =
    state === 'connected' ? 'Room connected' : state === 'connecting' ? 'Joining room…' : state === 'reconnecting' ? 'Room reconnecting…' : 'Room disconnected'
  const stateTone = state === 'connected' ? 'live' : state === 'disconnected' ? 'fail' : 'wait'
  const inRoom = peers.filter((p) => p.inviteId).length
  const asks = lanes.filter((l) => ui[l.inviteId]?.pauseAsk || ui[l.inviteId]?.withdrew)

  return (
    <div className="space-y-2 rounded-panel border border-divider bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 size={14} className="text-ice" />
        <p className="studio-type-label text-ice">
          Panel · {lanes.length} guest{lanes.length === 1 ? '' : 's'}
        </p>
        <span className={`studio-type-timecode ${TONE[stateTone]}`}>{stateLabel}</span>
        <span className="studio-type-timecode text-silver">{inRoom} in the room</span>
        <span className={`studio-type-timecode ${TONE[tally.tone] || TONE.idle}`}>{tally.label}</span>
        {detail && state === 'disconnected' && <span className="studio-type-label normal-case tracking-normal text-heart">{detail}</span>}
      </div>

      {asks.length > 0 && (
        <div className="space-y-2 rounded-panel border-2 border-lane-cohost-1 bg-lane-cohost-1/10 px-3 py-3" role="alert">
          {asks.map((l) => (
            <p key={l.inviteId} className="studio-type-body flex items-center gap-2 font-medium text-lane-cohost-1">
              <Coffee size={16} />
              {ui[l.inviteId]?.withdrew
                ? `${l.name} asked to withdraw their recording. The episode is flagged for review.`
                : `${l.name} needs a moment. Their mic is off on their side.`}
            </p>
          ))}
          {!pauseOn && (
            <Button variant="primary" size="compact" onClick={() => setHostPause(true)}>
              <ShieldCheck size={14} /> Safe pause everyone (off the recording)
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {lanes.map((lane) => {
          const inv = ordered.find((i) => i.id === lane.inviteId)
          const peer = peerByInvite.get(lane.inviteId)
          const g = ui[lane.inviteId] || EMPTY_UI
          const consent = consents[lane.inviteId]
          const notes = consent
            ? [
                consent.choices.voice_altered && 'alter voice',
                consent.choices.face_blurred && 'blur face',
                consent.choices.first_name_only && 'first name only',
                !consent.choices.may_publish && 'wants to hear final cut',
                consent.choices.audio_only && 'audio only',
                consent.withdrawnAt && 'CONSENT WITHDRAWN',
              ].filter(Boolean)
            : []
          const presence = peer?.audioLive
            ? 'in the room'
            : inv?.state === 'left'
              ? 'left'
              : inv?.state && inv.state !== 'pending'
                ? 'in booth — linking'
                : 'waiting'
          // Lane hue: the first guest keeps the booth's guest accent (1); the rest fan out across the cohost lanes.
          const hue = laneColor(lane.index === 1 ? 1 : lane.index)
          return (
            <div key={lane.inviteId} className="space-y-1.5 rounded-panel border border-divider bg-surface px-3 py-2">
              <p className="studio-type-label flex flex-wrap items-center gap-x-2 gap-y-0.5 normal-case tracking-normal">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hue.base }} aria-hidden />
                <span className="font-medium text-white">
                  {lane.index}. {lane.name}
                </span>
                <span className={`studio-type-timecode ${peer?.audioLive ? TONE.live : TONE.idle}`}>{presence}</span>
                <span className="text-silver">
                  lane {lane.personId === 'guest' ? 'Guest' : `Guest ${lane.index}`} · mic{' '}
                  {g.muteLocked ? 'host muted' : g.muted ? 'guest muted' : 'live'} · cam {g.camLocked ? 'host off' : g.camOn || peer?.videoLive ? 'on' : 'off'}
                  {g.pause || pauseOn ? ' · SAFE PAUSE' : ''}
                </span>
                {inv?.referenceCode && <span className="studio-type-timecode text-silver">{inv.referenceCode}</span>}
              </p>
              {notes.length > 0 && (
                <p className={`${HINT} text-lane-cohost-1`}>
                  <ShieldCheck size={12} className="-mt-0.5 mr-1 inline" />
                  Consent: {notes.join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button variant={g.muteLocked ? 'danger' : 'secondary'} size="dense" aria-pressed={g.muteLocked} disabled={busy} onClick={() => void setGuestMute(lane.inviteId, !g.muteLocked)}>
                  {g.muteLocked ? <Volume2 size={14} /> : <MicOff size={14} />}
                  {g.muteLocked ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  aria-pressed={g.camLocked}
                  disabled={busy}
                  onClick={() => void setGuestCamera(lane.inviteId, g.camLocked)}
                  className={g.camLocked ? 'border-heart/50 text-heart' : undefined}
                >
                  {g.camLocked ? <Video size={14} /> : <VideoOff size={14} />}
                  {g.camLocked ? 'Allow camera' : 'Camera off'}
                </Button>
                <Button
                  variant={g.pause ? 'primary' : 'secondary'}
                  size="dense"
                  aria-pressed={g.pause}
                  disabled={busy || safePause}
                  onClick={() => void setGuestPause(lane.inviteId, !g.pause)}
                  className={!g.pause ? 'border-lane-cohost-1/50 text-lane-cohost-1' : undefined}
                >
                  <Coffee size={14} /> {g.pause ? 'End pause' : 'Safe pause'}
                </Button>
                <Button variant="danger" size="dense" disabled={busy} onClick={() => setConfirmRevoke(lane.inviteId)}>
                  <UserX size={14} /> Revoke
                </Button>
              </div>
              {confirmRevoke === lane.inviteId && (
                <div className="space-y-2 rounded-panel border border-heart/70 bg-heart/10 px-3 py-2" role="alertdialog">
                  <p className="studio-type-body text-white">Revoke {lane.name}&apos;s link? Their session ends at once; uploaded backups are kept.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" size="compact" onClick={() => void revoke(lane.inviteId)}>
                      Disconnect and revoke
                    </Button>
                    <Button variant="secondary" size="compact" autoFocus onClick={() => setConfirmRevoke(null)}>
                      Keep them connected
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={talkback ? 'primary' : 'secondary'} size="compact" aria-pressed={talkback} disabled={busy || state !== 'connected'} onClick={() => void setTalkbackOn(!talkback)}>
          <Headphones size={14} /> {talkback ? 'Talkback on (all)' : 'Talkback (all)'}
        </Button>
        <Button
          variant={cueLive ? 'primary' : 'secondary'}
          size="compact"
          aria-pressed={cueToGuest}
          disabled={busy || state !== 'connected'}
          onClick={() => {
            cueRef.current = !cueToGuest
            setCueToGuest(!cueToGuest)
          }}
          className={!cueLive && cueToGuest ? 'border-forged/70 text-ice' : undefined}
        >
          <Music2 size={14} /> {cueLive ? 'Cue live' : cueToGuest ? 'Cue armed' : 'Cue to guests'}
        </Button>
        <Button
          variant={pauseOn ? 'primary' : 'secondary'}
          size="compact"
          aria-pressed={pauseOn}
          disabled={busy || safePause}
          onClick={() => setHostPause((v) => !v)}
          className={!pauseOn ? 'border-lane-cohost-1/50 text-lane-cohost-1' : undefined}
        >
          <Coffee size={14} /> {safePause ? 'Safe pause on' : pauseOn ? 'End safe pause (all)' : 'Safe pause (all)'}
        </Button>
        {state === 'disconnected' && (
          <Button variant="primary" size="compact" onClick={() => void reconnect()}>
            <RefreshCw size={14} /> Rejoin room
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="studio-type-body flex items-center gap-2 text-silver">
          Expires
          <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-control-compact w-auto px-2 py-0 text-sm">
            <option value={4}>4 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
          </Select>
        </label>
        <Button variant="primary" size="compact" loading={busy} disabled={Boolean(capacity && capacity.remaining <= 0)} title={capacity?.reason || undefined} onClick={() => void addGuest()}>
          <UserPlus size={14} /> Add another guest
        </Button>
        {freshUrl && (
          <Button variant="secondary" size="compact" onClick={() => void copyLink()}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
          </Button>
        )}
        <Chip tone="accent" dot>
          {room.provider}
        </Chip>
      </div>
      {capacity?.reason && <p className={`${HINT} text-lane-cohost-1`}>{capacity.reason}</p>}
      {freshUrl && (
        <div className="space-y-1">
          <p className="studio-type-timecode break-all text-ice">{freshUrl}</p>
          <p className={HINT}>Private link for the newest guest: send it only to them. Shown once — only a hash is stored.</p>
        </div>
      )}
      <p className={HINT}>
        Panel mode: everyone is in the episode room. Each guest records onto their own lane and keeps a local backup that uploads
        in 10-second parts. Guests hear each other; talkback and cue reach all of them. Safe pause silences a guest on their side
        and shows them a calm pause screen.
      </p>
      {error && (
        <div className="rounded-control border border-heart/50 bg-heart/10 px-3 py-2">
          <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-heart">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        </div>
      )}
    </div>
  )
}
