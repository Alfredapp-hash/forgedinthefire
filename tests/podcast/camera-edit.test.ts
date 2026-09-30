import { describe, expect, it } from 'vitest'
import {
  deleteCameraRange,
  dissolveCameraPair,
  joinAdjacentCamera,
  slipCameraClip,
  splitAllCameraAt,
  splitCameraAt,
  trimCameraClip,
} from '@/lib/podcast/camera-edit'
import type { CameraClip } from '@/lib/podcast/camera'
import { cam, round } from '../helpers/tracks'

const spans = (clips: CameraClip[], personId?: string) =>
  clips.filter((c) => !personId || c.personId === personId).map((c) => [round(c.offset), round(c.duration), round(c.sourceStart)])

describe('splitCameraAt', () => {
  it('splits a clip and keeps sourceStart/trimStart aligned', () => {
    const out = splitCameraAt([cam({ offset: 1, duration: 10 })], 4)
    expect(spans(out)).toEqual([
      [1, 3, 0],
      [4, 7, 3],
    ])
    expect(out[1].trimStart).toBe(out[1].sourceStart)
  })

  it('only splits the requested person', () => {
    const clips = [cam({ offset: 0, duration: 10, personId: 'host' }), cam({ offset: 0, duration: 10, personId: 'guest' })]
    const out = splitCameraAt(clips, 5, 'guest')
    expect(spans(out, 'host').length).toBe(1)
    expect(spans(out, 'guest').length).toBe(2)
  })

  it('edge split is a no-op', () => {
    const clips = [cam({ offset: 0, duration: 10 })]
    expect(splitCameraAt(clips, 0.01)).toBe(clips)
  })
})

describe('trim / slip', () => {
  it('trims in and out within the file', () => {
    const c = cam({ offset: 0, duration: 10, sourceDuration: 10 })
    expect(spans(trimCameraClip([c], c.id, 'in', 2))).toEqual([[2, 8, 2]])
    expect(spans(trimCameraClip([c], c.id, 'out', 20))).toEqual([[0, 10, 0]])
  })

  it('a trimmed in-point drags back left, clamped to the start of the file', () => {
    const c = cam({ offset: 0, duration: 10, sourceDuration: 10 })
    const trimmed = trimCameraClip([c], c.id, 'in', 4)
    expect(spans(trimCameraClip(trimmed, c.id, 'in', 1))).toEqual([[1, 9, 1]])
    expect(spans(trimCameraClip(trimmed, c.id, 'in', -5))).toEqual([[0, 10, 0]])
  })

  it('slip moves media under a fixed seat, bounded by the file', () => {
    const c = cam({ offset: 5, duration: 4, sourceStart: 2, trimStart: 2, sourceDuration: 10 })
    expect(spans(slipCameraClip([c], c.id, 3))).toEqual([[5, 4, 5]])
    expect(spans(slipCameraClip([c], c.id, 100))).toEqual([[5, 4, 6]])
    expect(spans(slipCameraClip([c], c.id, -100))).toEqual([[5, 4, 0]])
  })
})

describe('deleteCameraRange (ripple cuts)', () => {
  it('cut hole leaves a gap', () => {
    expect(spans(deleteCameraRange([cam({ offset: 0, duration: 10 })], 2, 4))).toEqual([
      [0, 2, 0],
      [4, 6, 4],
    ])
  })

  it('ripple pulls later clips of that person only', () => {
    const clips = [
      cam({ offset: 0, duration: 10, personId: 'host' }),
      cam({ offset: 0, duration: 10, personId: 'guest' }),
    ]
    const out = deleteCameraRange(clips, 2, 4, 'host', true)
    expect(spans(out, 'host')).toEqual([
      [0, 2, 0],
      [2, 6, 4],
    ])
    expect(spans(out, 'guest')).toEqual([[0, 10, 0]])
  })

  it('split then join restores the clip', () => {
    const out = joinAdjacentCamera(splitCameraAt([cam({ offset: 0, duration: 10 })], 3), 3)
    expect(spans(out)).toEqual([[0, 10, 0]])
  })
})

describe('dissolve', () => {
  it('dissolve overlaps the next clip and sets matching fades', () => {
    const a = cam({ offset: 0, duration: 6 })
    const b = cam({ offset: 6, duration: 6, sourceStart: 6, trimStart: 6, sourceDuration: 12 })
    const out = dissolveCameraPair([a, b], a.id, 1)
    const na = out.find((c) => c.id === a.id)!
    const nb = out.find((c) => c.id === b.id)!
    expect(na.fadeOut).toBe(1)
    expect(nb.fadeIn).toBe(1)
    expect(nb.offset).toBe(5)
  })
})

describe('splitAllCameraAt', () => {
  it('razors every lane (and overlay layer) spanning the time, not just the first hit', () => {
    const clips = [
      cam({ offset: 0, duration: 10, personId: 'host' }),
      cam({ offset: 0, duration: 10, personId: 'guest' }),
      cam({ offset: 2, duration: 4, personId: 'host', layer: 'overlay' }),
    ]
    const out = splitAllCameraAt(clips, 5)
    expect(spans(out, 'host').sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual([
      [0, 5, 0],
      [2, 3, 0],
      [5, 1, 3],
      [5, 5, 5],
    ])
    expect(spans(out, 'guest')).toEqual([
      [0, 5, 0],
      [5, 5, 5],
    ])
  })

  it('returns the same array when nothing spans the time', () => {
    const clips = [cam({ offset: 0, duration: 10 })]
    expect(splitAllCameraAt(clips, 20)).toBe(clips)
  })
})
