/** Linked A/V on one session clock. Unlink is the default edit; badge if they drift. */

import { isLinkedPicture, type CameraClip } from '@/lib/podcast/camera'
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

/** Largest in-point gap between overlapping listen-audio and camera clips. */
export function avDriftForPerson(tracks: StudioTrack[], cameras: CameraClip[], personId: string): AvDrift | null {
  const audio = listenAudioClips(tracks, personId)
  const pics = cameras.filter((c) => c.personId === personId && !c.muted && isLinkedPicture(c))
  if (audio.length === 0 || pics.length === 0) return null
  let worst: AvDrift | null = null
  for (const cam of pics) {
    const mates = audio.filter(
      (a) =>
        (cam.syncGroup && a.syncGroup === cam.syncGroup) ||
        overlaps(a.offset, a.duration, cam.offset, cam.duration),
    )
    for (const a of mates) {
      const seconds = Math.abs(a.offset - cam.offset)
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

// ---------------------------------------------------------------------------
// Auto-snap. Detection lives in avDriftForPerson; this brings A/V back within
// AV_SYNC_SLOP by nudging the picture clip (default) or the linked audio.
// ---------------------------------------------------------------------------

export type SnapTarget = 'camera' | 'audio'

/**
 * The signed delta that aligns the drifted lane to its mate. Positive means the
 * target lane's in-point must move later. Returns 0 when already within slop.
 *
 * - target 'camera' (default): slide the picture to the audio in-point.
 * - target 'audio': slide the listen-take audio to the picture in-point.
 */
export function snapDelta(drift: AvDrift | null, target: SnapTarget = 'camera'): number {
  if (!drift || drift.seconds <= AV_SYNC_SLOP) return 0
  return target === 'camera'
    ? drift.audioOffset - drift.cameraOffset
    : drift.cameraOffset - drift.audioOffset
}

/**
 * Snap the drifted picture to the audio in-point. Moves every linked camera clip for the
 * person that sits at the drifted picture offset by the detected delta. Detection and the
 * manual Slip/nudge stay untouched. No-op when within slop.
 */
export function snapCamerasToAudio(
  cameras: CameraClip[],
  drift: AvDrift | null,
): CameraClip[] {
  const delta = snapDelta(drift, 'camera')
  if (!drift || Math.abs(delta) < 0.0005) return cameras
  return cameras.map((c) => {
    if (c.personId !== drift.personId || !isLinkedPicture(c)) return c
    return Math.abs(c.offset - drift.cameraOffset) < 0.08
      ? { ...c, offset: Math.max(0, c.offset + delta) }
      : c
  })
}

/**
 * Snap the drifted listen-take audio to the picture in-point instead. Moves clips of the
 * person's listen lane that sit at the drifted audio offset by the detected delta.
 */
export function snapAudioToCameras(
  tracks: StudioTrack[],
  drift: AvDrift | null,
): StudioTrack[] {
  const delta = snapDelta(drift, 'audio')
  if (!drift || Math.abs(delta) < 0.0005) return tracks
  return tracks.map((t) => {
    if (t.personId !== drift.personId || !isVoiceRole(t.role) || !t.listen || !t.buffer) return t
    const clips = clipsOf(t).map((c) =>
      Math.abs(c.offset - drift.audioOffset) < 0.08 ? { ...c, offset: Math.max(0, c.offset + delta) } : c,
    )
    const offset = clips[0]?.offset ?? t.offset
    return { ...t, clips, offset }
  })
}
