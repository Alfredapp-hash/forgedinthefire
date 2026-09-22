/**
 * Two-person guest path without a paid SFU.
 *
 * Live talk + admin punch use P2P WebRTC (STUN only). Guest mic + optional
 * camera arrive on the admin tab as one MediaStream. Audio is recorded with
 * startLaneCapture; inbound video is a parallel camera file on the same punch
 * clock. Do not mux video into the take AudioBuffer or episode.audio_url.
 *
 * Tradeoff: no TURN. Most home NATs work; corporate / symmetric NAT will fail
 * more often once video is on. Guest also records a local camera backup they
 * can upload if the live peer is thin or never connects.
 */

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export const ICE_FAILED_HINT =
  'Peer failed. This booth is STUN-only — a strict office NAT often cannot connect. Stay on this tab for a local camera backup, or try a phone hotspot.'

export function createStudioPeer() {
  return new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 2,
  })
}

export function attachLocalAudio(peer: RTCPeerConnection, stream: MediaStream) {
  const existing = peer.getSenders().filter((s) => s.track?.kind === 'audio')
  const track = stream.getAudioTracks()[0]
  if (!track) return
  if (existing[0]) {
    void existing[0].replaceTrack(track)
    return
  }
  peer.addTrack(track, stream)
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
