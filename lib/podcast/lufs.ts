/**
 * Podcast loudness — thin adapter over the single BS.1770-4 implementation in
 * lib/studio/loudness.ts (sample-rate-correct K-weighting, summed channel energy,
 * absolute + relative gating, 4× oversampled true peak). Exports are unchanged for
 * existing callers (measureLoudness / gainForTargetLufs / verifyLufs).
 */

import { integratedLoudness, targetLufs, truePeakDb } from '@/lib/studio/loudness'

const TARGET_PODCAST_LUFS = -16

export type Loudness = {
  lufs: number
  /** Sample peak (linear) */
  peak: number
  /** Sample peak (dBFS) */
  peakDb: number
  /** 4× oversampled true peak (dBTP). Present when `truePeak: true` was requested. */
  truePeakDb?: number
}

export const PODCAST_LUFS = TARGET_PODCAST_LUFS
/** Directory convention for mono programmes. */
export const PODCAST_LUFS_MONO = -19

function channelsOf(buffer: AudioBuffer) {
  return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i))
}

export function measureLoudness(buffer: AudioBuffer, opts?: { truePeak?: boolean }): Loudness {
  const channels = channelsOf(buffer)
  const r = integratedLoudness({ sampleRate: buffer.sampleRate, channels })
  const peak = Number.isFinite(r.peakDb) ? 10 ** (r.peakDb / 20) : 0
  const out: Loudness = { lufs: r.lufs, peak, peakDb: r.peakDb }
  if (opts?.truePeak) out.truePeakDb = truePeakDb(channels)
  return out
}

/** Podcast target for a buffer's channel count (−16 stereo, −19 mono). */
export function podcastTargetLufs(buffer: AudioBuffer) {
  return targetLufs(buffer.numberOfChannels)
}

export function gainForTargetLufs(measured: number, target = TARGET_PODCAST_LUFS) {
  if (!Number.isFinite(measured)) return 1
  return 10 ** ((target - measured) / 20)
}

/** Default acceptance window around the target (dB). ±1 LU is inaudible and well
 * inside Apple/Spotify's ~±1 LU normalization band, so anything wider warrants a warn. */
export const LUFS_TOLERANCE = 1

export type LufsVerdict = {
  /** Measured integrated loudness of the buffer that was handed off. */
  lufs: number
  target: number
  /** Signed distance from target in LU (positive = hotter than target). */
  deltaLu: number
  /** True when |deltaLu| <= tolerance (or when the mix is effectively silent). */
  onTarget: boolean
  peakDb: number
}

/**
 * Re-measure an already-processed buffer and report whether it actually lands on
 * the LUFS target. Call this on the *rendered* mix (post gain/limit, or after
 * decoding the encoded blob) to catch a normalization that a limiter clawed back.
 * A silent / un-gateable mix (non-finite LUFS) is treated as on-target — there is
 * nothing to normalize and no false alarm to raise.
 */
export function verifyLufs(
  buffer: AudioBuffer,
  target = TARGET_PODCAST_LUFS,
  tolerance = LUFS_TOLERANCE,
): LufsVerdict {
  const { lufs, peakDb } = measureLoudness(buffer)
  if (!Number.isFinite(lufs)) {
    return { lufs, target, deltaLu: 0, onTarget: true, peakDb }
  }
  const deltaLu = lufs - target
  return { lufs, target, deltaLu, onTarget: Math.abs(deltaLu) <= tolerance, peakDb }
}
