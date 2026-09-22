/** Peak envelopes + retina display helpers for studio clip lanes. */

/** Cap so 2x/3x boards stay sharp without 4x+ backing stores. */
export const MAX_TRACK_DPR = 3
const MAX_PEAK_BUCKETS = 131072
const CACHE_CAP = 48

type PeakCache = Map<string, Float32Array>
const peakCache = new WeakMap<AudioBuffer, PeakCache>()

export function trackDisplayRatio(dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1
  return Math.min(MAX_TRACK_DPR, Math.max(1, dpr))
}

/** One envelope sample per device pixel of the clip (capped for long takes). */
export function peakBucketCount(cssWidth: number, dpr = trackDisplayRatio()): number {
  const w = Math.max(1, Math.round(cssWidth))
  return Math.min(MAX_PEAK_BUCKETS, Math.max(24, Math.round(w * trackDisplayRatio(dpr))))
}

export function snapCssPx(n: number): number {
  return Math.round(n)
}

/** Flush adjacent clips: snap start/end independently so a 1px gap does not appear. */
export function snapSpan(startCss: number, endCss: number, minWidth = 1): { left: number; width: number } {
  const left = Math.round(startCss)
  const right = Math.round(endCss)
  return { left, width: Math.max(minWidth, right - left) }
}

/** Device-pixel-aligned CSS left + 1-device-pixel width (Firefox + Chrome). */
export function snapHairline(css: number, dpr = trackDisplayRatio()): { left: number; width: number } {
  const ratio = trackDisplayRatio(dpr)
  return {
    left: Math.round(css * ratio) / ratio,
    width: 1 / ratio,
  }
}

export function peakEnvelope(buffer: AudioBuffer, buckets: number): Float32Array {
  return peakEnvelopeSlice(buffer, 0, buffer.duration, buckets)
}

export function peakEnvelopeSlice(
  buffer: AudioBuffer,
  sourceStart: number,
  duration: number,
  buckets: number,
): Float32Array {
  const count = Math.max(8, Math.floor(buckets))
  const key = `${sourceStart.toFixed(4)}|${duration.toFixed(4)}|${count}`
  const cached = peakCache.get(buffer)
  const hit = cached?.get(key)
  if (hit) return hit

  const peaks = new Float32Array(count)
  const data = buffer.getChannelData(0)
  const start0 = Math.max(0, Math.floor(sourceStart * buffer.sampleRate))
  const end0 = Math.min(data.length, Math.ceil((sourceStart + duration) * buffer.sampleRate))
  const span = Math.max(1, end0 - start0)
  const step = span / count
  for (let i = 0; i < count; i++) {
    const start = start0 + Math.floor(i * step)
    const end = Math.min(end0, start0 + Math.floor((i + 1) * step))
    let peak = 0
    for (let s = start; s < end; s++) peak = Math.max(peak, Math.abs(data[s]))
    peaks[i] = peak
  }

  let map = cached
  if (!map) {
    map = new Map()
    peakCache.set(buffer, map)
  }
  if (map.size >= CACHE_CAP) {
    const first = map.keys().next().value
    if (first !== undefined) map.delete(first)
  }
  map.set(key, peaks)
  return peaks
}

/** Draw a 1:1 device-pixel envelope. `peaks` should already be `peakBucketCount` dense. */
export function drawPeakEnvelope(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  backingW: number,
  backingH: number,
  color: string,
  dim = false,
): void {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, backingW, backingH)
  const mid = backingH / 2
  const n = peaks.length
  if (n === 0 || backingW < 1 || backingH < 1) return

  ctx.globalAlpha = dim ? 0.38 : 0.9
  ctx.fillStyle = color
  for (let x = 0; x < backingW; x++) {
    const i = n === backingW ? x : Math.min(n - 1, Math.floor((x / backingW) * n))
    const barH = Math.max(1, Math.round((peaks[i] || 0) * (mid - 1)))
    ctx.fillRect(x, Math.round(mid - barH), 1, barH * 2)
  }

  if (!dim) {
    ctx.globalAlpha = 1
    return
  }

  ctx.globalAlpha = 0.32
  ctx.strokeStyle = '#0C141C'
  ctx.lineWidth = 1
  ctx.beginPath()
  const step = 4
  for (let x = -backingH; x < backingW; x += step) {
    ctx.moveTo(x + 0.5, 0.5)
    ctx.lineTo(x + backingH + 0.5, backingH + 0.5)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}
