import { beforeAll, describe, expect, it } from 'vitest'
import {
  BLEEP_GAIN,
  BLEEP_PAD_S,
  CUT_XFADE_S,
  applyBleeps,
  applyCuts,
  bleepRanges,
  findRoomTone,
  makeTimeMap,
  mergeRanges,
  remapChapters,
  remapWords,
  renderPlan,
} from '@/lib/podcast/safety/render'
import { FakeAudioBuffer, installAudioBuffer } from '../../helpers/audio-buffer'
import { words } from './helpers'

const sr = 8000

function speech(seconds = 2, channels = 1): AudioBuffer {
  const b = new FakeAudioBuffer({ length: sr * seconds, sampleRate: sr, numberOfChannels: channels })
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(i / 3)
  }
  return b as unknown as AudioBuffer
}

const peak = (x: Float32Array) => {
  let m = 0
  for (const v of x) m = Math.max(m, Math.abs(v))
  return m
}

beforeAll(installAudioBuffer)

describe('bleep ranges', () => {
  it('pads each hit by ±80 ms by default and clamps to the file', () => {
    expect(BLEEP_PAD_S).toBe(0.08)
    const r = bleepRanges([{ start: 1, end: 1.5 }], BLEEP_PAD_S, 10)
    expect(r).toHaveLength(1)
    expect(r[0].start).toBeCloseTo(0.92, 6)
    expect(r[0].end).toBeCloseTo(1.58, 6)
    const edge = bleepRanges([{ start: 0.02, end: 0.3 }, { start: 9.9, end: 10 }], BLEEP_PAD_S, 10)
    expect(edge[0].start).toBe(0)
    expect(edge[1].end).toBe(10)
  })

  it('merges hits whose padding overlaps', () => {
    const r = bleepRanges([{ start: 1, end: 1.2 }, { start: 1.3, end: 1.5 }, { start: 3, end: 3.2 }], BLEEP_PAD_S, 10)
    expect(r).toHaveLength(2)
    expect(r[0].start).toBeCloseTo(0.92)
    expect(r[0].end).toBeCloseTo(1.58)
  })

  it('mergeRanges sorts, merges and drops empties', () => {
    expect(mergeRanges([{ start: 2, end: 3 }, { start: 0, end: 1 }, { start: 0.5, end: 1.5 }, { start: 4, end: 4 }])).toEqual([
      { start: 0, end: 1.5 },
      { start: 2, end: 3 },
    ])
  })
})

describe('applyBleeps', () => {
  it('silence removes the original inside the padded region (apart from ramps outside it)', () => {
    const b = speech()
    applyBleeps(b, [{ start: 0.5, end: 1 }], 'silence', BLEEP_PAD_S)
    const d = b.getChannelData(0)
    expect(peak(d.subarray(Math.round(0.42 * sr), Math.round(1.08 * sr)))).toBe(0)
    expect(d[100]).not.toBe(0)
    expect(d.length).toBe(sr * 2)
  })

  it('tone replaces speech with a 1 kHz tone at −20 dBFS', () => {
    const b = speech()
    applyBleeps(b, [{ start: 0.5, end: 1 }], 'tone', BLEEP_PAD_S)
    const inner = b.getChannelData(0).subarray(Math.round(0.51 * sr), Math.round(0.99 * sr))
    expect(peak(inner)).toBeCloseTo(BLEEP_GAIN, 2)
    // 1 kHz at 8 kHz: 8 samples per period → a zero crossing every 4 samples.
    let zc = 0
    for (let i = 1; i < inner.length; i++) if (Math.sign(inner[i]) !== Math.sign(inner[i - 1])) zc++
    expect(zc / inner.length).toBeCloseTo(0.25, 1)
  })

  it('room tone fills with the quietest background, never the speech', () => {
    const b = speech()
    const d = b.getChannelData(0)
    for (let i = Math.round(1.5 * sr); i < 2 * sr; i++) d[i] = 0.001 * Math.sin(i * 1.7)
    const room = findRoomTone(b, 0.25)
    expect(room).not.toBeNull()
    expect(peak(room![0])).toBeLessThan(0.01)
    applyBleeps(b, [{ start: 0.2, end: 0.8 }], 'roomtone', BLEEP_PAD_S)
    const inner = d.subarray(Math.round(0.25 * sr), Math.round(0.75 * sr))
    expect(peak(inner)).toBeLessThan(0.01)
    expect(peak(inner)).toBeGreaterThan(0)
  })

  it('room tone falls back to silence on a fully silent file', () => {
    const b = new FakeAudioBuffer({ length: sr, sampleRate: sr }) as unknown as AudioBuffer
    expect(findRoomTone(b)).toBeNull()
    applyBleeps(b, [{ start: 0.2, end: 0.4 }], 'roomtone')
    expect(peak(b.getChannelData(0))).toBe(0)
  })
})

describe('applyCuts', () => {
  it('uses 10 ms crossfades and shortens by the cut plus one crossfade per join', () => {
    expect(CUT_XFADE_S).toBe(0.01)
    const b = speech(3)
    const out = applyCuts(b, [{ start: 0.5, end: 1 }, { start: 2, end: 2.25 }])
    const X = Math.round(CUT_XFADE_S * sr)
    expect(out.length).toBe(b.length - Math.round(0.5 * sr) - Math.round(0.25 * sr) - 2 * X)
  })

  it('crossfades the join (no hard jump) and leaves audio away from joins untouched', () => {
    const b = new FakeAudioBuffer({ length: sr, sampleRate: sr }) as unknown as AudioBuffer
    const d = b.getChannelData(0)
    d.fill(0.5)
    for (let i = sr / 2; i < sr; i++) d[i] = -0.5
    const out = applyCuts(b, [{ start: 0.4, end: 0.6 }]).getChannelData(0)
    const join = Math.round(0.4 * sr)
    let maxStep = 0
    for (let i = join - 100; i < join + 100; i++) maxStep = Math.max(maxStep, Math.abs(out[i + 1] - out[i]))
    expect(maxStep).toBeLessThan(0.05)
    expect(out[10]).toBe(0.5)
    expect(out[out.length - 10]).toBe(-0.5)
  })

  it('no cuts → same buffer; all channels cut alike', () => {
    const b = speech(1, 2)
    expect(applyCuts(b, [])).toBe(b)
    const out = applyCuts(b, [{ start: 0.2, end: 0.3 }])
    expect(out.numberOfChannels).toBe(2)
    expect(out.getChannelData(1)).toEqual(out.getChannelData(0))
  })
})

describe('time remapping', () => {
  it('maps times through cuts and drops removed words', () => {
    const tm = makeTimeMap([{ start: 1, end: 2 }, { start: 5, end: 6 }], 10, 0)
    expect(tm.map(0.5)).toBe(0.5)
    expect(tm.map(1.5)).toBe(1)
    expect(tm.map(3)).toBe(2)
    expect(tm.map(7)).toBe(5)
    expect(tm.removes(1.2, 1.8)).toBe(true)
    expect(tm.removes(0.8, 1.2)).toBe(false) // half inside is kept
  })

  it('remaps words and chapters onto the new timeline', () => {
    const ws = words('hello um world')
    const next = remapWords(ws, [{ start: 0.4, end: 0.8 }], 2)
    expect(next.map((w) => w.w)).toEqual(['hello', 'world'])
    expect(next[1].s).toBeCloseTo(0.4 - CUT_XFADE_S, 2)
    const ch = remapChapters([{ title: 'a', start_ms: 0 }, { title: 'b', start_ms: 1500 }], [{ start: 0.5, end: 1 }], 2)
    expect(ch[1].start_ms).toBe(1000 - Math.round(CUT_XFADE_S * 1000))
  })
})

describe('renderPlan', () => {
  it('never mutates the source and applies bleeps then cuts', async () => {
    const src = speech(2)
    const before = src.getChannelData(0).slice()
    const out = await renderPlan(src, { bleeps: [{ start: 0.5, end: 0.7 }], bleepMode: 'silence', bleepPad: 0.08, disguise: [], cuts: [{ start: 1.5, end: 1.7 }] })
    expect(src.getChannelData(0)).toEqual(before)
    expect(out.length).toBeLessThan(src.length)
    expect(peak(out.getChannelData(0).subarray(Math.round(0.5 * sr), Math.round(0.7 * sr)))).toBe(0)
  })
})
