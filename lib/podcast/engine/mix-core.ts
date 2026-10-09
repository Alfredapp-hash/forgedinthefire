/**
 * Pure mixdown core: renders a MixPlan (plain arrays, no AudioBuffer) to a stereo pair.
 * Shared by `mixdownTracks` (main thread) and `workers/master.worker.ts`.
 *
 * Per-track audibility (listen take / comp ranges) is precomputed into session-time
 * windows, so the inner loop never scans sibling tracks per sample. Switch points
 * between takes get an equal-power crossfade (sin/cos, sums to unity power).
 */

import { resampleSinc } from './resample'

export const DEFAULT_XFADE_SEC = 0.016

export type CompWindow = {
  /** Session seconds. -Infinity / Infinity for open ends. */
  start: number
  end: number
  /** Crossfade in at `start` (a take switch point), centred on the boundary. */
  xfadeIn: boolean
  xfadeOut: boolean
}

export type MixClipPlan = {
  /** Seconds into the source */
  sourceStart: number
  duration: number
  /** Session seconds */
  offset: number
  gain: number
  fadeIn: number
  fadeOut: number
  /**
   * Equal-power crossfade centred on the clip head / tail (reads source handles past the edge).
   * Default true. False for a seamless join (same source, butted together), where a fade over
   * identical audio would bump the level +3 dB.
   */
  edgeIn?: boolean
  edgeOut?: boolean
}

export type MixTrackPlan = {
  /** 1 or 2 channels */
  channels: Float32Array[]
  sourceRate: number
  pan: number
  volume: number
  automation: { t: number; v: number }[]
  clips: MixClipPlan[]
  /** null = audible everywhere */
  windows: CompWindow[] | null
}

export type MixPlan = {
  sampleRate: number
  startSec: number
  endSec: number
  xfadeSec?: number
  tracks: MixTrackPlan[]
}

/** Rising equal-power gain for u in [0, 1]. */
export function equalPowerIn(u: number) {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return Math.sin(u * Math.PI * 0.5)
}

/** Falling equal-power gain for u in [0, 1]. */
export function equalPowerOut(u: number) {
  if (u <= 0) return 1
  if (u >= 1) return 0
  return Math.cos(u * Math.PI * 0.5)
}

/**
 * Two clips on one lane butt-join seamlessly when the second continues the first's source
 * exactly (a plain split). Such an edge needs no crossfade.
 */
export function clipsJoinSeamlessly(a: MixClipPlan, b: MixClipPlan, epsSec = 0.0001) {
  return Math.abs(a.offset + a.duration - b.offset) < epsSec && Math.abs(a.sourceStart + a.duration - b.sourceStart) < epsSec
}

/** Fill in edgeIn/edgeOut for a lane's clips: hard edges only at seamless joins. */
export function markClipEdges(clips: MixClipPlan[], epsSec = 0.0001): MixClipPlan[] {
  return clips.map((clip) => ({
    ...clip,
    edgeIn: clip.edgeIn ?? !clips.some((o) => o !== clip && clipsJoinSeamlessly(o, clip, epsSec)),
    edgeOut: clip.edgeOut ?? !clips.some((o) => o !== clip && clipsJoinSeamlessly(clip, o, epsSec)),
  }))
}

/** Equal-power comp gain at session time t for a set of audible windows. */
export function compGainAt(windows: CompWindow[] | null, t: number, xfadeSec = DEFAULT_XFADE_SEC): number {
  if (!windows) return 1
  const h = xfadeSec / 2
  let g = 0
  for (const w of windows) {
    const lo = w.xfadeIn ? w.start - h : w.start
    const hi = w.xfadeOut ? w.end + h : w.end
    if (t < lo || t >= hi) continue
    let v = 1
    if (w.xfadeIn && t < w.start + h) v *= Math.sin((Math.PI / 2) * ((t - lo) / xfadeSec))
    if (w.xfadeOut && t > w.end - h) v *= Math.cos((Math.PI / 2) * ((t - (w.end - h)) / xfadeSec))
    if (v > g) g = v
  }
  return g
}

/** Binary-search linear automation (same result as multitrack.automationAt). */
export function automationValue(points: { t: number; v: number }[], t: number, fallback = 1) {
  const n = points.length
  if (!n) return fallback
  if (t <= points[0].t) return points[0].v
  if (t >= points[n - 1].t) return points[n - 1].v
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t < t) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const span = b.t - a.t
  if (span <= 0) return b.v
  return a.v + (b.v - a.v) * ((t - a.t) / span)
}

type Range = { from: number; to: number; win: CompWindow | null }

function audibleSampleRanges(windows: CompWindow[] | null, from: number, to: number, sr: number, xfadeSec: number): Range[] {
  if (!windows) return [{ from, to, win: null }]
  const h = xfadeSec / 2
  const out: Range[] = []
  for (const w of windows) {
    const lo = w.xfadeIn ? w.start - h : w.start
    const hi = w.xfadeOut ? w.end + h : w.end
    const a = Math.max(from, Number.isFinite(lo) ? Math.ceil(lo * sr) : from)
    const b = Math.min(to, Number.isFinite(hi) ? Math.ceil(hi * sr) : to)
    if (b > a) out.push({ from: a, to: b, win: w })
  }
  return out
}

/** Render the plan into a new stereo pair (float, no clipping). */
export function renderMixPlan(plan: MixPlan): { left: Float32Array; right: Float32Array } {
  const sr = plan.sampleRate
  const xfade = plan.xfadeSec ?? DEFAULT_XFADE_SEC
  const length = Math.max(1, Math.ceil((plan.endSec - plan.startSec) * sr))
  const L = new Float32Array(length)
  const R = new Float32Array(length)
  const startSample = Math.floor(plan.startSec * sr)
  const BLOCK = 32

  for (const track of plan.tracks) {
    if (!track.channels.length) continue
    const srcL = resampleSinc(track.channels[0], track.sourceRate, sr)
    const srcR = track.channels.length > 1 ? resampleSinc(track.channels[1], track.sourceRate, sr) : srcL
    const srcLen = srcL.length
    const pan = Math.max(-1, Math.min(1, track.pan))
    const panL = Math.min(1, 1 - pan)
    const panR = Math.min(1, 1 + pan)
    const autom = track.automation || []
    const hasAutom = autom.length > 0

    const hN = Math.round((xfade / 2) * sr)
    for (const clip of track.clips) {
      const srcStart = Math.floor(clip.sourceStart * sr)
      const clipLen = Math.max(1, Math.floor(clip.duration * sr))
      const offsetSamples = Math.floor(clip.offset * sr)
      const fadeInN = Math.floor(Math.max(0, clip.fadeIn) * sr)
      const fadeOutN = Math.floor(Math.max(0, clip.fadeOut) * sr)
      // Equal-power edges centred on the clip boundaries, reading source handles past each edge,
      // so a cut between different source regions never lands as a hard step. A user fade
      // already reaches silence at the edge; a seamless split join must stay untouched.
      const headN = clip.edgeIn !== false && fadeInN === 0 ? hN : 0
      const tailN = clip.edgeOut !== false && fadeOutN === 0 ? hN : 0
      // Clip-local index range i ∈ [i0, i1) that lands in the render window and the source.
      let i0 = Math.max(-headN, startSample - offsetSamples, -srcStart)
      let i1 = Math.min(clipLen + tailN, startSample + length - offsetSamples, srcLen - srcStart)
      if (i1 <= i0) continue
      const ranges = audibleSampleRanges(track.windows, offsetSamples + i0, offsetSamples + i1, sr, xfade)
      const constGain = track.volume * clip.gain
      for (const range of ranges) {
        i0 = range.from - offsetSamples
        i1 = range.to - offsetSamples
        const win = range.win
        const xfadeIn = !!win?.xfadeIn
        const xfadeOut = !!win?.xfadeOut
        const h = xfade / 2
        for (let b = i0; b < i1; b += BLOCK) {
          const e = Math.min(i1, b + BLOCK)
          let a0 = 1
          let a1 = 1
          if (hasAutom) {
            a0 = automationValue(autom, (offsetSamples + b) / sr)
            a1 = automationValue(autom, (offsetSamples + e) / sr)
          }
          const slope = (a1 - a0) / (e - b)
          for (let i = b; i < e; i++) {
            const abs = offsetSamples + i
            const mi = abs - startSample
            const si = srcStart + i
            let env = constGain * (a0 + slope * (i - b))
            if (fadeInN > 0 && i < fadeInN) env *= i / fadeInN
            if (fadeOutN > 0 && i > clipLen - fadeOutN) env *= (clipLen - i) / fadeOutN
            if (headN > 0 && i < headN) env *= equalPowerIn((i + headN) / (2 * headN))
            if (tailN > 0 && i >= clipLen - tailN) env *= equalPowerOut((i - (clipLen - tailN)) / (2 * tailN))
            if (win && (xfadeIn || xfadeOut)) {
              const t = abs / sr
              if (xfadeIn && t < win.start + h) env *= Math.sin((Math.PI / 2) * Math.max(0, (t - (win.start - h)) / xfade))
              if (xfadeOut && t > win.end - h) env *= Math.cos((Math.PI / 2) * Math.min(1, (t - (win.end - h)) / xfade))
            }
            L[mi] += srcL[si] * panL * env
            R[mi] += srcR[si] * panR * env
          }
        }
      }
    }
  }
  return { left: L, right: R }
}

/** Transferable buffers of a plan (for postMessage). Copies are made by the caller. */
export function planTransferables(plan: MixPlan): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>()
  for (const t of plan.tracks) for (const c of t.channels) seen.add(c.buffer as ArrayBuffer)
  return [...seen]
}
