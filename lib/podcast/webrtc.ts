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

function audioSender(peer: RTCPeerConnection) {
  const live = peer.getSenders().find((s) => s.track?.kind === 'audio')
  if (live) return live
  const line = peer.getTransceivers().find((t) => {
    const kind = t.receiver.track?.kind || t.sender.track?.kind
    return kind === 'audio'
  })
  return line?.sender
}

export function attachLocalAudio(peer: RTCPeerConnection, stream: MediaStream) {
  const track = stream.getAudioTracks()[0]
  if (!track) return
  const existing = audioSender(peer)
  if (existing) {
    void existing.replaceTrack(track)
    return
  }
  peer.addTrack(track, stream)
}

/** Mute host→guest audio without stopping the mic (talkback off). Does not stop tracks. */
export function detachLocalAudio(peer: RTCPeerConnection) {
  const sender = audioSender(peer)
  if (sender?.track?.kind === 'audio') void sender.replaceTrack(null)
}

/** Host mic on the existing audio m-line only while talkback is on. Not mixed into the Guest take. */
export function applyTalkback(peer: RTCPeerConnection, stream: MediaStream | null, on: boolean) {
  if (on && stream?.getAudioTracks().some((t) => t.readyState === 'live')) {
    attachLocalAudio(peer, stream)
    return
  }
  detachLocalAudio(peer)
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
