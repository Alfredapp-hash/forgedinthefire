'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { clipsOf, isVoiceRole, sessionDuration, type SessionPerson, type StudioTrack, type TrackClip } from '@/lib/podcast/multitrack'
import { laneColor, LANE_IDS, type LaneColor, type LaneId } from '@/lib/podcast/lanes'
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
  /** All clips in the current multi-selection (includes the primary clip). */
  selectedClipIds?: Set<string>
  /** Snap active — draws a subtle grid tint hint on lanes. Visual only. */
  snap?: boolean
  /** Loop transport active — draws the labeled loop-zone band across the ruler. */
  loop?: boolean
  range: { start: number; end: number }
  /** Additive = Cmd/Ctrl-click (toggle clip in the multi-selection). */
  onSelect: (trackId: string, clipId: string | null, additive?: boolean) => void
  onPlayhead: (sec: number) => void
  /** Fired once at the start of a move/trim/roll drag so the host can snapshot undo. */
  onEditStart?: () => void
  onMoveClip: (trackId: string, clipId: string, offset: number) => void
  onTrimClip: (trackId: string, clipId: string, edge: 'in' | 'out', time: number) => void
  /** Roll trim: Shift+drag an edge trims the neighbour, preserving total length. */
  onRollTrim?: (trackId: string, clipId: string, edge: 'in' | 'out', time: number) => void
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
  /** Transport rolling — gently pulses the playhead glow. Visual only; defaults off. */
  playing?: boolean
  /**
   * Drop the embedded tile's border / rounding / shadow so this board can sit
   * flush as the audio row inside a unified per-person track group. Visual only.
   */
  flush?: boolean
  /**
   * Reserve a fixed-width, non-scrolling left column before the board so the
   * time axis lines up with per-person track groups that carry a header rail
   * of the same width. Used by the shared ruler. Visual only.
   */
  gutterLeft?: number
}

/**
 * Resolve a persistent lane hue for a person. Canonical ids ('host', 'guest',
 * 'cohost-N') map straight through; any other id falls back to a stable index so
 * every participant keeps one colour across renders. Visual only — no logic reads this.
 */
function laneColorForPerson(personId: string | null | undefined, index: number): LaneColor {
  if (personId && (LANE_IDS as readonly string[]).includes(personId)) {
    return laneColor(personId as LaneId)
  }
  return laneColor(index)
}

function subscribeDpr(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

export function useTrackDpr(): number {
  return useSyncExternalStore(subscribeDpr, () => trackDisplayRatio(), () => 1)
}

export function TimelinePlayhead({
  sec,
  pxPerSec,
  playing = false,
}: {
  sec: number
  pxPerSec: number
  /** Gently pulses the glow while transport is rolling. Reduced-motion safe. */
  playing?: boolean
}) {
  const dpr = useTrackDpr()
  const hair = snapHairline(sec * pxPerSec, dpr)
  // Bold 5px stem centred on the snapped hairline, with a soft ice-blue glow.
  const stem = 5
  const left = hair.left - (stem - hair.width) / 2
  return (
    <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left, width: stem }}>
      {/* Grab handle: a rounded ice-blue cap at the top of the stem. */}
      <span
        aria-hidden
        className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-2.5 w-3 rounded-clip bg-ice shadow-glow-medium"
      />
      {/* The stem itself — bold, glowing, gently breathing while playing. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-full rounded-full bg-ice shadow-glow-medium ${
          playing ? 'animate-glow-pulse' : ''
        }`}
      />
    </div>
  )
}

export function SessionTimeline({
  people,
  tracks,
  playhead,
  pxPerSec,
  selectedId,
  selectedClipId,
  selectedClipIds,
  snap = false,
  loop = false,
  range,
  onSelect,
  onPlayhead,
  onEditStart,
  onMoveClip,
  onTrimClip,
  onRollTrim,
  onRange,
  personId = null,
  durationSec,
  embedded = false,
  showRuler = true,
  rulerOnly = false,
  scrollLeft,
  onScrollLeft,
  playing = false,
  flush = false,
  gutterLeft,
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
    | { kind: 'trim'; trackId: string; clipId: string; edge: 'in' | 'out'; roll: boolean }
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
      if (Math.abs(event.clientX - d.startX) > 3) d.moved = true
      const delta = (event.clientX - d.startX) / pxPerSec
      onMoveClip(d.trackId, d.clipId, Math.max(0, d.startOffset + delta))
    } else if (d.kind === 'trim') {
      if (d.roll && onRollTrim) onRollTrim(d.trackId, d.clipId, d.edge, t)
      else onTrimClip(d.trackId, d.clipId, d.edge, t)
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
    // Cmd/Ctrl-click toggles multi-selection; a plain click replaces it.
    onSelect(track.id, clip.id, event.metaKey || event.ctrlKey)
    if (edge) {
      onEditStart?.()
      // Shift+drag an edge = roll trim (moves the boundary with the neighbour).
      drag.current = { kind: 'trim', trackId: track.id, clipId: clip.id, edge, roll: event.shiftKey }
      return
    }
    onEditStart?.()
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
  // Loop-zone band: a labeled translucent region on the ruler when loop is armed
  // over a real range. Purely presentational; the transport owns the loop logic.
  const showLoopBand = loop && hasRange && showRuler

  const board = (
    <div
      ref={boardRef}
      // Focusable + named: keyboard users can reach and scroll the board, and the
      // single-letter editing shortcuts fire while it (or nothing) has focus.
      tabIndex={rulerOnly ? undefined : 0}
      role={rulerOnly ? undefined : 'region'}
      aria-label={
        rulerOnly ? undefined : scopedPeople.length === 1 ? `Timeline for ${scopedPeople[0].name}` : 'Timeline'
      }
      data-timeline
      className="overflow-x-auto rounded-clip outline-none focus-visible:ring-2 focus-visible:ring-ice/60"
      onScroll={(e) => onScrollLeft?.(e.currentTarget.scrollLeft)}
      onPointerMove={onBoardPointerMove}
      onPointerUp={onBoardPointerUp}
      onPointerCancel={onBoardPointerUp}
    >
      <div className="relative" style={{ width, minHeight: rulerOnly ? rulerH || 24 : 56 }}>
        {showRuler && (
          <div
            className="sticky top-0 z-10 h-6 border-b border-divider bg-surface-sunken"
            onPointerDown={onRulerPointerDown}
          >
            {ticks.map(({ t, major }) => {
              const left = Math.round(t * pxPerSec)
              return (
                <span key={t} className="absolute top-0 h-full pointer-events-none" style={{ left }}>
                  <i
                    className={`absolute top-0 block ${major ? 'h-2 bg-silver-label' : 'h-1 bg-divider'}`}
                    style={{ left: 0, width: 1 }}
                  />
                  {major && (
                    <span className="studio-type-timecode absolute top-2.5 leading-none text-silver-label" style={{ left: 3 }}>
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
            className="absolute bottom-0 z-20 pointer-events-none bg-forged/10 border-x border-forged/40"
            style={{
              top: rulerH,
              left: selBox.left,
              width: selBox.width,
            }}
          />
        )}

        {showLoopBand && (
          <div
            className="absolute z-20 pointer-events-none rounded-clip border-x-2 border-ice/70 bg-ice/10"
            style={{ top: 0, height: rulerH, left: selBox.left, width: selBox.width }}
          >
            <span
              className="studio-type-label absolute left-1 top-1/2 -translate-y-1/2 rounded-clip bg-ice/20 px-1 leading-none text-ice"
              style={{ maxWidth: Math.max(0, selBox.width - 6) }}
            >
              ⟲ Loop {formatClock(selStart)}–{formatClock(selEnd)}
            </span>
          </div>
        )}

        {rows.map(({ person, lane }, rowIndex) => {
          const hasComp = Boolean(person && lane.some((t) => isVoiceRole(t.role) && (t.compRanges || []).length > 0))
          const laneCount = Math.max(1, lane.length)
          const topPad = showPersonLabel ? 18 : hasComp ? 8 : 6
          // Persistent GarageBand-style hue for this lane, keyed to the person.
          const hue = laneColorForPerson(person?.id, rowIndex)
          return (
            <div
              key={person?.id || 'lane'}
              className="relative border-t border-divider"
              style={{ height: topPad + laneCount * 52, background: hue.laneBg }}
              onPointerDown={lane[0] ? undefined : onEmptyLanePointerDown}
            >
              {showPersonLabel && (
                <span className="absolute z-20 inline-flex items-center gap-1.5" style={{ left: 8, top: 4 }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: hue.base }} />
                  <span className="studio-type-label text-silver-label">{person?.name || 'Takes'}</span>
                </span>
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
                            background: hue.base,
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
                      <span className="studio-type-label absolute z-20 text-silver-label pointer-events-none" style={{ left: 8, top: 0 }}>
                        take {track.take}
                      </span>
                    )}
                    {clips.length === 0 && (
                      <div
                        className="studio-type-label absolute h-9 rounded-clip border border-dashed px-2 flex items-center text-silver-label transition-colors"
                        style={{
                          left: embedded ? 52 : 8,
                          minWidth: 72,
                          top: 8,
                          borderColor: hue.border,
                          background: `${hue.laneBg}`,
                        }}
                      >
                        {track.armed ? 'armed — press Record' : 'no take yet'}
                      </div>
                    )}
                    {clips.map((clip) => (
                      <Clip
                        key={clip.id}
                        track={track}
                        clip={clip}
                        laneColor={hue}
                        pxPerSec={pxPerSec}
                        selected={
                          selectedClipIds
                            ? selectedClipIds.has(clip.id) ||
                              (selectedId === track.id && !selectedClipId && selectedClipIds.size === 0)
                            : selectedId === track.id && (selectedClipId === clip.id || !selectedClipId)
                        }
                        multi={Boolean(selectedClipIds && selectedClipIds.size > 1 && selectedClipIds.has(clip.id))}
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
                <p className="studio-type-label absolute text-silver-label normal-case tracking-normal" style={{ left: 8, top: 8 }}>
                  No takes yet — add one, then record.
                </p>
              )}
            </div>
          )
        })}

        <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} playing={playing} />
      </div>
    </div>
  )

  if (embedded || rulerOnly) {
    const shell =
      flush
        ? 'bg-obsidian overflow-hidden'
        : 'rounded-tile border border-divider bg-obsidian overflow-hidden shadow-depth-sm'
    if (gutterLeft != null) {
      return (
        <div className={shell}>
          <div className="flex items-stretch">
            <div
              className="shrink-0 flex items-center border-r border-divider px-2"
              style={{ width: gutterLeft }}
            >
              <span className="studio-type-label text-silver-label">Timeline</span>
            </div>
            <div className="min-w-0 flex-1">{board}</div>
          </div>
        </div>
      )
    }
    return <div className={shell}>{board}</div>
  }

  return (
    <div className="rounded-tile border border-divider bg-surface-card overflow-hidden shadow-depth-md">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <p className="studio-type-column text-ice">Session timeline</p>
        <p className="studio-type-timecode text-silver-body">
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
  laneColor,
  pxPerSec,
  selected,
  multi = false,
  dim,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTrimIn,
  onTrimOut,
}: {
  track: StudioTrack
  clip: TrackClip
  laneColor: LaneColor
  pxPerSec: number
  selected: boolean
  /** Part of a multi-selection (>1 clip) — draws an accent ring. */
  multi?: boolean
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
      className={`group absolute overflow-hidden rounded-clip cursor-grab active:cursor-grabbing transition-[box-shadow,transform,filter] duration-150 will-change-transform hover:-translate-y-px hover:brightness-110 hover:shadow-glow-subtle ${
        selected
          ? multi
            ? 'shadow-highlight-rim ring-2 ring-ice/80'
            : 'shadow-highlight-rim ring-1 ring-ice/60'
          : 'shadow-depth-sm hover:shadow-depth-md'
      }`}
      style={{
        left: box.left,
        width: box.width,
        height: 40,
        top: 0,
        background: laneColor.clipFill,
        border: `1px solid ${selected ? laneColor.base : laneColor.border}`,
        opacity: !track.buffer && dim ? 0.45 : dim ? 0.7 : 1,
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
          color={laneColor.base}
          dim={dim}
        />
      )}
      <span
        className="studio-type-label absolute leading-none text-white pointer-events-none truncate normal-case tracking-normal"
        style={{ left: 6, top: 3, maxWidth: '70%' }}
      >
        {track.name}
        {clip.muted ? ' · mut' : ''}
      </span>
      <button
        type="button"
        aria-label={`Trim start of ${track.name}`}
        className="absolute left-0 top-0 z-10 h-full w-2.5 cursor-ew-resize rounded-l-clip bg-transparent hover:bg-white/15 focus-visible:bg-white/25"
        onPointerDown={onTrimIn}
      />
      <button
        type="button"
        aria-label={`Trim end of ${track.name}`}
        className="absolute right-0 top-0 z-10 h-full w-2.5 cursor-ew-resize rounded-r-clip bg-transparent hover:bg-white/15 focus-visible:bg-white/25"
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
      <path d={d} fill="none" stroke="var(--ice-blue)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.85" />
    </svg>
  )
}
