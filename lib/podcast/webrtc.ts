/**
 * Two-person guest path without a paid SFU.
 *
 * Live talk + admin punch use P2P WebRTC. ICE starts with public STUN.
 * TURN is optional via /api/studio/ice (TURN_URL, TURN_USERNAME, TURN_CREDENTIAL).
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
  'Peer failed. This booth is STUN-only until TURN_URL, TURN_USERNAME, and TURN_CREDENTIAL are set on Netlify. Stay on this tab for a local camera backup, or try a phone hotspot.'

export function iceFailedHint(turnConfigured: boolean) {
  return turnConfigured
    ? 'Peer failed even with TURN. Stay on this tab for a local camera backup, or try another network.'
    : ICE_FAILED_HINT
}

export type StudioIceConfig = {
  iceServers: RTCIceServer[]
  turnConfigured: boolean
}

export async function loadStudioIceServers(): Promise<StudioIceConfig> {
  try {
    const res = await fetch('/api/studio/ice', { cache: 'no-store' })
    if (!res.ok) throw new Error('ice')
    const data = (await res.json()) as StudioIceConfig
    if (Array.isArray(data.iceServers) && data.iceServers.length) return data
  } catch {
    /* STUN-only until the route is up */
  }
  return { iceServers: STUN_SERVERS, turnConfigured: false }
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

/**
 * Restart ICE on the offerer (guest) side without dropping local tracks or
 * transceivers. Reuses the existing m-line layout — talkback, cue, video — so a
 * blackout re-gathers candidates (new ufrag/pwd) instead of rebuilding the peer.
 * Returns null if the peer is mid-negotiation so we don't stomp an in-flight SDP.
 */
export async function restartIceOffer(peer: RTCPeerConnection) {
  if (peer.signalingState !== 'stable') {
    console.warn('[studio] skip ICE restart in signaling state', peer.signalingState)
    return null
  }
  const offer = await peer.createOffer({ iceRestart: true })
  await peer.setLocalDescription(offer)
  return peer.localDescription
}

export async function answerOffer(peer: RTCPeerConnection, offer: RTCSessionDescriptionInit) {
  await peer.setRemoteDescription(offer)
  await flushPendingIce(peer)
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  return peer.localDescription
}

/**
 * Re-answer a renegotiation offer (an ICE restart) on the EXISTING peer. The
 * answerer's ufrag/pwd rotate to match the offerer's restart, keeping the same
 * senders/receivers so audio recovers without a fresh peer. Returns false (and
 * logs) if the offer lands in a state where re-answering would throw — the
 * caller can then fall back to a full rebuild.
 */
export async function reanswerOffer(
  peer: RTCPeerConnection,
  offer: RTCSessionDescriptionInit,
): Promise<RTCSessionDescription | null> {
  if (peer.signalingState !== 'stable' && peer.signalingState !== 'have-remote-offer') {
    console.warn('[studio] dropped restart offer in signaling state', peer.signalingState)
    return null
  }
  await peer.setRemoteDescription(offer)
  await flushPendingIce(peer)
  const answer = await peer.createAnswer()
  await peer.setLocalDescription(answer)
  return peer.localDescription
}

/**
 * Apply the remote answer. Returns false (and logs) if it arrives in the wrong
 * signaling state — a missed offer or a duplicate answer — so callers can react
 * instead of silently ending up with no audio.
 */
export async function applyAnswer(
  peer: RTCPeerConnection,
  answer: RTCSessionDescriptionInit,
): Promise<boolean> {
  if (peer.signalingState !== 'have-local-offer') {
    console.warn('[studio] dropped answer in signaling state', peer.signalingState)
    return false
  }
  await peer.setRemoteDescription(answer)
  await flushPendingIce(peer)
  return true
}

/**
 * ICE candidates trickle over 900ms polling and often arrive before the remote
 * description is set — applying them then throws and the candidate is lost.
 * Queue early candidates per-peer and flush them once the remote description
 * lands, so the answer/candidate race can't strand the connection.
 */
const pendingIce = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>()

async function flushPendingIce(peer: RTCPeerConnection) {
  const queued = pendingIce.get(peer)
  if (!queued?.length) return
  pendingIce.delete(peer)
  for (const candidate of queued) {
    try {
      await peer.addIceCandidate(candidate)
    } catch {
      /* stale candidate from a superseded negotiation */
    }
  }
}

export async function addIce(peer: RTCPeerConnection, candidate: RTCIceCandidateInit | null) {
  if (candidate && !peer.remoteDescription) {
    const queued = pendingIce.get(peer) ?? []
    queued.push(candidate)
    pendingIce.set(peer, queued)
    return
  }
  try {
    await peer.addIceCandidate(candidate || undefined)
  } catch {
    /* trickle arrived before remote description, or candidate is stale */
  }
}

/**
 * One-way transport latency estimate for the punch clock (A/V sync, T5).
 *
 * Reads `currentRoundTripTime` (seconds) off the nominated/succeeded ICE
 * candidate-pair and halves it — RTT is symmetric enough for a ~1-frame
 * alignment. Falls back across pairs (nominated → any pair carrying an RTT)
 * because some engines don't flag `nominated` on the reported pair. Returns
 * `null` when stats are unavailable (reconnect mid-take, no succeeded pair, or
 * the browser doesn't expose the field) so callers degrade to "place at punch"
 * instead of misplacing on a garbage number.
 */
export async function estimateOneWayLatency(
  peer: RTCPeerConnection | null,
): Promise<number | null> {
  if (!peer || typeof peer.getStats !== 'function') return null
  try {
    const stats = await peer.getStats()
    let nominatedRtt: number | null = null
    let anyRtt: number | null = null
    stats.forEach((report) => {
      if (report.type !== 'candidate-pair') return
      const pair = report as RTCIceCandidatePairStats
      const rtt = pair.currentRoundTripTime
      if (typeof rtt !== 'number' || !Number.isFinite(rtt) || rtt < 0) return
      // Prefer the pair actually carrying media.
      if (pair.nominated && (pair.state === undefined || pair.state === 'succeeded')) {
        nominatedRtt = rtt
      }
      if (anyRtt == null) anyRtt = rtt
    })
    const rtt = nominatedRtt ?? anyRtt
    if (rtt == null) return null
    const oneWay = rtt / 2
    // Sanity clamp: a booth pair over ~1s one-way is almost certainly a stale or
    // bogus reading — treat as unavailable rather than shove a take a second off.
    if (oneWay > 1) return null
    return oneWay
  } catch {
    return null
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
