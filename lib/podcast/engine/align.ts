/**
 * Fine alignment of a guest backup take against the live (WebRTC) guest lane.
 *
 * The backup is first placed from its manifest clock (startedAtSessionSec). That clock mapping is
 * good to a few hundred ms (network RTT, recorder start jitter). Here we refine it by
 * cross-correlating loudness envelopes of the two recordings of the same voice over their overlap,
 * within ±maxLagSec. Envelopes (1 kHz, rectified + mean-removed) are robust to the live lane's
 * Opus coding, AGC and phase differences, and cheap enough for the main thread.
 *
 * Pure: no Web Audio. Callers pass mono Float32 data + its sample rate + where sample 0 sits on the
 * session clock.
 */

export type AlignInput = {
  data: Float32Array
  sampleRate: number
  /** Session seconds of data[0]. */
  startSec: number
}

export type AlignResult = {
  /** Seconds to ADD to the target's startSec so it lines up with the reference. */
  shiftSec: number
  /** Pearson correlation of the envelopes at the best lag (−1…1). */
  score: number
  /** Overlap (seconds) the estimate was made on. */
  overlapSec: number
}

export const ENVELOPE_RATE = 1000

/** Rectified block-mean envelope at `rate` Hz. Fractional blocks keep 44.1 kHz on the same grid as 48 kHz. */
export function envelope(data: Float32Array, sampleRate: number, rate = ENVELOPE_RATE): Float32Array {
  const step = sampleRate / rate
  const n = Math.floor(data.length / step)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step)
    const b = Math.max(a + 1, Math.floor((i + 1) * step))
    let sum = 0
    for (let j = a; j < b; j++) sum += Math.abs(data[j])
    out[i] = sum / (b - a)
  }
  return out
}

/**
 * Lag (in envelope samples) in [minLag, maxLag] (default ±maxLag) that maximises the normalised correlation of
 * ref[i] with target[i + lag]. Positive lag: the target's content sits LATER than the reference's.
 */
export function bestLag(
  ref: Float32Array,
  target: Float32Array,
  maxLag: number,
  minLag = -maxLag,
): { lag: number; score: number } {
  let best = { lag: 0, score: -Infinity }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const i0 = Math.max(0, -lag)
    const i1 = Math.min(ref.length, target.length - lag)
    const n = i1 - i0
    if (n < 16) continue
    let sa = 0
    let sb = 0
    for (let i = i0; i < i1; i++) {
      sa += ref[i]
      sb += target[i + lag]
    }
    const ma = sa / n
    const mb = sb / n
    let num = 0
    let da = 0
    let db = 0
    for (let i = i0; i < i1; i++) {
      const a = ref[i] - ma
      const b = target[i + lag] - mb
      num += a * b
      da += a * a
      db += b * b
    }
    const den = Math.sqrt(da * db)
    const score = den > 1e-12 ? num / den : 0
    if (score > best.score) best = { lag, score }
  }
  return best.score === -Infinity ? { lag: 0, score: 0 } : best
}

/**
 * How far to move `target` (seconds) so it lines up with `reference`, searching ±maxLagSec around
 * the current placement. Uses up to `windowSec` of their overlap. Returns null when they do not
 * overlap by at least `minOverlapSec`, or the match is weaker than `minScore` (e.g. silence, or a
 * different voice) — callers keep the clock placement then.
 */
export function alignToReference(
  reference: AlignInput,
  target: AlignInput,
  opts: { maxLagSec?: number; windowSec?: number; minOverlapSec?: number; minScore?: number } = {},
): AlignResult | null {
  const maxLagSec = opts.maxLagSec ?? 0.2
  const windowSec = opts.windowSec ?? 30
  const minOverlap = opts.minOverlapSec ?? 2
  const minScore = opts.minScore ?? 0.3
  const refEnd = reference.startSec + reference.data.length / reference.sampleRate
  const tgtEnd = target.startSec + target.data.length / target.sampleRate
  // Overlap window on the session clock, shrunk by the search range so every lag stays in-bounds.
  const from = Math.max(reference.startSec, target.startSec) + maxLagSec
  const to = Math.min(refEnd, tgtEnd, from + windowSec) - maxLagSec
  if (to - from < minOverlap) return null

  const slice = (src: AlignInput, a: number, b: number) => {
    const s = Math.max(0, Math.floor((a - src.startSec) * src.sampleRate))
    const e = Math.min(src.data.length, Math.ceil((b - src.startSec) * src.sampleRate))
    return envelope(src.data.subarray(s, e), src.sampleRate)
  }
  // Reference: the overlap. Target: the overlap widened by the search range on both sides.
  const ref = slice(reference, from, to)
  const tgt = slice(target, from - maxLagSec, to + maxLagSec)
  const maxLag = Math.round(maxLagSec * ENVELOPE_RATE)
  // bestLag compares ref[i] with tgt[i + lag]; tgt starts maxLag samples earlier than ref, so
  // lag = maxLag means "no shift".
  const { lag, score } = bestLag(ref, tgt, 2 * maxLag, 0)
  if (!(score >= minScore)) return null
  const shiftSamples = lag - maxLag
  return {
    shiftSec: -shiftSamples / ENVELOPE_RATE,
    score,
    overlapSec: to - from,
  }
}
