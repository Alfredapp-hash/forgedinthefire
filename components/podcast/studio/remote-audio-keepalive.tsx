'use client'

import { useEffect, useRef } from 'react'

/**
 * Chrome bug: a remote WebRTC MediaStream fed only into Web Audio (createMediaStreamSource)
 * renders silence unless the stream is also attached to a media element. A hidden, muted
 * <audio> keeps the remote track flowing so meters and captures get real samples.
 */
export function RemoteAudioKeepAlive({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) void el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [stream])
  return <audio ref={ref} muted autoPlay playsInline hidden aria-hidden />
}
