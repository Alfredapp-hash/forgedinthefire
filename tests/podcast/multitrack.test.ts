import { beforeAll, describe, expect, it } from 'vitest'
import {
  assignCompRange,
  clearCompRanges,
  cloneAudioBuffer,
  defaultSessionTracks,
  emptyTakeForPerson,
  ensurePersonLanes,
  DEFAULT_PEOPLE,
  nextTakeNumber,
  takeAudibleAt,
  withListenTake,
  type StudioTrack,
} from '@/lib/podcast/multitrack'
import { installAudioBuffer, silentBuffer } from '../helpers/audio-buffer'
import { take } from '../helpers/tracks'

beforeAll(installAudioBuffer)

function threeTakes(): StudioTrack[] {
  const a = take({ seconds: 10, take: 1, listen: true })
  const b = take({ seconds: 10, take: 2, listen: false })
  const c = take({ seconds: 10, take: 3, listen: false })
  return [a, b, c]
}

describe('default session', () => {
  it('3 voice slots for Host/Guest, 1 for beds/sfx; Host take 1 armed', () => {
    const tracks = defaultSessionTracks()
    expect(tracks.filter((t) => t.personId === 'host').length).toBe(3)
    expect(tracks.filter((t) => t.personId === 'guest').length).toBe(3)
    expect(tracks.filter((t) => t.personId === 'beds').length).toBe(1)
    expect(tracks.filter((t) => t.armed).map((t) => [t.personId, t.take])).toEqual([['host', 1]])
  })

  it('ensurePersonLanes pads after a restore and nextTakeNumber continues', () => {
    const restored = [take({ seconds: 3, take: 5 })]
    const padded = ensurePersonLanes(restored, DEFAULT_PEOPLE)
    expect(padded.filter((t) => t.personId === 'host').map((t) => t.take)).toEqual([5, 6, 7])
    expect(nextTakeNumber(padded, 'host')).toBe(8)
    expect(emptyTakeForPerson(padded, 'host')?.take).toBe(6)
  })
})

describe('withListenTake', () => {
  it('makes one take audible and the others not (layered ones stay)', () => {
    const [a, b, c] = threeTakes()
    c.layered = true
    const out = withListenTake([a, b, c], b.id)
    expect(out.map((t) => t.listen)).toEqual([false, true, false])
    expect(takeAudibleAt(out, out[1], 5)).toBe(true)
    expect(takeAudibleAt(out, out[0], 5)).toBe(false)
    expect(takeAudibleAt(out, out[2], 5)).toBe(true) // layered
  })

  it('unmutes the chosen take', () => {
    const [a, b] = threeTakes()
    b.muted = true
    expect(withListenTake([a, b], b.id)[1].muted).toBe(false)
  })

  it('does not touch other people', () => {
    const [a] = threeTakes()
    const g = take({ seconds: 10, personId: 'guest', role: 'guest', listen: true })
    const out = withListenTake([a, g], a.id)
    expect(out[1].listen).toBe(true)
  })
})

describe('assignCompRange + takeAudibleAt', () => {
  it('comp range wins inside, listen take wins outside', () => {
    const tracks = assignCompRange(threeTakes(), threeTakes()[0].id, 0, 0) // no-op (too short)
    expect(tracks.every((t) => t.compRanges.length === 0)).toBe(true)

    const base = threeTakes()
    const comped = assignCompRange(base, base[1].id, 2, 4)
    expect(comped[1].compRanges).toEqual([{ start: 2, end: 4 }])
    expect(takeAudibleAt(comped, comped[1], 3)).toBe(true)
    expect(takeAudibleAt(comped, comped[0], 3)).toBe(false)
    expect(takeAudibleAt(comped, comped[0], 5)).toBe(true)
    expect(takeAudibleAt(comped, comped[1], 5)).toBe(false)
    expect(takeAudibleAt(comped, comped[1], 4)).toBe(false) // end is exclusive
  })

  it('a later comp carves out the earlier one and adjacent ranges merge', () => {
    const base = threeTakes()
    let t = assignCompRange(base, base[1].id, 0, 10)
    t = assignCompRange(t, base[2].id, 4, 6)
    expect(t[1].compRanges).toEqual([
      { start: 0, end: 4 },
      { start: 6, end: 10 },
    ])
    expect(t[2].compRanges).toEqual([{ start: 4, end: 6 }])
    t = assignCompRange(t, base[1].id, 4, 6)
    expect(t[1].compRanges).toEqual([{ start: 0, end: 10 }])
    expect(t[2].compRanges).toEqual([])
    expect(clearCompRanges(t, 'host').every((x) => x.compRanges.length === 0)).toBe(true)
  })

  it('reversed range is normalized', () => {
    const base = threeTakes()
    expect(assignCompRange(base, base[1].id, 6, 2)[1].compRanges).toEqual([{ start: 2, end: 6 }])
  })

  it('beds are always audible; single take always audible', () => {
    const bed = take({ seconds: 5, personId: 'beds', role: 'bed' })
    expect(takeAudibleAt([bed], bed, 1)).toBe(true)
    const [only] = threeTakes()
    only.listen = false
    expect(takeAudibleAt([only], only, 1)).toBe(true)
  })

  it('muted siblings do not steal the listen slot', () => {
    const [a, b] = threeTakes()
    a.muted = true
    expect(takeAudibleAt([a, b], b, 1)).toBe(true)
  })
})

describe('cloneAudioBuffer', () => {
  it('deep-copies samples', () => {
    const buf = silentBuffer(0.01, 48000, 2)
    buf.getChannelData(1)[3] = 0.5
    const copy = cloneAudioBuffer(buf)
    buf.getChannelData(1)[3] = 0
    expect(copy.getChannelData(1)[3]).toBe(0.5)
    expect(copy.numberOfChannels).toBe(2)
  })
})
