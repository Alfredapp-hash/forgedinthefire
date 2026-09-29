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
import type { CameraClip } from '@/lib/podcast/camera'
import { deleteCameraRange } from '@/lib/podcast/camera-edit'
import { rippleSwitchEdl, type SwitchEDL } from '@/lib/podcast/switch-edl'

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
  // An emptied lane must stay empty: clipsOf() reads a bare [] as "whole buffer".
  return { ...track, clips: clean, offset, noClips: clean.length === 0 && Boolean(track.buffer) }
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
        // Clamp to the source, not the current in-point: dragging left reveals trimmed-off audio
        // (never before source 0 or session 0).
        const earliest = Math.max(0, c.offset - c.sourceStart)
        const t = Math.max(earliest, Math.min(sessionTime, clipEnd(c) - MIN_CLIP))
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

/** Map a session time through a ripple delete of [a, b]: before stays, inside collapses to a, after shifts left. */
export function rippleTime(t: number, a: number, b: number): number {
  if (t <= a) return t
  if (t >= b) return Math.max(0, t - (b - a))
  return a
}

/**
 * Shift volume automation and best-take (comp) ranges on this track as if [a, b] were removed,
 * so a ripple keeps them on the audio they were drawn for.
 */
export function rippleTrackTimeline(track: StudioTrack, a: number, b: number): StudioTrack {
  const gap = b - a
  const automation = (track.automation || [])
    .filter((p) => p.t <= a + 0.0005 || p.t >= b - 0.0005)
    .map((p) => (p.t >= b - 0.0005 ? { ...p, t: Math.max(0, p.t - gap) } : { ...p }))
  const compRanges = (track.compRanges || [])
    .map((r) => ({ ...r, start: rippleTime(r.start, a, b), end: rippleTime(r.end, a, b) }))
    .filter((r) => r.end - r.start > 0.001)
  return { ...track, automation, compRanges }
}

/**
 * Punch a hole: keep audio on both sides, leave silence in the middle. Same track.
 * With `ripple`, later clips, automation points and best-take ranges all move left by the gap.
 */
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
  const next = withClips(split, shifted)
  return ripple ? rippleTrackTimeline(next, a, b) : next
}

/** Everything on the session clock that a ripple edit has to keep in step. */
export type SessionTimeline = {
  tracks: StudioTrack[]
  cameras: CameraClip[]
  /** Live-captured / hand-edited camera-switch cuts (MAIN follows the talker). */
  switchEdl: SwitchEDL
}

/**
 * Ripple delete across the whole session: removes [start, end] from every audio lane, every
 * picture lane and the camera-switch EDL, then closes the gap. Audio, camera and switch cuts
 * all shift by the same amount, so linked picture never drifts from its audio.
 */
export function rippleDeleteSession(session: SessionTimeline, start: number, end: number): SessionTimeline {
  const a = Math.max(0, Math.min(start, end))
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return session
  return {
    tracks: session.tracks.map((t) => (t.buffer ? deleteRange(t, a, b, true) : rippleTrackTimeline(t, a, b))),
    cameras: deleteCameraRange(session.cameras, a, b, undefined, true),
    switchEdl: rippleSwitchEdl(session.switchEdl || [], a, b),
  }
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

/** Set gain (and optionally mute) on ONE clip by id. Clamped 0–2. */
export function setClipGain(track: StudioTrack, clipId: string, gain: number, muted?: boolean): StudioTrack {
  const base = ensureClips(track)
  const g = Math.max(0, Math.min(2, gain))
  return withClips(
    base,
    clipsOf(base).map((c) =>
      c.id === clipId ? { ...c, gain: g, muted: muted ?? c.muted } : c,
    ),
  )
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
  syncGroup?: string,
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
    syncGroup,
  }
}

export function mapTrack(tracks: StudioTrack[], id: string, fn: (t: StudioTrack) => StudioTrack) {
  return tracks.map((t) => (t.id === id ? fn(t) : t))
}

/**
 * Quantize a session time to a grid, then magnet-snap to any nearby anchor
 * (clip edges, the playhead, range bounds) that is within `magnet` seconds.
 * Anchors always win over the grid when one is in range, so edits click onto
 * neighbouring material the way an NLE snaps to cuts. Grid `<= 0` disables the
 * grid step (magnet only); `magnet <= 0` disables the magnet (grid only).
 */
export function snapTime(t: number, grid: number, anchors: number[] = [], magnet = 0): number {
  const time = Math.max(0, t)
  let best = time
  let bestDist = Infinity
  for (const a of anchors) {
    if (a < 0) continue
    const d = Math.abs(a - time)
    if (d <= magnet && d < bestDist) {
      best = a
      bestDist = d
    }
  }
  if (bestDist < Infinity) return best
  if (grid > 0) return Math.round(time / grid) * grid
  return time
}

/** Session-time anchors on a lane (every clip edge) — used for magnetic snapping. */
export function clipEdges(track: StudioTrack): number[] {
  return clipsOf(track).flatMap((c) => [c.offset, clipEnd(c)])
}

/**
 * Roll edit: move the boundary between a clip and its immediate neighbour on the
 * SAME lane. Trimming the OUT edge extends/retracts this clip and pushes the next
 * clip's IN edge by the opposite amount, so total lane length is preserved (a true
 * NLE roll). The IN edge rolls against the previous clip the same way. If there is
 * no touching neighbour on that side we fall back to a plain single-clip trim so the
 * gesture never dead-ends. Purely clip-boundary math — source bytes are untouched.
 */
export function rollTrimClip(
  track: StudioTrack,
  clipId: string,
  edge: 'in' | 'out',
  sessionTime: number,
): StudioTrack {
  const base = ensureClips(track)
  const buf = base.buffer
  if (!buf) return track
  const clips = clipsOf(base).slice().sort((a, b) => a.offset - b.offset)
  const idx = clips.findIndex((c) => c.id === clipId)
  if (idx < 0) return base
  const clip = clips[idx]

  if (edge === 'out') {
    const next = clips[idx + 1]
    // Roll only when the next clip actually abuts this one.
    if (!next || Math.abs(clipEnd(clip) - next.offset) > 0.03) {
      return trimClip(base, clipId, 'out', sessionTime)
    }
    const minT = clip.offset + MIN_CLIP
    const maxT = clipEnd(next) - MIN_CLIP
    // Cap by available source: this clip can only grow while it has buffer tail,
    // and the next clip can only give up head-room down to sourceStart 0.
    const clipSrcCap = clip.offset + (buf.duration - clip.sourceStart)
    const nextSrcCap = next.offset - next.sourceStart // boundary where next.sourceStart hits 0
    const lo = Math.max(minT, nextSrcCap)
    const hi = Math.min(maxT, clipSrcCap)
    const bound = Math.max(lo, Math.min(sessionTime, hi))
    const nextStart = Math.max(0, next.sourceStart + (bound - next.offset))
    const nextDur = clipEnd(next) - bound
    return withClips(
      base,
      clips.map((c) => {
        if (c.id === clip.id) return { ...c, duration: bound - c.offset }
        if (c.id === next.id) return { ...c, offset: bound, sourceStart: nextStart, duration: nextDur }
        return c
      }),
    )
  }

  const prev = clips[idx - 1]
  if (!prev || Math.abs(clipEnd(prev) - clip.offset) > 0.03) {
    return trimClip(base, clipId, 'in', sessionTime)
  }
  const minT = prev.offset + MIN_CLIP
  const maxT = clipEnd(clip) - MIN_CLIP
  // This clip can only pull its IN edge left while it has buffer head-room; the
  // prev clip can only grow while it has buffer tail.
  const clipHeadCap = clip.offset - clip.sourceStart // boundary where this.sourceStart hits 0
  const prevSrcCap = prev.offset + (buf.duration - prev.sourceStart)
  const lo = Math.max(minT, clipHeadCap)
  const hi = Math.min(maxT, prevSrcCap)
  const bound = Math.max(lo, Math.min(sessionTime, hi))
  const clipStart = Math.max(0, clip.sourceStart + (bound - clip.offset))
  const clipDur = clipEnd(clip) - bound
  return withClips(
    base,
    clips.map((c) => {
      if (c.id === prev.id) return { ...c, duration: bound - c.offset }
      if (c.id === clip.id) return { ...c, offset: bound, sourceStart: clipStart, duration: clipDur }
      return c
    }),
  )
}

/**
 * Sidechain ducking preset. Scans the `sidechain` track's buffer for stretches
 * where its short-term level rises above `openDb` (it is "talking"), then writes
 * volume automation on THIS track that dips to `duckDb` across those stretches
 * (with an attack/release ramp), returning to unity between them. This is the
 * "lower the music when the host talks" preset expressed purely as automation via
 * the same `setVolumeInRange` primitive — no buffer is rewritten. Segments shorter
 * than `minHold` are ignored and gaps smaller than `minHold` are bridged so the
 * bed does not flutter.
 */
export function duckWithSidechain(
  target: StudioTrack,
  sidechain: StudioTrack,
  opts: { duckDb?: number; openDb?: number; attack?: number; release?: number; minHold?: number } = {},
): StudioTrack {
  const buf = sidechain.buffer
  if (!buf) return target
  const duckDb = opts.duckDb ?? -12
  const openDb = opts.openDb ?? -40
  const attack = Math.max(0.02, opts.attack ?? 0.12)
  const release = Math.max(0.02, opts.release ?? 0.35)
  const minHold = Math.max(0.05, opts.minHold ?? 0.25)
  const level = Math.max(0, Math.min(1, Math.pow(10, duckDb / 20)))
  const openLin = Math.pow(10, openDb / 20)

  const sr = buf.sampleRate
  const win = Math.max(1, Math.round(sr * 0.03)) // 30 ms RMS window
  const data = buf.getChannelData(0)
  const hop = win
  const activeAt: { t: number; on: boolean }[] = []
  for (let i = 0; i < data.length; i += hop) {
    let sum = 0
    const end = Math.min(data.length, i + win)
    for (let j = i; j < end; j++) sum += data[j] * data[j]
    const rms = Math.sqrt(sum / Math.max(1, end - i))
    activeAt.push({ t: (sidechain.offset || 0) + i / sr, on: rms > openLin })
  }

  // Collapse consecutive frames into loud segments, bridging tiny gaps.
  const segs: { start: number; end: number }[] = []
  let segStart = -1
  for (let k = 0; k < activeAt.length; k++) {
    const { t, on } = activeAt[k]
    if (on && segStart < 0) segStart = t
    if (!on && segStart >= 0) {
      segs.push({ start: segStart, end: t })
      segStart = -1
    }
  }
  if (segStart >= 0) segs.push({ start: segStart, end: activeAt[activeAt.length - 1]?.t ?? segStart })

  const merged: { start: number; end: number }[] = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && s.start - last.end < minHold) last.end = s.end
    else merged.push({ ...s })
  }
  const kept = merged.filter((s) => s.end - s.start >= minHold)

  let out: StudioTrack = { ...target, automation: [...(target.automation || [])] }
  for (const s of kept) {
    out = setVolumeInRange(out, s.start, s.end, level, Math.min(attack, release))
  }
  return out
}
