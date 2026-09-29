import { describe, expect, it } from 'vitest'
import { applyGainWithLimiter, integratedLoudness, targetLufs } from '@/lib/studio/loudness'
import { sine } from '../helpers/audio-buffer'

// BS.1770 reference: a 997 Hz sine at −20 dBFS (peak) in one channel reads ≈ −23 LUFS (it is −23.0
// by definition for 1 kHz at 0 dBFS RMS-equivalent -3 dB crest). Summed stereo reads 3 dB higher.
describe('integratedLoudness (BS.1770-4)', () => {
  for (const sampleRate of [48000, 44100]) {
    it(`997 Hz @ −20 dBFS mono ≈ −23 LUFS at ${sampleRate} Hz`, () => {
      const x = sine(997, -20, 5, sampleRate)
      const r = integratedLoudness({ sampleRate, channels: [x] })
      expect(r.lufs).toBeGreaterThan(-23.5)
      expect(r.lufs).toBeLessThan(-22.5)
      expect(r.peakDb).toBeCloseTo(-20, 1)
      expect(r.channels).toBe(1)
    })

    it(`997 Hz @ −20 dBFS in both channels ≈ −20 LUFS at ${sampleRate} Hz`, () => {
      const x = sine(997, -20, 5, sampleRate)
      const r = integratedLoudness({ sampleRate, channels: [x, x.slice()] })
      expect(r.lufs).toBeGreaterThan(-20.5)
      expect(r.lufs).toBeLessThan(-19.5)
    })
  }

  it('silence is −Infinity (absolute gate)', () => {
    const r = integratedLoudness({ sampleRate: 48000, channels: [new Float32Array(48000 * 2)] })
    expect(r.lufs).toBe(-Infinity)
    expect(r.peakDb).toBe(-Infinity)
  })

  it('relative gate ignores a long quiet tail', () => {
    const sr = 48000
    const loud = sine(997, -20, 4, sr)
    const quiet = sine(997, -60, 20, sr)
    const both = new Float32Array(loud.length + quiet.length)
    both.set(loud)
    both.set(quiet, loud.length)
    const r = integratedLoudness({ sampleRate: sr, channels: [both] })
    expect(r.lufs).toBeGreaterThan(-23.6)
  })

  it('short clips (< 400 ms) still measure', () => {
    const r = integratedLoudness({ sampleRate: 48000, channels: [sine(997, -20, 0.2)] })
    expect(Number.isFinite(r.lufs)).toBe(true)
  })

  it('only the first two channels count', () => {
    const x = sine(997, -20, 3)
    const a = integratedLoudness({ sampleRate: 48000, channels: [x, x.slice()] }).lufs
    const b = integratedLoudness({ sampleRate: 48000, channels: [x, x.slice(), x.slice()] }).lufs
    expect(b).toBeCloseTo(a, 5)
  })
})

describe('applyGainWithLimiter', () => {
  it('raises loudness by the gain and never exceeds the ceiling', () => {
    const sr = 48000
    const x = sine(997, -20, 3, sr)
    const before = integratedLoudness({ sampleRate: sr, channels: [x] }).lufs
    applyGainWithLimiter({ sampleRate: sr, channels: [x] }, 4)
    const after = integratedLoudness({ sampleRate: sr, channels: [x] })
    expect(after.lufs - before).toBeCloseTo(4, 1)
    expect(after.peakDb).toBeLessThanOrEqual(-1.5 + 1e-6)
  })

  it('clamps hot material to the ceiling', () => {
    const sr = 48000
    const x = sine(997, -3, 1, sr)
    applyGainWithLimiter({ sampleRate: sr, channels: [x] }, 12, -1)
    const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-1 + 1e-6)
  })

  it('targets: −16 stereo, −19 mono', () => {
    expect(targetLufs(2)).toBe(-16)
    expect(targetLufs(1)).toBe(-19)
  })
})
