/** Dual (or more) local audio inputs for the production room. */

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
 * Mic constraints. `raw` keeps its old meaning when a boolean is passed (true = raw,
 * false = browser processing). Omit it (or pass a CaptureProcessing) to use the new
 * default: 'raw'.
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
  /** Latency / clock info for punch alignment — pass the capture to record-session punchTrimSec. */
  timing?: () => CaptureTiming
  /** Worklet only: float result after `done` (skip the WAV decode). */
  buffer?: () => AudioBuffer | null
}

export type LaneCaptureOptions = {
  /** Shared session AudioContext (cue + all mics). Not closed on stop. */
  context?: AudioContext
  /** Crash-safe journal. Worklet path appends PCM; MediaRecorder path appends encoded chunks. */
  journal?: TakeJournal
  finishJournalOnStop?: boolean
  /** Force the MediaRecorder path. */
  forceMediaRecorder?: boolean
  /** MediaRecorder timeslice (ms). Default 1000 (journal chunk ≈ 1 s). */
  timesliceMs?: number
}

function startMediaRecorderCapture(key: string, stream: MediaStream, opts: LaneCaptureOptions = {}): LaneCapture {
  const audioOnly = new MediaStream(stream.getAudioTracks())
  const mime = recorderMime()
  const recorder = mime ? new MediaRecorder(audioOnly, { mimeType: mime }) : new MediaRecorder(audioOnly)
  const chunks: Blob[] = []
  const journal = opts.journal
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return
      chunks.push(event.data)
      try {
        journal?.appendBlob?.(event.data)
      } catch {
        /* journal must never break capture */
      }
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
      const settle = journal
        ? (opts.finishJournalOnStop ? journal.finish() : journal.flush?.() ?? Promise.resolve()).catch(() => {})
        : Promise.resolve()
      void settle.then(() => resolve(blob))
    }
    recorder.onerror = () => reject(new Error('Recorder failed'))
  })
  recorder.start(opts.timesliceMs ?? (journal ? 1000 : 250))
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

export async function startLaneCapture(key: string, stream: MediaStream, opts: LaneCaptureOptions = {}): Promise<LaneCapture> {
  if (!opts.forceMediaRecorder) {
    try {
      const { startWorkletCapture } = await import('@/lib/podcast/worklet-capture')
      const worklet = await startWorkletCapture(key, stream, {
        context: opts.context,
        journal: opts.journal,
        finishJournalOnStop: opts.finishJournalOnStop,
      })
      if (worklet) return worklet
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
