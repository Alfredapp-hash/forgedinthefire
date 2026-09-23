/**
 * Podcast loudness — thin adapter over the single BS.1770-4 implementation in
 * lib/studio/loudness.ts (sample-rate-correct K-weighting, summed channel energy,
 * absolute + relative gating). Exports are unchanged for existing callers.
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
