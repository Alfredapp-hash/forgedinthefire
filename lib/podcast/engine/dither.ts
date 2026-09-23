/** Float → 16-bit PCM with TPDF dither. The final clamp to the PCM range happens here, and only here. */

export type DitherMode = boolean | 'auto'

/** xorshift32 — fast, deterministic per call. */
function rng(seed = 0x9e3779b9) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** True when samples already sit on the 16-bit grid (e.g. a decoded 16-bit WAV) — dithering would only add noise. */
export function isOn16BitGrid(channels: Float32Array[], probe = 4096): boolean {
  let checked = 0
  for (const data of channels) {
    const step = Math.max(1, Math.floor(data.length / probe))
    for (let i = 0; i < data.length && checked < probe; i += step) {
      const v = data[i] * 32768
      if (v === 0) continue
      if (Math.abs(v - Math.round(v)) > 1e-3) return false
      checked++
    }
  }
  return true
}

export function quantize16(x: number, noise: number) {
  let q = Math.round(x * 32768 + noise)
  if (q > 32767) q = 32767
  else if (q < -32768) q = -32768
  return q
}

/** Convert one channel to Int16 with optional TPDF (±1 LSB triangular) dither. */
export function floatToInt16(input: Float32Array, dither = true, seed?: number): Int16Array {
  const out = new Int16Array(input.length)
  const r = rng(seed)
  for (let i = 0; i < input.length; i++) {
    const n = dither ? r() - r() : 0
    out[i] = quantize16(input[i], n)
  }
  return out
}

export function resolveDither(mode: DitherMode | undefined, channels: Float32Array[]): boolean {
  if (mode === undefined || mode === 'auto') return !isOn16BitGrid(channels)
  return mode
}
