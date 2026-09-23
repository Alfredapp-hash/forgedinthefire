/**
 * Sample-accurate punch capture via AudioWorklet. Falls back to MediaRecorder in capture.ts.
 *
 * - Frames arrive in ~4096-frame batches with transferred buffers (not 128-frame clones).
 * - `options.context` shares ONE AudioContext with cue playback and every other mic, so
 *   the capture's start frame is directly comparable with the cue's start frame.
 * - `options.journal` receives every batch as it arrives (crash-safe take journal).
 */

import { encodeWav } from '@/lib/podcast/audio'
import { ensureWorkletModule, PUNCH_WORKLET_URL, supportsWorklet } from '@/lib/podcast/engine/context'
import { findClickOnset, median, type CaptureTiming } from '@/lib/podcast/engine/latency'
import type { TakeJournal } from '@/lib/podcast/take-journal'

export type WorkletCaptureOptions = {
  /** Shared session AudioContext. When given it is NOT closed on stop. */
  context?: AudioContext
  /** Crash-safe journal; batches are appended as they arrive. */
  journal?: TakeJournal
  /** Mark the journal complete when the capture stops (default false: the caller finishes/deletes it once the take is saved). */
  finishJournalOnStop?: boolean
  /** 1 (default) or 2 channels. */
  channels?: 1 | 2
  /** Frames per worklet message (default 4096). */
  batchFrames?: number
  /** Called for every batch (e.g. live meters or custom sinks). */
  onFrames?: (frames: Float32Array[], frame: number) => void
}

export type WorkletCapture = {
  key: string
  recorder: null
  kind: 'worklet'
  stop: () => void
  done: Promise<Blob>
  /** The context this capture runs on (shared or private). */
  context: AudioContext
  sampleRate: number
  /** Resolves with the AudioContext frame of the first captured sample. */
  startFrame: Promise<number>
  /** Latency / clock info for punch alignment (see record-session punchTrimSec). */
  timing: () => CaptureTiming
  /** Raw float result (available after `done`), avoiding a WAV decode round-trip. */
  buffer: () => AudioBuffer | null
}

type Node = {
  node: AudioWorkletNode
  source: MediaStreamAudioSourceNode
  mute: GainNode
  startFrame: Promise<number>
  startFrameValue: () => number | null
  flush: () => Promise<void>
  disconnect: () => void
}

function trackLatency(stream: MediaStream): number {
  const track = stream.getAudioTracks()[0]
  const settings = (track?.getSettings?.() || {}) as MediaTrackSettings & { latency?: number }
  return typeof settings.latency === 'number' && Number.isFinite(settings.latency) ? settings.latency : 0
}

async function attachCaptureNode(
  ctx: AudioContext,
  stream: MediaStream,
  opts: { channels: number; batchFrames: number; onData: (frames: Float32Array[], frame: number) => void },
): Promise<Node> {
  await ensureWorkletModule(ctx, PUNCH_WORKLET_URL)
  const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
  const node = new AudioWorkletNode(ctx, 'punch-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: opts.channels,
    channelCountMode: 'explicit',
    processorOptions: { batchFrames: opts.batchFrames, channels: opts.channels },
  })
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute)
  mute.connect(ctx.destination)

  let startValue: number | null = null
  let resolveStart: (n: number) => void = () => {}
  const startFrame = new Promise<number>((resolve) => {
    resolveStart = resolve
  })
  let flushWaiters: (() => void)[] = []
  node.port.onmessage = (event: MessageEvent) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'start') {
      startValue = msg.frame
      resolveStart(msg.frame)
    } else if (msg.type === 'data' && Array.isArray(msg.channels)) {
      opts.onData(msg.channels as Float32Array[], msg.frame as number)
    } else if (msg.type === 'flushed') {
      const waiters = flushWaiters
      flushWaiters = []
      waiters.forEach((w) => w())
    }
  }
  const flush = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 400)
      flushWaiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
      try {
        node.port.postMessage({ type: 'flush' })
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })
  const disconnect = () => {
    try {
      source.disconnect()
      node.disconnect()
      mute.disconnect()
      node.port.onmessage = null
    } catch {
      /* already torn down */
    }
  }
  return { node, source, mute, startFrame, startFrameValue: () => startValue, flush, disconnect }
}

export async function startWorkletCapture(
  key: string,
  stream: MediaStream,
  options: WorkletCaptureOptions = {},
): Promise<WorkletCapture | null> {
  if (!supportsWorklet()) return null
  const audioTracks = stream.getAudioTracks()
  if (!audioTracks.length) return null

  const shared = options.context && options.context.state !== 'closed' ? options.context : null
  const ctx = shared || new AudioContext()
  const channels = options.channels === 2 ? 2 : 1
  const chunks: Float32Array[][] = []
  let attached: Node
  try {
    attached = await attachCaptureNode(ctx, stream, {
      channels,
      batchFrames: options.batchFrames ?? 4096,
      onData: (frames, frame) => {
        chunks.push(frames)
        try {
          options.journal?.append(frames)
        } catch {
          /* journal must never break capture */
        }
        options.onFrames?.(frames, frame)
      },
    })
  } catch {
    if (!shared) await ctx.close().catch(() => {})
    return null
  }
  if (ctx.state !== 'running') await ctx.resume().catch(() => {})

  const inputLatency = trackLatency(stream)
  let result: AudioBuffer | null = null
  let finished = false
  let resolveBlob: (blob: Blob) => void = () => {}
  const done = new Promise<Blob>((resolve) => {
    resolveBlob = resolve
  })

  const finalize = async () => {
    await attached.flush()
    attached.disconnect()
    const length = chunks.reduce((sum, part) => sum + part[0].length, 0)
    const buffer = new AudioBuffer({ length: Math.max(1, length), numberOfChannels: channels, sampleRate: ctx.sampleRate })
    for (let c = 0; c < channels; c++) {
      const dst = buffer.getChannelData(c)
      let offset = 0
      for (const part of chunks) {
        dst.set(part[Math.min(c, part.length - 1)], offset)
        offset += part[0].length
      }
    }
    chunks.length = 0
    result = buffer
    if (options.journal) {
      try {
        if (options.finishJournalOnStop) await options.journal.finish()
        else await options.journal.flush?.()
      } catch {
        /* journal errors are reported via its onError */
      }
    }
    if (!shared) void ctx.close().catch(() => {})
    // 16-bit WAV with TPDF dither (float capture is not on the 16-bit grid).
    resolveBlob(encodeWav(buffer, { dither: true }))
  }

  const stop = () => {
    if (finished) return
    finished = true
    void finalize()
  }

  return {
    key,
    recorder: null,
    kind: 'worklet',
    stop,
    done,
    context: ctx,
    sampleRate: ctx.sampleRate,
    startFrame: attached.startFrame,
    buffer: () => result,
    timing: () => ({
      sampleRate: ctx.sampleRate,
      startFrame: attached.startFrameValue(),
      outputLatency: typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0,
      baseLatency: typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0,
      inputLatency,
      context: ctx,
    }),
  }
}

/**
 * Loop-back calibration: plays three clicks through `ctx.destination` and records them
 * on `stream` (mic near the speaker / interface loop-back). Returns the median round-trip
 * latency in seconds, or null when the clicks were not heard. Use the result as
 * `roundTripSec` in punchTrimSec.
 */
export async function measureRoundTripLatency(
  ctx: AudioContext,
  stream: MediaStream,
  opts: { clicks?: number; spacingSec?: number; level?: number } = {},
): Promise<number | null> {
  if (!supportsWorklet() || !stream.getAudioTracks().length) return null
  const sr = ctx.sampleRate
  const parts: { frame: number; data: Float32Array }[] = []
  const node = await attachCaptureNode(ctx, stream, {
    channels: 1,
    batchFrames: 1024,
    onData: (frames, frame) => parts.push({ frame, data: frames[0] }),
  })
  try {
    if (ctx.state !== 'running') await ctx.resume()
    const clicks = Math.max(1, opts.clicks ?? 3)
    const spacing = opts.spacingSec ?? 0.35
    const click = ctx.createBuffer(1, Math.round(sr * 0.002), sr)
    const cd = click.getChannelData(0)
    for (let i = 0; i < cd.length; i++) cd[i] = (opts.level ?? 0.8) * (1 - i / cd.length) * (i % 2 ? -1 : 1)
    const t0 = ctx.currentTime + 0.4
    const clickFrames: number[] = []
    for (let k = 0; k < clicks; k++) {
      const src = ctx.createBufferSource()
      src.buffer = click
      src.connect(ctx.destination)
      const when = t0 + k * spacing
      src.start(when)
      clickFrames.push(Math.round(when * sr))
    }
    const endTime = t0 + clicks * spacing + 0.3
    await new Promise<void>((resolve) => {
      const tick = () => (ctx.currentTime >= endTime || ctx.state === 'closed' ? resolve() : setTimeout(tick, 30))
      tick()
    })
    await node.flush()
    const first = node.startFrameValue()
    if (first == null || !parts.length) return null
    const base = parts[0].frame
    const total = parts.reduce((n, p) => n + p.data.length, 0)
    const all = new Float32Array(total)
    let o = 0
    for (const p of parts) {
      all.set(p.data, o)
      o += p.data.length
    }
    const results: number[] = []
    for (const cf of clickFrames) {
      const from = cf - base
      const to = Math.min(all.length, from + Math.round(spacing * sr * 0.9))
      const onset = findClickOnset(all, from, to)
      if (onset >= 0) results.push((onset - from) / sr)
    }
    const rt = median(results)
    return rt != null && rt >= 0 && rt < 1 ? rt : null
  } finally {
    node.disconnect()
  }
}
