/** Sample-accurate punch capture via AudioWorklet. Falls back to MediaRecorder in capture.ts. */

import { encodeWav } from '@/lib/podcast/audio'

const WORKLET_URL = '/podcast/punch-capture-worklet.js'

export async function startWorkletCapture(
  key: string,
  stream: MediaStream,
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

  const chunks: Float32Array[] = []
  node.port.onmessage = (event) => {
    if (event.data instanceof Float32Array && event.data.length) {
      chunks.push(event.data)
    }
  }

  let finished = false
  let resolveBlob: (blob: Blob) => void = () => {}
  const done = new Promise<Blob>((resolve) => {
    resolveBlob = resolve
  })

  const stop = () => {
    if (finished) return
    finished = true
    try {
      source.disconnect()
      node.disconnect()
      mute.disconnect()
    } catch {
      /* already torn down */
    }
    const length = chunks.reduce((sum, part) => sum + part.length, 0)
    const merged = new Float32Array(Math.max(1, length))
    let offset = 0
    for (const part of chunks) {
      merged.set(part, offset)
      offset += part.length
    }
    const buffer = ctx.createBuffer(1, merged.length, ctx.sampleRate)
    buffer.copyToChannel(merged, 0)
    void ctx.close().catch(() => {})
    resolveBlob(encodeWav(buffer))
  }

  return { key, recorder: null, kind: 'worklet', stop, done }
}
