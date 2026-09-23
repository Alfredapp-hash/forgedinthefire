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
 * Apply `gainDb` with a 5 ms look-ahead brickwall limiter at `ceilingDb` (sample peak)
 * and an 80 ms release. Mutates the channels in place.
 */
export function applyGainWithLimiter({ sampleRate, channels }: ChannelData, gainDb: number, ceilingDb = -1.5) {
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
