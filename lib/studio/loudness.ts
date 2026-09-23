/**
 * ITU-R BS.1770-4 integrated loudness + a look-ahead peak limiter for the release
 * checklist's one-click "Normalize loudness". Works on plain Float32Array channels so
 * it can be unit-tested outside the browser.
 *
 * Differs from lib/podcast/lufs.ts in two ways that matter for directory specs:
 *  - channel energies are SUMMED (BS.1770), not averaged — averaging reads stereo 3 dB low;
 *  - K-weighting coefficients are derived for the actual sample rate (44.1k vs 48k).
 */

export type ChannelData = { sampleRate: number; channels: Float32Array[] }
export type LoudnessResult = { lufs: number; peakDb: number; channels: number }

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }

function kWeightingFilters(fs: number): [Biquad, Biquad] {
  // libebur128 formulation of the BS.1770 pre-filter (high shelf) and RLB high-pass.
  let f0 = 1681.974450955533
  const G = 3.999843853973347
  let Q = 0.7071752369554196
  let K = Math.tan((Math.PI * f0) / fs)
  const Vh = 10 ** (G / 20)
  const Vb = Vh ** 0.4996667741545416
  let a0 = 1 + K / Q + K * K
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  }
  f0 = 38.13547087602444
  Q = 0.5003270373238773
  K = Math.tan((Math.PI * f0) / fs)
  a0 = 1 + K / Q + K * K
  const highpass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  return [shelf, highpass]
}

const ABS_GATE = -70
const REL_GATE = -10

/** Integrated loudness (LUFS, gated) and sample peak (dBFS). */
export function integratedLoudness({ sampleRate, channels }: ChannelData): LoudnessResult {
  const [s, h] = kWeightingFilters(sampleRate)
  const hop = Math.max(1, Math.round(sampleRate * 0.1)) // 100 ms; 4 hops = one 400 ms block
  const length = channels[0]?.length ?? 0
  const segments = new Float64Array(Math.ceil(length / hop))
  let peak = 0

  for (const data of channels.slice(0, 2)) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0 // shelf state
    let u1 = 0, u2 = 0, z1 = 0, z2 = 0 // high-pass state
    for (let i = 0; i < length; i++) {
      const x = data[i]
      const ax = x < 0 ? -x : x
      if (ax > peak) peak = ax
      const y = s.b0 * x + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2
      x2 = x1; x1 = x; y2 = y1; y1 = y
      const z = h.b0 * y + h.b1 * u1 + h.b2 * u2 - h.a1 * z1 - h.a2 * z2
      u2 = u1; u1 = y; z2 = z1; z1 = z
      segments[(i / hop) | 0] += z * z
    }
  }

  const blockLen = hop * 4
  const blocks: number[] = []
  for (let seg = 0; seg + 4 <= segments.length; seg++) {
    const energy = (segments[seg] + segments[seg + 1] + segments[seg + 2] + segments[seg + 3]) / blockLen
    blocks.push(energy)
  }
  if (!blocks.length && length) blocks.push(segments.reduce((a, b) => a + b, 0) / length)

  const lk = (e: number) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity)
  const abs = blocks.filter((e) => lk(e) > ABS_GATE)
  if (!abs.length) return { lufs: -Infinity, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, channels: channels.length }
  const relThreshold = lk(abs.reduce((a, b) => a + b, 0) / abs.length) + REL_GATE
  const gated = abs.filter((e) => lk(e) > relThreshold)
  const lufs = lk(gated.reduce((a, b) => a + b, 0) / gated.length)
  return { lufs, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, channels: channels.length }
}

/**
 * Apply `gainDb` with a 5 ms look-ahead limiter at `ceilingDb` and an 80 ms release.
 * Mutates the channels in place. Now true-peak aware (4× oversampled detection, smooth
 * gain curve); the old sample-peak brickwall is kept as `applyGainWithSamplePeakLimiter`.
 */
export function applyGainWithLimiter(data: ChannelData, gainDb: number, ceilingDb = -1.5) {
  applyTruePeakLimiter(data, { gainDb, ceilingDb, lookaheadMs: 5, releaseMs: 80 })
}

/** Legacy sample-peak brickwall (kept for callers that relied on its exact behaviour). */
export function applyGainWithSamplePeakLimiter({ sampleRate, channels }: ChannelData, gainDb: number, ceilingDb = -1.5) {
  const gain = 10 ** (gainDb / 20)
  const ceiling = 10 ** (ceilingDb / 20)
  const n = channels[0]?.length ?? 0
  const look = Math.max(1, Math.round(sampleRate * 0.005))
  const release = Math.exp(-1 / (sampleRate * 0.08))
  // Sliding-window minimum over the next `look` samples of required gain reduction.
  const qIdx = new Int32Array(look + 2)
  const qVal = new Float32Array(look + 2)
  let head = 0, tail = 0, size = 0
  const cap = look + 2
  let env = 1

  const need = (j: number) => {
    let p = 0
    for (const ch of channels) {
      const v = ch[j] < 0 ? -ch[j] : ch[j]
      if (v > p) p = v
    }
    const out = p * gain
    return out > ceiling ? ceiling / out : 1
  }

  for (let i = 0; i < n + look; i++) {
    if (i < n) {
      const v = need(i)
      while (size && qVal[(tail - 1 + cap) % cap] >= v) { tail = (tail - 1 + cap) % cap; size-- }
      qIdx[tail] = i; qVal[tail] = v; tail = (tail + 1) % cap; size++
    }
    const k = i - look
    if (k < 0) continue
    while (size && qIdx[head] < k) { head = (head + 1) % cap; size-- }
    const target = size ? qVal[head] : 1
    env = target < env ? target : target + (env - target) * release
    const g = gain * env
    for (const ch of channels) {
      const y = ch[k] * g
      ch[k] = y > ceiling ? ceiling : y < -ceiling ? -ceiling : y
    }
  }
}

/** Directory convention: −16 LUFS for stereo, −19 LUFS for mono. */
export function targetLufs(channels: number) {
  return channels >= 2 ? -16 : -19
}

// ---------------------------------------------------------------------------
// True peak (BS.1770-4 Annex 2 style): 4× oversampling, 12 taps per phase.
// ---------------------------------------------------------------------------

const TP_PHASES = 4
const TP_TAPS = 12 // per phase; taps read x[n-5 .. n+6] for a point between n and n+1
const TP_HALF = 6

function tpKernel(): Float32Array[] {
  const beta = 6
  const kaiser0 = (x: number) => {
    if (x <= -1 || x >= 1) return 0
    const i0 = (v: number) => {
      let sum = 1
      let term = 1
      const q = (v * v) / 4
      for (let k = 1; k < 48; k++) {
        term *= q / (k * k)
        sum += term
      }
      return sum
    }
    return i0(beta * Math.sqrt(1 - x * x)) / i0(beta)
  }
  const rows: Float32Array[] = []
  for (let p = 1; p < TP_PHASES; p++) {
    const frac = p / TP_PHASES
    const row = new Float32Array(TP_TAPS)
    let sum = 0
    for (let k = 0; k < TP_TAPS; k++) {
      const x = frac + TP_HALF - 1 - k // distance from x[n-5+k]
      const px = Math.PI * x
      const h = (x === 0 ? 1 : Math.sin(px) / px) * kaiser0(x / (TP_HALF + 0.5))
      row[k] = h
      sum += h
    }
    for (let k = 0; k < TP_TAPS; k++) row[k] /= sum
    rows.push(row)
  }
  return rows
}

let TP_ROWS: Float32Array[] | null = null
function tpRows() {
  if (!TP_ROWS) TP_ROWS = tpKernel()
  return TP_ROWS
}

/** Max |interpolated| value strictly between samples n and n+1 (3 oversampled points). */
export function interSamplePeak(data: Float32Array, n: number): number {
  const rows = tpRows()
  const r1 = rows[0]
  const r2 = rows[1]
  const r3 = rows[2]
  const len = data.length
  const first = n - TP_HALF + 1
  let a1 = 0
  let a2 = 0
  let a3 = 0
  if (first >= 0 && first + TP_TAPS <= len) {
    for (let k = 0; k < TP_TAPS; k++) {
      const x = data[first + k]
      a1 += x * r1[k]
      a2 += x * r2[k]
      a3 += x * r3[k]
    }
  } else {
    for (let k = 0; k < TP_TAPS; k++) {
      const j = first + k
      if (j < 0 || j >= len) continue
      const x = data[j]
      a1 += x * r1[k]
      a2 += x * r2[k]
      a3 += x * r3[k]
    }
  }
  if (a1 < 0) a1 = -a1
  if (a2 < 0) a2 = -a2
  if (a3 < 0) a3 = -a3
  return a1 > a2 ? (a1 > a3 ? a1 : a3) : a2 > a3 ? a2 : a3
}

/**
 * 4× oversampled true peak (linear) across channels. Inter-sample points are only
 * evaluated where a neighbouring sample is within 6 dB of the running maximum, which
 * keeps hour-long masters fast without missing realistic overs.
 */
export function truePeak(channels: Float32Array[]): number {
  let peak = 0
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const a = data[i] < 0 ? -data[i] : data[i]
      if (a > peak) peak = a
    }
  }
  const gate = peak * 0.5
  let tp = peak
  for (const data of channels) {
    const n = data.length
    for (let i = 0; i + 1 < n; i++) {
      const a = data[i] < 0 ? -data[i] : data[i]
      const b = data[i + 1] < 0 ? -data[i + 1] : data[i + 1]
      if (a < gate && b < gate) continue
      const v = interSamplePeak(data, i)
      if (v > tp) tp = v
    }
  }
  return tp
}

export function truePeakDb(channels: Float32Array[]): number {
  const tp = truePeak(channels)
  return tp > 0 ? 20 * Math.log10(tp) : -Infinity
}

export type TruePeakLimiterOptions = {
  /** Pre-gain in dB applied before limiting. */
  gainDb?: number
  /** True-peak ceiling (dBTP). Default −1. */
  ceilingDb?: number
  lookaheadMs?: number
  releaseMs?: number
}

/**
 * Look-ahead true-peak limiter with a smooth gain curve. Required gain per sample is
 * computed from the 4× oversampled peak around that sample; a forward sliding minimum
 * over the look-ahead window followed by a moving average of the same length gives a
 * linear attack ramp that reaches the needed reduction exactly at the peak; release is
 * a one-pole return to unity. Mutates channels in place. No hard clipping.
 */
export function applyTruePeakLimiter({ sampleRate, channels }: ChannelData, opts: TruePeakLimiterOptions = {}) {
  const gain = 10 ** ((opts.gainDb ?? 0) / 20)
  // Aim a hair under the ceiling: gain modulation can nudge the reconstructed peak.
  const ceiling = 10 ** (((opts.ceilingDb ?? -1) - 0.05) / 20)
  const n = channels[0]?.length ?? 0
  if (!n) return
  const L = Math.max(8, Math.round((sampleRate * (opts.lookaheadMs ?? 5)) / 1000))
  const release = Math.exp(-1 / (sampleRate * ((opts.releaseMs ?? 100) / 1000)))
  const gateLevel = (ceiling / gain) * 0.5

  // Inter-sample segment s (between s and s+1) is shared by samples s and s+1: cache it.
  const segIdx = channels.map(() => -1)
  const segVal = channels.map(() => 0)
  const segment = (c: number, s: number) => {
    if (segIdx[c] === s) return segVal[c]
    const ch = channels[c]
    const a = ch[s] < 0 ? -ch[s] : ch[s]
    const b = ch[s + 1] < 0 ? -ch[s + 1] : ch[s + 1]
    const v = a >= gateLevel || b >= gateLevel ? interSamplePeak(ch, s) : 0
    segIdx[c] = s
    segVal[c] = v
    return v
  }
  const need = (i: number) => {
    let p = 0
    for (let c = 0; c < channels.length; c++) {
      const x = channels[c][i]
      const a = x < 0 ? -x : x
      if (a > p) p = a
      if (i > 0) {
        const v = segment(c, i - 1)
        if (v > p) p = v
      }
      if (i + 1 < n) {
        const v = segment(c, i)
        if (v > p) p = v
      }
    }
    const out = p * gain
    return out > ceiling ? ceiling / out : 1
  }

  // Monotonic deque for the forward window minimum m[k] = min(r[k..k+L]).
  const cap = L + 2
  const qIdx = new Int32Array(cap)
  const qVal = new Float32Array(cap)
  let head = 0
  let tail = 0
  let size = 0
  // Moving average of m over L+1 samples.
  const ring = new Float64Array(L + 1).fill(1)
  let ringPos = 0
  let ringSum = L + 1
  let env = 1

  for (let i = 0; i < n + L; i++) {
    if (i < n) {
      const v = need(i)
      while (size && qVal[(tail - 1 + cap) % cap] >= v) {
        tail = (tail - 1 + cap) % cap
        size--
      }
      qIdx[tail] = i
      qVal[tail] = v
      tail = (tail + 1) % cap
      size++
    }
    // k runs from −L so the average window is primed with real minima before output.
    const k = i - L
    while (size && qIdx[head] < k) {
      head = (head + 1) % cap
      size--
    }
    const m = size ? qVal[head] : 1
    ringSum += m - ring[ringPos]
    ring[ringPos] = m
    ringPos = ringPos + 1 === ring.length ? 0 : ringPos + 1
    if (k < 0) continue
    // Average of the last L+1 minima; each is ≤ r at any peak inside their window.
    const g = ringSum / ring.length
    env = g < env ? g : g + (env - g) * release
    const total = gain * env
    for (const ch of channels) ch[k] *= total
  }
}

/** Integrated loudness + true peak in one call. */
export function measureProgram(data: ChannelData): LoudnessResult & { truePeakDb: number } {
  const r = integratedLoudness(data)
  return { ...r, truePeakDb: truePeakDb(data.channels) }
}
