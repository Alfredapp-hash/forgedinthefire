/**
 * Band-limited (windowed-sinc, Kaiser) polyphase resampler on plain Float32Arrays.
 * Pure — runs on the main thread, in a Worker, or under vitest.
 *
 * Rational ratios (44.1k ↔ 48k = 147/160) use an exact polyphase table; odd ratios
 * quantize the fractional phase to 1/1024 sample (≈ −90 dB error on speech).
 */

export const SESSION_SAMPLE_RATE = 48000

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a || 1
}

/** Zeroth-order modified Bessel function (Kaiser window). */
function besselI0(x: number) {
  let sum = 1
  let term = 1
  const q = (x * x) / 4
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k)
    sum += term
    if (term < sum * 1e-12) break
  }
  return sum
}

export function kaiser(x: number, beta: number) {
  // x in [-1, 1]
  if (x <= -1 || x >= 1) return 0
  return besselI0(beta * Math.sqrt(1 - x * x)) / besselI0(beta)
}

export function sinc(x: number) {
  if (x === 0) return 1
  const px = Math.PI * x
  return Math.sin(px) / px
}

type Table = { phases: number; taps: number; half: number; coeffs: Float32Array; exact: boolean; L: number; M: number }

const tableCache = new Map<string, Table>()

function buildTable(fromRate: number, toRate: number, zeroCrossings: number): Table {
  const key = `${fromRate}:${toRate}:${zeroCrossings}`
  const hit = tableCache.get(key)
  if (hit) return hit
  const g = gcd(fromRate, toRate)
  const L = Math.round(toRate / g)
  const M = Math.round(fromRate / g)
  const exact = L <= 1024
  const phases = exact ? L : 1024
  // Cutoff relative to the input Nyquist: full band when upsampling, new Nyquist when down.
  const fc = Math.min(1, toRate / fromRate) * 0.97
  const halfWidth = zeroCrossings / fc
  const half = Math.ceil(halfWidth)
  const taps = half * 2
  const beta = 8.6
  const coeffs = new Float32Array(phases * taps)
  for (let p = 0; p < phases; p++) {
    const frac = p / phases
    let sum = 0
    for (let k = 0; k < taps; k++) {
      // tap k reads input[n - half + 1 + k]; distance from the output instant:
      const x = frac + half - 1 - k
      const h = fc * sinc(fc * x) * kaiser(x / halfWidth, beta)
      coeffs[p * taps + k] = h
      sum += h
    }
    // Unity DC gain per phase.
    if (sum !== 0) for (let k = 0; k < taps; k++) coeffs[p * taps + k] /= sum
  }
  const table = { phases, taps, half, coeffs, exact, L, M }
  if (tableCache.size > 16) tableCache.clear()
  tableCache.set(key, table)
  return table
}

/** Output length for a resample (matches OfflineAudioContext rounding). */
export function resampledLength(length: number, fromRate: number, toRate: number) {
  return Math.max(1, Math.round((length * toRate) / fromRate))
}

/** Band-limited resample of one channel. Returns the input unchanged when rates match. */
export function resampleSinc(
  input: Float32Array,
  fromRate: number,
  toRate: number,
  opts: { zeroCrossings?: number } = {},
): Float32Array {
  if (fromRate === toRate) return input
  const t = buildTable(fromRate, toRate, opts.zeroCrossings ?? 10)
  const outLen = resampledLength(input.length, fromRate, toRate)
  const out = new Float32Array(outLen)
  const { taps, half, coeffs, exact, L, M, phases } = t
  const n = input.length
  const step = fromRate / toRate
  for (let i = 0; i < outLen; i++) {
    let base: number
    let phase: number
    if (exact) {
      const pos = i * M
      base = Math.floor(pos / L)
      phase = pos - base * L
    } else {
      const pos = i * step
      base = Math.floor(pos)
      phase = Math.round((pos - base) * phases)
      if (phase >= phases) {
        phase = 0
        base++
      }
    }
    const first = base - half + 1
    const row = phase * taps
    let acc = 0
    if (first >= 0 && first + taps <= n) {
      for (let k = 0; k < taps; k++) acc += input[first + k] * coeffs[row + k]
    } else {
      for (let k = 0; k < taps; k++) {
        const j = first + k
        if (j >= 0 && j < n) acc += input[j] * coeffs[row + k]
      }
    }
    out[i] = acc
  }
  return out
}

export function resampleChannels(channels: Float32Array[], fromRate: number, toRate: number): Float32Array[] {
  return channels.map((c) => resampleSinc(c, fromRate, toRate))
}
