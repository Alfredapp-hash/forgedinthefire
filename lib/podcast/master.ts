/**
 * Single master render used by every export path (hosted mix, WAV/MP3 download, stems zip,
 * video export audio): mixdown (resampled to the session rate, comp crossfades) → master
 * gain → fades → optional loudness match (−16 LUFS stereo / −19 mono) → −1 dBTP true-peak
 * look-ahead limiter. Runs in a Worker when available; falls back to the main thread.
 */
import type { StudioTrack } from './multitrack'
import { buildMixPlan, emptyStereo, SESSION_SAMPLE_RATE } from './multitrack'
import { renderMixPlan, type MixPlan } from './engine/mix-core'
import { processMaster, type MasterCoreOptions } from './engine/master-core'
import type { MasterWorkerRequest, MasterWorkerResponse } from './workers/master.worker'

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
  /** Override the loudness target (LUFS). */
  targetLufs?: number
  /** True-peak ceiling. Default −1 dBTP. */
  ceilingDb?: number
  /** Comp/take crossfade length. Default 16 ms. */
  crossfadeSec?: number
  /** Render in a Web Worker when possible (default true). */
  useWorker?: boolean
  /** Apply each track's insert chain first (tracksWithInserts). Default false — pass prepared tracks. */
  applyInserts?: boolean
}

export type MasterResult = {
  buffer: AudioBuffer
  lufs: number
  truePeakDb: number
}

let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const pending = new Map<number, { resolve: (r: MasterWorkerResponse) => void }>()

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined' || typeof window === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./workers/master.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<MasterWorkerResponse>) => {
      const job = pending.get(event.data.id)
      if (!job) return
      pending.delete(event.data.id)
      job.resolve(event.data)
    }
    worker.onerror = () => {
      workerBroken = true
      for (const [id, job] of pending) job.resolve({ id, ok: false, error: 'worker crashed' })
      pending.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

function runInWorker(w: Worker, plan: MixPlan, opts: MasterCoreOptions): Promise<MasterWorkerResponse> {
  const id = nextId++
  // Copy source channels (never transfer an AudioBuffer's own storage), then transfer the copies.
  const copied: MixPlan = {
    ...plan,
    tracks: plan.tracks.map((t) => ({ ...t, channels: t.channels.map((c) => c.slice()) })),
  }
  const transfer = copied.tracks.flatMap((t) => t.channels.map((c) => c.buffer as ArrayBuffer))
  return new Promise((resolve) => {
    pending.set(id, { resolve })
    const msg: MasterWorkerRequest = { id, plan: copied, opts }
    w.postMessage(msg, transfer)
  })
}

export async function renderMaster(tracks: StudioTrack[], opts: MasterOptions = {}): Promise<MasterResult> {
  const sampleRate = opts.sampleRate || SESSION_SAMPLE_RATE
  let source = tracks
  if (opts.applyInserts) {
    const { tracksWithInserts } = await import('./inserts')
    source = await tracksWithInserts(tracks)
  }
  const w = opts.useWorker === false ? null : getWorker()
  const plan = buildMixPlan(source, {
    startSec: opts.startSec,
    endSec: opts.endSec,
    sampleRate,
    crossfadeSec: opts.crossfadeSec,
    // The worker resamples off-thread; the main-thread path reuses the per-buffer cache.
    resampleOnMainThread: !w,
  })
  const core: MasterCoreOptions = {
    gainDb: opts.gainDb,
    fadeInSec: opts.fadeInSec,
    fadeOutSec: opts.fadeOutSec,
    matchLufs: opts.matchLufs,
    targetLufs: opts.targetLufs,
    ceilingDb: opts.ceilingDb,
  }
  if (!plan.tracks.length) {
    return { buffer: emptyStereo(sampleRate, 1), lufs: -Infinity, truePeakDb: -Infinity }
  }

  let left: Float32Array
  let right: Float32Array
  let lufs: number
  let truePeakDb: number
  const res = w ? await runInWorker(w, plan, core) : null
  if (res && res.ok) {
    ;({ left, right, lufs, truePeakDb } = res)
  } else {
    const mainPlan = w ? buildMixPlan(source, { startSec: opts.startSec, endSec: opts.endSec, sampleRate, crossfadeSec: opts.crossfadeSec }) : plan
    ;({ left, right } = renderMixPlan(mainPlan))
    ;({ lufs, truePeakDb } = processMaster([left, right], sampleRate, core))
  }
  const buffer = emptyStereo(sampleRate, left.length)
  buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0)
  buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1)
  return { buffer, lufs, truePeakDb }
}
