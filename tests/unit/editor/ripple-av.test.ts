import { describe, expect, it } from 'vitest'
import { deleteRange, rippleDeleteSession, rippleTime } from '@/lib/podcast/edit'
import { rippleProgramCuts } from '@/lib/podcast/camera-edit'
import { AV_SYNC_SLOP, avDriftForPerson } from '@/lib/podcast/av-sync'
import { cameraClipEnd, programStateAt, type CameraClip, type ProgramCut } from '@/lib/podcast/camera'
import { createEmptyTrack, clipsOf, type StudioTrack } from '@/lib/podcast/multitrack'

function fakeBuffer(duration: number) {
  return {
    duration,
    length: Math.round(duration * 48000),
    sampleRate: 48000,
    numberOfChannels: 1,
  } as unknown as AudioBuffer
}

function voice(personId: string, offset: number, duration: number, syncGroup: string): StudioTrack {
  const t = createEmptyTrack({
    name: `${personId} take`,
    role: personId === 'guest' ? 'guest' : 'vocal',
    personId,
    take: 1,
    listen: true,
  })
  t.buffer = fakeBuffer(duration)
  t.offset = offset
  t.clips = [
    {
      id: `${personId}-clip`,
      sourceStart: 0,
      duration,
      offset,
      gain: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      syncGroup,
    },
  ]
  return t
}

function cam(personId: string, offset: number, duration: number, syncGroup: string): CameraClip {
  return {
    id: `${personId}-cam`,
    personId,
    url: `blob:${personId}`,
    mime: 'video/webm',
    offset,
    duration,
    trimStart: 0,
    sourceStart: 0,
    sourceDuration: duration,
    bytes: 1000,
    syncGroup,
  }
}

describe('rippleTime', () => {
  it('keeps times before, collapses inside, shifts after', () => {
    expect(rippleTime(5, 10, 20)).toBe(5)
    expect(rippleTime(15, 10, 20)).toBe(10)
    expect(rippleTime(25, 10, 20)).toBe(15)
  })
})

describe('rippleDeleteSession keeps audio, camera and scene cuts in sync', () => {
  const session = () => ({
    tracks: [voice('host', 0, 60, 'g1'), voice('guest', 0, 60, 'g2')],
    cameras: [cam('host', 0, 60, 'g1'), cam('guest', 0, 60, 'g2')],
    programCuts: [
      { id: 'c1', at: 5, scene: 'guest' },
      { id: 'c2', at: 30, scene: 'pip' },
      { id: 'c3', at: 45, scene: 'host' },
    ] as ProgramCut[],
  })

  it('removes the same span from every lane and closes the gap', () => {
    const out = rippleDeleteSession(session(), 20, 25)
    for (const t of out.tracks) {
      const clips = clipsOf(t)
      expect(clips).toHaveLength(2)
      expect(clips[0].offset).toBe(0)
      expect(clips[0].duration).toBeCloseTo(20)
      expect(clips[1].offset).toBeCloseTo(20)
      expect(clips[1].sourceStart).toBeCloseTo(25)
      expect(clips[1].offset + clips[1].duration).toBeCloseTo(55)
    }
    for (const personId of ['host', 'guest']) {
      const pics = out.cameras.filter((c) => c.personId === personId).sort((a, b) => a.offset - b.offset)
      expect(pics).toHaveLength(2)
      expect(pics[0].offset).toBe(0)
      expect(cameraClipEnd(pics[0])).toBeCloseTo(20)
      expect(pics[1].offset).toBeCloseTo(20)
      expect(pics[1].sourceStart).toBeCloseTo(25)
      expect(cameraClipEnd(pics[1])).toBeCloseTo(55)
    }
    expect(out.programCuts.map((c) => [c.id, c.at])).toEqual([
      ['c1', 5],
      ['c2', 25],
      ['c3', 40],
    ])
  })

  it('leaves no A/V drift for linked people after the ripple', () => {
    const out = rippleDeleteSession(session(), 10, 18)
    for (const personId of ['host', 'guest']) {
      const drift = avDriftForPerson(out.tracks, out.cameras, personId)
      expect(drift?.seconds ?? 0).toBeLessThan(0.001)
    }
  })

  it('an audio-only ripple (the old behaviour) is reported as drift', () => {
    const s = session()
    const audioOnly = { ...s, tracks: s.tracks.map((t) => deleteRange(t, 10, 18, true)) }
    expect(avDriftForPerson(audioOnly.tracks, audioOnly.cameras, 'host')?.seconds ?? 0).toBeGreaterThan(AV_SYNC_SLOP)
  })

  it('audio and picture point at the same source second after the edit', () => {
    const out = rippleDeleteSession(session(), 12, 19)
    const host = clipsOf(out.tracks[0])
    const pic = out.cameras.filter((c) => c.personId === 'host').sort((a, b) => a.offset - b.offset)
    // At session time 30 both lanes play source second 37.
    const audioAt = (t: number) => {
      const c = host.find((x) => t >= x.offset && t < x.offset + x.duration)!
      return c.sourceStart + (t - c.offset)
    }
    const picAt = (t: number) => {
      const c = pic.find((x) => t >= x.offset && t < x.offset + x.duration)!
      return (c.sourceStart ?? 0) + (t - c.offset)
    }
    expect(audioAt(30)).toBeCloseTo(37)
    expect(picAt(30)).toBeCloseTo(37)
  })

  it('the scene on air when the removed section ends is still on air when playback resumes', () => {
    // Cut to PIP at 30 sits inside the removed 28–35 range.
    const out = rippleDeleteSession(session(), 28, 35)
    expect(programStateAt(out.programCuts, 28.5, 'host').scene).toBe('pip')
    // Before the edit, source time 36 was PIP; after, it lives at 29.
    expect(programStateAt(out.programCuts, 29, 'host').scene).toBe('pip')
  })

  it('shifts volume automation and best-take ranges with the audio', () => {
    const s = session()
    s.tracks[0].automation = [
      { t: 5, v: 1 },
      { t: 22, v: 0.3 },
      { t: 40, v: 0.5 },
    ]
    s.tracks[0].compRanges = [{ start: 30, end: 40 }]
    const out = rippleDeleteSession(s, 20, 25)
    expect(out.tracks[0].automation.map((p) => p.t)).toEqual([5, 35])
    expect(out.tracks[0].compRanges).toEqual([{ start: 25, end: 35 }])
  })

  it('ignores a range shorter than a frame', () => {
    const s = session()
    const out = rippleDeleteSession(s, 10, 10.01)
    expect(out).toBe(s)
  })
})

describe('rippleProgramCuts', () => {
  it('collapses several cuts inside the gap to the last one', () => {
    const cuts: ProgramCut[] = [
      { id: 'a', at: 12, scene: 'guest' },
      { id: 'b', at: 14, scene: 'pip' },
      { id: 'c', at: 30, scene: 'host' },
    ]
    const out = rippleProgramCuts(cuts, 10, 20, 'host')
    expect(out.map((c) => [c.id, c.at, c.scene])).toEqual([
      ['b', 10, 'pip'],
      ['c', 20, 'host'],
    ])
  })
})

describe('deleteRange (single lane)', () => {
  it('without ripple leaves later clips where they were', () => {
    const t = voice('host', 0, 60, 'g')
    const out = deleteRange(t, 20, 25, false)
    expect(clipsOf(out).map((c) => c.offset)).toEqual([0, 25])
  })
})
