import { createEmptyTrack, type StudioTrack, type TrackClip } from '@/lib/podcast/multitrack'
import type { CameraClip } from '@/lib/podcast/camera'
import { silentBuffer } from './audio-buffer'

export function clip(partial: Partial<TrackClip> & Pick<TrackClip, 'offset' | 'duration'>): TrackClip {
  return {
    id: partial.id || `c_${Math.random().toString(36).slice(2, 8)}`,
    sourceStart: 0,
    gain: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...partial,
  }
}

/** A voice take with a real (silent) buffer of `seconds` and the given clips (default: one full clip at `offset`). */
export function take(
  opts: {
    seconds: number
    offset?: number
    personId?: string
    role?: StudioTrack['role']
    clips?: TrackClip[]
  } & Partial<StudioTrack>,
): StudioTrack {
  const { seconds, offset = 0, personId = 'host', role = 'vocal', clips, ...rest } = opts
  const t = createEmptyTrack({ name: `${personId} take`, role, personId, offset, ...rest })
  t.buffer = silentBuffer(seconds)
  t.clips = clips ?? [clip({ offset, duration: seconds })]
  return t
}

export function cam(partial: Partial<CameraClip> & Pick<CameraClip, 'offset' | 'duration'>): CameraClip {
  return {
    id: partial.id || `cam_${Math.random().toString(36).slice(2, 8)}`,
    personId: 'host',
    url: 'blob:cam',
    mime: 'video/webm',
    trimStart: 0,
    sourceStart: 0,
    sourceDuration: partial.duration,
    bytes: 1000,
    ...partial,
  }
}

export const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p
