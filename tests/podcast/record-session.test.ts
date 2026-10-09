import { describe, expect, it } from 'vitest'
import { punchAlignSec, punchInTime, punchTrimSec, sharedPunchInTime, REC_MODE_META, type CueHandle } from '@/lib/podcast/record-session'
import type { LaneCapture } from '@/lib/podcast/capture'
import { defaultSessionTracks } from '@/lib/podcast/multitrack'
import { clip, take } from '../helpers/tracks'

// Host talks 0–10 s, guest 10–25 s, host pickup 25–30 s is not there yet.
function session() {
  return [
    take({ seconds: 10, offset: 0 }),
    take({ seconds: 15, offset: 10, personId: 'guest', role: 'guest', clips: [clip({ offset: 10, duration: 15 })] }),
  ]
}

describe('punchInTime', () => {
  it('lists every mode in REC_MODE_META', () => {
    expect(REC_MODE_META.map((m) => m.id).sort()).toEqual(['after_mine', 'after_mix', 'at_playhead', 'from_start'])
  })

  it('after_mix → end of the whole session', () => {
    expect(punchInTime('after_mix', 3, session(), 'host')).toBe(25)
  })

  it('after_mine → end of this person’s last take', () => {
    expect(punchInTime('after_mine', 3, session(), 'host')).toBe(10)
    expect(punchInTime('after_mine', 3, session(), 'guest')).toBe(25)
  })

  it('after_mine with no audio yet falls back to end of the mix', () => {
    const tracks = [...session(), ...defaultSessionTracks().filter((t) => t.personId === 'sfx')]
    expect(punchInTime('after_mine', 3, tracks, 'sfx')).toBe(25)
  })

  it('at_playhead / from_start', () => {
    expect(punchInTime('at_playhead', 7.5, session(), 'host')).toBe(7.5)
    expect(punchInTime('at_playhead', -2, session(), 'host')).toBe(0)
    expect(punchInTime('from_start', 7.5, session(), 'host')).toBe(0)
  })

  it('empty session punches at 0 in every mode', () => {
    const empty = defaultSessionTracks()
    for (const m of REC_MODE_META) expect(punchInTime(m.id, 0, empty, 'host')).toBe(0)
  })

  it('after_mix respects trimmed clips, not the raw buffer length', () => {
    const t = take({ seconds: 30, clips: [clip({ offset: 0, duration: 12 })] })
    expect(punchInTime('after_mix', 0, [t], 'host')).toBe(12)
  })
})

describe('punchAlignSec (latency compensation)', () => {
  const ctx = { outputLatency: 0.02, baseLatency: 0.005 } as unknown as AudioContext
  const capture = (startFrame: number | null, context: AudioContext | null = ctx) =>
    ({
      key: 'host',
      recorder: null,
      kind: 'worklet',
      stop: () => {},
      done: Promise.resolve(new Blob()),
      timing: () => ({ sampleRate: 48000, startFrame, outputLatency: 0.02, baseLatency: 0.005, inputLatency: 0.01, context }),
    }) as unknown as LaneCapture
  const cue = (startFrame: number) => ({ ctx, startFrame, fromSec: 10 }) as unknown as CueHandle

  it('trims preroll + (cue − capture) frame delta + round-trip device latency on one clock', () => {
    // capture began 480 frames (10 ms) before the cue; 35 ms of reported latency
    const a = punchAlignSec({ prerollSec: 2, capture: capture(96000 - 480), cue: cue(96000) })
    expect(a).toBeCloseTo(2 + 0.01 + 0.035, 6)
    expect(punchTrimSec({ prerollSec: 2, capture: capture(96000 - 480), cue: cue(96000) })).toBeCloseTo(a, 6)
  })

  it('a capture that began after the punch point reports a negative alignment (lay it later, do not clamp)', () => {
    // capture started 3 s after the cue; preroll was 2 s → the take really begins 1 s − latency after the punch
    const a = punchAlignSec({ prerollSec: 2, capture: capture(96000 + 3 * 48000), cue: cue(96000) })
    expect(a).toBeCloseTo(2 - 3 + 0.035, 6)
    expect(a).toBeLessThan(0)
    expect(punchTrimSec({ prerollSec: 2, capture: capture(96000 + 3 * 48000), cue: cue(96000) })).toBe(0)
  })

  it('different clocks: only the preroll and latency count; a remote guest skips device latency', () => {
    const other = {} as AudioContext
    expect(punchAlignSec({ prerollSec: 1.5, capture: capture(999, other), cue: cue(96000) })).toBeCloseTo(1.5 + 0.035, 6)
    expect(punchAlignSec({ prerollSec: 1.5, capture: capture(999, other), cue: cue(96000), compensateLatency: false })).toBeCloseTo(1.5, 6)
  })

  it('a measured loop-back round trip replaces the reported latency sum', () => {
    expect(punchAlignSec({ prerollSec: 0, capture: capture(96000), cue: cue(96000), roundTripSec: 0.012 })).toBeCloseTo(0.012, 6)
  })

  it('MediaRecorder captures (no timing) fall back to the preroll', () => {
    const mr = { key: 'g', recorder: null, kind: 'media-recorder', stop: () => {}, done: Promise.resolve(new Blob()) } as unknown as LaneCapture
    expect(punchAlignSec({ prerollSec: 2.5, capture: mr, cue: cue(0) })).toBe(2.5)
  })
})

describe('sharedPunchInTime', () => {
  it('one person delegates to punchInTime', () => {
    expect(sharedPunchInTime('after_mine', 0, session(), ['host'])).toBe(10)
  })

  it('two people land together; after_mine uses the end of the mix', () => {
    expect(sharedPunchInTime('after_mine', 0, session(), ['host', 'guest'])).toBe(25)
    expect(sharedPunchInTime('after_mix', 0, session(), ['host', 'guest'])).toBe(25)
    expect(sharedPunchInTime('at_playhead', 4, session(), ['host', 'guest'])).toBe(4)
    expect(sharedPunchInTime('from_start', 4, session(), ['host', 'guest'])).toBe(0)
  })
})
