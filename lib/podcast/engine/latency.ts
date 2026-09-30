/** Punch-in / sync latency math (pure). */

export type CaptureTiming = {
  sampleRate: number
  /** AudioContext frame of the first captured sample (null until audio flows / MediaRecorder). */
  startFrame: number | null
  /** ctx.outputLatency (s) — 0 when the browser does not report it */
  outputLatency: number
  /** ctx.baseLatency (s) */
  baseLatency: number
  /** MediaStreamTrack settings latency (s) */
  inputLatency: number
  /** The capture ran on this context (compare frames only when it is the cue's context). */
  context: BaseAudioContext | null
}

/**
 * Frames to trim from the head of a capture, on top of the preroll, so the take lines up
 * with what the performer heard:
 *   (cueStartFrame − captureStartFrame) + (outputLatency + baseLatency + inputLatency) × sr
 * A measured loop-back round trip (measureRoundTripLatency) replaces the reported sum.
 * The frame delta is only meaningful when cue and capture share one AudioContext; pass
 * null frames otherwise.
 */
export function latencyCompensationFrames(p: {
  sampleRate: number
  cueStartFrame?: number | null
  captureStartFrame?: number | null
  outputLatency?: number
  baseLatency?: number
  inputLatency?: number
  measuredRoundTripSec?: number | null
}): number {
  const delta =
    p.cueStartFrame != null && p.captureStartFrame != null ? p.cueStartFrame - p.captureStartFrame : 0
  const reported = (p.outputLatency || 0) + (p.baseLatency || 0) + (p.inputLatency || 0)
  const rt = p.measuredRoundTripSec != null && Number.isFinite(p.measuredRoundTripSec) ? p.measuredRoundTripSec : reported
  return Math.round(delta + rt * p.sampleRate)
}

/**
 * First sample of a click in a loop-back recording, searching from `from`. Threshold is
 * relative to the pre-click noise floor and the window peak. Returns −1 if not found.
 */
export function findClickOnset(data: Float32Array, from = 0, to = data.length, noiseFrames = 2048): number {
  const start = Math.max(0, from)
  const end = Math.min(data.length, to)
  if (end - start < 16) return -1
  let noise = 0
  const nStart = Math.max(0, start - noiseFrames)
  for (let i = nStart; i < start; i++) noise += data[i] * data[i]
  const noiseRms = start > nStart ? Math.sqrt(noise / (start - nStart)) : 0
  let peak = 0
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]))
  if (peak < Math.max(1e-4, noiseRms * 4)) return -1
  const thr = Math.max(noiseRms * 6, peak * 0.3)
  for (let i = start; i < end; i++) if (Math.abs(data[i]) >= thr) return i
  return -1
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
