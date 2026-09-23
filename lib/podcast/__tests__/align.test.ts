import { describe, expect, it } from 'vitest'
import { alignToReference, bestLag, envelope } from '@/lib/podcast/engine/align'

/** Deterministic "speech": noise bursts of random length separated by gaps, at `rate` Hz. */
function speechLike(seconds: number, rate: number, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32)
  // Build the on/off pattern on a rate-independent grid (ms) so two rates carry the same content.
  const ms = Math.ceil(seconds * 1000)
  const gate = new Float32Array(ms)
  for (let t = 0; t < ms; ) {
    const on = 80 + Math.floor(rnd() * 400)
    const off = 40 + Math.floor(rnd() * 300)
    const level = 0.2 + rnd() * 0.6
    for (let k = 0; k < on && t + k < ms; k++) gate[t + k] = level
    t += on + off
  }
  const out = new Float32Array(Math.floor(seconds * rate))
  for (let i = 0; i < out.length; i++) out[i] = gate[Math.min(ms - 1, Math.floor((i / rate) * 1000))] * (rnd() * 2 - 1)
  return out
}

describe('engine/align', () => {
  it('envelope keeps 44.1 kHz and 48 kHz on the same 1 kHz grid', () => {
    expect(envelope(new Float32Array(44100), 44100).length).toBe(1000)
    expect(envelope(new Float32Array(48000), 48000).length).toBe(1000)
  })

  it('bestLag finds a known shift', () => {
    const a = envelope(speechLike(6, 8000), 8000)
    const shifted = new Float32Array(a.length)
    shifted.set(a.subarray(0, a.length - 37), 37) // content 37 samples later
    const { lag, score } = bestLag(a, shifted, 100)
    expect(lag).toBe(37)
    expect(score).toBeGreaterThan(0.9)
  })

  it('pulls a backup placed 120 ms late back onto the live lane (different rates)', () => {
    const live = { data: speechLike(20, 48000), sampleRate: 48000, startSec: 10 }
    // Same voice, recorded at 44.1 kHz from session 10 s, but the clock mapping put it at 10.12 s.
    const backup = { data: speechLike(20, 44100), sampleRate: 44100, startSec: 10.12 }
    const r = alignToReference(live, backup)
    expect(r).not.toBeNull()
    expect(r!.shiftSec).toBeCloseTo(-0.12, 2)
    expect(r!.score).toBeGreaterThan(0.5)
  })

  it('pushes an early placement later', () => {
    const live = { data: speechLike(15, 48000), sampleRate: 48000, startSec: 4 }
    const backup = { data: speechLike(15, 48000), sampleRate: 48000, startSec: 3.93 }
    expect(alignToReference(live, backup)!.shiftSec).toBeCloseTo(0.07, 2)
  })

  it('returns null without enough overlap or without a real match', () => {
    const live = { data: speechLike(10, 48000), sampleRate: 48000, startSec: 0 }
    expect(alignToReference(live, { data: speechLike(10, 48000), sampleRate: 48000, startSec: 9 })).toBeNull()
    const other = { data: speechLike(10, 48000, 999), sampleRate: 48000, startSec: 0 }
    expect(alignToReference(live, other, { minScore: 0.5 })).toBeNull()
    const silence = { data: new Float32Array(48000 * 10), sampleRate: 48000, startSec: 0 }
    expect(alignToReference(live, silence)).toBeNull()
  })
})
