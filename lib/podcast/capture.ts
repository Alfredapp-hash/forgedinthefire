/** Dual (or more) local audio inputs for the production room. */

import {
  appendCheckpoint,
  beginCheckpoint,
  describeCheckpoint,
  finalizeCheckpoint,
  loadRecoverableTakes,
  takeKeyFor,
  type CheckpointKind,
} from '@/lib/podcast/session-store'
import { mediaErrorMessage } from '@/lib/podcast/camera'
import type { CaptureTiming } from '@/lib/podcast/engine/latency'
import type { TakeJournal } from '@/lib/podcast/take-journal'

export type { CaptureTiming } from '@/lib/podcast/engine/latency'

/**
 * 'raw'     — echoCancellation / noiseSuppression / autoGainControl OFF: the true mic signal.
 *             Default for recording when the person wears headphones; cleanup happens AFTER
 *             the take (RNNoise 'isolate' insert, gate, de-ess) where it can be undone.
 * 'browser' — the browser's AEC + NS + AGC (+ voiceIsolation). Use on open speakers or for
 *             live talkback, where echo matters more than fidelity.
 */
export type CaptureProcessing = 'raw' | 'browser'

/** Resolve the processing mode: explicit choice wins; no headphones → 'browser'; else 'raw'. */
export function resolveProcessing(opts: { processing?: CaptureProcessing; raw?: boolean; headphones?: boolean } = {}): CaptureProcessing {
  if (opts.processing) return opts.processing
  if (typeof opts.raw === 'boolean') return opts.raw ? 'raw' : 'browser'
  if (opts.headphones === false) return 'browser'
  return 'raw'
}

/**
 * A "samples are flowing" signal the UI can poll as a recording watchdog.
 * `lastTickAt` advances as chunks arrive; if it stops moving while recording,
 * the recorder has stalled. `samples` is a monotonic running count.
 */
export type CaptureWatchdog = {
  tick: (sampleCount: number) => void
  /** Read the current signal. `lastTickAt` is a performance.now() timestamp. */
  read: () => { lastTickAt: number; samples: number; chunks: number }
}

/** Create a watchdog whose signal is readable from the returned object. */
export function createWatchdog(): CaptureWatchdog {
  const state = { lastTickAt: 0, samples: 0, chunks: 0 }
  return {
    tick: (sampleCount: number) => {
      state.lastTickAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      state.samples += Math.max(0, sampleCount)
      state.chunks += 1
    },
    read: () => ({ ...state }),
  }
}

/**
 * Sink a capture streams its chunk parts into on a periodic tick, so a crash
 * loses at most one tick and RAM stays bounded on long takes. Backed by the
 * IndexedDB checkpoint store in session-store.ts.
 */
export type CheckpointSink = {
  /** Append captured parts (Blob for MediaRecorder/camera, PCM ArrayBuffer for worklet). */
  append: (parts: Array<Blob | ArrayBuffer>) => Promise<void>
  /**
   * Record how this lane is actually being captured, once the capture path is
   * chosen. The sink is created before startLaneCapture decides worklet vs
   * MediaRecorder, and recovery decoding depends on this (PCM→WAV vs blob).
   */
  describe: (info: { kind: CheckpointKind; mime: string; sampleRate?: number }) => Promise<void>
  /** Rebuild the whole take from the store once recording stops. */
  finalize: () => Promise<Blob | null>
  /** Drop the checkpoint (after the take is laid onto the timeline). */
  discard: () => Promise<void>
  onError?: (err: unknown) => void
}

/** Wire a checkpoint sink for one capture lane to the IndexedDB store. */
export async function makeCheckpointSink(opts: {
  episodeId: string
  laneKey: string
  kind: CheckpointKind
  mime: string
  sampleRate: number
  offset: number
  recTrim: number
  label: string
  personId: string
  onError?: (err: unknown) => void
}): Promise<CheckpointSink> {
  const takeKey = takeKeyFor(opts.episodeId, opts.laneKey)
  await beginCheckpoint({
    takeKey,
    episodeId: opts.episodeId,
    laneKey: opts.laneKey,
    kind: opts.kind,
    mime: opts.mime,
    sampleRate: opts.sampleRate,
    offset: opts.offset,
    recTrim: opts.recTrim,
    label: opts.label,
    personId: opts.personId,
  })
  return {
    append: (parts) => appendCheckpoint(takeKey, parts),
    describe: (info) => describeCheckpoint(takeKey, info),
    finalize: async () => {
      const recovered = await loadRecoverableTakes(opts.episodeId)
      return recovered.find((r) => r.meta.takeKey === takeKey)?.blob ?? null
    },
    discard: () => finalizeCheckpoint(takeKey),
    onError: opts.onError,
  }
}

/**
 * Mic constraints. `raw` keeps its old meaning when a boolean is passed (true = raw,
 * false = browser processing); a CaptureProcessing string is used as-is. The session
 * rate (48 kHz) is requested so capture, cue and mixdown share one clock.
 */
export function audioInputConstraints(
  deviceId: string | undefined,
  raw?: boolean | CaptureProcessing,
  opts: { headphones?: boolean; sampleRate?: number } = {},
): MediaTrackConstraints {
  const mode = typeof raw === 'string' ? raw : resolveProcessing({ raw, headphones: opts.headphones })
  const off = mode === 'raw'
  const audio: MediaTrackConstraints = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: !off,
    noiseSuppression: !off,
    autoGainControl: !off,
    channelCount: 1,
    sampleRate: { ideal: opts.sampleRate ?? 48000 },
  }
  if (!off) {
    Object.assign(audio, { voiceIsolation: true })
  }
  return audio
}

export async function openInputStream(
  deviceId: string | undefined,
  raw?: boolean | CaptureProcessing,
  opts: { headphones?: boolean } = {},
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      typeof window !== 'undefined' && !window.isSecureContext
        ? 'Microphone needs a secure context (localhost or HTTPS)'
        : 'This browser cannot open a microphone',
    )
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audioInputConstraints(deviceId, raw, opts) })
  } catch (err) {
    throw new Error(mediaErrorMessage(err, 'microphone'))
  }
}

/** Open unique devices one at a time so Chrome is less likely to kill the first stream. */
export async function openInputStreams(
  deviceIds: string[],
  raw?: boolean | CaptureProcessing,
): Promise<Map<string, MediaStream>> {
  const unique = [...new Set(deviceIds.map((id) => id || ''))]
  const out = new Map<string, MediaStream>()
  for (const id of unique) {
    const stream = await openInputStream(id || undefined, raw)
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live')
    if (!live) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('A microphone track ended as soon as it opened. Chrome often allows only one input — pick two hardware devices, not the same mic twice.')
    }
    for (const [key, prev] of out) {
      if (prev.getAudioTracks().some((t) => t.readyState !== 'live')) {
        stream.getTracks().forEach((t) => t.stop())
        prev.getTracks().forEach((t) => t.stop())
        throw new Error(
          `Opening a second mic stopped “${key || 'default'}”. Use two named devices (interface inputs), or a mixer into one mic.`,
        )
      }
    }
    out.set(id, stream)
  }
  return out
}

export function recorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

export type LaneCapture = {
  key: string
  recorder: MediaRecorder | null
  kind: 'worklet' | 'media-recorder'
  stop: () => void
  done: Promise<Blob>
  /** Worklet only: the AudioContext the capture ran on (the shared session context when given). */
  context?: AudioContext
  sampleRate?: number
  /** Worklet only: AudioContext frame of the first captured sample. */
  startFrame?: Promise<number>
  /** Latency / clock info for punch alignment — pass the capture to record-session punchAlignSec. */
  timing?: () => CaptureTiming
  /** Worklet only: float result after `done` (skip the WAV decode). */
  buffer?: () => AudioBuffer | null
}

export type LaneCaptureOpts = {
  /** Crash-safe checkpoint sink (IndexedDB, session-store). Parts rotate every ~1 s. */
  checkpoint?: CheckpointSink
  /** Samples-flowing signal for the stall watchdog. */
  watchdog?: CaptureWatchdog
  /** Shared session AudioContext (cue + every mic, 48 kHz). Never closed by the capture. */
  context?: AudioContext
  /** Optional take journal (chunk-level persistence) — honoured by captures that support it. */
  journal?: TakeJournal
  finishJournalOnStop?: boolean
  /** Force the MediaRecorder path. */
  forceMediaRecorder?: boolean
  /** MediaRecorder timeslice (ms). Default 1000 (one checkpoint part ≈ 1 s). */
  timesliceMs?: number
}

/** Flush the MediaRecorder blob tail to the checkpoint store this often (ms). */
const MR_CHECKPOINT_MS = 1000

function startMediaRecorderCapture(
  key: string,
  stream: MediaStream,
  opts?: LaneCaptureOpts,
): LaneCapture {
  const audioOnly = new MediaStream(stream.getAudioTracks())
  const mime = recorderMime()
  const recorder = mime ? new MediaRecorder(audioOnly, { mimeType: mime }) : new MediaRecorder(audioOnly)
  const checkpoint = opts?.checkpoint
  const watchdog = opts?.watchdog

  // Retained only in the no-checkpoint fallback; with a sink these are rotated
  // to IndexedDB and dropped so RAM stays bounded on long takes.
  const retained: Blob[] = []
  // Tail not yet checkpointed.
  let pending: Blob[] = []
  const outMime = recorder.mimeType || mime || 'audio/webm'

  if (checkpoint) {
    void checkpoint.describe({ kind: 'media-recorder', mime: outMime })
  }

  const rotate = async () => {
    if (!checkpoint || pending.length === 0) return
    const batch = pending
    pending = []
    try {
      await checkpoint.append(batch)
    } catch (err) {
      pending = batch.concat(pending)
      checkpoint.onError?.(err)
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  if (checkpoint) {
    timer = setInterval(() => {
      void rotate()
    }, MR_CHECKPOINT_MS)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return
      watchdog?.tick(event.data.size)
      if (checkpoint) pending.push(event.data)
      else retained.push(event.data)
      try {
        opts?.journal?.appendBlob?.(event.data)
      } catch {
        /* journal must never break capture */
      }
    }
    recorder.onstop = () => {
      if (timer) clearInterval(timer)
      void (async () => {
        await rotate()
        let blob: Blob | null = null
        if (checkpoint) {
          try {
            blob = await checkpoint.finalize()
          } catch {
            blob = null
          }
        }
        if (!blob) blob = new Blob(retained, { type: outMime })
        const journal = opts?.journal
        if (journal) {
          try {
            if (opts?.finishJournalOnStop) await journal.finish()
            else await journal.flush?.()
          } catch {
            /* journal errors are reported via its onError */
          }
        }
        resolve(blob)
      })()
    }
    recorder.onerror = () => {
      if (timer) clearInterval(timer)
      reject(new Error('Recorder failed'))
    }
  })
  recorder.start(opts?.timesliceMs ?? 1000)
  return {
    key,
    recorder,
    kind: 'media-recorder',
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop()
    },
    done,
  }
}

export async function startLaneCapture(
  key: string,
  stream: MediaStream,
  opts?: LaneCaptureOpts,
): Promise<LaneCapture> {
  if (!opts?.forceMediaRecorder) {
    try {
      const { startWorkletCapture } = await import('@/lib/podcast/worklet-capture')
      // Superset of the options either worklet-capture generation understands
      // (checkpoint/watchdog for the checkpoint build; context/journal for the shared-clock build).
      const workletOpts = {
        checkpoint: opts?.checkpoint,
        watchdog: opts?.watchdog,
        context: opts?.context,
        journal: opts?.journal,
        finishJournalOnStop: opts?.finishJournalOnStop,
      } as unknown as Parameters<typeof startWorkletCapture>[2]
      const worklet = await startWorkletCapture(key, stream, workletOpts)
      if (worklet) return worklet as LaneCapture
    } catch {
      /* Chrome-only path; MediaRecorder stays the fallback */
    }
  }
  return startMediaRecorderCapture(key, stream, opts)
}

export function stopLaneCapture(capture: LaneCapture) {
  capture.stop()
}

export function stopStreams(streams: Iterable<MediaStream | null | undefined>) {
  for (const stream of streams) {
    stream?.getTracks().forEach((t) => t.stop())
  }
}
