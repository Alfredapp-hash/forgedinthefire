/**
 * Loop-back latency calibration: plays a few clicks through `ctx.destination` and records
 * them on `stream` (mic near the speaker / interface loop-back). Returns the median
 * round-trip latency in seconds, or null when the clicks were not heard. Use the result as
 * `roundTripSec` in record-session punchAlignSec.
 *
 * Uses the punch-capture worklet in batched mode (processorOptions → {type:'start'|'data'}
 * messages), so it never depends on the lane-capture module.
 */

import { ensureWorkletModule, PUNCH_WORKLET_URL, supportsWorklet } from './context'
import { findClickOnset, median } from './latency'

export async function measureRoundTripLatency(
  ctx: AudioContext,
  stream: MediaStream,
  opts: { clicks?: number; spacingSec?: number; level?: number } = {},
): Promise<number | null> {
  if (!supportsWorklet() || !stream.getAudioTracks().length) return null
  const sr = ctx.sampleRate
  await ensureWorkletModule(ctx, PUNCH_WORKLET_URL)
  const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
  const node = new AudioWorkletNode(ctx, 'punch-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { batchFrames: 1024, channels: 1 },
  })
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute)
  mute.connect(ctx.destination)

  const parts: { frame: number; data: Float32Array }[] = []
  let startFrame: number | null = null
  let flushWaiters: (() => void)[] = []
  node.port.onmessage = (event: MessageEvent) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'start') startFrame = msg.frame
    else if (msg.type === 'data' && Array.isArray(msg.channels)) parts.push({ frame: msg.frame, data: msg.channels[0] })
    else if (msg.type === 'flushed') {
      const w = flushWaiters
      flushWaiters = []
      w.forEach((fn) => fn())
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
    await flush()
    if (startFrame == null || !parts.length) return null
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
    try {
      source.disconnect()
      node.disconnect()
      mute.disconnect()
      node.port.onmessage = null
    } catch {
      /* already torn down */
    }
  }
}
