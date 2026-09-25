'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Scissors } from 'lucide-react'
import { formatClock } from '@/lib/podcast/audio'
import { formatDrift, type AvDrift } from '@/lib/podcast/av-sync'
import {
  cameraClipEnd,
  cameraKind,
  cameraSourceStart,
  clipKeyframes,
  formatBytes,
  type CameraClip,
  type PictureKeyframe,
  type StingerStyle,
} from '@/lib/podcast/camera'
import {
  drawPeakEnvelope,
  peakBucketCount,
  peakEnvelopeSlice,
  snapHairline,
  snapSpan,
  trackDisplayRatio,
} from '@/lib/podcast/peaks'
import type { SwitchEDL } from '@/lib/podcast/switch-edl'
import { TimelinePlayhead, useTrackDpr } from '@/components/podcast/session-timeline'
import { Button, IconButton } from '@/components/studio-ui'
import { laneColor, LANE_IDS, type LaneColor, type LaneId } from '@/lib/podcast/lanes'

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
  onPlayhead?: (sec: number) => void
  onMoveClip?: (clipId: string, offset: number) => void
  onTrimClip?: (clipId: string, edge: 'in' | 'out', time: number) => void
  onRange?: (start: number, end: number) => void
  range?: { start: number; end: number }
  linked?: boolean
  onLinkedChange?: (linked: boolean) => void
  drift?: AvDrift | null
  broken?: boolean
  /** One-click "snap to sync": nudge the lagging picture to the audio in-point (or vice-versa). */
  onSnapSync?: () => void
  onSplit?: () => void
  onCutHole?: (ripple: boolean) => void
  onTrimEdge?: (edge: 'in' | 'out') => void
  onSlip?: (delta: number) => void
  onMute?: () => void
  onJoin?: () => void
  onDissolve?: () => void
  onStinger?: (where: 'playhead' | 'cut' | 'chapters') => void
  markers?: { time: number; label: string }[]
  disabled?: boolean
  /** Camera-switch decisions (movable, non-destructive) drawn as vertical cuts on the lane. */
  edl?: SwitchEDL
  /** Options for a marker's "main camera" picker + the default main for a new cut. */
  switchParticipants?: { id: string; name: string }[]
  onAddSwitch?: (atSec: number, mainId: string) => void
  onMoveSwitch?: (id: string, toSec: number) => void
  onRemoveSwitch?: (id: string) => void
  onSetSwitchMain?: (id: string, mainId: string) => void
  /** Waveform source drawn under this person's video lane. Null degrades to bare clips. */
  audioForPerson?: (personId: string) => AudioBuffer | null
}

/** Persistent lane hue for a camera person — canonical ids pass through, else index-stable. */
function laneColorFor(personId: string | null | undefined, index = 0): LaneColor {
  if (personId && (LANE_IDS as readonly string[]).includes(personId)) {
    return laneColor(personId as LaneId)
  }
  return laneColor(index)
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
  onPlayhead,
  onMoveClip,
  onTrimClip,
  onRange,
  range,
  linked = true,
  onLinkedChange,
  drift,
  broken,
  onSnapSync,
  onSplit,
  onCutHole,
  onTrimEdge,
  onSlip,
  onMute,
  onJoin,
  onDissolve,
  onStinger,
  markers,
  disabled,
  edl,
  switchParticipants,
  onAddSwitch,
  onMoveSwitch,
  onRemoveSwitch,
  onSetSwitchMain,
  audioForPerson,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const width = Math.max(480, Math.round(durationSec * pxPerSec))
  // Which switch marker is actively being dragged — drives the highlight rim.
  const [draggingSwitchId, setDraggingSwitchId] = useState<string | null>(null)
  const drag = useRef<
    | { kind: 'move'; clipId: string; startX: number; startOffset: number; moved: boolean }
    | { kind: 'trim'; clipId: string; edge: 'in' | 'out' }
    | { kind: 'switch'; id: string; moved: boolean }
    | { kind: 'range'; anchor: number }
    | { kind: 'seek' }
    | null
  >(null)
  const selected = clips.find((c) => c.id === selectedId) || null
  const showBroken = Boolean(broken && linked)

  // Every clip on this lane belongs to the same person; use it as the waveform + cut source.
  const personId = clips[0]?.personId ?? null
  const laneHue = laneColorFor(personId)
  const waveBuffer = personId && audioForPerson ? audioForPerson(personId) : null
  const switchEnabled = Boolean(onAddSwitch || onMoveSwitch || onRemoveSwitch || onSetSwitchMain)
  const cuts = edl ?? []
  const pickList = switchParticipants ?? []
  const defaultMainId = pickList[0]?.id ?? personId ?? ''

  /** Snap a raw session time to the playhead or a nearby cut when within ~6px. */
  function snapCutTime(sec: number, ignoreId?: string): number {
    const tol = 6 / pxPerSec
    if (Math.abs(sec - playhead) <= tol) return playhead
    let best = sec
    let bestGap = tol
    for (const ev of cuts) {
      if (ev.id === ignoreId) continue
      const gap = Math.abs(ev.atSec - sec)
      if (gap < bestGap) {
        bestGap = gap
        best = ev.atSec
      }
    }
    return Math.max(0, best)
  }

  function nameForMain(id: string): string {
    return pickList.find((p) => p.id === id)?.name ?? id
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el || scrollLeft == null) return
    if (Math.abs(el.scrollLeft - scrollLeft) > 1) el.scrollLeft = scrollLeft
  }, [scrollLeft, width])

  function timeFromClientX(clientX: number) {
    const el = boardRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pxPerSec)
  }

  function onBoardPointerMove(event: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const t = timeFromClientX(event.clientX)
    if (d.kind === 'move') {
      if (Math.abs(event.clientX - d.startX) > 3) d.moved = true
      const delta = (event.clientX - d.startX) / pxPerSec
      onMoveClip?.(d.clipId, Math.max(0, d.startOffset + delta))
    } else if (d.kind === 'trim') {
      onTrimClip?.(d.clipId, d.edge, t)
    } else if (d.kind === 'switch') {
      d.moved = true
      onMoveSwitch?.(d.id, snapCutTime(t, d.id))
    } else if (d.kind === 'range') {
      onRange?.(Math.min(d.anchor, t), Math.max(d.anchor, t))
      onPlayhead?.(t)
    } else {
      onPlayhead?.(t)
    }
  }

  function onBoardPointerUp(event: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'switch') setDraggingSwitchId(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    if (d?.kind === 'move' && !d.moved) {
      const clip = clips.find((c) => c.id === d.clipId)
      if (clip) {
        const rect = (event.target as HTMLElement).getBoundingClientRect()
        const into = Math.max(0, (event.clientX - rect.left) / pxPerSec)
        onPlayhead?.(clip.offset + into)
      }
    }
  }

  function onEmptyPointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest('[data-cam-clip]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = timeFromClientX(event.clientX)
    if (event.shiftKey) {
      drag.current = { kind: 'range', anchor: t }
      onRange?.(t, t)
    } else {
      drag.current = { kind: 'seek' }
    }
    onPlayhead?.(t)
    onSelect(null)
  }

  if (clips.length === 0 && !(markers && markers.length)) return null

  return (
    <div className="rounded-tile border border-divider bg-obsidian overflow-hidden shadow-depth-sm">
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, background: laneHue.laneBg }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: laneHue.base }} />
            <span className="studio-type-label text-silver-label">Camera takes</span>
          </span>
          {onLinkedChange && (
            <Button
              size="dense"
              variant={linked ? 'secondary' : 'ghost'}
              onClick={() => onLinkedChange(!linked)}
              title={
                linked
                  ? 'Linked: moving a take can nudge this camera. Trim/split/cut stay independent.'
                  : 'Unlinked: audio and picture edit on their own. Same playhead.'
              }
            >
              {linked ? 'Linked' : 'Unlinked'}
            </Button>
          )}
          {showBroken && drift && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="studio-type-timecode text-lane-cohost-1"
                title={`Audio in-point ${formatClock(drift.audioOffset)} vs picture ${formatClock(drift.cameraOffset)}`}
              >
                Broken sync · {formatDrift(drift.seconds)}
              </span>
              {onSnapSync && (
                <Button
                  size="dense"
                  variant="secondary"
                  onClick={onSnapSync}
                  disabled={disabled}
                  title={`Slide the picture ${formatDrift(drift.seconds)} to the audio in-point (${formatClock(drift.audioOffset)}).`}
                >
                  Snap to sync
                </Button>
              )}
            </span>
          )}
        </div>
        <p className="studio-type-timecode text-silver-label">
          {clips.length} file{clips.length === 1 ? '' : 's'}
          {selected ? ` · in ${formatClock(cameraSourceStart(selected))}` : ''}
        </p>
      </div>
      {clips.length > 0 && (
        <div
          ref={boardRef}
          className="overflow-x-auto"
          onScroll={(e) => onScrollLeft?.(e.currentTarget.scrollLeft)}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
        >
          <div className="relative" style={{ width, height: 40 }} onPointerDown={onEmptyPointerDown}>
            {waveBuffer && (
              <LaneWaveform buffer={waveBuffer} cssWidth={width} cssHeight={40} color={color} />
            )}
            {range && range.end - range.start > 0.04 && (
              <div
                className="absolute top-0 bottom-0 bg-forged/10 border-x border-forged/40 pointer-events-none"
                style={{
                  left: snapHairline(range.start * pxPerSec, 1).left,
                  width: Math.max(2, (range.end - range.start) * pxPerSec),
                }}
              />
            )}
            {(markers || []).map((mark) => (
              <div
                key={`${mark.time}-${mark.label}`}
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: snapHairline(mark.time * pxPerSec, 1).left }}
                title={`${mark.label} · ${formatClock(mark.time)}`}
              >
                <div className="h-full w-px bg-lane-cohost-1" />
                <span className="studio-type-label absolute top-0 left-1 max-w-[7rem] truncate text-lane-cohost-1">
                  {mark.label}
                </span>
              </div>
            ))}
            {switchEnabled &&
              cuts.map((ev) => {
                const hair = snapHairline(ev.atSec * pxPerSec, 1)
                // The cut takes its colour from the camera it switches TO.
                const targetHue = laneColorFor(ev.mainId)
                const isDragging = draggingSwitchId === ev.id
                return (
                  <div
                    key={ev.id}
                    className="absolute top-0 bottom-0 z-30 group"
                    style={{ left: hair.left, width: 0 }}
                  >
                    {/* Drag body: a slim hit area centered on the cut line. */}
                    <div
                      role="button"
                      aria-label={`Camera cut to ${nameForMain(ev.mainId)} at ${formatClock(ev.atSec)}`}
                      title={`Cut → ${nameForMain(ev.mainId)} · ${formatClock(ev.atSec)}${ev.reason === 'auto' ? ' · auto' : ''} · drag to move`}
                      className="absolute top-0 bottom-0 -left-2 w-4 cursor-ew-resize"
                      onPointerDown={(event) => {
                        if (!onMoveSwitch) return
                        event.stopPropagation()
                        event.currentTarget.setPointerCapture(event.pointerId)
                        drag.current = { kind: 'switch', id: ev.id, moved: false }
                        setDraggingSwitchId(ev.id)
                      }}
                    >
                      {/* Cut line in the target camera's hue; auto cuts read softer. */}
                      <div
                        className="absolute top-0 bottom-0 left-2 w-px"
                        style={{ background: targetHue.base, opacity: ev.reason === 'auto' ? 0.55 : 0.9 }}
                      />
                      {/* Clear diamond marker — filled in the target hue, rimmed while dragged. */}
                      <div
                        className={`absolute top-1 left-2 -translate-x-1/2 h-2 w-2 rotate-45 rounded-[1px] border transition-shadow ${
                          isDragging ? 'shadow-highlight-rim' : ''
                        }`}
                        style={{ background: targetHue.clipFill, borderColor: targetHue.base }}
                      />
                    </div>
                    {/* Retarget picker + delete — appear on hover to keep the lane clean. */}
                    <div className="absolute top-0 left-2.5 z-40 hidden group-hover:flex items-center gap-1 rounded-clip border border-divider bg-surface-card px-1 py-0.5 shadow-depth-md">
                      {onSetSwitchMain && pickList.length > 0 ? (
                        <select
                          aria-label="Cut main camera"
                          value={ev.mainId}
                          disabled={disabled}
                          className="studio-type-label bg-transparent text-ice outline-none normal-case tracking-normal"
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => onSetSwitchMain(ev.id, e.target.value)}
                        >
                          {pickList.map((p) => (
                            <option key={p.id} value={p.id} className="bg-surface-card text-white">
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="studio-type-label text-ice normal-case tracking-normal">{nameForMain(ev.mainId)}</span>
                      )}
                      {onRemoveSwitch && (
                        <IconButton
                          aria-label="Delete camera cut"
                          variant="ghost"
                          size="dense"
                          className="!h-5 !w-5 text-heart"
                          disabled={disabled}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onRemoveSwitch(ev.id)}
                          title="Remove this cut"
                        >
                          <span aria-hidden className="text-[11px] leading-none">✕</span>
                        </IconButton>
                      )}
                    </div>
                  </div>
                )
              })}
            {clips.map((clip) => {
              const isSelected = selectedId === clip.id
              const box = snapSpan(clip.offset * pxPerSec, cameraClipEnd(clip) * pxPerSec, 28)
              const kind = cameraKind(clip)
              const kindLabel =
                kind === 'title' ? 'title' : kind === 'broll' ? 'b-roll' : kind === 'stinger' ? 'sting' : 'cam'
              // Camera clips wear the lane hue; overlays keep their meaning colours.
              const clipColor =
                kind === 'title'
                  ? 'var(--ice-blue)'
                  : kind === 'broll'
                    ? 'var(--lane-cohost-1)'
                    : kind === 'stinger'
                      ? 'var(--white)'
                      : laneHue.base
              const clipFill =
                kind === 'camera'
                  ? laneHue.clipFill
                  : `color-mix(in srgb, ${clipColor} 22%, transparent)`
              // Concrete hex for the canvas sprocket paint (CSS vars don't resolve there).
              const sprocketColor =
                kind === 'title'
                  ? laneColor('guest').base
                  : kind === 'broll'
                    ? laneColor('cohost-1').base
                    : kind === 'stinger'
                      ? '#F6FAFC'
                      : laneHue.base
              return (
                <div
                  key={clip.id}
                  data-cam-clip={clip.id}
                  title={`${kindLabel} ${formatClock(clip.offset)}–${formatClock(cameraClipEnd(clip))} · in ${formatClock(cameraSourceStart(clip))} · ${formatBytes(clip.bytes)}${clip.muted ? ' · muted' : ''}${clip.fadeIn || clip.fadeOut ? ` · fade ${clip.fadeIn || 0}/${clip.fadeOut || 0}` : ''}`}
                  className={`studio-type-timecode absolute text-left leading-none truncate rounded-clip transition-shadow ${
                    isSelected ? 'text-white shadow-highlight-rim' : 'text-silver-body shadow-depth-sm'
                  } ${clip.muted ? 'opacity-40' : ''}`}
                  style={{
                    top: 6,
                    height: 28,
                    left: box.left,
                    width: box.width,
                    paddingLeft: 6,
                    paddingRight: 6,
                    border: `1px solid ${isSelected ? 'transparent' : clipColor}`,
                    background: clipFill,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    onSelect(clip.id)
                    drag.current = {
                      kind: 'move',
                      clipId: clip.id,
                      startX: event.clientX,
                      startOffset: clip.offset,
                      moved: false,
                    }
                  }}
                >
                  <FilmSprockets color={sprocketColor} />
                  <span className="relative z-10">
                    {kind === 'title'
                      ? clip.label || 'title'
                      : kind === 'broll'
                        ? `b-roll ${formatClock(clip.offset)}`
                        : kind === 'stinger'
                          ? clip.stingerStyle === 'title'
                            ? clip.label || 'sting'
                            : 'sting'
                          : `cam ${formatClock(clip.offset)}`}
                    {clip.muted ? ' · mut' : ''}
                    {clip.fadeIn || clip.fadeOut ? ' · xf' : ''}
                    {clip.keyframes?.length ? ' · kf' : ''}
                  </span>
                  <button
                    type="button"
                    aria-label="Trim picture in"
                    className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-10 bg-transparent"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      onSelect(clip.id)
                      drag.current = { kind: 'trim', clipId: clip.id, edge: 'in' }
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Trim picture out"
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize z-10 bg-transparent"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      onSelect(clip.id)
                      drag.current = { kind: 'trim', clipId: clip.id, edge: 'out' }
                    }}
                  />
                </div>
              )
            })}
            <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} />
          </div>
        </div>
      )}
      {(onSplit || onCutHole || onSlip || onLinkedChange || switchEnabled) && clips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-divider px-2 py-1.5">
          {onSplit && (
            <Button
              size="dense"
              variant="primary"
              disabled={disabled || !selected}
              onClick={onSplit}
              title="Snip the selected picture clip at the playhead (V)."
            >
              <Scissors size={12} aria-hidden />
              Snip at playhead
            </Button>
          )}
          {switchEnabled && onAddSwitch && (
            <Button
              size="dense"
              variant="secondary"
              disabled={disabled || !defaultMainId}
              onClick={() => onAddSwitch(snapCutTime(playhead), defaultMainId)}
              title="Drop a camera-switch cut at the playhead. Drag it to move; hover to retarget or delete."
            >
              + Add cut
            </Button>
          )}
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={onSplit}>
            Split
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={() => onTrimEdge?.('in')}>
            Trim in
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={() => onTrimEdge?.('out')}>
            Trim out
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled} onClick={() => onCutHole?.(false)}>
            Cut hole
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled} onClick={() => onCutHole?.(true)}>
            Ripple
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={() => onSlip?.(-0.1)}>
            Slip −
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={() => onSlip?.(0.1)}>
            Slip +
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled || !selected} onClick={onMute}>
            {selected?.muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button size="dense" variant="ghost" disabled={disabled} onClick={onJoin}>
            Join
          </Button>
          <Button
            size="dense"
            variant="ghost"
            disabled={disabled || !selected}
            onClick={onDissolve}
            title="Overlap the next clip and fade — Kdenlive / MLT dissolve. Picture only."
          >
            Dissolve
          </Button>
          {onStinger && (
            <>
              <Button
                size="dense"
                variant="ghost"
                disabled={disabled}
                onClick={() => onStinger('playhead')}
                title="OBS-style black flash at the playhead — canvas, not a plugin."
              >
                Stinger
              </Button>
              <Button
                size="dense"
                variant="ghost"
                disabled={disabled || !selected}
                onClick={() => onStinger('cut')}
                title="Black flash at the selected clip’s out-point (between clips)."
              >
                Sting cut
              </Button>
              <Button
                size="dense"
                variant="ghost"
                disabled={disabled || !markers?.length}
                onClick={() => onStinger('chapters')}
                title="Black flash at each chapter marker."
              >
                Sting chapters
              </Button>
            </>
          )}
          <p className="studio-type-label text-silver-label normal-case tracking-normal ml-1">
            Picture only — audio stays on the voice lanes. V splits. J / K / L is the playhead.
            {switchEnabled ? ' Cut markers drag on the lane; hover a cut to retarget or delete.' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

const WAVE_TILE_CSS = 2048

/**
 * Per-lane waveform background aligned to the full timeline (t=0..durationSec at pxPerSec).
 * Tiled retina canvases; envelopes are cached in the shared peaks WeakMap, so panning /
 * re-rendering never recomputes them. Degrades to nothing when there is no buffer.
 */
function LaneWaveform({
  buffer,
  cssWidth,
  cssHeight,
  color,
}: {
  buffer: AudioBuffer
  cssWidth: number
  cssHeight: number
  color: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dpr = useTrackDpr()
  const width = Math.max(1, Math.round(cssWidth))
  const height = Math.max(1, Math.round(cssHeight))

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const buckets = peakBucketCount(width, dpr)
    // Whole file across the whole lane — same time scale as the clips above it.
    const peaks = peakEnvelopeSlice(buffer, 0, buffer.duration, buckets)
    const tileCount = Math.max(1, Math.ceil(width / WAVE_TILE_CSS))

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
      const left = t * WAVE_TILE_CSS
      const tw = Math.min(WAVE_TILE_CSS, width - left)
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
      // dim=true → recessed background strip so clips + cuts stay legible on top.
      drawPeakEnvelope(ctx, peaks.subarray(start, Math.min(peaks.length, end)), bw, bh, color, true)
    }
  }, [buffer, width, height, color, dpr])

  return <div ref={wrapRef} className="absolute inset-0 z-0 pointer-events-none opacity-70" />
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
  onFilter?: (next: { brightness: number; contrast: number; saturation: number }) => void
  onFades?: (fadeIn: number, fadeOut: number) => void
  onTitle?: (label: string, sublabel: string) => void
  onOverlayFit?: (fit: 'cover' | 'pip') => void
  onStingerStyle?: (style: StingerStyle) => void
  onSeedKeyframes?: () => void
  onAddKeyframe?: () => void
  onUpdateKeyframe?: (index: number, patch: Partial<PictureKeyframe>) => void
  onRemoveKeyframe?: (index: number) => void
}

export function CameraClipReview({
  clip,
  label,
  onDiscard,
  onFilter,
  onFades,
  onTitle,
  onOverlayFit,
  onStingerStyle,
  onSeedKeyframes,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
}: ReviewProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const inPoint = cameraSourceStart(clip)
  const kind = cameraKind(clip)
  const filter = clip.filter || { brightness: 0, contrast: 0, saturation: 0 }
  const keys = clipKeyframes(clip)

  useEffect(() => {
    const el = ref.current
    if (!el || !clip.url) return
    el.src = clip.url
    const seek = () => {
      if (inPoint > 0.04) el.currentTime = inPoint
    }
    el.addEventListener('loadedmetadata', seek)
    return () => {
      el.removeEventListener('loadedmetadata', seek)
      el.removeAttribute('src')
      el.load()
    }
  }, [clip.url, inPoint])

  return (
    <div className="flex flex-wrap items-end gap-2">
      {clip.url ? (
        <div className="relative overflow-hidden rounded-lg border border-[#1A232C] bg-[#05070A] h-[90px] w-[160px]">
          <video
            ref={ref}
            controls
            playsInline
            className="h-full w-full object-cover"
            style={{ filter: `brightness(${1 + filter.brightness}) contrast(${1 + filter.contrast}) saturate(${1 + filter.saturation})` }}
          />
        </div>
      ) : (
        <div className="flex h-[90px] w-[160px] flex-col justify-end rounded-lg border border-[#1A232C] bg-[#05070A] px-2 py-2">
          <p className="truncate text-[12px] text-[#F6FAFC]">{clip.label || 'Title'}</p>
          {clip.sublabel ? <p className="truncate text-[10px] text-[#8DEBFF]">{clip.sublabel}</p> : null}
        </div>
      )}
      <div className="space-y-1 min-w-[16rem] flex-1">
        <p className="text-[11px] text-[#B8C4CF]">
          {label}{' '}
          {kind === 'title' ? 'title' : kind === 'broll' ? 'B-roll' : kind === 'stinger' ? 'stinger' : 'camera'} ·{' '}
          {formatClock(clip.offset)} · {formatClock(clip.duration)}
          {kind !== 'title' && kind !== 'stinger' ? ` · in ${formatClock(inPoint)} · ${formatBytes(clip.bytes)}` : ''}
          {clip.muted ? ' · muted' : ''}
        </p>
        <p className="text-[10px] text-[#7C8B97]">
          {kind === 'title'
            ? 'Kdenlive-style title clip on the picture clock. Canvas text — not in the RSS mix.'
            : kind === 'broll'
              ? 'Overlay movie on Program. Cover replaces A-roll picture; PIP keeps A-roll. Audio mix unchanged.'
              : kind === 'stinger'
                ? 'OBS-style cut flash on Program. Black or a title card — canvas, not a plugin. Not in the RSS mix.'
                : 'Separate file — not in the RSS mix. Color is a Shotcut-style insert. Edits do not rewrite PCM.'}
        </p>
        {kind === 'stinger' && onStingerStyle && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            onClick={() => onStingerStyle(clip.stingerStyle === 'title' ? 'black' : 'title')}
          >
            {clip.stingerStyle === 'title' ? 'Title card' : 'Black flash'}
          </button>
        )}
        {(kind === 'title' || (kind === 'stinger' && clip.stingerStyle === 'title')) && onTitle && (
          <div className="flex flex-wrap gap-2">
            <input
              defaultValue={clip.label || ''}
              key={`${clip.id}-name`}
              placeholder="Name"
              className="w-36 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[11px] text-[#F6FAFC]"
              onBlur={(e) => onTitle(e.target.value, clip.sublabel || '')}
            />
            <input
              defaultValue={clip.sublabel || ''}
              key={`${clip.id}-sub`}
              placeholder="Role / line two"
              className="w-36 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[11px] text-[#F6FAFC]"
              onBlur={(e) => onTitle(clip.label || 'Title', e.target.value)}
            />
          </div>
        )}
        {kind === 'broll' && onOverlayFit && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            onClick={() => onOverlayFit(clip.overlayFit === 'pip' ? 'cover' : 'pip')}
          >
            {clip.overlayFit === 'pip' ? 'Keep A-roll (PIP)' : 'Cover A-roll'}
          </button>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-[#A9B8C6] max-w-lg">
          <label>
            Bright {filter.brightness.toFixed(2)}
            <input
              type="range"
              min={-0.6}
              max={0.6}
              step={0.02}
              value={filter.brightness}
              disabled={!onFilter}
              onChange={(e) =>
                onFilter?.({ ...filter, brightness: Number(e.target.value) })
              }
              className="w-full accent-[#53D6FF]"
            />
          </label>
          <label>
            Contrast {filter.contrast.toFixed(2)}
            <input
              type="range"
              min={-0.6}
              max={0.6}
              step={0.02}
              value={filter.contrast}
              disabled={!onFilter}
              onChange={(e) => onFilter?.({ ...filter, contrast: Number(e.target.value) })}
              className="w-full accent-[#53D6FF]"
            />
          </label>
          <label>
            Sat {filter.saturation.toFixed(2)}
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={filter.saturation}
              disabled={!onFilter}
              onChange={(e) => onFilter?.({ ...filter, saturation: Number(e.target.value) })}
              className="w-full accent-[#53D6FF]"
            />
          </label>
          <label>
            Fade in {(clip.fadeIn || 0).toFixed(2)}s
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.fadeIn || 0}
              disabled={!onFades}
              onChange={(e) => onFades?.(Number(e.target.value), clip.fadeOut || 0)}
              className="w-full accent-[#53D6FF]"
            />
          </label>
          <label>
            Fade out {(clip.fadeOut || 0).toFixed(2)}s
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.fadeOut || 0}
              disabled={!onFades}
              onChange={(e) => onFades?.(clip.fadeIn || 0, Number(e.target.value))}
              className="w-full accent-[#53D6FF]"
            />
          </label>
        </div>
        <div className="space-y-1.5 max-w-lg">
          <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Keyframes</p>
          {keys.length === 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              disabled={!onSeedKeyframes}
              onClick={onSeedKeyframes}
              title="Two linear points — opacity and position. Painted in Program / A-roll."
            >
              Add in / out points
            </button>
          ) : (
            <div className="space-y-2">
              {keys.map((kf, i) => (
                <div key={`${clip.id}-kf-${i}`} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-[#A9B8C6]">
                  <label>
                    At {kf.at.toFixed(2)}s
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.04, clip.duration)}
                      step={0.05}
                      value={kf.at}
                      disabled={!onUpdateKeyframe}
                      onChange={(e) => onUpdateKeyframe?.(i, { at: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                    />
                  </label>
                  <label>
                    Opacity {kf.opacity.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={kf.opacity}
                      disabled={!onUpdateKeyframe}
                      onChange={(e) => onUpdateKeyframe?.(i, { opacity: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                    />
                  </label>
                  <label>
                    X {kf.x.toFixed(2)}
                    <input
                      type="range"
                      min={-0.5}
                      max={0.5}
                      step={0.01}
                      value={kf.x}
                      disabled={!onUpdateKeyframe}
                      onChange={(e) => onUpdateKeyframe?.(i, { x: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                    />
                  </label>
                  <label>
                    Y {kf.y.toFixed(2)}
                    <input
                      type="range"
                      min={-0.5}
                      max={0.5}
                      step={0.01}
                      value={kf.y}
                      disabled={!onUpdateKeyframe}
                      onChange={(e) => onUpdateKeyframe?.(i, { y: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                    />
                  </label>
                  {onRemoveKeyframe && keys.length > 1 && (
                    <button
                      type="button"
                      className="col-span-2 sm:col-span-4 text-left text-[10px] uppercase tracking-wider text-[#7C8B97]"
                      onClick={() => onRemoveKeyframe(i)}
                    >
                      Remove point {i + 1}
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40"
                disabled={!onAddKeyframe || keys.length >= 4}
                onClick={onAddKeyframe}
              >
                Keyframe at playhead
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {clip.url ? (
            <a
              href={clip.url}
              download={`camera-${clip.personId}-${clip.id}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            >
              Download camera file
            </a>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            onClick={onDiscard}
          >
            Discard {kind === 'title' ? 'title' : kind === 'broll' ? 'B-roll' : kind === 'stinger' ? 'stinger' : 'camera take'}
          </button>
        </div>
      </div>
    </div>
  )
}
