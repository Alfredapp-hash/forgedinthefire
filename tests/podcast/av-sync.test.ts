import { describe, expect, it } from 'vitest'
import {
  AV_SYNC_SLOP,
  avBroken,
  avDriftForPerson,
  formatDrift,
  nudgeAudioWithCamera,
  nudgeCamerasWithAudio,
  personAvLinked,
} from '@/lib/podcast/av-sync'
import { splitTrackAt } from '@/lib/podcast/edit'
import { splitCameraAt } from '@/lib/podcast/camera-edit'
import { clipsOf, type SessionPerson } from '@/lib/podcast/multitrack'
import { cam, clip, take } from '../helpers/tracks'

const host: SessionPerson = { id: 'host', name: 'Host', color: '#fff', kind: 'voice' }

function punch(offset = 0, seconds = 10) {
  const t = take({ seconds, offset, clips: [clip({ offset, duration: seconds, syncGroup: 'g1' })] })
  const c = cam({ offset, duration: seconds, syncGroup: 'g1' })
  return { t, c }
}

describe('av-sync', () => {
  it('linked by default; unlinked when avLinked === false', () => {
    expect(personAvLinked(host)).toBe(true)
    expect(personAvLinked({ ...host, avLinked: false })).toBe(false)
    expect(personAvLinked(undefined)).toBe(true)
  })

  it('aligned punch has zero drift and is not broken', () => {
    const { t, c } = punch(3)
    expect(avDriftForPerson([t], [c], 'host')?.seconds).toBe(0)
    expect(avBroken([t], [c], host)).toBe(false)
  })

  it('drift beyond one frame is broken; within slop is not', () => {
    const { t, c } = punch(3)
    expect(avBroken([t], [{ ...c, offset: 3 + AV_SYNC_SLOP / 2 }], host)).toBe(false)
    expect(avBroken([t], [{ ...c, offset: 3.2 }], host)).toBe(true)
    expect(avBroken([t], [{ ...c, offset: 3.2 }], { ...host, avLinked: false })).toBe(false)
  })

  it('moving audio nudges the linked camera by the same delta', () => {
    const { t, c } = punch(0)
    const moved = nudgeCamerasWithAudio([c], t.clips[0], 'host', 0, 2.5, true)
    expect(moved[0].offset).toBe(2.5)
    expect(nudgeCamerasWithAudio([c], t.clips[0], 'host', 0, 2.5, false)[0].offset).toBe(0)
  })

  it('moving camera nudges the listen take', () => {
    const { t, c } = punch(0)
    const out = nudgeAudioWithCamera([t], c, 0, 1.5, true)
    expect(clipsOf(out[0])[0].offset).toBe(1.5)
  })

  // Split pieces keep the punch's syncGroup, and avDriftForPerson pairs clips by syncGroup even
  // when they do not overlap — so the left picture half is compared with the right audio half
  // (4 s apart) and the voice card shows "Linked · sync off" although nothing moved.
  it.fails('BUG: splitting audio AND picture at the same point reports broken sync', () => {
    const { t, c } = punch(0)
    const t2 = splitTrackAt(t, 4)
    const c2 = splitCameraAt([c], 4)
    expect(avBroken([t2], c2, host)).toBe(false)
  })

  it.fails('BUG: splitting only the audio take (S) reports broken sync', () => {
    const { t, c } = punch(0)
    const t2 = splitTrackAt(t, 4)
    expect(avBroken([t2], [c], host)).toBe(false)
  })

  it('formatDrift', () => {
    expect(formatDrift(0.042)).toBe('42 ms')
    expect(formatDrift(1.5)).toBe('1.50s')
  })
})
