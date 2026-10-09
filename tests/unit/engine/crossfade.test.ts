import { describe, expect, it } from 'vitest'
import { clipsJoinSeamlessly, equalPowerIn, equalPowerOut, markClipEdges, renderMixPlan } from '@/lib/podcast/engine/mix-core'
import { createEmptyTrack, mixdownTracks } from '@/lib/podcast/multitrack'
import { installAudioBuffer } from '../../../lib/podcast/__tests__/shim'

installAudioBuffer()

const SR = 48000

function buf(seconds: number, fill: (i: number) => number, rate = SR) {
  const b = new AudioBuffer({
    length: Math.round(rate * seconds),
    numberOfChannels: 1,
    sampleRate: rate,
  })
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = fill(i)
  return b
}

describe('equal-power crossfade curves', () => {
  it('in² + out² = 1 across the whole fade', () => {
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const a = equalPowerIn(u)
      const b = equalPowerOut(u)
      expect(a * a + b * b).toBeCloseTo(1, 6)
    }
  })

  it('is 0 → 1 (in) and 1 → 0 (out) with −3 dB at the midpoint', () => {
    expect(equalPowerIn(0)).toBe(0)
    expect(equalPowerIn(1)).toBe(1)
    expect(equalPowerOut(0)).toBe(1)
    expect(equalPowerOut(1)).toBe(0)
    expect(20 * Math.log10(equalPowerIn(0.5))).toBeCloseTo(-3.01, 1)
  })

  it('marks seamless split joins as hard edges and everything else as crossfaded', () => {
    const a = { sourceStart: 0, duration: 1, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0 }
    const b = { sourceStart: 1, duration: 1, offset: 1, gain: 1, fadeIn: 0, fadeOut: 0 }
    const c = { sourceStart: 5, duration: 1, offset: 2, gain: 1, fadeIn: 0, fadeOut: 0 }
    expect(clipsJoinSeamlessly(a, b)).toBe(true)
    expect(clipsJoinSeamlessly(b, c)).toBe(false)
    const marked = markClipEdges([a, b, c])
    expect(marked.map((m) => [m.edgeIn, m.edgeOut])).toEqual([
      [true, false],
      [false, true],
      [true, true],
    ])
  })
})

describe('mixdown clip-edge crossfades', () => {
  it('a plain split stays seamless (no +3 dB bump at the join)', () => {
    const src = buf(2, () => 0.5)
    const clipA = {
      id: 'a',
      sourceStart: 0,
      duration: 1,
      offset: 0,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const clipB = {
      id: 'b',
      sourceStart: 1,
      duration: 1,
      offset: 1,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const track = createEmptyTrack({
      name: 'v',
      role: 'bed',
      personId: 'beds',
      buffer: src,
      clips: [clipA, clipB],
    })
    const L = mixdownTracks([track]).getChannelData(0)
    for (let i = 47000; i < 49000; i++) expect(L[i]).toBeCloseTo(0.5, 5)
  })

  it('a cut between different source regions is an equal-power crossfade, not a hard cut', () => {
    // source: first second = +0.5, second second = −0.5; keep 0–0.5 s and 1.5–2 s butted together
    const src = buf(2, (i) => (i < SR ? 0.5 : -0.5))
    const clipA = {
      id: 'a',
      sourceStart: 0,
      duration: 0.5,
      offset: 0,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const clipB = {
      id: 'b',
      sourceStart: 1.5,
      duration: 0.5,
      offset: 0.5,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const track = createEmptyTrack({
      name: 'v',
      role: 'bed',
      personId: 'beds',
      buffer: src,
      clips: [clipA, clipB],
    })
    const L = mixdownTracks([track], { crossfadeSec: 0.01 }).getChannelData(0)
    const j = SR / 2
    // hard cut would jump 0.5 → −0.5 in one sample; with a 10 ms crossfade the max step is small
    let maxStep = 0
    for (let i = j - 480; i < j + 480; i++) maxStep = Math.max(maxStep, Math.abs(L[i + 1] - L[i]))
    expect(maxStep).toBeLessThan(0.01)
    expect(L[j - 480]).toBeCloseTo(0.5, 3)
    expect(L[j + 480]).toBeCloseTo(-0.5, 3)
  })

  it('a cut between two uncorrelated regions keeps constant power through the join', () => {
    let seed = 7
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296 - 0.5
    }
    const src = buf(4, () => rnd())
    const clipA = {
      id: 'a',
      sourceStart: 0,
      duration: 1,
      offset: 0,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const clipB = {
      id: 'b',
      sourceStart: 3,
      duration: 1,
      offset: 1,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }
    const track = createEmptyTrack({
      name: 'v',
      role: 'bed',
      personId: 'beds',
      buffer: src,
      clips: [clipA, clipB],
    })
    const L = mixdownTracks([track], { crossfadeSec: 0.02 }).getChannelData(0)
    const power = (from: number, to: number) => {
      let s = 0
      for (let i = from; i < to; i++) s += L[i] * L[i]
      return s / (to - from)
    }
    const steady = power(10000, 40000)
    const across = power(SR - 480, SR + 480)
    expect(across / steady).toBeGreaterThan(0.8)
    expect(across / steady).toBeLessThan(1.2)
  })

  it('a user fade-in replaces the edge crossfade (silence before the clip)', () => {
    const src = buf(1, () => 0.5)
    const { left } = renderMixPlan({
      sampleRate: SR,
      startSec: 0,
      endSec: 1,
      xfadeSec: 0.02,
      tracks: [
        {
          channels: [src.getChannelData(0)],
          sourceRate: SR,
          pan: 0,
          volume: 1,
          automation: [],
          clips: [
            {
              sourceStart: 0.5,
              duration: 0.25,
              offset: 0.5,
              gain: 1,
              fadeIn: 0.1,
              fadeOut: 0,
              edgeIn: true,
              edgeOut: true,
            },
          ],
          windows: null,
        },
      ],
    })
    expect(left[SR * 0.5 - 100]).toBe(0)
    expect(left[SR * 0.5]).toBe(0)
    expect(left[Math.round(SR * 0.55)]).toBeCloseTo(0.25, 3)
    // the tail still gets its equal-power handle past the clip end
    expect(left[Math.round(SR * 0.75) + 200]).toBeGreaterThan(0)
    expect(left[Math.round(SR * 0.75) + 200]).toBeLessThan(0.5)
  })
})
