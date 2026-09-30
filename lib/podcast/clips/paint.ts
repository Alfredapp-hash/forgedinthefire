/**
 * Frame painter for share clips. Works on a plain canvas or an OffscreenCanvas (worker), so it
 * only uses the 2D context API and pre-decoded ImageBitmaps.
 */
import { activeWordIndex, captionGroups, fitGroups, groupAt, wrapWords } from './captions'
import { clipLayout, type ClipLayout, type Rect } from './layout'
import { CLIP_BRAND, type CaptionGroup, type ClipSpec } from './types'
import { barLevels, windowLevels, type Peaks } from './waveform'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** A decoded picture: an ImageBitmap, or anything that can draw itself (a mediabunny VideoSample). */
export type Picture =
  | ImageBitmap
  | { width: number; height: number; draw: (ctx: Ctx2D, dx: number, dy: number, dw: number, dh: number) => void }

export type PaintAssets = {
  cover: ImageBitmap | null
  /** Video frame for this instant; painted instead of the cover when present. */
  frame?: Picture | null
  peaks: Peaks
  /** Blurred cover backdrop, built once by the painter (a full-frame blur per frame is too slow). */
  backdrop?: { source: ImageBitmap; canvas: OffscreenCanvas | HTMLCanvasElement } | null
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

export type PaintPlan = {
  layout: ClipLayout
  groups: CaptionGroup[]
  spec: ClipSpec
}

const FONT_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const FONT_SERIF = 'Georgia, "Times New Roman", serif'

/** Everything derived from the spec once, reused every frame. */
export function planPaint(spec: ClipSpec): PaintPlan {
  const layout = clipLayout(spec.aspect)
  const groups = fitGroups(
    captionGroups(spec.words, { maxChars: layout.captionChars * layout.captionLines }),
    layout.captionChars,
    layout.captionLines,
  )
  return { layout, groups, spec }
}

function drawPicture(ctx: Ctx2D, pic: Picture, dx: number, dy: number, dw: number, dh: number) {
  if ('draw' in pic && typeof pic.draw === 'function') pic.draw(ctx, dx, dy, dw, dh)
  else ctx.drawImage(pic as ImageBitmap, dx, dy, dw, dh)
}

function drawCover(ctx: Ctx2D, pic: Picture, r: Rect, radius = 0) {
  const pw = pic.width
  const ph = pic.height
  if (!pw || !ph) return
  const scale = Math.max(r.w / pw, r.h / ph)
  const dw = pw * scale
  const dh = ph * scale
  ctx.save()
  roundedRect(ctx, r, radius)
  ctx.clip()
  drawPicture(ctx, pic, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh)
  ctx.restore()
}

function roundedRect(ctx: Ctx2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.w / 2, r.h / 2)
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.lineTo(r.x + r.w - rad, r.y)
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad)
  ctx.lineTo(r.x + r.w, r.y + r.h - rad)
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h)
  ctx.lineTo(r.x + rad, r.y + r.h)
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rad)
  ctx.lineTo(r.x, r.y + rad)
  ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y)
  ctx.closePath()
}

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Ellipsise a line to fit `maxWidth` using real measurement. */
function fitText(ctx: Ctx2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** Wrap by measurement into at most `maxLines`, ellipsising the last. */
function wrapMeasured(ctx: Ctx2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && ctx.measureText(next).width > maxWidth) {
      lines.push(cur)
      cur = w
    } else cur = next
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + '…', maxWidth)
  }
  return lines
}

function paintBackground(ctx: Ctx2D, plan: PaintPlan, assets: PaintAssets) {
  const { layout, spec } = plan
  const brand = spec.brand || CLIP_BRAND
  ctx.fillStyle = brand.background
  ctx.fillRect(0, 0, layout.width, layout.height)
  if (assets.frame) {
    // Video: the frame itself fills the background (no per-frame blur — too slow at 30 fps).
    ctx.save()
    ctx.globalAlpha = 0.45
    drawCover(ctx, assets.frame, { x: 0, y: 0, w: layout.width, h: layout.height })
    ctx.restore()
  } else if (assets.cover) {
    // Blurred, darkened artwork fills the frame behind everything — blurred once, then reused.
    if (!assets.backdrop || assets.backdrop.source !== assets.cover || assets.backdrop.canvas.width !== layout.width || assets.backdrop.canvas.height !== layout.height) {
      const canvas = makeCanvas(layout.width, layout.height)
      const bctx = canvas.getContext('2d') as Ctx2D | null
      if (bctx) {
        bctx.fillStyle = brand.background
        bctx.fillRect(0, 0, layout.width, layout.height)
        try {
          bctx.filter = 'blur(38px) saturate(1.1)'
        } catch {
          /* filter unsupported (Safari OffscreenCanvas) — the dark tint below still works */
        }
        drawCover(bctx, assets.cover, { x: -60, y: -60, w: layout.width + 120, h: layout.height + 120 })
        assets.backdrop = { source: assets.cover, canvas }
      }
    }
    if (assets.backdrop) {
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.drawImage(assets.backdrop.canvas, 0, 0)
      ctx.restore()
    }
  }
  const grad = ctx.createLinearGradient(0, 0, 0, layout.height)
  grad.addColorStop(0, hexToRgba(brand.background, 0.55))
  grad.addColorStop(0.5, hexToRgba(brand.background, 0.7))
  grad.addColorStop(1, hexToRgba(brand.background, 0.92))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, layout.width, layout.height)
}

function paintArt(ctx: Ctx2D, plan: PaintPlan, assets: PaintAssets) {
  const { layout, spec } = plan
  const brand = spec.brand || CLIP_BRAND
  const r = layout.art
  const radius = Math.round(r.w * 0.06)
  ctx.save()
  ctx.shadowColor = hexToRgba(brand.accent, 0.22)
  ctx.shadowBlur = 48
  ctx.fillStyle = brand.surface
  roundedRect(ctx, r, radius)
  ctx.fill()
  ctx.restore()
  const pic = assets.frame || assets.cover
  if (pic) drawCover(ctx, pic, r, radius)
  ctx.save()
  ctx.strokeStyle = hexToRgba(brand.accent, 0.35)
  ctx.lineWidth = 2
  roundedRect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, radius)
  ctx.stroke()
  ctx.restore()
}

function paintTitles(ctx: Ctx2D, plan: PaintPlan) {
  const { layout, spec } = plan
  const brand = spec.brand || CLIP_BRAND
  const r = layout.title
  const centred = layout.aspect !== '16:9'
  ctx.save()
  ctx.textBaseline = 'top'
  ctx.textAlign = centred ? 'center' : 'left'
  const x = centred ? r.x + r.w / 2 : r.x
  ctx.font = `700 ${layout.font.title}px ${FONT_SERIF}`
  ctx.fillStyle = brand.ink
  const lines = wrapMeasured(ctx, spec.title.trim() || 'Untitled episode', r.w, 2)
  let y = r.y
  for (const line of lines) {
    ctx.fillText(line, x, y)
    y += Math.round(layout.font.title * 1.18)
  }
  if (spec.showTitle.trim()) {
    ctx.font = `600 ${layout.font.show}px ${FONT_SANS}`
    ctx.fillStyle = brand.accentBright
    ctx.fillText(fitText(ctx, spec.showTitle.trim().toUpperCase(), r.w), x, y + Math.round(layout.font.show * 0.35))
  }
  ctx.restore()
}

function paintWave(ctx: Ctx2D, plan: PaintPlan, assets: PaintAssets, t: number) {
  const { layout, spec } = plan
  const brand = spec.brand || CLIP_BRAND
  const r = layout.wave
  const mid = r.y + r.h / 2
  ctx.save()
  if (spec.style === 'bars') {
    const count = Math.max(12, Math.min(48, Math.floor(r.w / 26)))
    const levels = barLevels(assets.peaks, t, count)
    const gap = 8
    const bw = (r.w - gap * (count - 1)) / count
    for (let i = 0; i < count; i++) {
      const h = Math.max(6, levels[i] * r.h)
      const x = r.x + i * (bw + gap)
      ctx.fillStyle = i % 2 === 0 ? brand.accent : brand.accentBright
      roundedRect(ctx, { x, y: mid - h / 2, w: bw, h }, bw / 2)
      ctx.fill()
    }
  } else {
    const count = Math.max(40, Math.min(160, Math.floor(r.w / 9)))
    const levels = windowLevels(assets.peaks, t, count, 3)
    const step = r.w / (count - 1)
    // Faint full-height guide line.
    ctx.strokeStyle = hexToRgba(brand.accent, 0.18)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(r.x, mid)
    ctx.lineTo(r.x + r.w, mid)
    ctx.stroke()
    const centre = Math.floor(count / 2)
    for (let i = 0; i < count; i++) {
      const h = Math.max(4, levels[i] * r.h)
      const x = r.x + i * step
      const past = i <= centre
      ctx.fillStyle = past ? brand.accent : hexToRgba(brand.accentBright, 0.55)
      roundedRect(ctx, { x: x - 2.5, y: mid - h / 2, w: 5, h }, 2.5)
      ctx.fill()
    }
    // Playhead.
    ctx.fillStyle = brand.ink
    ctx.fillRect(r.x + centre * step - 1.5, r.y, 3, r.h)
  }
  ctx.restore()
}

function paintCaptions(ctx: Ctx2D, plan: PaintPlan, t: number) {
  const { layout, spec, groups } = plan
  const brand = spec.brand || CLIP_BRAND
  const gi = groupAt(groups, t)
  if (gi < 0) return
  const group = groups[gi]
  const active = activeWordIndex(group, t)
  const lines = wrapWords(group.words, layout.captionChars, layout.captionLines)
  const r = layout.caption
  const size = layout.font.caption
  const lineH = Math.round(size * 1.28)
  const totalH = lines.length * lineH
  const top = layout.aspect === '16:9' ? r.y + r.h - totalH : r.y + Math.max(0, Math.round((r.h - totalH) * 0.35))
  ctx.save()
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.font = `700 ${size}px ${FONT_SANS}`
  const space = ctx.measureText(' ').width
  let wordIdx = 0
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    // Measure so highlighted words sit exactly where the plain text would.
    const widths = line.words.map((w) => ctx.measureText(w.text).width)
    let total = widths.reduce((a, b) => a + b, 0) + space * (line.words.length - 1)
    let scale = 1
    if (total > r.w) {
      scale = r.w / total
      total = r.w
    }
    let x = r.x + (r.w - total) / 2
    const y = top + li * lineH
    for (let wi = 0; wi < line.words.length; wi++) {
      const w = line.words[wi]
      const width = widths[wi] * scale
      const isActive = wordIdx === active
      if (isActive && !w.redacted) {
        ctx.fillStyle = hexToRgba(brand.accent, 0.22)
        roundedRect(ctx, { x: x - 10, y: y - 6, w: width + 20, h: size + 14 }, 12)
        ctx.fill()
      }
      ctx.save()
      if (scale !== 1) {
        ctx.translate(x, y)
        ctx.scale(scale, 1)
        ctx.translate(-x, -y)
      }
      ctx.lineWidth = Math.max(4, size * 0.12)
      ctx.strokeStyle = hexToRgba(brand.background, 0.85)
      ctx.lineJoin = 'round'
      ctx.strokeText(w.text, x, y)
      ctx.fillStyle = w.redacted ? brand.muted : isActive ? brand.accentBright : brand.ink
      ctx.fillText(w.text, x, y)
      ctx.restore()
      x += width + space * scale
      wordIdx++
    }
  }
  ctx.restore()
}

function paintWatermark(ctx: Ctx2D, plan: PaintPlan) {
  const { layout, spec } = plan
  const brand = spec.brand || CLIP_BRAND
  const r = layout.safeRect
  ctx.save()
  ctx.font = `500 ${Math.round(layout.font.show * 0.8)}px ${FONT_SANS}`
  ctx.fillStyle = hexToRgba(brand.muted, 0.8)
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'right'
  ctx.fillText('forgedinthefire.org/podcast', r.x + r.w, r.y + r.h)
  ctx.restore()
}

/** Paint one frame at `t` seconds from the clip start. */
export function paintClipFrame(ctx: Ctx2D, plan: PaintPlan, assets: PaintAssets, t: number) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  try {
    ctx.filter = 'none'
  } catch {
    /* ignore */
  }
  paintBackground(ctx, plan, assets)
  paintArt(ctx, plan, assets)
  paintTitles(ctx, plan)
  paintWave(ctx, plan, assets, t)
  paintCaptions(ctx, plan, t)
  paintWatermark(ctx, plan)
  ctx.restore()
}
