'use client'

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import type { ProgramCut, ProgramScene } from '@/lib/podcast/camera'
import { snapHairline, snapSpan, trackDisplayRatio } from '@/lib/podcast/peaks'
import { TimelinePlayhead, useTrackDpr } from '@/components/podcast/session-timeline'

type Props = {
  clips: CameraClip[]
  /** Omit inside a LiveStoreContext provider — the hairline follows the live store. */
  playhead?: number
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
  /** Called once when a drag (move / trim) actually starts — one undo step per drag. */
  onEditStart?: () => void
  /** Remove the selected clip from the lane (Del). */
  onDelete?: () => void
  /** Shown instead of nothing when the lane is empty (e.g. camera is on but no take yet). */
  emptyHint?: string | null
  /** Program scene cuts drawn as ticks so picture edits line up with switching. */
  cuts?: ProgramCut[]
}

export const CameraLane = memo(function CameraLane({
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
  onEditStart,
  onDelete,
  emptyHint,
  cuts,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const width = Math.max(480, Math.round(durationSec * pxPerSec))
  const drag = useRef<
    | { kind: 'move'; clipId: string; startX: number; startOffset: number; moved: boolean }
    | { kind: 'trim'; clipId: string; edge: 'in' | 'out'; started: boolean }
    | { kind: 'range'; anchor: number }
    | { kind: 'seek' }
    | null
  >(null)
  const selected = clips.find((c) => c.id === selectedId) || null
  const showBroken = Boolean(broken && linked)

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
      if (!d.moved && Math.abs(event.clientX - d.startX) <= 3) return
      if (!d.moved) {
        d.moved = true
        onEditStart?.()
      }
      const delta = (event.clientX - d.startX) / pxPerSec
      onMoveClip?.(d.clipId, Math.max(0, d.startOffset + delta))
    } else if (d.kind === 'trim') {
      if (!d.started) {
        d.started = true
        onEditStart?.()
      }
      onTrimClip?.(d.clipId, d.edge, t)
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

  if (clips.length === 0) {
    if (!emptyHint) return null
    return (
      <div className="rounded-lg border border-dashed border-[#1A232C] bg-[#05070A] px-2 py-1.5">
        <p className="text-[10px] text-[#7C8B97]">
          <span className="uppercase tracking-wider">Camera takes</span> · {emptyHint}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#1A232C] bg-[#05070A] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Camera takes</p>
          {onLinkedChange && (
            <button
              type="button"
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                linked ? 'border-[#53D6FF]/50 text-[#8DEBFF]' : 'border-[#27313B] text-[#7C8B97]'
              }`}
              onClick={() => onLinkedChange(!linked)}
              title={
                linked
                  ? 'Linked: moving a take can nudge this camera. Trim/split/cut stay independent.'
                  : 'Unlinked: audio and picture edit on their own. Same playhead.'
              }
            >
              {linked ? 'Linked' : 'Unlinked'}
            </button>
          )}
          {showBroken && drift && (
            <span
              className="text-[10px] font-mono text-[#FFB86B]"
              title={`Audio in-point ${formatClock(drift.audioOffset)} vs picture ${formatClock(drift.cameraOffset)}`}
            >
              Broken sync · {formatDrift(drift.seconds)}
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-[#7C8B97]">
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
            {range && range.end - range.start > 0.04 && (
              <div
                className="absolute top-0 bottom-0 bg-[#53D6FF]/10 pointer-events-none"
                style={{
                  left: snapHairline(range.start * pxPerSec, 1).left,
                  width: Math.max(2, (range.end - range.start) * pxPerSec),
                }}
              />
            )}
            {(cuts || []).map((cut) => (
              <div
                key={cut.id}
                className="absolute top-0 bottom-0 z-10 pointer-events-none w-px bg-[#FF5B73]/50"
                style={{ left: snapHairline(cut.at * pxPerSec, 1).left }}
              />
            ))}
            {(markers || []).map((mark) => (
              <div
                key={`${mark.time}-${mark.label}`}
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: snapHairline(mark.time * pxPerSec, 1).left }}
                title={`${mark.label} · ${formatClock(mark.time)}`}
              >
                <div className="h-full w-px bg-[#FFB86B]" />
                <span className="absolute top-0 left-1 max-w-[7rem] truncate text-[9px] uppercase tracking-wider text-[#FFB86B]">
                  {mark.label}
                </span>
              </div>
            ))}
            {clips.map((clip) => {
              const isSelected = selectedId === clip.id
              const box = snapSpan(clip.offset * pxPerSec, cameraClipEnd(clip) * pxPerSec, 28)
              const kind = cameraKind(clip)
              const kindLabel =
                kind === 'title' ? 'title' : kind === 'broll' ? 'b-roll' : kind === 'stinger' ? 'sting' : 'cam'
              const clipColor =
                kind === 'title' ? '#8DEBFF' : kind === 'broll' ? '#FFB86B' : kind === 'stinger' ? '#F6FAFC' : color
              return (
                <div
                  key={clip.id}
                  data-cam-clip={clip.id}
                  title={`${kindLabel} ${formatClock(clip.offset)}–${formatClock(cameraClipEnd(clip))} · in ${formatClock(cameraSourceStart(clip))} · ${formatBytes(clip.bytes)}${clip.muted ? ' · muted' : ''}${clip.fadeIn || clip.fadeOut ? ` · fade ${clip.fadeIn || 0}/${clip.fadeOut || 0}` : ''}`}
                  className={`absolute text-left text-[10px] leading-none font-mono truncate ${
                    isSelected ? 'text-[#F6FAFC]' : 'text-[#B8C4CF]'
                  } ${clip.muted ? 'opacity-40' : ''}`}
                  style={{
                    top: 6,
                    height: 28,
                    left: box.left,
                    width: box.width,
                    paddingLeft: 6,
                    paddingRight: 6,
                    borderRadius: 4,
                    border: `1px solid ${isSelected ? '#53D6FF' : '#27313B'}`,
                    background: `${clipColor}22`,
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
                  <FilmSprockets color={clipColor} />
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
                      drag.current = { kind: 'trim', clipId: clip.id, edge: 'in', started: false }
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
                      drag.current = { kind: 'trim', clipId: clip.id, edge: 'out', started: false }
                    }}
                  />
                </div>
              )
            })}
            <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} />
          </div>
        </div>
      )}
      {(onSplit || onCutHole || onSlip || onLinkedChange) && clips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#1A232C] px-2 py-1.5">
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={onSplit}>
            Split
          </button>
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={() => onTrimEdge?.('in')}>
            Trim in
          </button>
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={() => onTrimEdge?.('out')}>
            Trim out
          </button>
          <button type="button" className={toolBtn} disabled={disabled} onClick={() => onCutHole?.(false)}>
            Remove, leave gap
          </button>
          <button type="button" className={toolBtn} disabled={disabled} onClick={() => onCutHole?.(true)}>
            Remove &amp; close gap
          </button>
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={() => onSlip?.(-0.1)}>
            Slip −
          </button>
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={() => onSlip?.(0.1)}>
            Slip +
          </button>
          <button type="button" className={toolBtn} disabled={disabled || !selected} onClick={onMute}>
            {selected?.muted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" className={toolBtn} disabled={disabled} onClick={onJoin}>
            Join
          </button>
          {onDelete && (
            <button
              type="button"
              className={toolBtn}
              disabled={disabled || !selected}
              onClick={onDelete}
              title="Remove the selected clip from the lane (Del). Undo brings it back."
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className={toolBtn}
            disabled={disabled || !selected}
            onClick={onDissolve}
            title="Overlap the next clip and fade — Kdenlive / MLT dissolve. Picture only."
          >
            Dissolve
          </button>
          {onStinger && (
            <>
              <button
                type="button"
                className={toolBtn}
                disabled={disabled}
                onClick={() => onStinger('playhead')}
                title="OBS-style black flash at the playhead — canvas, not a plugin."
              >
                Stinger
              </button>
              <button
                type="button"
                className={toolBtn}
                disabled={disabled || !selected}
                onClick={() => onStinger('cut')}
                title="Black flash at the selected clip’s out-point (between clips)."
              >
                Sting cut
              </button>
              <button
                type="button"
                className={toolBtn}
                disabled={disabled || !markers?.length}
                onClick={() => onStinger('chapters')}
                title="Black flash at each chapter marker."
              >
                Sting chapters
              </button>
            </>
          )}
          <p className="text-[10px] text-[#7C8B97] ml-1">
            Picture only — audio stays on the voice lanes. V splits · Del removes · ⌘Z undoes.
          </p>
        </div>
      )}
    </div>
  )
})

const toolBtn =
  'inline-flex min-h-[28px] items-center px-2 py-0.5 rounded border border-[#4A5968] text-[10px] uppercase tracking-wider text-[#D5DEE6] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8DEBFF]'

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
  /** Title / stinger length in seconds. */
  onDuration?: (seconds: number) => void
  /** First change of a slider drag — the editor pushes one undo step. */
  onEditStart?: () => void
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
  onDuration,
  onEditStart,
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
      <div
        className="space-y-1 min-w-[16rem] flex-1"
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') onEditStart?.()
        }}
        onKeyDownCapture={(e) => {
          if ((e.target as HTMLElement).getAttribute('type') === 'range') onEditStart?.()
        }}
      >
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
              ? 'Overlay movie on the Output. Cover replaces the full-screen picture; Picture-in-picture keeps it. Audio mix unchanged.'
              : kind === 'stinger'
                ? 'Short flash on the Output. Black or a title card. Not in the podcast audio.'
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
        {(kind === 'title' || kind === 'stinger') && onDuration && (
          <label className="block max-w-xs text-[10px] text-[#A9B8C6]">
            Length {clip.duration.toFixed(2)}s
            <input
              type="range"
              min={0.2}
              max={kind === 'stinger' ? 3 : 20}
              step={0.05}
              value={clip.duration}
              onChange={(e) => onDuration(Number(e.target.value))}
              className="w-full accent-[#53D6FF]"
            />
          </label>
        )}
        {kind === 'broll' && onOverlayFit && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            onClick={() => onOverlayFit(clip.overlayFit === 'pip' ? 'cover' : 'pip')}
          >
            {clip.overlayFit === 'pip' ? 'Picture-in-picture' : 'Cover full-screen'}
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
              title="Two linear points — opacity and position. Painted in the Output / full-screen video."
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

const SCENE_COLOR: Record<ProgramScene, string> = {
  host: '#53D6FF',
  guest: '#FFB86B',
  pip: '#B78CFF',
}

const SCENE_LABEL: Record<ProgramScene, string> = {
  host: 'Host',
  guest: 'Guest',
  pip: 'Side by side',
}

type CutLaneProps = {
  cuts: ProgramCut[]
  startScene: ProgramScene
  /** Omit inside a LiveStoreContext provider. */
  playhead?: number
  pxPerSec: number
  durationSec: number
  scrollLeft?: number
  onScrollLeft?: (left: number) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPlayhead?: (sec: number) => void
  onMove?: (cutId: string, at: number) => void
  onEditStart?: () => void
  onRemove?: (cutId: string) => void
  onFade?: (cutId: string, fade: number) => void
  onScene?: (cutId: string, scene: ProgramScene) => void
  onClear?: () => void
  disabled?: boolean
}

/**
 * Program lane — which scene is on air over time (OBS Studio-mode switch log on the NLE clock).
 * Drag a tick to retime a cut; the export and Program monitor follow this lane.
 */
export const ProgramCutLane = memo(function ProgramCutLane({
  cuts,
  startScene,
  playhead,
  pxPerSec,
  durationSec,
  scrollLeft,
  onScrollLeft,
  selectedId,
  onSelect,
  onPlayhead,
  onMove,
  onEditStart,
  onRemove,
  onFade,
  onScene,
  onClear,
  disabled,
}: CutLaneProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const width = Math.max(480, Math.round(durationSec * pxPerSec))
  const drag = useRef<{ cutId: string; startX: number; startAt: number; moved: boolean } | { seek: true } | null>(null)
  const selected = cuts.find((c) => c.id === selectedId) || null

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

  const segments: { from: number; to: number; scene: ProgramScene }[] = []
  let prevAt = 0
  let prevScene = startScene
  for (const cut of cuts) {
    segments.push({ from: prevAt, to: cut.at, scene: prevScene })
    prevAt = cut.at
    prevScene = cut.scene
  }
  segments.push({ from: prevAt, to: durationSec, scene: prevScene })

  return (
    <div className="rounded-lg border border-[#1A232C] bg-[#05070A] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1">
        <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">
          Output lane · {cuts.length ? `${cuts.length} scene cut${cuts.length === 1 ? '' : 's'}` : `all ${SCENE_LABEL[startScene]}`}
        </p>
        <p className="text-[10px] text-[#7C8B97]">
          {cuts.length === 0
            ? 'Click Host / Guest / Side by side (or ⌥1–3) to switch at the playhead — live while recording.'
            : 'Drag a tick to retime. Export follows this lane.'}
        </p>
      </div>
      <div
        ref={boardRef}
        className="overflow-x-auto"
        onScroll={(e) => onScrollLeft?.(e.currentTarget.scrollLeft)}
        onPointerMove={(event) => {
          const d = drag.current
          if (!d) return
          if ('seek' in d) {
            onPlayhead?.(timeFromClientX(event.clientX))
            return
          }
          if (!d.moved && Math.abs(event.clientX - d.startX) <= 3) return
          if (!d.moved) {
            d.moved = true
            onEditStart?.()
          }
          onMove?.(d.cutId, Math.max(0, d.startAt + (event.clientX - d.startX) / pxPerSec))
        }}
        onPointerUp={(event) => {
          drag.current = null
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            /* already released */
          }
        }}
      >
        <div
          className="relative"
          style={{ width, height: 22 }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('[data-pgm-cut]')) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { seek: true }
            onPlayhead?.(timeFromClientX(event.clientX))
            onSelect(null)
          }}
        >
          {segments.map((seg, i) =>
            seg.to - seg.from > 0.001 ? (
              <div
                key={`${seg.from}-${i}`}
                className="absolute top-1 bottom-1 rounded-sm text-[9px] uppercase tracking-wider leading-[14px] px-1 truncate pointer-events-none"
                style={{
                  left: seg.from * pxPerSec,
                  width: Math.max(1, (seg.to - seg.from) * pxPerSec),
                  background: `${SCENE_COLOR[seg.scene]}22`,
                  color: SCENE_COLOR[seg.scene],
                }}
              >
                {SCENE_LABEL[seg.scene]}
              </div>
            ) : null,
          )}
          {cuts.map((cut) => (
            <button
              key={cut.id}
              type="button"
              data-pgm-cut={cut.id}
              aria-label={`${SCENE_LABEL[cut.scene]} cut at ${formatClock(cut.at)}`}
              title={`${SCENE_LABEL[cut.scene]} at ${formatClock(cut.at)}${cut.fade ? ` · fade ${cut.fade.toFixed(2)}s` : ' · cut'}`}
              className="absolute top-0 bottom-0 z-20 w-2 -ml-1 cursor-ew-resize"
              style={{ left: cut.at * pxPerSec }}
              disabled={disabled}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.currentTarget.parentElement?.parentElement?.setPointerCapture(event.pointerId)
                onSelect(cut.id)
                drag.current = { cutId: cut.id, startX: event.clientX, startAt: cut.at, moved: false }
              }}
            >
              <span
                className="block h-full w-0.5 mx-auto"
                style={{
                  background: selectedId === cut.id ? '#F6FAFC' : SCENE_COLOR[cut.scene],
                  boxShadow: cut.fade ? `0 0 6px ${SCENE_COLOR[cut.scene]}` : undefined,
                }}
              />
            </button>
          ))}
          <TimelinePlayhead sec={playhead} pxPerSec={pxPerSec} />
        </div>
      </div>
      {(selected || (onClear && cuts.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#1A232C] px-2 py-1.5">
          {selected && (
            <>
              <span className="text-[10px] font-mono text-[#B8C4CF]">{formatClock(selected.at)}</span>
              {(['host', 'guest', 'pip'] as ProgramScene[]).map((scene) => (
                <button
                  key={scene}
                  type="button"
                  className={toolBtn}
                  style={selected.scene === scene ? { borderColor: SCENE_COLOR[scene], color: SCENE_COLOR[scene] } : undefined}
                  disabled={disabled}
                  onClick={() => onScene?.(selected.id, scene)}
                >
                  {SCENE_LABEL[scene]}
                </button>
              ))}
              <button
                type="button"
                className={toolBtn}
                disabled={disabled}
                onClick={() => onFade?.(selected.id, selected.fade ? 0 : 0.45)}
                title="Toggle a 0.45s dissolve into this scene"
              >
                {selected.fade ? 'Fade → cut' : 'Cut → fade'}
              </button>
              <button type="button" className={toolBtn} disabled={disabled} onClick={() => onRemove?.(selected.id)}>
                Delete cut
              </button>
            </>
          )}
          {onClear && cuts.length > 0 && (
            <button type="button" className={toolBtn} disabled={disabled} onClick={onClear}>
              Clear all cuts
            </button>
          )}
        </div>
      )}
    </div>
  )
})
