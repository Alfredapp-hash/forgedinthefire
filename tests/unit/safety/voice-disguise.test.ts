import { beforeAll, describe, expect, it } from 'vitest'
import { DISGUISE_PRESETS, DISGUISE_WARNING, disguiseMono, disguiseRange } from '@/lib/podcast/safety/voice-disguise'
import { FakeAudioBuffer, installAudioBuffer } from '../../helpers/audio-buffer'

const sr = 16000
const sine = (hz: number, seconds: number) => Float32Array.from({ length: Math.round(seconds * sr) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sr))

function zeroCrossRate(x: Float32Array) {
  let zc = 0
  for (let i = 1; i < x.length; i++) if ((x[i] >= 0) !== (x[i - 1] >= 0)) zc++
  return (zc / 2) * (sr / x.length)
}

beforeAll(installAudioBuffer)

describe('voice disguise', () => {
  it('keeps the exact length', async () => {
    for (const len of [1, 1000, 12345, sr * 2 + 7]) {
      const x = Float32Array.from({ length: len }, (_, i) => Math.sin(i / 7) * 0.3)
      expect((await disguiseMono(x, sr, DISGUISE_PRESETS.lower.settings)).length).toBe(len)
    }
  })

  it('moves pitch by the requested semitones', async () => {
    const x = sine(400, 1.5)
    const down = await disguiseMono(x, sr, { pitch: -12, formant: 1 })
    const mid = down.subarray(sr * 0.25, sr * 1.25)
    expect(zeroCrossRate(mid)).toBeGreaterThan(170)
    expect(zeroCrossRate(mid)).toBeLessThan(230)
    const up = await disguiseMono(x, sr, { pitch: 7, formant: 1 })
    expect(zeroCrossRate(up.subarray(sr * 0.25, sr * 1.25))).toBeGreaterThan(560)
  })

  it('produces finite, non-silent output within [-1, 1] for every preset', async () => {
    const x = sine(220, 1)
    for (const preset of Object.values(DISGUISE_PRESETS)) {
      const y = await disguiseMono(x, sr, preset.settings)
      let peak = 0
      for (const v of y) {
        expect(Number.isFinite(v)).toBe(true)
        peak = Math.max(peak, Math.abs(v))
      }
      expect(peak).toBeGreaterThan(0.05)
      expect(peak).toBeLessThanOrEqual(1)
    }
  })

  it('presets shift pitch and formants independently, and the disclaimer is honest', () => {
    expect(DISGUISE_PRESETS.lower.settings.pitch).toBeLessThan(0)
    expect(DISGUISE_PRESETS.lower.settings.formant).toBeLessThan(1)
    expect(DISGUISE_PRESETS.masked.settings.pitch).toBeLessThan(0)
    expect(DISGUISE_PRESETS.masked.settings.formant).toBeGreaterThan(1)
    expect(DISGUISE_WARNING).toMatch(/reversed/i)
  })

  it('only changes the chosen range of a buffer', async () => {
    const b = new FakeAudioBuffer({ length: sr * 2, sampleRate: sr }) as unknown as AudioBuffer
    const x = sine(300, 2)
    b.copyToChannel(x, 0)
    await disguiseRange(b, 1, 1.5, DISGUISE_PRESETS.lower.settings)
    const y = b.getChannelData(0)
    expect(y.subarray(0, sr * 0.9)).toEqual(x.subarray(0, sr * 0.9))
    expect(y.subarray(sr * 1.6)).toEqual(x.subarray(sr * 1.6))
    let diff = 0
    for (let i = sr * 1.1; i < sr * 1.4; i++) diff += Math.abs(y[i] - x[i])
    expect(diff).toBeGreaterThan(1)
  })
})
