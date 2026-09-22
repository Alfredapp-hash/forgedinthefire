'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { formatBytes, type CameraClip } from '@/lib/podcast/camera'
import { snapSpan, trackDisplayRatio } from '@/lib/podcast/peaks'
import { TimelinePlayhead, useTrackDpr } from '@/components/podcast/session-timeline'

type Props = {
  clips: CameraClip[]
  playhead: number
  pxPerSec: number
  durationSec: number
  scrollLeft?: number
  onScrollLeft?: (left: number) => void
  color: string
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function CameraLane({
  clips,
  playhead,
  pxPerSec,
  durationSec,
  scrollLeft,
  onScrollLeft,
  color,
  selectedId,
  onSelect,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const width = Math.max(480, Math.round(durationSec * pxPerSec))

  useEffect(() => {
    const el = boardRef.current
    if (!el || scrollLeft == null) return
    if (Math.abs(el.scrollLeft - scrollLeft) > 1) el.scrollLeft = scrollLeft
  }, [scrollLeft, width])

  if (clips.length === 0) return null

  return (
    <div className="rounded-lg border border-[#1A232C] bg-[#05070A] overflow-hidden">
      <div className="flex items-center justify-between" style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
        <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Camera takes</p>
        <p className="text-[10px] font-mono text-[#7C8B97]">{clips.length} file{clips.length === 1 ? '' : 's'}</p>
      </div>
      <div
        ref={boardRef}
        className="overflow-x-auto"
        onScroll={(e) => onScrollLeft?.(e.currentTarget.scrollLeft)}
      >
        <div className="relative" style={{ width, height: 40 }}>
          {clips.map((clip) => {
            const selected = selectedId === clip.id
            const box = snapSpan(clip.offset * pxPerSec, (clip.offset + clip.duration) * pxPerSec, 28)
            return (
              <button
                key={clip.id}
                type="button"
                title={`${formatClock(clip.offset)} · ${formatClock(clip.duration)} · ${formatBytes(clip.bytes)}`}
                className={`absolute text-left text-[10px] leading-none font-mono truncate ${
                  selected ? 'text-[#F6FAFC]' : 'text-[#B8C4CF]'
                }`}
                style={{
                  top: 6,
                  height: 28,
                  left: box.left,
                  width: box.width,
                  paddingLeft: 6,
                  paddingRight: 6,
                  borderRadius: 4,
                  border: `1px solid ${selected ? '#53D6FF' : '#27313B'}`,
                  background: `${color}22`,
                }}
                onClick={() => onSelect(selected ? null : clip.id)}
              >
                <FilmSprockets color={color} />
                <span className="relative z-10">cam {formatClock(clip.offset)}</span>
              </button>
            )
          })}
          <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} />
        </div>
      </div>
    </div>
  )
}

function FilmSprockets({ color }: { color: string }) {
  const dpr = useTrackDpr()
  const [tile, setTile] = useState('')

  useLayoutEffect(() => {
    const ratio = trackDisplayRatio(dpr)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(8 * ratio))
    canvas.height = Math.max(1, Math.round(28 * ratio))
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = 0.2
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 0.55
    ctx.fillStyle = '#0C141C'
    const hole = Math.max(1, Math.round(ratio))
    const inset = Math.max(1, Math.round(2 * ratio))
    ctx.fillRect(inset, inset, hole, hole)
    ctx.fillRect(inset, canvas.height - inset - hole, hole, hole)
    setTile(canvas.toDataURL())
  }, [color, dpr])

  return (
    <span
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: tile ? `url(${tile})` : undefined,
        backgroundRepeat: 'repeat-x',
        backgroundSize: '8px 28px',
        imageRendering: 'pixelated',
      }}
    />
  )
}

type ReviewProps = {
  clip: CameraClip
  label: string
  onDiscard: () => void
}

export function CameraClipReview({ clip, label, onDiscard }: ReviewProps) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.src = clip.url
    const seek = () => {
      if (clip.trimStart > 0.04) el.currentTime = clip.trimStart
    }
    el.addEventListener('loadedmetadata', seek)
    return () => {
      el.removeEventListener('loadedmetadata', seek)
      el.removeAttribute('src')
      el.load()
    }
  }, [clip.url, clip.trimStart])

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative overflow-hidden rounded-lg border border-[#1A232C] bg-[#05070A] h-[90px] w-[160px]">
        <video ref={ref} controls playsInline className="h-full w-full object-cover" />
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-[#B8C4CF]">
          {label} camera · {formatClock(clip.offset)} · {formatClock(clip.duration)} · {formatBytes(clip.bytes)}
        </p>
        <p className="text-[10px] text-[#7C8B97]">Separate file — not in the RSS mix. Download stays local unless you upload it yourself.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={clip.url}
            download={`camera-${clip.personId}-${clip.id}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            Download camera file
          </a>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            onClick={onDiscard}
          >
            Discard camera take
          </button>
        </div>
      </div>
    </div>
  )
}
