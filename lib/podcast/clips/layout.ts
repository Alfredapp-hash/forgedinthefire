/**
 * Safe-area layout per aspect. Pure: only numbers in, rects out, so it is unit-testable and shared
 * by the main-thread painter and the worker.
 *
 * Safe areas follow the usual social overlays: vertical video loses the top (username / sound) and
 * bottom (caption + action rail), square and wide posts only need a small inset.
 */
import type { ClipAspect } from './types'

export type Rect = { x: number; y: number; w: number; h: number }

export type ClipLayout = {
  aspect: ClipAspect
  width: number
  height: number
  /** Inset from each edge that platform chrome may cover. */
  safe: { top: number; bottom: number; left: number; right: number }
  /** Everything below sits inside this rect. */
  safeRect: Rect
  /** Square picture (cover art / video). */
  art: Rect
  /** Episode title + show name. */
  title: Rect
  /** Waveform / bars strip. */
  wave: Rect
  /** Burned-in captions. */
  caption: Rect
  /** Base font sizes (px). */
  font: { title: number; show: number; caption: number }
  /** Max caption characters per line at `font.caption`. */
  captionChars: number
  captionLines: number
}

export const CLIP_DIMENSIONS: Record<ClipAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

const SAFE: Record<ClipAspect, ClipLayout['safe']> = {
  '9:16': { top: 220, bottom: 330, left: 72, right: 72 },
  '1:1': { top: 72, bottom: 72, left: 72, right: 72 },
  '16:9': { top: 72, bottom: 96, left: 96, right: 96 },
}

function inset(width: number, height: number, safe: ClipLayout['safe']): Rect {
  return { x: safe.left, y: safe.top, w: width - safe.left - safe.right, h: height - safe.top - safe.bottom }
}

export function rectContains(outer: Rect, inner: Rect, tolerance = 0.5) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  )
}

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function clipLayout(aspect: ClipAspect): ClipLayout {
  const { width, height } = CLIP_DIMENSIONS[aspect]
  const safe = SAFE[aspect]
  const safeRect = inset(width, height, safe)
  const gap = Math.round(width * 0.03)

  if (aspect === '16:9') {
    // Wide: art on the left, title + wave on the right, captions across the bottom.
    const captionH = Math.round(safeRect.h * 0.3)
    const topH = safeRect.h - captionH - gap
    const artSize = Math.min(topH, Math.round(safeRect.w * 0.34))
    const art: Rect = { x: safeRect.x, y: safeRect.y, w: artSize, h: artSize }
    const right = { x: art.x + art.w + gap * 1.5, w: safeRect.w - artSize - gap * 1.5 }
    const title: Rect = { x: right.x, y: safeRect.y, w: right.w, h: Math.round(topH * 0.5) }
    const wave: Rect = { x: right.x, y: title.y + title.h + gap, w: right.w, h: topH - title.h - gap }
    const caption: Rect = { x: safeRect.x, y: safeRect.y + safeRect.h - captionH, w: safeRect.w, h: captionH }
    return {
      aspect,
      width,
      height,
      safe,
      safeRect,
      art,
      title,
      wave,
      caption,
      font: { title: 56, show: 30, caption: 58 },
      captionChars: 38,
      captionLines: 2,
    }
  }

  // Vertical / square: stacked — art, title, wave, captions.
  const vertical = aspect === '9:16'
  const artSize = Math.min(Math.round(safeRect.w * (vertical ? 0.62 : 0.42)), Math.round(safeRect.h * (vertical ? 0.34 : 0.4)))
  const art: Rect = { x: safeRect.x + Math.round((safeRect.w - artSize) / 2), y: safeRect.y, w: artSize, h: artSize }
  const titleH = vertical ? 200 : 120
  const title: Rect = { x: safeRect.x, y: art.y + art.h + gap, w: safeRect.w, h: titleH }
  const waveH = vertical ? 160 : 90
  const wave: Rect = { x: safeRect.x, y: title.y + title.h + gap, w: safeRect.w, h: waveH }
  const captionTop = wave.y + wave.h + gap
  const caption: Rect = { x: safeRect.x, y: captionTop, w: safeRect.w, h: safeRect.y + safeRect.h - captionTop }
  return {
    aspect,
    width,
    height,
    safe,
    safeRect,
    art,
    title,
    wave,
    caption,
    font: vertical ? { title: 54, show: 30, caption: 64 } : { title: 44, show: 26, caption: 50 },
    captionChars: vertical ? 22 : 30,
    captionLines: vertical ? 3 : 2,
  }
}
