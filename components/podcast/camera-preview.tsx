'use client'

import { useEffect, useRef } from 'react'

type Props = {
  stream: MediaStream
  label: string
  live?: boolean
  compact?: boolean
  /** OBS-style: live cameras are Preview; punched output is Program. */
  role?: 'preview' | 'program'
}

export function CameraPreview({ stream, label, live = false, compact = false, role = 'preview' }: Props) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    void el.play().catch(() => {
      /* autoplay can wait for a click; muted + playsInline usually works */
    })
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[#1A232C] bg-[#05070A] ${
        compact ? 'h-[90px] w-[160px]' : 'h-[135px] w-[240px]'
      }`}
    >
      <video ref={ref} muted playsInline autoPlay className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-[#05070A]/70 px-1.5 py-1">
        {live ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF5B73]" /> : null}
        <span className="truncate text-[10px] uppercase tracking-wider text-[#F6FAFC]">
          {role === 'preview' ? `PVW · ${label}` : label}
        </span>
      </div>
    </div>
  )
}
