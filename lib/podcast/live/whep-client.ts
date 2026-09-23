/**
 * Minimal WHEP viewer (draft-ietf-wish-whep): recvonly peer, SDP offer POSTed
 * straight to the public playback URL, answer in the body, DELETE on close.
 * Playback URLs are public by design (Cloudflare `/webRTC/play`, MediaMTX `/whep`).
 */

import { STUN_SERVERS } from '@/lib/podcast/webrtc'
import { waitForGathering } from '@/lib/podcast/live/whip-client'

export type WhepSession = {
  stream: MediaStream
  close: () => Promise<void>
  peer: RTCPeerConnection
}

export async function playWhep(
  url: string,
  onState?: (state: RTCPeerConnectionState) => void,
): Promise<WhepSession> {
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS, bundlePolicy: 'max-bundle' })
  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })
  const stream = new MediaStream()
  pc.ontrack = (event) => {
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track)
  }
  pc.onconnectionstatechange = () => onState?.(pc.connectionState)
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForGathering(pc, 2000)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp || offer.sdp || '',
    })
  } catch (err) {
    pc.close()
    throw err
  }
  if (!res.ok) {
    pc.close()
    throw new Error(`Playback not available (${res.status})`)
  }
  const location = res.headers.get('location')
  const resource = location ? new URL(location, url).toString() : null
  await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
  return {
    stream,
    peer: pc,
    close: async () => {
      pc.close()
      if (resource) await fetch(resource, { method: 'DELETE' }).catch(() => {})
    },
  }
}
