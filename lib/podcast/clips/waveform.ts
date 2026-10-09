/**
 * Waveform / bars data for the audiogram. Pure numeric helpers over raw channel data, so they run
 * in the worker, on the main thread, and in unit tests.
 */

export type Peaks = {
  /** Peak |sample| per bucket, 0..1 (normalised so the loudest bucket is 1). */
  values: Float32Array
  /** Buckets per second. */
  perSec: number
  /** Seconds covered. */
  duration: number
}

/**
 * Peak amplitude per bucket over `[startSec, endSec)` of the given channels (mono-summed).
 * `perSec` buckets per second; 60 gives smooth motion at 30 fps.
 */
export function computePeaks(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number,
  perSec = 60,
): Peaks {
  const duration = Math.max(0, endSec - startSec)
  const buckets = Math.max(1, Math.ceil(duration * perSec))
  const values = new Float32Array(buckets)
  if (!channels.length || sampleRate <= 0) return { values, perSec, duration }
  const length = channels[0].length
  const first = Math.max(0, Math.floor(startSec * sampleRate))
  const per = sampleRate / perSec
  let max = 0
  for (let b = 0; b < buckets; b++) {
    const a = Math.min(length, Math.floor(first + b * per))
    const z = Math.min(length, Math.floor(first + (b + 1) * per))
    let peak = 0
    for (let i = a; i < z; i++) {
      let sum = 0
      for (const ch of channels) sum += ch[i] || 0
      const v = Math.abs(sum / channels.length)
      if (v > peak) peak = v
    }
    values[b] = peak
    if (peak > max) max = peak
  }
  if (max > 0) for (let b = 0; b < buckets; b++) values[b] /= max
  return { values, perSec, duration }
}

/** Peak (0..1) at a time, with linear interpolation between buckets. */
export function peakAt(peaks: Peaks, t: number): number {
  const { values, perSec } = peaks
  if (!values.length) return 0
  const pos = Math.max(0, Math.min(values.length - 1, t * perSec))
  const i = Math.floor(pos)
  const j = Math.min(values.length - 1, i + 1)
  const f = pos - i
  return values[i] * (1 - f) + values[j] * f
}

/**
 * Levels for a scrolling waveform: `count` samples across a window of `spanSec` centred on `t`.
 * Outside the clip the level is 0 so the wave "enters" from the right and "leaves" to the left.
 */
export function windowLevels(peaks: Peaks, t: number, count: number, spanSec: number): Float32Array {
  const out = new Float32Array(Math.max(1, count))
  for (let i = 0; i < out.length; i++) {
    const at = t - spanSec / 2 + (spanSec * i) / Math.max(1, out.length - 1)
    out[i] = at < 0 || at > peaks.duration ? 0 : peakAt(peaks, at)
  }
  return out
}

/**
 * Levels for an equaliser-style bar row: `count` bars whose heights follow the recent signal, each
 * bar lagging a little more than its neighbour so the row moves like a meter rather than a copy
 * of one number. Deterministic — no random flicker, so re-renders match.
 */
export function barLevels(peaks: Peaks, t: number, count: number, opts: { lagSec?: number; floor?: number } = {}): Float32Array {
  const lag = opts.lagSec ?? 0.35
  const floor = opts.floor ?? 0.06
  const out = new Float32Array(Math.max(1, count))
  const mid = (out.length - 1) / 2
  for (let i = 0; i < out.length; i++) {
    // Distance from the middle → more lag towards the edges, mirrored.
    const d = Math.abs(i - mid) / Math.max(1, mid)
    const at = t - d * lag
    const level = at < 0 ? 0 : peakAt(peaks, at)
    // Edges sit lower than the centre so the row has a shape at rest.
    out[i] = floor + (1 - floor) * level * (1 - 0.45 * d)
  }
  return out
}

/** Downsample a whole-episode peak list for the range picker (one value per pixel column). */
export function overviewPeaks(peaks: Peaks, columns: number): Float32Array {
  const out = new Float32Array(Math.max(1, columns))
  if (!peaks.values.length) return out
  const per = peaks.values.length / out.length
  for (let c = 0; c < out.length; c++) {
    const a = Math.floor(c * per)
    const z = Math.max(a + 1, Math.floor((c + 1) * per))
    let m = 0
    for (let i = a; i < z && i < peaks.values.length; i++) if (peaks.values[i] > m) m = peaks.values[i]
    out[c] = m
  }
  return out
}
