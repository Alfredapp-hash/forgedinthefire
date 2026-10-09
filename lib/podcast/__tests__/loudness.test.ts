import { describe, expect, it } from 'vitest'
import { applyTruePeakLimiter, integratedLoudness, truePeak, truePeakDb } from '@/lib/studio/loudness'
import { measureLoudness } from '@/lib/podcast/lufs'
import { processMaster } from '@/lib/podcast/engine/master-core'
import { installAudioBuffer, sine } from './shim'

installAudioBuffer()

function noise(amp: number, seconds: number, seed = 1, sr = 48000) {
  let x = seed
  const n = Math.round(seconds * sr)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out[i] = (((x >>> 0) / 4294967296) * 2 - 1) * amp
  }
  return out
}

describe('BS.1770 gating and channel summing', () => {
  it('stereo 1 kHz sine at −23 dBFS reads −23 LUFS (EBU Tech 3341 case 1)', () => {
    const amp = 10 ** (-23 / 20)
    const l = sine(1000, amp, 20, 48000)
    expect(integratedLoudness({ sampleRate: 48000, channels: [l, l.slice()] }).lufs).toBeCloseTo(-23, 1)
  })

  it('channel energies are summed: mono is 3 dB below the same signal on two channels', () => {
    const m = sine(1000, 0.1, 10, 48000)
    const mono = integratedLoudness({ sampleRate: 48000, channels: [m] }).lufs
    const stereo = integratedLoudness({ sampleRate: 48000, channels: [m, m.slice()] }).lufs
    expect(stereo - mono).toBeCloseTo(3.01, 1)
  })

  it('relative gate ignores long quiet sections (EBU 3341 case 3-style)', () => {
    const loud = sine(1000, 10 ** (-20 / 20), 10, 48000)
    const quiet = sine(1000, 10 ** (-40 / 20), 10, 48000)
    const both = new Float32Array(loud.length + quiet.length)
    both.set(loud)
    both.set(quiet, loud.length)
    expect(integratedLoudness({ sampleRate: 48000, channels: [both, both.slice()] }).lufs).toBeCloseTo(-20, 0)
  })

  it('silence is −Infinity', () => {
    expect(integratedLoudness({ sampleRate: 48000, channels: [new Float32Array(96000)] }).lufs).toBe(-Infinity)
  })
})

describe('true-peak limiter (stress)', () => {
  it('never exceeds the ceiling after +12 dB of gain on noise', () => {
    const x = noise(0.5, 3)
    const y = noise(0.5, 3, 7)
    applyTruePeakLimiter({ sampleRate: 48000, channels: [x, y] }, { ceilingDb: -1, gainDb: 12 })
    expect(truePeakDb([x, y])).toBeLessThanOrEqual(-1 + 0.05)
  })

  it('leaves quiet material untouched', () => {
    const x = sine(440, 0.1, 1, 48000)
    const copy = x.slice()
    applyTruePeakLimiter({ sampleRate: 48000, channels: [x] }, { ceilingDb: -1, gainDb: 0 })
    let diff = 0
    for (let i = 0; i < x.length; i++) diff = Math.max(diff, Math.abs(x[i] - copy[i]))
    expect(diff).toBeLessThan(1e-7)
  })

  it('catches inter-sample overs a sample-peak limiter would miss', () => {
    const x = sine(12000, 0.99, 1, 48000, Math.PI / 4)
    applyTruePeakLimiter({ sampleRate: 48000, channels: [x] }, { ceilingDb: -1, gainDb: 0 })
    expect(truePeakDb([x])).toBeLessThanOrEqual(-1 + 0.05)
  })

  it('processMaster hits −16 LUFS stereo within 0.5 LU on noise with transients, under −1 dBTP', () => {
    const l = noise(0.05, 12, 3)
    const r = noise(0.05, 12, 9)
    for (let k = 1; k < 10; k++) l[k * 48000] = 0.95
    const rep = processMaster([l, r], 48000, { matchLufs: true, ceilingDb: -1 })
    expect(Math.abs(rep.lufs - -16)).toBeLessThan(0.5)
    expect(rep.truePeakDb).toBeLessThanOrEqual(-1 + 0.05)
  })
})

describe('BS.1770 loudness', () => {
  it('997 Hz sine at −20 dBFS, mono → ≈ −23.0 LUFS', () => {
    const x = sine(997, 0.1, 10, 48000)
    const r = integratedLoudness({ sampleRate: 48000, channels: [x] })
    expect(r.lufs).toBeCloseTo(-23.0, 1)
  })

  it('same signal on both channels → ≈ −20.0 LUFS', () => {
    const x = sine(997, 0.1, 10, 48000)
    const r = integratedLoudness({ sampleRate: 48000, channels: [x, x.slice()] })
    expect(r.lufs).toBeCloseTo(-20.0, 1)
  })

  it('is sample-rate correct at 44.1 kHz', () => {
    const x = sine(997, 0.1, 10, 44100)
    const r = integratedLoudness({ sampleRate: 44100, channels: [x] })
    expect(r.lufs).toBeCloseTo(-23.0, 1)
  })

  it('lib/podcast/lufs adapter agrees with lib/studio/loudness', () => {
    const buf = new AudioBuffer({ length: 480000, numberOfChannels: 2, sampleRate: 48000 })
    buf.copyToChannel(sine(997, 0.1, 10, 48000), 0)
    buf.copyToChannel(sine(997, 0.1, 10, 48000), 1)
    const r = measureLoudness(buf)
    expect(r.lufs).toBeCloseTo(-20.0, 1)
    expect(r.peakDb).toBeCloseTo(-20, 1)
  })
})

describe('true peak', () => {
  it('detects inter-sample peaks of an fs/4 sine sampled at 45°', () => {
    // Samples land at ±0.707 of the waveform: sample peak −3 dB, true peak 0 dB.
    const x = sine(12000, 1, 1, 48000, Math.PI / 4)
    let samplePeak = 0
    for (const v of x) samplePeak = Math.max(samplePeak, Math.abs(v))
    expect(20 * Math.log10(samplePeak)).toBeCloseTo(-3.01, 1)
    expect(truePeakDb([x])).toBeGreaterThan(-0.6)
    expect(truePeakDb([x])).toBeLessThan(0.3)
  })

  it('true peak of a low-frequency sine ≈ sample peak', () => {
    const x = sine(1000, 0.5, 0.5, 48000)
    expect(truePeak([x])).toBeCloseTo(0.5, 2)
  })

  it('limiter holds −1 dBTP with a smooth curve and no hard clipping', () => {
    const sr = 48000
    const x = sine(11000, 0.9, 1, sr, 0.3)
    // add a loud burst in the middle
    for (let i = 20000; i < 22000; i++) x[i] *= 2.5
    const chans = [x]
    applyTruePeakLimiter({ sampleRate: sr, channels: chans }, { gainDb: 3, ceilingDb: -1 })
    expect(truePeakDb(chans)).toBeLessThanOrEqual(-0.9)
    // no sample sits exactly on a clip value
    let atCeil = 0
    for (const v of x) if (Math.abs(v) === 1) atCeil++
    expect(atCeil).toBe(0)
  })
})
