/** Same-lane clip + volume-automation edits (GarageBand-style, one track). */

import {
  automationAt,
  clipsOf,
  ensureClips,
  newClipId,
  type AutomationPoint,
  type StudioTrack,
  type TrackClip,
} from '@/lib/podcast/multitrack'

const MIN_CLIP = 0.04
const RAMP = 0.04

export function clipEnd(clip: TrackClip) {
  return clip.offset + clip.duration
}

export function clipAtTime(track: StudioTrack, sessionTime: number): TrackClip | null {
  return (
    clipsOf(track).find((c) => sessionTime >= c.offset - 0.0001 && sessionTime < clipEnd(c) - 0.0001) || null
  )
}

export function withClips(track: StudioTrack, clips: TrackClip[]): StudioTrack {
  const clean = clips
    .filter((c) => c.duration >= MIN_CLIP)
    .map((c) => ({ ...c }))
    .sort((a, b) => a.offset - b.offset)
  const offset = clean[0]?.offset ?? track.offset
  return { ...track, clips: clean, offset }
}

export function moveClip(track: StudioTrack, clipId: string, offset: number): StudioTrack {
  const base = ensureClips(track)
  return withClips(
    base,
    clipsOf(base).map((c) => (c.id === clipId ? { ...c, offset: Math.max(0, offset) } : c)),
  )
}

export function trimClip(
  track: StudioTrack,
  clipId: string,
  edge: 'in' | 'out',
  sessionTime: number,
): StudioTrack {
  const base = ensureClips(track)
  const buf = base.buffer
  if (!buf) return track
  return withClips(
    base,
    clipsOf(base).map((c) => {
      if (c.id !== clipId) return c
      if (edge === 'in') {
        const t = Math.max(c.offset, Math.min(sessionTime, clipEnd(c) - MIN_CLIP))
        const delta = t - c.offset
        const sourceStart = Math.max(0, c.sourceStart + delta)
        const maxDur = buf.duration - sourceStart
        const duration = Math.min(maxDur, c.duration - delta)
        return { ...c, offset: t, sourceStart, duration }
      }
      const t = Math.max(c.offset + MIN_CLIP, Math.min(sessionTime, c.offset + (buf.duration - c.sourceStart)))
      return { ...c, duration: t - c.offset }
    }),
  )
}

export function splitTrackAt(track: StudioTrack, sessionTime: number): StudioTrack {
  const base = ensureClips(track)
  const clips: TrackClip[] = []
  let did = false
  for (const c of clipsOf(base)) {
    if (did || sessionTime <= c.offset + MIN_CLIP || sessionTime >= clipEnd(c) - MIN_CLIP) {
      clips.push(c)
      continue
    }
    const leftDur = sessionTime - c.offset
    clips.push({ ...c, duration: leftDur, fadeOut: Math.min(c.fadeOut, 0.05) })
    clips.push({
      ...c,
      id: newClipId(),
      offset: sessionTime,
      sourceStart: c.sourceStart + leftDur,
      duration: c.duration - leftDur,
      fadeIn: Math.min(c.fadeIn, 0.05),
    })
    did = true
  }
  return did ? withClips(base, clips) : base
}

export function splitRange(track: StudioTrack, start: number, end: number): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return track
  return splitTrackAt(splitTrackAt(track, a), b)
}

/** Punch a hole: keep audio on both sides, leave silence in the middle. Same track. */
export function deleteRange(track: StudioTrack, start: number, end: number, ripple = false): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return track
  const split = splitRange(track, a, b)
  const kept = clipsOf(split).filter((c) => clipEnd(c) <= a + 0.001 || c.offset >= b - 0.001)
  const gap = b - a
  const shifted = ripple
    ? kept.map((c) => (c.offset >= b - 0.001 ? { ...c, offset: Math.max(0, c.offset - gap) } : c))
    : kept
  return withClips(split, shifted)
}

/** Keep only the selected slice of this track. */
export function cropToRange(track: StudioTrack, start: number, end: number): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return track
  const split = splitRange(track, a, b)
  return withClips(
    split,
    clipsOf(split).filter((c) => c.offset >= a - 0.001 && clipEnd(c) <= b + 0.001),
  )
}

export function muteRange(track: StudioTrack, start: number, end: number, muted = true): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const split = splitRange(ensureClips(track), a, b)
  return withClips(
    split,
    clipsOf(split).map((c) => {
      const inside = c.offset >= a - 0.001 && clipEnd(c) <= b + 0.001
      return inside ? { ...c, muted } : c
    }),
  )
}

export function setClipGainInRange(track: StudioTrack, start: number, end: number, gain: number): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const split = splitRange(ensureClips(track), a, b)
  const g = Math.max(0, Math.min(2, gain))
  return withClips(
    split,
    clipsOf(split).map((c) => {
      const inside = c.offset >= a - 0.001 && clipEnd(c) <= b + 0.001
      return inside ? { ...c, gain: g, muted: g <= 0.001 } : c
    }),
  )
}

function sortPoints(points: AutomationPoint[]) {
  return [...points].sort((a, b) => a.t - b.t)
}

/** Duck or raise volume across a time range on this track only. Does not split. */
export function setVolumeInRange(
  track: StudioTrack,
  start: number,
  end: number,
  level: number,
  ramp = RAMP,
): StudioTrack {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < 0.02) return track
  const v = Math.max(0, Math.min(2, level))
  const edge = Math.min(ramp, (b - a) / 4)
  const pts = sortPoints(track.automation || [])
  const before = automationAt(pts, a, 1)
  const after = automationAt(pts, b, 1)
  const kept = pts.filter((p) => p.t < a - 0.0005 || p.t > b + 0.0005)
  const added: AutomationPoint[] = [
    { t: a, v: before },
    { t: a + edge, v },
    { t: b - edge, v },
    { t: b, v: after },
  ]
  return { ...track, automation: sortPoints([...kept, ...added]) }
}

export function clearAutomation(track: StudioTrack): StudioTrack {
  return { ...track, automation: [] }
}

export function joinAdjacentClips(track: StudioTrack, sessionTime: number): StudioTrack {
  const base = ensureClips(track)
  const clips = clipsOf(base)
  for (let i = 0; i < clips.length - 1; i++) {
    const a = clips[i]
    const b = clips[i + 1]
    const touching = Math.abs(clipEnd(a) - b.offset) < 0.03
    const contiguous = Math.abs(a.sourceStart + a.duration - b.sourceStart) < 0.03
    const near = sessionTime >= a.offset && sessionTime <= clipEnd(b)
    if (touching && contiguous && near && a.muted === b.muted) {
      const merged: TrackClip = {
        ...a,
        duration: clipEnd(b) - a.offset,
        fadeOut: b.fadeOut,
        gain: (a.gain + b.gain) / 2,
      }
      return withClips(base, [...clips.slice(0, i), merged, ...clips.slice(i + 2)])
    }
  }
  return base
}

export function duplicateClipAt(track: StudioTrack, clipId: string, atOffset?: number): StudioTrack {
  const base = ensureClips(track)
  const src = clipsOf(base).find((c) => c.id === clipId)
  if (!src) return track
  const copy: TrackClip = {
    ...src,
    id: newClipId(),
    offset: Math.max(0, atOffset ?? clipEnd(src)),
    muted: false,
  }
  return withClips(base, [...clipsOf(base), copy])
}

export function setClipFades(track: StudioTrack, clipId: string, fadeIn: number, fadeOut: number): StudioTrack {
  const base = ensureClips(track)
  return withClips(
    base,
    clipsOf(base).map((c) =>
      c.id === clipId
        ? { ...c, fadeIn: Math.max(0, fadeIn), fadeOut: Math.max(0, fadeOut) }
        : c,
    ),
  )
}

export function pasteClip(track: StudioTrack, clip: TrackClip, atOffset: number): StudioTrack {
  const base = ensureClips(track)
  return withClips(base, [
    ...clipsOf(base),
    { ...clip, id: newClipId(), offset: Math.max(0, atOffset) },
  ])
}

export function fullClipForBuffer(
  buffer: { duration: number },
  offset: number,
  fadeIn = 0.05,
  fadeOut = 0.15,
): TrackClip {
  return {
    id: newClipId(),
    sourceStart: 0,
    duration: buffer.duration,
    offset: Math.max(0, offset),
    gain: 1,
    muted: false,
    fadeIn,
    fadeOut,
  }
}

export function mapTrack(tracks: StudioTrack[], id: string, fn: (t: StudioTrack) => StudioTrack) {
  return tracks.map((t) => (t.id === id ? fn(t) : t))
}
