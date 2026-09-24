/** Sample-accurate punch capture via AudioWorklet. Falls back to MediaRecorder in capture.ts. */

import { encodeWav } from '@/lib/podcast/audio'
import type { CaptureWatchdog, CheckpointSink } from '@/lib/podcast/capture'

const WORKLET_URL = '/podcast/punch-capture-worklet.js'

/** Flush the in-RAM PCM tail to the checkpoint store this often (ms). */
const CHECKPOINT_MS = 4000

export async function startWorkletCapture(
  key: string,
  stream: MediaStream,
  opts?: { checkpoint?: CheckpointSink; watchdog?: CaptureWatchdog },
): Promise<{
  key: string
  recorder: null
  kind: 'worklet'
  stop: () => void
  done: Promise<Blob>
} | null> {
  if (typeof AudioWorkletNode === 'undefined' || !('audioWorklet' in AudioContext.prototype)) {
    return null
  }
  const audioTracks = stream.getAudioTracks()
  if (!audioTracks.length) return null

  const ctx = new AudioContext()
  try {
    await ctx.audioWorklet.addModule(WORKLET_URL)
  } catch {
    await ctx.close().catch(() => {})
    return null
  }

  const source = ctx.createMediaStreamSource(new MediaStream(audioTracks))
  const node = new AudioWorkletNode(ctx, 'punch-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  })
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute)
  mute.connect(ctx.destination)
  await ctx.resume()

  const checkpoint = opts?.checkpoint
  const watchdog = opts?.watchdog

  // Recovery decoding depends on knowing this lane is worklet PCM at ctx rate.
  if (checkpoint) {
    void checkpoint.describe({ kind: 'worklet', mime: 'audio/wav', sampleRate: ctx.sampleRate })
  }

  // When there's no checkpoint sink we must keep the whole take in RAM to
  // finalize; with a sink, rotated parts are dropped and finalize reads them
  // back from IndexedDB, so RAM stays bounded on long takes.
  const retained: ArrayBuffer[] = []
  // Tail still in RAM, not yet checkpointed.
  let pending: Float32Array[] = []
  let pendingSamples = 0

  node.port.onmessage = (event) => {
    if (event.data instanceof Float32Array && event.data.length) {
      pending.push(event.data)
      pendingSamples += event.data.length
      watchdog?.tick(event.data.length)
    }
  }

  /** Drain the RAM tail into one contiguous PCM buffer and hand it to the sink. */
  const rotate = async () => {
    if (pendingSamples === 0) return
    const merged = new Float32Array(pendingSamples)
    let offset = 0
    for (const part of pending) {
      merged.set(part, offset)
      offset += part.length
    }
    pending = []
    pendingSamples = 0
    if (checkpoint) {
      try {
        await checkpoint.append([merged.buffer])
        // Persisted — release from RAM. finalize() reads it back from the store.
      } catch (err) {
        // Put it back so we retry next tick / on stop rather than lose audio.
        pending.unshift(merged)
        pendingSamples += merged.length
        checkpoint.onError?.(err)
      }
    } else {
      retained.push(merged.buffer)
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  if (checkpoint) {
    timer = setInterval(() => {
      void rotate()
    }, CHECKPOINT_MS)
  }

  let finished = false
  let resolveBlob: (blob: Blob) => void = () => {}
  const done = new Promise<Blob>((resolve) => {
    resolveBlob = resolve
  })

  const wavFromRetained = () => {
    const total = retained.reduce((sum, b) => sum + b.byteLength, 0) / 4
    const merged = new Float32Array(Math.max(1, total))
    let offset = 0
    for (const b of retained) {
      const floats = new Float32Array(b)
      merged.set(floats, offset)
      offset += floats.length
    }
    const buffer = ctx.createBuffer(1, merged.length, ctx.sampleRate)
    buffer.copyToChannel(merged, 0)
    return encodeWav(buffer)
  }

  const stop = () => {
    if (finished) return
    finished = true
    if (timer) clearInterval(timer)
    void (async () => {
      // Fold the last tail in before tearing down.
      await rotate()
      try {
        source.disconnect()
        node.disconnect()
        mute.disconnect()
      } catch {
        /* already torn down */
      }
      let blob: Blob | null = null
      if (checkpoint) {
        try {
          blob = await checkpoint.finalize()
        } catch {
          blob = null
        }
      }
      if (!blob) blob = wavFromRetained()
      void ctx.close().catch(() => {})
      resolveBlob(blob)
    })()
  }

  return { key, recorder: null, kind: 'worklet', stop, done }
}
