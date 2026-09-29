import { describe, expect, it } from 'vitest'
import {
  clipAtTime,
  cropToRange,
  deleteRange,
  joinAdjacentClips,
  muteRange,
  pasteClip,
  splitRange,
  splitTrackAt,
  trimClip,
} from '@/lib/podcast/edit'
import { clipsOf } from '@/lib/podcast/multitrack'
import { clip, round, take } from '../helpers/tracks'

const spans = (t: ReturnType<typeof take>) =>
  clipsOf(t).map((c) => [round(c.offset), round(c.duration), round(c.sourceStart)])

describe('splitTrackAt', () => {
  it('splits one clip into two contiguous pieces on the same lane', () => {
    const t = take({ seconds: 10, offset: 2 })
    const out = splitTrackAt(t, 5)
    expect(spans(out)).toEqual([
      [2, 3, 0],
      [5, 7, 3],
    ])
    expect(new Set(clipsOf(out).map((c) => c.id)).size).toBe(2)
  })

  it('ignores a split at (or within 40 ms of) either edge', () => {
    const t = take({ seconds: 10 })
    expect(clipsOf(splitTrackAt(t, 0)).length).toBe(1)
    expect(clipsOf(splitTrackAt(t, 0.02)).length).toBe(1)
    expect(clipsOf(splitTrackAt(t, 9.99)).length).toBe(1)
    expect(clipsOf(splitTrackAt(t, 12)).length).toBe(1)
  })

  it('does not mutate the input track', () => {
    const t = take({ seconds: 10 })
    const before = JSON.stringify(t.clips)
    splitTrackAt(t, 4)
    expect(JSON.stringify(t.clips)).toBe(before)
  })

  it('split pieces keep the source syncGroup', () => {
    const t = take({ seconds: 10, clips: [clip({ offset: 0, duration: 10, syncGroup: 'g1' })] })
    expect(clipsOf(splitTrackAt(t, 4)).map((c) => c.syncGroup)).toEqual(['g1', 'g1'])
  })
})

describe('trimClip', () => {
  it('trims the in-point forward and advances sourceStart', () => {
    const t = take({ seconds: 10 })
    const id = t.clips[0].id
    const out = trimClip(t, id, 'in', 3)
    expect(spans(out)).toEqual([[3, 7, 3]])
  })

  it('trims the out-point and clamps to the source length', () => {
    const t = take({ seconds: 10 })
    const id = t.clips[0].id
    expect(spans(trimClip(t, id, 'out', 6))).toEqual([[0, 6, 0]])
    expect(spans(trimClip(trimClip(t, id, 'out', 6), id, 'out', 50))).toEqual([[0, 10, 0]])
  })

  it('never trims a clip shorter than 40 ms', () => {
    const t = take({ seconds: 10 })
    const id = t.clips[0].id
    const [[, dur]] = spans(trimClip(t, id, 'out', -5))
    expect(dur).toBeCloseTo(0.04, 3)
  })

  // An NLE in-point can be dragged back out to reveal trimmed source (clamped to source 0).
  it('in-point can be dragged back left to reveal trimmed-off source', () => {
    const t = take({ seconds: 10 })
    const id = t.clips[0].id
    const trimmed = trimClip(t, id, 'in', 4) // offset 4, sourceStart 4
    const restored = trimClip(trimmed, id, 'in', 1)
    expect(spans(restored)).toEqual([[1, 9, 1]])
    // …but never before the start of the source.
    expect(spans(trimClip(trimmed, id, 'in', -3))).toEqual([[0, 10, 0]])
  })
})

describe('deleteRange', () => {
  it('cuts a hole and leaves a gap (no ripple)', () => {
    const t = take({ seconds: 10 })
    expect(spans(deleteRange(t, 3, 5))).toEqual([
      [0, 3, 0],
      [5, 5, 5],
    ])
  })

  it('ripple-deletes: later audio slides left by the gap', () => {
    const t = take({ seconds: 10 })
    expect(spans(deleteRange(t, 3, 5, true))).toEqual([
      [0, 3, 0],
      [3, 5, 5],
    ])
  })

  it('ripple also pulls later, separate clips on the same lane', () => {
    const t = take({
      seconds: 20,
      clips: [clip({ offset: 0, duration: 4 }), clip({ offset: 10, duration: 4, sourceStart: 10 })],
    })
    expect(spans(deleteRange(t, 1, 3, true))).toEqual([
      [0, 1, 0],
      [1, 1, 3],
      [8, 4, 10],
    ])
  })

  it('reversed range is normalized; tiny range is a no-op', () => {
    const t = take({ seconds: 10 })
    expect(spans(deleteRange(t, 5, 3))).toEqual(spans(deleteRange(t, 3, 5)))
    expect(deleteRange(t, 3, 3.01)).toBe(t)
  })

  // withClips(track, []) marks the lane noClips so clipsOf() does not read the bare [] as
  // "one clip covering the whole buffer" (which resurrected the deleted take).
  it('deleting a range that covers the whole (only) clip leaves the lane empty', () => {
    const t = take({ seconds: 10 })
    expect(clipsOf(deleteRange(t, 0, 10)).length).toBe(0)
  })

  it('same for a range wider than the clip, with ripple', () => {
    const t = take({ seconds: 10, offset: 2, clips: [clip({ offset: 2, duration: 10 })] })
    expect(clipsOf(deleteRange(t, 0, 20, true)).length).toBe(0)
  })

  it('an emptied lane comes back when a clip is pasted onto it', () => {
    const t = take({ seconds: 10 })
    const src = clipsOf(t)[0]
    const empty = deleteRange(t, 0, 10)
    expect(empty.noClips).toBe(true)
    const pasted = pasteClip(empty, src, 3)
    expect(pasted.noClips).toBe(false)
    expect(spans(pasted)).toEqual([[3, 10, 0]])
  })

  it('deleting one of two clips works (control for the bug above)', () => {
    const t = take({
      seconds: 20,
      clips: [clip({ offset: 0, duration: 4 }), clip({ offset: 10, duration: 4, sourceStart: 10 })],
    })
    expect(spans(deleteRange(t, 9, 15))).toEqual([[0, 4, 0]])
  })
})

describe('range helpers', () => {
  it('splitRange makes three pieces', () => {
    expect(spans(splitRange(take({ seconds: 10 }), 2, 6))).toEqual([
      [0, 2, 0],
      [2, 4, 2],
      [6, 4, 6],
    ])
  })

  it('cropToRange keeps only the selection', () => {
    expect(spans(cropToRange(take({ seconds: 10 }), 2, 6))).toEqual([[2, 4, 2]])
  })

  it('muteRange mutes only the inside piece', () => {
    const out = muteRange(take({ seconds: 10 }), 2, 6)
    expect(clipsOf(out).map((c) => c.muted)).toEqual([false, true, false])
  })

  it('joinAdjacentClips re-joins a split', () => {
    const t = splitTrackAt(take({ seconds: 10 }), 4)
    expect(spans(joinAdjacentClips(t, 4))).toEqual([[0, 10, 0]])
  })

  it('clipAtTime is half-open [offset, end)', () => {
    const t = take({ seconds: 10, offset: 2 })
    expect(clipAtTime(t, 2)).not.toBeNull()
    expect(clipAtTime(t, 11.99)).not.toBeNull()
    expect(clipAtTime(t, 12)).toBeNull()
    expect(clipAtTime(t, 1.9)).toBeNull()
  })
})
