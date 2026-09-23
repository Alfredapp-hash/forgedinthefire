/**
 * Face blur for live Program (and, later, the recorded picture export).
 *
 * Detector: MediaPipe Tasks Vision Face Detector (BlazeFace short-range),
 * Apache-2.0. The JS comes from the npm package (bundled, loaded lazily);
 * the WASM runtime and the model are fetched at runtime:
 *   WASM  https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/wasm
 *   model https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
 * The WASM version MUST match the installed package version (MEDIAPIPE_VERSION).
 *
 * Fail-SAFE rules (survivor safety — a missed blur is worse than a blank picture):
 *   - Until the detector has produced a result, and whenever the last good result is
 *     older than `stallMs` (300 ms), or after any detector error, the box is painted
 *     as a silhouette privacy card instead of the camera.
 *   - Faces are padded 30% and the last boxes are held for `holdMs` (500 ms) when
 *     detection drops out for a moment (head turn, hand over face).
 *   - If no face is found after the hold, the WHOLE picture is pixelated
 *     (`noFace: 'obscure'`, default): a detector miss must not reveal a face.
 *
 * Usage:
 *   const blur = await createFaceBlurrer()
 *   blur.process(video, ctx, x, y, w, h)   // draws `video` cover-fitted into the box, faces obscured
 *   blur.close()
 */

import type { FaceDetector } from '@mediapipe/tasks-vision'

/** Keep in sync with package.json "@mediapipe/tasks-vision". */
export const MEDIAPIPE_VERSION = '1.0.1'
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
export const FACE_DETECTOR_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

export type FaceBlurStyle = 'pixelate' | 'blur'
export type FaceBlurState = 'loading' | 'ok' | 'stalled' | 'failed'

export type FaceBlurOptions = {
  style?: FaceBlurStyle
  /** Fractional padding added on every side of a detected box. Default 0.3. */
  padding?: number
  /** Keep the last boxes this long when detection returns nothing. Default 500 ms. */
  holdMs?: number
  /** No good detection for this long → silhouette card. Default 300 ms. */
  stallMs?: number
  /** Run the detector at most this often. Default 66 ms (~15 Hz). */
  detectEveryMs?: number
  minConfidence?: number
  /** What to do when no face is found after the hold. Default 'obscure' (whole picture). */
  noFace?: 'obscure' | 'clear'
  /** Label on the privacy card. */
  label?: string
  onState?: (state: FaceBlurState, detail?: string) => void
}

export type FaceBlurrer = {
  /** Draw `src` cover-fitted into (x, y, w, h) with faces obscured — or a privacy card when unsafe. */
  process(
    src: CanvasImageSource,
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    now?: number,
  ): void
  close(): void
  readonly state: FaceBlurState
}

export type Box = { x: number; y: number; w: number; h: number }

// ---------- pure geometry (unit-tested) ----------

/** Pad a box by `pad` of its size on every side, clamped to the image. */
export function padBox(box: Box, pad: number, imgW: number, imgH: number): Box {
  const px = box.w * pad
  const py = box.h * pad
  const x0 = Math.max(0, box.x - px)
  const y0 = Math.max(0, box.y - py)
  const x1 = Math.min(imgW, box.x + box.w + px)
  const y1 = Math.min(imgH, box.y + box.h + py)
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Source crop that cover-fits (srcW × srcH) into a (w × h) box — same maths as the compositor. */
export function coverCrop(srcW: number, srcH: number, w: number, h: number): Box {
  const scale = Math.max(w / srcW, h / srcH)
  const sw = w / scale
  const sh = h / scale
  return { x: (srcW - sw) / 2, y: (srcH - sh) / 2, w: sw, h: sh }
}

/** Map a source-space box through a crop into a destination box; null if fully outside. */
export function mapToDest(box: Box, crop: Box, dx: number, dy: number, dw: number, dh: number): Box | null {
  const k = dw / crop.w
  const x0 = Math.max(dx, dx + (box.x - crop.x) * k)
  const y0 = Math.max(dy, dy + (box.y - crop.y) * k)
  const x1 = Math.min(dx + dw, dx + (box.x + box.w - crop.x) * k)
  const y1 = Math.min(dy + dh, dy + (box.y + box.h - crop.y) * k)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Decide what to draw this frame. Pure so the fail-safe timing can be tested. */
export function blurDecision(input: {
  now: number
  lastOkAt: number | null
  lastFaceAt: number | null
  failed: boolean
  stallMs: number
  holdMs: number
}): 'card' | 'boxes' | 'noface' {
  if (input.failed || input.lastOkAt == null || input.now - input.lastOkAt > input.stallMs) return 'card'
  if (input.lastFaceAt != null && input.now - input.lastFaceAt <= input.holdMs) return 'boxes'
  return 'noface'
}

// ---------- drawing helpers ----------

function sourceSize(src: CanvasImageSource): { w: number; h: number } | null {
  const s = src as Partial<HTMLVideoElement & VideoFrame & HTMLImageElement & { width: number; height: number }>
  const w = s.videoWidth || s.displayWidth || s.naturalWidth || (typeof s.width === 'number' ? s.width : 0)
  const h = s.videoHeight || s.displayHeight || s.naturalHeight || (typeof s.height === 'number' ? s.height : 0)
  return w > 0 && h > 0 ? { w, h } : null
}

/** Calm head-and-shoulders silhouette. Exported for the compositor's "loading" state. */
export function paintPrivacyCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label = 'Camera hidden for privacy',
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = '#0B1117'
  ctx.fillRect(x, y, w, h)
  const cx = x + w / 2
  const r = Math.min(w, h) * 0.13
  const headY = y + h * 0.4
  ctx.fillStyle = '#1C2731'
  ctx.beginPath()
  ctx.arc(cx, headY, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx, headY + r * 3.1, r * 2.3, r * 1.9, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#7C8B97'
  ctx.font = `${Math.max(12, Math.round(h / 20))}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, y + h * 0.86, w - 24)
  ctx.restore()
}

let filesetPromise: Promise<unknown> | null = null

async function loadDetector(minConfidence: number): Promise<FaceDetector> {
  const vision = await import('@mediapipe/tasks-vision')
  if (!filesetPromise) {
    filesetPromise = vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE).catch((err) => {
      filesetPromise = null
      throw err
    })
  }
  const fileset = (await filesetPromise) as Parameters<typeof vision.FaceDetector.createFromOptions>[0]
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: minConfidence,
    })
  try {
    return await make('GPU')
  } catch {
    return make('CPU')
  }
}

/** Load the detector (WASM + model from CDN). Rejects if it cannot load — callers must then show a card. */
export async function createFaceBlurrer(options: FaceBlurOptions = {}): Promise<FaceBlurrer> {
  const style = options.style ?? 'pixelate'
  const padding = options.padding ?? 0.3
  const holdMs = options.holdMs ?? 500
  const stallMs = options.stallMs ?? 300
  const detectEveryMs = options.detectEveryMs ?? 66
  const noFace = options.noFace ?? 'obscure'
  const label = options.label ?? 'Camera hidden for privacy'

  const detector = await loadDetector(options.minConfidence ?? 0.4)

  const detectCanvas = document.createElement('canvas')
  const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: false })
  const tiny = document.createElement('canvas')
  const tinyCtx = tiny.getContext('2d')
  if (!detectCtx || !tinyCtx) {
    detector.close()
    throw new Error('Canvas 2D is not available')
  }

  let state: FaceBlurState = 'loading'
  let closed = false
  let failed = false
  let lastTs = 0
  let lastAttemptAt = -Infinity
  let lastOkAt: number | null = null
  let lastFaceAt: number | null = null
  let boxes: Box[] = []
  const canFilter = 'filter' in (tinyCtx as object)

  const setState = (next: FaceBlurState, detail?: string) => {
    if (next === state) return
    state = next
    options.onState?.(next, detail)
  }

  function detect(src: CanvasImageSource, size: { w: number; h: number }, now: number) {
    const k = Math.min(1, 320 / Math.max(size.w, size.h))
    const dw = Math.max(16, Math.round(size.w * k))
    const dh = Math.max(16, Math.round(size.h * k))
    if (detectCanvas.width !== dw) detectCanvas.width = dw
    if (detectCanvas.height !== dh) detectCanvas.height = dh
    detectCtx!.drawImage(src, 0, 0, dw, dh)
    const ts = Math.max(lastTs + 1, Math.round(now))
    lastTs = ts
    const t0 = performance.now()
    const result = detector.detectForVideo(detectCanvas, ts)
    const took = performance.now() - t0
    const found: Box[] = []
    for (const d of result.detections || []) {
      const b = d.boundingBox
      if (!b) continue
      found.push({ x: b.originX / k, y: b.originY / k, w: b.width / k, h: b.height / k })
    }
    // A detection that itself took longer than the stall budget does not count as healthy.
    if (took <= stallMs) lastOkAt = now
    if (found.length) {
      boxes = found
      lastFaceAt = now
    }
  }

  function obscure(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    srcBox: Box,
    dest: Box,
    blocksAcross: number,
  ) {
    if (srcBox.w < 1 || srcBox.h < 1 || dest.w < 1 || dest.h < 1) return
    if (style === 'blur' && canFilter) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(dest.x, dest.y, dest.w, dest.h)
      ctx.clip()
      ctx.filter = `blur(${Math.max(8, Math.round(dest.w / 6))}px)`
      // Draw twice: the second pass hides the sharp edge a single blur leaves at the clip.
      ctx.drawImage(src, srcBox.x, srcBox.y, srcBox.w, srcBox.h, dest.x, dest.y, dest.w, dest.h)
      ctx.drawImage(src, srcBox.x, srcBox.y, srcBox.w, srcBox.h, dest.x, dest.y, dest.w, dest.h)
      ctx.restore()
      return
    }
    const tw = Math.max(3, Math.round(blocksAcross))
    const th = Math.max(3, Math.round((blocksAcross * dest.h) / dest.w))
    tiny.width = tw
    tiny.height = th
    tinyCtx!.imageSmoothingEnabled = true
    tinyCtx!.drawImage(src, srcBox.x, srcBox.y, srcBox.w, srcBox.h, 0, 0, tw, th)
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tiny, 0, 0, tw, th, dest.x, dest.y, dest.w, dest.h)
    ctx.restore()
  }

  return {
    get state() {
      return state
    },
    process(src, ctx, x, y, w, h, now = performance.now()) {
      const size = sourceSize(src)
      if (closed || failed || !size) {
        paintPrivacyCard(ctx, x, y, w, h, label)
        return
      }
      if (now - lastAttemptAt >= detectEveryMs) {
        lastAttemptAt = now
        try {
          detect(src, size, now)
        } catch (err) {
          failed = true
          setState('failed', err instanceof Error ? err.message : 'Face detector error')
        }
      }
      const decision = blurDecision({ now, lastOkAt, lastFaceAt, failed, stallMs, holdMs })
      if (decision === 'card') {
        if (!failed) setState(lastOkAt == null ? 'loading' : 'stalled')
        paintPrivacyCard(ctx, x, y, w, h, label)
        return
      }
      setState('ok')
      const crop = coverCrop(size.w, size.h, w, h)
      ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, x, y, w, h)
      if (decision === 'noface') {
        if (noFace === 'obscure') obscure(ctx, src, crop, { x, y, w, h }, 16)
        return
      }
      for (const b of boxes) {
        const padded = padBox(b, padding, size.w, size.h)
        const dest = mapToDest(padded, crop, x, y, w, h)
        if (!dest) continue
        // Source rect matching the (possibly clipped) destination rect.
        const k = w / crop.w
        const srcBox = {
          x: crop.x + (dest.x - x) / k,
          y: crop.y + (dest.y - y) / k,
          w: dest.w / k,
          h: dest.h / k,
        }
        obscure(ctx, src, srcBox, dest, 8)
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        detector.close()
      } catch {
        /* already closed */
      }
    },
  }
}
