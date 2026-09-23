/**
 * Two-person guest path without a paid SFU.
 *
 * Live talk + admin punch use P2P WebRTC. ICE starts with public STUN.
 * TURN is optional via /api/studio/ice: TURN_URL + TURN_SECRET (short-lived REST
 * credentials, preferred) or TURN_URL + TURN_USERNAME + TURN_CREDENTIAL (static).
 * Guest mic + optional camera arrive on the admin tab as one MediaStream.
 * Audio is recorded with startLaneCapture; inbound video is a parallel camera
 * file on the same punch clock. Do not mux video into the take AudioBuffer
 * or episode.audio_url.
 *
 * Host→guest audio is two m-lines: talkback (host mic) then program/cue
 * (MediaStreamDestination tap of startLiveMix). Neither is recorded on the
 * Guest take. Guest local backup stays their mic only.
 *
 * Guest also records a local camera backup they can upload if ICE fails.
 */

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** @deprecated use STUN_SERVERS or loadStudioIceServers() */
export const ICE_SERVERS = STUN_SERVERS

export const ICE_FAILED_HINT =
  'Peer failed. This booth is STUN-only until TURN_URL and TURN_SECRET (or TURN_USERNAME + TURN_CREDENTIAL) are set on Netlify. Stay on this tab for a local camera backup, or try a phone hotspot.'

export function iceFailedHint(turnConfigured: boolean) {
  return turnConfigured
    ? 'Peer failed even with TURN. Stay on this tab for a local camera backup, or try another network.'
    : ICE_FAILED_HINT
}

export type StudioIceConfig = {
  iceServers: RTCIceServer[]
  turnConfigured: boolean
  /** Unix seconds when short-lived TURN credentials expire (absent for STUN/static creds). */
  expiresAt?: number
  /** Credential lifetime in seconds. */
  ttlSeconds?: number
  /** Client-side: when this config was fetched (ms). */
  fetchedAt?: number
}

/**
 * Fetch ICE (STUN + short-lived TURN) from the server. The host is recognised by
 * its admin session; the guest booth passes its invite token, which goes in a
 * header so it never lands in a query string or access log.
 */
export async function loadStudioIceServers(guestToken?: string): Promise<StudioIceConfig> {
  try {
    const res = await fetch('/api/studio/ice', {
      cache: 'no-store',
      headers: guestToken ? { 'x-guest-token': guestToken } : undefined,
    })
    if (!res.ok) throw new Error('ice')
    const data = (await res.json()) as StudioIceConfig
    if (Array.isArray(data.iceServers) && data.iceServers.length) return { ...data, fetchedAt: Date.now() }
  } catch {
    /* STUN-only until the route is up */
  }
  return { iceServers: STUN_SERVERS, turnConfigured: false, fetchedAt: Date.now() }
}

/** Refresh TURN credentials this long before they expire. */
const ICE_REFRESH_MARGIN_MS = 15 * 60 * 1000

/** True when short-lived TURN credentials are expired or close to it (refresh before an ICE restart). */
export function iceConfigStale(cfg: StudioIceConfig | null | undefined, now = Date.now()) {
  if (!cfg) return true
  if (cfg.expiresAt) return cfg.expiresAt * 1000 - now < ICE_REFRESH_MARGIN_MS
  // Static creds / STUN: re-check hourly in case TURN was configured meanwhile.
  return !cfg.fetchedAt || now - cfg.fetchedAt > 60 * 60 * 1000
}

/** ms until the config should be refreshed (for a timer). */
export function iceRefreshDelay(cfg: StudioIceConfig, now = Date.now()) {
  if (cfg.expiresAt) return Math.max(30_000, cfg.expiresAt * 1000 - now - ICE_REFRESH_MARGIN_MS)
  return 60 * 60 * 1000
}

/**
 * Put fresh ICE servers on a live peer (no renegotiation). New TURN credentials
 * apply to the next gathering — i.e. the next ICE restart — so call this first.
 */
export function applyIceServers(peer: RTCPeerConnection | null, cfg: StudioIceConfig) {
  if (!peer || peer.signalingState === 'closed') return false
  try {
    peer.setConfiguration({ ...peer.getConfiguration(), iceServers: cfg.iceServers.length ? cfg.iceServers : STUN_SERVERS })
    return true
  } catch {
    return false
  }
}

/** Random id for one RTCPeerConnection lifetime; tags offers/answers/candidates. */
export function newPeerGeneration() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * ICE restart on the SAME peer (keeps DTLS, tracks and transceivers): new ICE
 * credentials, fresh candidates, usually recovers a network change in 1-3 s.
 * Only the offerer (the guest) calls this. Returns null if the peer cannot restart now.
 */
export async function makeRestartOffer(peer: RTCPeerConnection) {
  if (peer.signalingState === 'closed') return null
  if (peer.signalingState === 'have-local-offer') {
    try {
      await peer.setLocalDescription({ type: 'rollback' })
    } catch {
      return null
    }
  }
  if (peer.signalingState !== 'stable') return null
  try {
    peer.restartIce?.()
  } catch {
    /* older Safari: iceRestart flag below still works */
  }
  const offer = await peer.createOffer({ iceRestart: true })
  await peer.setLocalDescription(offer)
  return peer.localDescription
}

/** Plain-language guest help when the connection cannot be made. */
export function guestConnectionHelp(turnConfigured: boolean) {
  return turnConfigured
    ? 'We could not connect you to the host. This is usually the network, not you. Press "Try again". If it keeps happening, try another Wi-Fi network or your phone\'s hotspot.'
    : 'We could not connect you to the host. Some work, school, or public Wi-Fi networks block calls like this. Press "Try again", or switch to another Wi-Fi network or your phone\'s hotspot.'
}

export function createStudioPeer(iceServers: RTCIceServer[] = STUN_SERVERS) {
  return new RTCPeerConnection({
    iceServers: iceServers.length ? iceServers : STUN_SERVERS,
    iceCandidatePoolSize: 2,
  })
}

function audioTransceivers(peer: RTCPeerConnection) {
  return peer.getTransceivers().filter((t) => {
    const kind = t.receiver.track?.kind || t.sender.track?.kind
    return kind === 'audio'
  })
}

/** First audio m-line: guest mic in / host talkback out. Never the program/cue sender. */
function talkbackSender(peer: RTCPeerConnection) {
  return (
    audioTransceivers(peer)[0]?.sender ||
    peer.getSenders().find((s) => s.track?.kind === 'audio')
  )
}

/** Second audio m-line: live mix / program cue to guest headphones. */
export function programCueSender(peer: RTCPeerConnection) {
  return audioTransceivers(peer)[1]?.sender
}

function liveAudioTrack(stream: MediaStream | null) {
  return stream?.getAudioTracks().find((t) => t.readyState === 'live') || null
}

export function attachLocalAudio(peer: RTCPeerConnection, stream: MediaStream) {
  const track = liveAudioTrack(stream)
  if (!track) return
  const existing = talkbackSender(peer)
  if (existing) {
    void existing.replaceTrack(track)
    return
  }
  peer.addTrack(track, stream)
}

/** Mute host→guest audio without stopping the mic (talkback off). Does not stop tracks. */
export function detachLocalAudio(peer: RTCPeerConnection) {
  const sender = talkbackSender(peer)
  if (sender) void sender.replaceTrack(null)
}

/** Host mic on the first audio m-line only while talkback is on. Not mixed into the Guest take. */
export function applyTalkback(peer: RTCPeerConnection, stream: MediaStream | null, on: boolean) {
  if (on && liveAudioTrack(stream)) {
    attachLocalAudio(peer, stream!)
    return
  }
  detachLocalAudio(peer)
}

/**
 * Guest adds a recvonly audio m-line before createOffer so the host can
 * replaceTrack the live mix without renegotiating or touching talkback.
 */
export function ensureCueRecvTransceiver(peer: RTCPeerConnection) {
  if (programCueSender(peer)) return audioTransceivers(peer)[1]
  return peer.addTransceiver('audio', { direction: 'recvonly' })
}

/** Live mix on the cue m-line. Returns false if the peer has no second audio line. */
export function applyProgramCue(peer: RTCPeerConnection, stream: MediaStream | null, on: boolean) {
  const sender = programCueSender(peer)
  if (!sender) return false
  void sender.replaceTrack(on ? liveAudioTrack(stream) : null)
  return true
}

export function remoteAudioByRole(peer: RTCPeerConnection) {
  const talk = new MediaStream()
  const cue = new MediaStream()
  for (const line of audioTransceivers(peer)) {
    const track = line.receiver.track
    if (!track || track.kind !== 'audio' || track.readyState === 'ended') continue
    const recvOnly = line.direction === 'recvonly' || line.currentDirection === 'recvonly'
    if (recvOnly) cue.addTrack(track)
    else talk.addTrack(track)
  }
  return { talk, cue }
}

export function videoTransceiver(peer: RTCPeerConnection) {
  return peer.getTransceivers().find((t) => {
    const kind = t.receiver.track?.kind || t.sender.track?.kind
    return kind === 'video'
  })
}

/** Negotiate a video m-line up front so camera on/off is replaceTrack, not a new peer. */
export function ensureVideoTransceiver(
  peer: RTCPeerConnection,
  direction: RTCRtpTransceiverDirection = 'sendonly',
) {
  return videoTransceiver(peer) || peer.addTransceiver('video', { direction })
}

export function attachLocalVideo(peer: RTCPeerConnection, stream: MediaStream) {
  const track = stream.getVideoTracks()[0]
  if (!track) return 'none' as const
  const transceiver = ensureVideoTransceiver(peer, 'sendonly')
  if (transceiver.sender) {
    void transceiver.sender.replaceTrack(track)
    return 'replace' as const
  }
  peer.addTrack(track, stream)
  return 'add' as const
}

export function detachLocalVideo(peer: RTCPeerConnection) {
  const sender = videoTransceiver(peer)?.sender
  if (sender) void sender.replaceTrack(null)
}

export function remoteAudioStream(peer: RTCPeerConnection): MediaStream {
  const stream = new MediaStream()
  for (const receiver of peer.getReceivers()) {
    if (receiver.track?.kind === 'audio') stream.addTrack(receiver.track)
  }
  return stream
}

export function collectRemoteStream(peer: RTCPeerConnection): MediaStream {
  const stream = new MediaStream()
  for (const receiver of peer.getReceivers()) {
    if (receiver.track && receiver.track.readyState !== 'ended') stream.addTrack(receiver.track)
  }
  return stream
}

export async function makeOffer(peer: RTCPeerConnection, recvVideo = false) {
  const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: recvVideo })
  await peer.setLocalDescription(offer)
  return peer.localDescription
}

export async function answerOffer(peer: RTCPeerConnection, offer: RTCSessionDescriptionInit) {
  await peer.setRemoteDescription(offer)
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  return peer.localDescription
}

export async function applyAnswer(peer: RTCPeerConnection, answer: RTCSessionDescriptionInit) {
  if (peer.signalingState === 'have-local-offer') {
    await peer.setRemoteDescription(answer)
  }
}

export async function addIce(peer: RTCPeerConnection, candidate: RTCIceCandidateInit | null) {
  try {
    await peer.addIceCandidate(candidate || undefined)
  } catch {
    /* trickle arrived before remote description */
  }
}

export function closePeer(peer: RTCPeerConnection | null, stopTracks = false) {
  if (!peer) return
  try {
    if (stopTracks) {
      peer.getSenders().forEach((s) => {
        try {
          s.track?.stop()
        } catch {
          /* already stopped */
        }
      })
    }
    peer.close()
  } catch {
    /* ignore */
  }
}
