'use client'

/**
 * Small components that subscribe to the live store so only they re-render (≤15 Hz) while
 * input meters bounce or the record clock ticks — the 5k-line editor stays out of the loop.
 */
import { memo } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { Meter } from '@/components/studio-ui'
import { useLiveValue } from './live-store'

export function LiveClock({ source = 'playhead' }: { source?: 'playhead' | 'recClock' }) {
  const t = useLiveValue((s) => (source === 'recClock' ? s.recClock : s.playhead), 0)
  return <>{formatClock(t)}</>
}

/** Input meters keyed by the capture label (studio-ui Meter, clip hold in heart red). */
export const LiveMeters = memo(function LiveMeters({ recording }: { recording: boolean }) {
  const peaks = useLiveValue((s) => s.peaks, {} as Record<string, number>)
  const clips = useLiveValue((s) => s.clips, {} as Record<string, boolean>)
  const rec = useLiveValue((s) => s.recClock, 0)
  const keys = Object.keys(peaks)
  const status = (key: string) => (clips[key] ? 'CLIP' : recording ? `in ${formatClock(rec)}` : 'idle')
  if (keys.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <Meter level={0} aria-label="Input level" className="flex-1" />
        <span className="studio-type-timecode text-silver">{recording ? `in ${formatClock(rec)}` : 'idle'}</span>
      </div>
    )
  }
  return (
    <>
      {keys.map((key) => (
        <div key={key} className="flex items-center gap-3">
          <span className="studio-type-label w-16 truncate text-[#7C8B97]">{key}</span>
          <Meter
            level={Math.min(1, (peaks[key] || 0) * 1.4)}
            aria-label={`${key} input level`}
            className={clips[key] ? 'shadow-rec' : undefined}
          />
          <span className={`studio-type-timecode ${clips[key] ? 'text-heart' : 'text-silver'}`}>{status(key)}</span>
        </div>
      ))}
    </>
  )
})
