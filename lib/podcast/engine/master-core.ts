/**
 * Pure master chain on float channels: gain → fades → optional loudness match →
 * look-ahead true-peak limiter (−1 dBTP). Float headroom is kept throughout; only the
 * final encoder clamps.
 */

import { applyTruePeakLimiter, integratedLoudness, targetLufs, truePeakDb } from '@/lib/studio/loudness'

export type MasterCoreOptions = {
  gainDb?: number
  fadeInSec?: number
  fadeOutSec?: number
  matchLufs?: boolean
  /** Override the podcast target (default −16 stereo / −19 mono by channel count). */
  targetLufs?: number
  /** True-peak ceiling, default −1 dBTP. */
  ceilingDb?: number
  /** Skip the limiter entirely (not recommended). */
  limiter?: boolean
}

export type MasterCoreResult = { lufs: number; truePeakDb: number }

/** Linear gain + linear fades (in place, no clamp). */
export function applyGainFadesInPlace(channels: Float32Array[], sampleRate: number, gain: number, fadeInSec: number, fadeOutSec: number) {
  const n = channels[0]?.length ?? 0
  const fadeIn = Math.min(n, Math.floor(Math.max(0, fadeInSec) * sampleRate))
  const fadeOut = Math.min(n, Math.floor(Math.max(0, fadeOutSec) * sampleRate))
  for (const data of channels) {
    if (gain !== 1) for (let i = 0; i < n; i++) data[i] *= gain
    for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn
    for (let i = Math.max(0, n - fadeOut + 1); i < n; i++) data[i] *= (n - i) / fadeOut
  }
}

/** True when L/R are (near) identical: side energy ≥ 40 dB below mid. */
export function isEffectivelyMono(channels: Float32Array[], thresholdDb = -40): boolean {
  if (channels.length < 2) return true
  const a = channels[0]
  const b = channels[1]
  let mid = 0
  let side = 0
  const step = a.length > 4_000_000 ? 4 : 1
  for (let i = 0; i < a.length; i += step) {
    const m = a[i] + b[i]
    const s = a[i] - b[i]
    mid += m * m
    side += s * s
  }
  if (mid <= 0) return true
  return side <= mid * 10 ** (thresholdDb / 10)
}

export function processMaster(channels: Float32Array[], sampleRate: number, opts: MasterCoreOptions = {}): MasterCoreResult {
  const gain = 10 ** ((opts.gainDb ?? 0) / 20)
  applyGainFadesInPlace(channels, sampleRate, gain, opts.fadeInSec ?? 0, opts.fadeOutSec ?? 0)
  const data = { sampleRate, channels }
  const ceilingDb = opts.ceilingDb ?? -1
  let matchGainDb = 0
  if (opts.matchLufs) {
    const loud = integratedLoudness(data)
    if (Number.isFinite(loud.lufs)) {
      const target = opts.targetLufs ?? targetLufs(channels.length)
      matchGainDb = target - loud.lufs
    }
  }
  if (opts.limiter !== false) {
    applyTruePeakLimiter(data, { gainDb: matchGainDb, ceilingDb })
    if (opts.matchLufs) {
      // The limiter can hold the level back on dense material — one gentle top-up pass.
      const again = integratedLoudness(data)
      const target = opts.targetLufs ?? targetLufs(channels.length)
      const short = target - again.lufs
      if (Number.isFinite(short) && short > 0.3 && short < 6) applyTruePeakLimiter(data, { gainDb: short, ceilingDb })
    }
  } else if (matchGainDb) {
    const g = 10 ** (matchGainDb / 20)
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g
  }
  const lufs = integratedLoudness(data).lufs
  return { lufs, truePeakDb: truePeakDb(channels) }
}
