'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { clipsOf, isVoiceRole, sessionDuration, type SessionPerson, type StudioTrack, type TrackClip } from '@/lib/podcast/multitrack'
import {
  drawPeakEnvelope,
  peakBucketCount,
  peakEnvelopeSlice,
  snapHairline,
  snapSpan,
  trackDisplayRatio,
} from '@/lib/podcast/peaks'

export type SessionTimelineProps = {
  people: SessionPerson[]
  tracks: StudioTrack[]
  playhead: number
  pxPerSec: number
  selectedId: string | null
  selectedClipId: string | null
  range: { start: number; end: number }
  onSelect: (trackId: string, clipId: string | null) => void
  onPlayhead: (sec: number) => void
  onMoveClip: (trackId: string, clipId: string, offset: number) => void
  onTrimClip: (trackId: string, clipId: string, edge: 'in' | 'out', time: number) => void
  onRange: (start: number, end: number, trackId: string) => void
  /** Scope lanes to one person. Primary editor is per-person, not one shared board. */
  personId?: string | null
  /** Shared session duration so every person board is the same width. */
  durationSec?: number
  /** Nest inside a person card — no "Session timeline" chrome. */
  embedded?: boolean
  /** Tick bar. Shared ruler uses this alone; person boards keep a compact one. */
  showRuler?: boolean
  /** Time strip only — no clip lanes. */
  rulerOnly?: boolean
  scrollLeft?: number
  onScrollLeft?: (left: number) => void
  /** Called once when a clip drag (move / trim) actually starts — one undo step per drag. */
  onEditStart?: () => void
}

function subscribeDpr(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

export function useTrackDpr(): number {
  return useSyncExternalStore(subscribeDpr, () => trackDisplayRatio(), () => 1)
}

export function TimelinePlayhead({ sec, pxPerSec }: { sec: number; pxPerSec: number }) {
  const dpr = useTrackDpr()
  const hair = snapHairline(sec * pxPerSec, dpr)
  return (
    <div
      className="absolute top-0 bottom-0 z-30 pointer-events-none bg-[#8DEBFF]"
      style={{ left: hair.left, width: hair.width }}
    />
  )
}

export function SessionTimeline({
  people,
  tracks,
  playhead,
  pxPerSec,
  selectedId,
  selectedClipId,
  range,
  onSelect,
  onPlayhead,
  onMoveClip,
  onTrimClip,
  onRange,
  personId = null,
  durationSec,
  embedded = false,
  showRuler = true,
  rulerOnly = false,
  scrollLeft,
  onScrollLeft,
  onEditStart,
}: SessionTimelineProps) {
  const scopedPeople = personId ? people.filter((p) => p.id === personId) : people
  const scopedTracks = (personId ? tracks.filter((t) => t.personId === personId) : tracks).slice().sort((a, b) => {
    if (a.personId === b.personId) return a.take - b.take
    return 0
  })
  const duration = durationSec ?? Math.max(30, playhead + 8, sessionDuration(tracks)) + 4
  const width = Math.max(480, Math.round(duration * pxPerSec))
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    | { kind: 'move'; trackId: string; clipId: string; startX: number; startOffset: number; moved: boolean }
    | { kind: 'trim'; trackId: string; clipId: string; edge: 'in' | 'out'; started?: boolean }
    | { kind: 'range'; trackId: string; anchor: number }
    | { kind: 'seek' }
    | null
  >(null)

  useEffect(() => {
    const el = boardRef.current
    if (!el || scrollLeft == null) return
    if (Math.abs(el.scrollLeft - scrollLeft) > 1) el.scrollLeft = scrollLeft
  }, [scrollLeft, width])

  const ticks = useMemo(() => {
    const major = pxPerSec >= 80 ? 5 : pxPerSec >= 40 ? 10 : 30
    const minor = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 5 : 0
    const out: { t: number; major: boolean }[] = []
    const step = minor || major
    const n = Math.floor(duration / step)
    for (let i = 0; i <= n; i++) {
      const t = i * step
      out.push({ t, major: i % (major / step) === 0 })
    }
    return out
  }, [duration, pxPerSec])

  function timeFromClientX(clientX: number) {
    const el = boardRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pxPerSec)
  }

  function onLanePointerDown(event: React.PointerEvent, track: StudioTrack) {
    if ((event.target as HTMLElement).closest('[data-clip]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = timeFromClientX(event.clientX)
    drag.current = { kind: 'range', trackId: track.id, anchor: t }
    onSelect(track.id, null)
    onPlayhead(t)
  }

  function onEmptyLanePointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest('[data-clip]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = timeFromClientX(event.clientX)
    drag.current = { kind: 'seek' }
    onPlayhead(t)
  }

  function onRulerPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = timeFromClientX(event.clientX)
    drag.current = { kind: 'seek' }
    onPlayhead(t)
  }

  function onBoardPointerMove(event: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const t = timeFromClientX(event.clientX)
    if (d.kind === 'move') {
      if (!d.moved && Math.abs(event.clientX - d.startX) <= 3) return
      if (!d.moved) {
        d.moved = true
        onEditStart?.()
      }
      const delta = (event.clientX - d.startX) / pxPerSec
      onMoveClip(d.trackId, d.clipId, Math.max(0, d.startOffset + delta))
    } else if (d.kind === 'trim') {
      if (!d.started) {
        d.started = true
        onEditStart?.()
      }
      onTrimClip(d.trackId, d.clipId, d.edge, t)
    } else if (d.kind === 'range') {
      onRange(Math.min(d.anchor, t), Math.max(d.anchor, t), d.trackId)
      onPlayhead(t)
    } else if (d.kind === 'seek') {
      onPlayhead(t)
    }
  }

  function onBoardPointerUp(event: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    if (d?.kind === 'move' && !d.moved) {
      const clipEl = (event.target as HTMLElement).closest('[data-clip]') as HTMLElement | null
      if (clipEl) {
        const rect = clipEl.getBoundingClientRect()
        const into = Math.max(0, (event.clientX - rect.left) / pxPerSec)
        const track = scopedTracks.find((x) => x.id === d.trackId)
        const clip = track ? clipsOf(track).find((c) => c.id === d.clipId) : null
        if (clip) onPlayhead(clip.offset + into)
      }
    }
  }

  function onClipPointerDown(
    event: React.PointerEvent,
    track: StudioTrack,
    clip: TrackClip,
    edge?: 'in' | 'out',
  ) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(track.id, clip.id)
    if (edge) {
      drag.current = { kind: 'trim', trackId: track.id, clipId: clip.id, edge }
      return
    }
    drag.current = {
      kind: 'move',
      trackId: track.id,
      clipId: clip.id,
      startX: event.clientX,
      startOffset: clip.offset,
      moved: false,
    }
  }

  const rows = rulerOnly
    ? []
    : scopedPeople.length
      ? scopedPeople.map((person) => ({
          person,
          lane: scopedTracks.filter((t) => t.personId === person.id),
        }))
      : [{ person: null, lane: scopedTracks }]

  const selStart = Math.min(range.start, range.end)
  const selEnd = Math.max(range.start, range.end)
  const hasRange = selEnd - selStart > 0.05
  const showPersonLabel = !embedded && !personId
  const rulerH = showRuler ? 24 : 0
  const selBox = snapSpan(selStart * pxPerSec, selEnd * pxPerSec, 2)

  const board = (
    <div
      ref={boardRef}
      className="overflow-x-auto"
      onScroll={(e) => onScrollLeft?.(e.currentTarget.scrollLeft)}
      onPointerMove={onBoardPointerMove}
      onPointerUp={onBoardPointerUp}
      onPointerCancel={onBoardPointerUp}
    >
      <div className="relative" style={{ width, minHeight: rulerOnly ? rulerH || 24 : 56 }}>
        {showRuler && (
          <div
            className="sticky top-0 z-10 h-6 border-b border-[#1A232C] bg-[#0C141C]"
            onPointerDown={onRulerPointerDown}
          >
            {ticks.map(({ t, major }) => {
              const left = Math.round(t * pxPerSec)
              return (
                <span key={t} className="absolute top-0 h-full pointer-events-none" style={{ left }}>
                  <i
                    className={`absolute top-0 block ${major ? 'h-2 bg-[#3A4652]' : 'h-1 bg-[#27313B]'}`}
                    style={{ left: 0, width: 1 }}
                  />
                  {major && (
                    <span className="absolute top-2.5 text-[10px] leading-none text-[#7C8B97] font-mono" style={{ left: 3 }}>
                      {formatClock(t)}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        )}

        {hasRange && (
          <div
            className="absolute bottom-0 z-20 pointer-events-none bg-[#53D6FF]/10 border-x border-[#53D6FF]/40"
            style={{
              top: rulerH,
              left: selBox.left,
              width: selBox.width,
            }}
          />
        )}

        {rows.map(({ person, lane }) => {
          const hasComp = Boolean(person && lane.some((t) => isVoiceRole(t.role) && (t.compRanges || []).length > 0))
          const laneCount = Math.max(1, lane.length)
          const topPad = showPersonLabel ? 18 : hasComp ? 8 : 6
          return (
            <div
              key={person?.id || 'lane'}
              className="relative border-t border-[#1A232C]"
              style={{ height: topPad + laneCount * 52 }}
              onPointerDown={lane[0] ? undefined : onEmptyLanePointerDown}
            >
              {showPersonLabel && (
                <p className="absolute z-20 text-[10px] uppercase tracking-wider text-[#7C8B97]" style={{ left: 8, top: 4 }}>
                  {person?.name || 'Takes'}
                </p>
              )}
              {hasComp && (
                <div className="absolute left-0 right-0 top-0 z-10" style={{ height: 2 }}>
                  {lane.flatMap((t) =>
                    (t.compRanges || []).map((r) => {
                      const bar = snapSpan(r.start * pxPerSec, r.end * pxPerSec, 2)
                      return (
                        <div
                          key={`${t.id}-${r.start}`}
                          className="absolute top-0"
                          style={{
                            left: bar.left,
                            width: bar.width,
                            height: 2,
                            background: t.color,
                          }}
                          title={`${t.name} · ${formatClock(r.start)}–${formatClock(r.end)}`}
                        />
                      )
                    }),
                  )}
                </div>
              )}
              {(lane.length ? lane : []).map((track, idx) => {
                const top = topPad + idx * 52
                const clips = clipsOf(track)
                return (
                  <div
                    key={track.id}
                    className="absolute left-0 right-0"
                    style={{ top, height: 44 }}
                    onPointerDown={(e) => onLanePointerDown(e, track)}
                    onPointerMove={onBoardPointerMove}
                    onPointerUp={onBoardPointerUp}
                  >
                    {embedded && (
                      <span className="absolute z-20 text-[10px] uppercase tracking-wider text-[#7C8B97] pointer-events-none" style={{ left: 8, top: 0 }}>
                        take {track.take}
                      </span>
                    )}
                    {clips.length === 0 && (
                      <div
                        className="absolute h-9 rounded border border-dashed border-[#27313B] text-[10px] text-[#7C8B97] px-2 flex items-center"
                        style={{ left: embedded ? 52 : 8, minWidth: 72, top: 8 }}
                      >
                        empty — arm or record
                      </div>
                    )}
                    {clips.map((clip) => (
                      <Clip
                        key={clip.id}
                        track={track}
                        clip={clip}
                        pxPerSec={pxPerSec}
                        selected={selectedId === track.id && (selectedClipId === clip.id || !selectedClipId)}
                        dim={
                          track.muted ||
                          clip.muted ||
                          ((track.role === 'vocal' || track.role === 'guest') && !track.listen && !track.layered)
                        }
                        onPointerDown={(e) => onClipPointerDown(e, track, clip)}
                        onPointerMove={onBoardPointerMove}
                        onPointerUp={onBoardPointerUp}
                        onTrimIn={(e) => onClipPointerDown(e, track, clip, 'in')}
                        onTrimOut={(e) => onClipPointerDown(e, track, clip, 'out')}
                      />
                    ))}
                    {selectedId === track.id && (track.automation || []).length > 1 && (
                      <AutomationLine points={track.automation} pxPerSec={pxPerSec} width={width} />
                    )}
                  </div>
                )
              })}
              {lane.length === 0 && (
                <p className="absolute text-[10px] text-[#7C8B97]" style={{ left: 8, top: 8 }}>
                  No takes yet — add one, then record.
                </p>
              )}
            </div>
          )
        })}

        <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} />
      </div>
    </div>
  )

  if (embedded || rulerOnly) {
    return (
      <div
        className={
          rulerOnly
            ? 'rounded-lg border border-[#1A232C] bg-[#05070A] overflow-hidden'
            : 'rounded-lg border border-[#1A232C] bg-[#05070A] overflow-hidden'
        }
      >
        {board}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#1A232C] bg-[#080C10] overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Session timeline</p>
        <p className="text-[11px] font-mono text-[#A9B8C6]">
          {formatClock(playhead)}
          {hasRange ? ` · sel ${formatClock(selStart)}–${formatClock(selEnd)}` : ''}
        </p>
      </div>
      {board}
    </div>
  )
}

function Clip({
  track,
  clip,
  pxPerSec,
  selected,
  dim,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTrimIn,
  onTrimOut,
}: {
  track: StudioTrack
  clip: TrackClip
  pxPerSec: number
  selected: boolean
  dim: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onTrimIn: (e: React.PointerEvent) => void
  onTrimOut: (e: React.PointerEvent) => void
}) {
  const box = snapSpan(clip.offset * pxPerSec, (clip.offset + clip.duration) * pxPerSec, 8)

  return (
    <div
      data-clip={clip.id}
      className="absolute overflow-hidden"
      style={{
        left: box.left,
        width: box.width,
        height: 40,
        top: 0,
        borderRadius: 6,
        background: track.color + (dim ? '18' : '33'),
        border: `1px solid ${selected ? '#8DEBFF' : track.color}`,
        opacity: !track.buffer && dim ? 0.45 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={`${track.name} · ${formatClock(clip.offset)}–${formatClock(clip.offset + clip.duration)}${clip.muted ? ' · muted' : ''}${clip.gain !== 1 ? ` · ${Math.round(clip.gain * 100)}%` : ''}`}
    >
      {track.buffer && (
        <PeakStrip
          buffer={track.buffer}
          sourceStart={clip.sourceStart}
          duration={clip.duration}
          cssWidth={box.width}
          cssHeight={40}
          color={track.color}
          dim={dim}
        />
      )}
      <span
        className="absolute text-[10px] leading-none text-[#F6FAFC] pointer-events-none truncate"
        style={{ left: 6, top: 3, maxWidth: '70%' }}
      >
        {track.name}
        {clip.muted ? ' · mut' : ''}
      </span>
      <button
        type="button"
        aria-label="Trim in"
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-10 bg-transparent"
        onPointerDown={onTrimIn}
      />
      <button
        type="button"
        aria-label="Trim out"
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize z-10 bg-transparent"
        onPointerDown={onTrimOut}
      />
    </div>
  )
}

const TILE_CSS = 2048

function PeakStrip({
  buffer,
  sourceStart,
  duration,
  cssWidth,
  cssHeight,
  color,
  dim,
}: {
  buffer: AudioBuffer
  sourceStart: number
  duration: number
  cssWidth: number
  cssHeight: number
  color: string
  dim: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dpr = useTrackDpr()
  const width = Math.max(1, Math.round(cssWidth))
  const height = Math.max(1, Math.round(cssHeight))

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const buckets = peakBucketCount(width, dpr)
    const peaks = peakEnvelopeSlice(buffer, sourceStart, duration, buckets)
    const tileCount = Math.max(1, Math.ceil(width / TILE_CSS))

    while (wrap.childElementCount < tileCount) {
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      canvas.style.display = 'block'
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.pointerEvents = 'none'
      canvas.style.setProperty('image-rendering', 'pixelated')
      wrap.appendChild(canvas)
    }
    while (wrap.childElementCount > tileCount) wrap.lastElementChild?.remove()

    for (let t = 0; t < tileCount; t++) {
      const canvas = wrap.children[t] as HTMLCanvasElement
      const left = t * TILE_CSS
      const tw = Math.min(TILE_CSS, width - left)
      const bw = Math.max(1, Math.round(tw * dpr))
      const bh = Math.max(1, Math.round(height * dpr))
      canvas.style.left = `${left}px`
      canvas.style.width = `${tw}px`
      canvas.style.height = `${height}px`
      if (canvas.width !== bw) canvas.width = bw
      if (canvas.height !== bh) canvas.height = bh
      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) continue
      const start = Math.floor((left / width) * peaks.length)
      const end = Math.max(start + 1, Math.round(((left + tw) / width) * peaks.length))
      drawPeakEnvelope(ctx, peaks.subarray(start, Math.min(peaks.length, end)), bw, bh, color, dim)
    }
  }, [buffer, sourceStart, duration, width, height, color, dim, dpr])

  return <div ref={wrapRef} className="absolute inset-0 pointer-events-none" />
}

function AutomationLine({
  points,
  pxPerSec,
  width,
}: {
  points: { t: number; v: number }[]
  pxPerSec: number
  width: number
}) {
  const d = useMemo(() => {
    if (points.length === 0) return ''
    const h = 44
    const y = (v: number) => Math.round(h - Math.max(0, Math.min(1.2, v)) * (h - 4))
    let path = `M 0 ${y(points[0].v)}`
    for (const p of points) path += ` L ${Math.round(p.t * pxPerSec)} ${y(p.v)}`
    path += ` L ${width} ${y(points[points.length - 1].v)}`
    return path
  }, [points, pxPerSec, width])
  if (!d) return null
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      width={width}
      height={44}
      viewBox={`0 0 ${width} 44`}
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke="#8DEBFF" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.85" />
    </svg>
  )
}
