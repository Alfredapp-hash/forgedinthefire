/** Linked A/V on one session clock. Unlink is the default edit; badge if they drift. */

import { cameraSourceStart, isLinkedPicture, type CameraClip } from '@/lib/podcast/camera'
import { clipsOf, isVoiceRole, type SessionPerson, type StudioTrack, type TrackClip } from '@/lib/podcast/multitrack'

/** ~1 frame at 24fps — Shotcut-style sync slop, not silent drift. */
export const AV_SYNC_SLOP = 0.042

export function personAvLinked(person: SessionPerson | undefined) {
  return person?.avLinked !== false
}

function overlaps(aOff: number, aDur: number, bOff: number, bDur: number) {
  return aOff < bOff + bDur - 0.001 && bOff < aOff + aDur - 0.001
}

export function listenAudioClips(tracks: StudioTrack[], personId: string): TrackClip[] {
  const lane = tracks.filter((t) => t.personId === personId && isVoiceRole(t.role) && t.buffer)
  const listen = lane.find((t) => t.listen) || lane[0]
  return listen ? clipsOf(listen) : []
}

export type AvDrift = {
  personId: string
  seconds: number
  audioOffset: number
  cameraOffset: number
}

/**
 * Largest source-alignment gap between listen audio and linked picture of one person.
 *
 * Pairs overlapping clips only (split halves of one punch must not be compared across the cut);
 * a camera clip with no overlapping audio falls back to its punch's syncGroup mates so a clip
 * dragged far away still reads as out of sync. Drift compares where each clip's source starts on
 * the session clock (offset − sourceStart), so trims and splits — which move in-points but not
 * the media — never read as drift.
 */
export function avDriftForPerson(tracks: StudioTrack[], cameras: CameraClip[], personId: string): AvDrift | null {
  const audio = listenAudioClips(tracks, personId)
  const pics = cameras.filter((c) => c.personId === personId && !c.muted && isLinkedPicture(c))
  if (audio.length === 0 || pics.length === 0) return null
  let worst: AvDrift | null = null
  for (const cam of pics) {
    let mates = audio.filter((a) => overlaps(a.offset, a.duration, cam.offset, cam.duration))
    if (mates.length === 0 && cam.syncGroup) mates = audio.filter((a) => a.syncGroup === cam.syncGroup)
    const camOrigin = cam.offset - cameraSourceStart(cam)
    for (const a of mates) {
      const seconds = Math.abs(a.offset - a.sourceStart - camOrigin)
      if (!worst || seconds > worst.seconds) {
        worst = { personId, seconds, audioOffset: a.offset, cameraOffset: cam.offset }
      }
    }
  }
  return worst
}

export function avBroken(tracks: StudioTrack[], cameras: CameraClip[], person: SessionPerson) {
  if (!personAvLinked(person)) return false
  const drift = avDriftForPerson(tracks, cameras, person.id)
  return Boolean(drift && drift.seconds > AV_SYNC_SLOP)
}

function clipMatchesCamera(clip: TrackClip, cam: CameraClip, fromOffset: number) {
  if (cam.syncGroup && clip.syncGroup && cam.syncGroup === clip.syncGroup) return true
  return Math.abs(cam.offset - fromOffset) < 0.08
}

/** When Linked, slide matching camera clips by the same delta. Trim/split never call this. */
export function nudgeCamerasWithAudio(
  cameras: CameraClip[],
  clip: TrackClip,
  personId: string,
  fromOffset: number,
  toOffset: number,
  linked: boolean,
): CameraClip[] {
  if (!linked) return cameras
  const delta = toOffset - fromOffset
  if (Math.abs(delta) < 0.0005) return cameras
  return cameras.map((c) => {
    if (c.personId !== personId || !isLinkedPicture(c)) return c
    return clipMatchesCamera(clip, c, fromOffset) ? { ...c, offset: Math.max(0, c.offset + delta) } : c
  })
}

function cameraMatchesClip(cam: CameraClip, clip: TrackClip, fromOffset: number) {
  if (cam.syncGroup && clip.syncGroup && cam.syncGroup === clip.syncGroup) return true
  return Math.abs(clip.offset - fromOffset) < 0.08
}

/** When Linked, slide matching listen-take audio by the same delta. */
export function nudgeAudioWithCamera(
  tracks: StudioTrack[],
  cam: CameraClip,
  fromOffset: number,
  toOffset: number,
  linked: boolean,
): StudioTrack[] {
  if (!linked) return tracks
  const delta = toOffset - fromOffset
  if (Math.abs(delta) < 0.0005) return tracks
  return tracks.map((t) => {
    if (t.personId !== cam.personId || !isVoiceRole(t.role) || !t.listen || !t.buffer) return t
    if (!isLinkedPicture(cam)) return t
    const clips = clipsOf(t).map((c) =>
      cameraMatchesClip(cam, c, fromOffset) ? { ...c, offset: Math.max(0, c.offset + delta) } : c,
    )
    const offset = clips[0]?.offset ?? t.offset
    return { ...t, clips, offset }
  })
}

export function formatDrift(seconds: number) {
  const ms = Math.round(seconds * 1000)
  if (ms < 1000) return `${ms} ms`
  return `${seconds.toFixed(2)}s`
}
