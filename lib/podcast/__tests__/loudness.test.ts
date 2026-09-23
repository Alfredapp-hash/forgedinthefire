import { describe, expect, it } from 'vitest'
import { applyTruePeakLimiter, integratedLoudness, truePeak, truePeakDb } from '@/lib/studio/loudness'
import { measureLoudness } from '@/lib/podcast/lufs'
import { installAudioBuffer, sine } from './shim'

installAudioBuffer()

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
