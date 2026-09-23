import { describe, expect, it } from 'vitest'
import { punchInTime, sharedPunchInTime, REC_MODE_META } from '@/lib/podcast/record-session'
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
