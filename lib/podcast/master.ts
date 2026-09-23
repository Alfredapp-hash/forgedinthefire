/**
 * CONTRACT STUB (Sprint 1) — Stream B implements; Stream A calls this from every export path
 * (hosted mix, WAV/MP3 download, stems zip, video export audio) instead of duplicating
 * mixdown → gain/fades → loudness → limiter in the editor.
 */
import type { StudioTrack } from './multitrack'
import { mixdownTracks } from './multitrack'

export type MasterOptions = {
  startSec?: number
  endSec?: number
  /** Normalize to podcast target (−16 LUFS stereo / −19 mono) with a −1 dBTP true-peak limiter. */
  matchLufs?: boolean
  /** Master gain in dB applied before loudness matching. */
  gainDb?: number
  fadeInSec?: number
  fadeOutSec?: number
  /** Session sample rate. Default 48000. */
  sampleRate?: number
}

export type MasterResult = {
  buffer: AudioBuffer
  lufs: number
  truePeakDb: number
}

export async function renderMaster(tracks: StudioTrack[], opts: MasterOptions = {}): Promise<MasterResult> {
  const buffer = mixdownTracks(tracks, { startSec: opts.startSec, endSec: opts.endSec, sampleRate: opts.sampleRate })
  return { buffer, lufs: NaN, truePeakDb: NaN }
}
