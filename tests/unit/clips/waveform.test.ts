import { describe, expect, it } from 'vitest'
import { barLevels, computePeaks, overviewPeaks, peakAt, windowLevels } from '@/lib/podcast/clips/waveform'

function tone(seconds: number, rate = 1000, amp: (t: number) => number = () => 1) {
  const out = new Float32Array(seconds * rate)
  for (let i = 0; i < out.length; i++) out[i] = amp(i / rate) * Math.sin((2 * Math.PI * 50 * i) / rate)
  return out
}

describe('computePeaks', () => {
  it('buckets the range and normalises to the loudest bucket', () => {
    const rate = 1000
    const data = tone(3, rate, (t) => (t >= 1 && t < 2 ? 1 : 0.25))
    const peaks = computePeaks([data], rate, 0, 3, 10)
    expect(peaks.values).toHaveLength(30)
    expect(peaks.duration).toBe(3)
    expect(Math.max(...peaks.values)).toBeCloseTo(1, 5)
    expect(peaks.values[5]).toBeLessThan(0.35)
    expect(peaks.values[15]).toBeGreaterThan(0.9)
  })
  it('respects the start offset and empty input', () => {
    const rate = 1000
    const data = tone(3, rate, (t) => (t >= 2 ? 1 : 0))
    const peaks = computePeaks([data], rate, 2, 3, 10)
    expect(peaks.values.every((v) => v > 0.5)).toBe(true)
    const empty = computePeaks([], rate, 0, 1, 10)
    expect(Array.from(empty.values)).toEqual(new Array(10).fill(0))
  })
})

describe('sampling helpers', () => {
  const peaks = { values: new Float32Array([0, 1, 0, 1]), perSec: 1, duration: 4 }
  it('peakAt interpolates and clamps', () => {
    expect(peakAt(peaks, 0.5)).toBeCloseTo(0.5, 5)
    expect(peakAt(peaks, -5)).toBe(0)
    expect(peakAt(peaks, 50)).toBe(1)
  })
  it('windowLevels is zero outside the clip so the wave scrolls in and out', () => {
    const levels = windowLevels(peaks, 0, 5, 2)
    expect(levels[0]).toBe(0)
    expect(levels[4]).toBeCloseTo(peakAt(peaks, 1), 5)
    expect(windowLevels(peaks, 10, 3, 1).every((v) => v === 0)).toBe(true)
  })
  it('barLevels is mirrored, bounded and deterministic', () => {
    const a = barLevels(peaks, 1, 9)
    const b = barLevels(peaks, 1, 9)
    expect(Array.from(a)).toEqual(Array.from(b))
    for (let i = 0; i < 4; i++) expect(a[i]).toBeCloseTo(a[8 - i], 5)
    expect(a.every((v) => v >= 0 && v <= 1)).toBe(true)
    expect(a[4]).toBeGreaterThanOrEqual(a[0])
  })
  it('overviewPeaks keeps the max per column', () => {
    const over = overviewPeaks({ values: new Float32Array([0.1, 0.9, 0.2, 0.3, 0.8, 0.1]), perSec: 1, duration: 6 }, 3)
    expect(Array.from(over)).toEqual([0.9, 0.3, 0.8].map((v) => Math.fround(v)))
  })
})
