/**
 * One AudioContext per recording session: cue playback and every mic capture share it,
 * so their frame clocks are directly comparable (sample-accurate punch alignment).
 */

import { SESSION_SAMPLE_RATE } from './resample'

export const PUNCH_WORKLET_URL = '/podcast/punch-capture-worklet.js'

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>()

/** addModule once per context (repeat calls share the same promise). */
export function ensureWorkletModule(ctx: BaseAudioContext, url = PUNCH_WORKLET_URL): Promise<void> {
  let byUrl = loaded.get(ctx)
  if (!byUrl) {
    byUrl = new Map()
    loaded.set(ctx, byUrl)
  }
  let p = byUrl.get(url)
  if (!p) {
    p = ctx.audioWorklet.addModule(url).catch((err) => {
      byUrl!.delete(url)
      throw err
    })
    byUrl.set(url, p)
  }
  return p
}

/** Shared session context at 48 kHz with interactive latency (falls back to the device rate). */
export function createSessionContext(opts: { sampleRate?: number; latencyHint?: AudioContextLatencyCategory | number } = {}): AudioContext {
  const latencyHint = opts.latencyHint ?? 'interactive'
  try {
    return new AudioContext({ sampleRate: opts.sampleRate ?? SESSION_SAMPLE_RATE, latencyHint })
  } catch {
    return new AudioContext({ latencyHint })
  }
}

export function supportsWorklet() {
  return typeof AudioWorkletNode !== 'undefined' && typeof AudioContext !== 'undefined' && 'audioWorklet' in AudioContext.prototype
}
