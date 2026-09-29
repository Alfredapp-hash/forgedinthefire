/** Camera-lane edits. Same clock as audio; never rewrites the webm or PCM. */

import {
  cameraClipEnd,
  cameraKind,
  cameraLayer,
  cameraSourceStart,
  clipKeyframes,
  evalKeyframes,
  newCameraClipId,
  normalizeCameraClip,
  normalizeKeyframes,
  type CameraClip,
  type CameraFilter,
  type PictureKeyframe,
  type StingerStyle,
} from '@/lib/podcast/camera'

const MIN_CLIP = 0.04

export function withCameraClips(clips: CameraClip[], next: CameraClip[]): CameraClip[] {
  return next
    .map(normalizeCameraClip)
    .filter((c) => c.duration >= MIN_CLIP)
    .sort((a, b) => a.offset - b.offset || a.personId.localeCompare(b.personId))
}

export function cameraClipAtTime(clips: CameraClip[], sessionTime: number, personId?: string) {
  return (
    clips.find(
      (c) =>
        (!personId || c.personId === personId) &&
        sessionTime >= c.offset - 0.0001 &&
        sessionTime < cameraClipEnd(c) - 0.0001,
    ) || null
  )
}

export function moveCameraClip(clips: CameraClip[], clipId: string, offset: number): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => (c.id === clipId ? { ...c, offset: Math.max(0, offset) } : c)),
  )
}

export function trimCameraClip(
  clips: CameraClip[],
  clipId: string,
  edge: 'in' | 'out',
  sessionTime: number,
): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => {
      if (c.id !== clipId) return c
      const src = cameraSourceStart(c)
      const fileDur = c.sourceDuration || src + c.duration
      if (edge === 'in') {
        const t = Math.max(c.offset, Math.min(sessionTime, cameraClipEnd(c) - MIN_CLIP))
        const delta = t - c.offset
        const sourceStart = Math.max(0, src + delta)
        const duration = Math.min(fileDur - sourceStart, c.duration - delta)
        return { ...c, offset: t, sourceStart, trimStart: sourceStart, duration }
      }
      const maxOut = c.offset + (fileDur - src)
      const t = Math.max(c.offset + MIN_CLIP, Math.min(sessionTime, maxOut))
      return { ...c, duration: t - c.offset }
    }),
  )
}

/** Keep timeline seat; slide media in/out (NLE slip). */
export function slipCameraClip(clips: CameraClip[], clipId: string, delta: number): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => {
      if (c.id !== clipId) return c
      const src = cameraSourceStart(c)
      const fileDur = c.sourceDuration || src + c.duration
      const next = Math.max(0, Math.min(fileDur - c.duration, src + delta))
      return { ...c, sourceStart: next, trimStart: next }
    }),
  )
}

export function splitCameraAt(clips: CameraClip[], sessionTime: number, personId?: string): CameraClip[] {
  const hit = cameraClipAtTime(clips, sessionTime, personId)
  if (!hit) return clips
  if (sessionTime <= hit.offset + MIN_CLIP || sessionTime >= cameraClipEnd(hit) - MIN_CLIP) return clips
  const leftDur = sessionTime - hit.offset
  const src = cameraSourceStart(hit)
  const left: CameraClip = { ...hit, duration: leftDur }
  const right: CameraClip = {
    ...hit,
    id: newCameraClipId(),
    offset: sessionTime,
    sourceStart: src + leftDur,
    trimStart: src + leftDur,
    duration: hit.duration - leftDur,
  }
  return withCameraClips(
    clips,
    clips.flatMap((c) => (c.id === hit.id ? [left, right] : [c])),
  )
}

/**
 * Razor every clip (every person, every layer — or one person's) that spans `sessionTime`.
 * Range edits need this: splitCameraAt only cuts the first clip it finds, which left other
 * people's lanes (and overlays) uncut when a range covered several lanes.
 */
export function splitAllCameraAt(clips: CameraClip[], sessionTime: number, personId?: string): CameraClip[] {
  let changed = false
  const out = clips.flatMap((hit) => {
    if (personId && hit.personId !== personId) return [hit]
    if (sessionTime <= hit.offset + MIN_CLIP || sessionTime >= cameraClipEnd(hit) - MIN_CLIP) return [hit]
    changed = true
    const leftDur = sessionTime - hit.offset
    const src = cameraSourceStart(hit)
    const left: CameraClip = { ...hit, duration: leftDur }
    const right: CameraClip = {
      ...hit,
      id: newCameraClipId(),
      offset: sessionTime,
      sourceStart: src + leftDur,
      trimStart: src + leftDur,
      duration: hit.duration - leftDur,
    }
    return [left, right]
  })
  return changed ? withCameraClips(clips, out) : clips
}

export function splitCameraRange(clips: CameraClip[], start: number, end: number, personId?: string) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return clips
  return splitAllCameraAt(splitAllCameraAt(clips, a, personId), b, personId)
}

/** Cut a hole on that person's camera lane. Ripple pulls later clips of the same person. */
export function deleteCameraRange(
  clips: CameraClip[],
  start: number,
  end: number,
  personId?: string,
  ripple = false,
): CameraClip[] {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return clips
  const split = splitCameraRange(clips, a, b, personId)
  const kept = split.filter((c) => {
    if (personId && c.personId !== personId) return true
    return cameraClipEnd(c) <= a + 0.001 || c.offset >= b - 0.001
  })
  const gap = b - a
  const shifted = ripple
    ? kept.map((c) =>
        (!personId || c.personId === personId) && c.offset >= b - 0.001
          ? { ...c, offset: Math.max(0, c.offset - gap) }
          : c,
      )
    : kept
  return withCameraClips(clips, shifted)
}

export function cropCameraRange(clips: CameraClip[], start: number, end: number, personId?: string) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return clips
  const split = splitCameraRange(clips, a, b, personId)
  return withCameraClips(
    clips,
    split.filter((c) => {
      if (personId && c.personId !== personId) return true
      return c.offset >= a - 0.001 && cameraClipEnd(c) <= b + 0.001
    }),
  )
}

export function muteCameraRange(clips: CameraClip[], start: number, end: number, personId?: string, muted = true) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const split = splitCameraRange(clips, a, b, personId)
  return withCameraClips(
    clips,
    split.map((c) => {
      if (personId && c.personId !== personId) return c
      const inside = c.offset >= a - 0.001 && cameraClipEnd(c) <= b + 0.001
      return inside ? { ...c, muted } : c
    }),
  )
}

export function toggleCameraMute(clips: CameraClip[], clipId: string): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => (c.id === clipId ? { ...c, muted: !c.muted } : c)),
  )
}

export function joinAdjacentCamera(clips: CameraClip[], sessionTime: number, personId?: string): CameraClip[] {
  const scoped = personId ? clips.filter((c) => c.personId === personId) : clips
  const ordered = [...scoped].sort((a, b) => a.offset - b.offset)
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]
    const b = ordered[i + 1]
    const touching = Math.abs(cameraClipEnd(a) - b.offset) < 0.03
    const contiguous = Math.abs(cameraSourceStart(a) + a.duration - cameraSourceStart(b)) < 0.03
    const sameFile = a.url === b.url && a.personId === b.personId
    const sameKind = cameraKind(a) === cameraKind(b) && cameraLayer(a) === cameraLayer(b)
    const noMotion = clipKeyframes(a).length === 0 && clipKeyframes(b).length === 0
    const near = sessionTime >= a.offset && sessionTime <= cameraClipEnd(b)
    if (touching && contiguous && sameFile && sameKind && noMotion && near && Boolean(a.muted) === Boolean(b.muted)) {
      const merged: CameraClip = { ...a, duration: cameraClipEnd(b) - a.offset }
      return withCameraClips(
        clips,
        clips.filter((c) => c.id !== a.id && c.id !== b.id).concat(merged),
      )
    }
  }
  return clips
}

export function setCameraFades(clips: CameraClip[], clipId: string, fadeIn: number, fadeOut: number): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            fadeIn: Math.max(0, Math.min(c.duration / 2, fadeIn)),
            fadeOut: Math.max(0, Math.min(c.duration / 2, fadeOut)),
          }
        : c,
    ),
  )
}

export function setCameraFilter(clips: CameraClip[], clipId: string, filter: CameraFilter | undefined): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => (c.id === clipId ? { ...c, filter } : c)),
  )
}

/** Overlap the next same-lane clip and fade — Kdenlive / MLT dissolve. Picture only. */
export function dissolveCameraPair(clips: CameraClip[], clipId: string, seconds = 0.5): CameraClip[] {
  const list = withCameraClips(clips, clips)
  const hit = list.find((c) => c.id === clipId)
  if (!hit) return clips
  const ordered = list
    .filter(
      (c) =>
        c.personId === hit.personId &&
        cameraKind(c) === cameraKind(hit) &&
        cameraLayer(c) === cameraLayer(hit) &&
        !c.muted,
    )
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
  const i = ordered.findIndex((c) => c.id === clipId)
  const a = ordered[i]
  const b = ordered[i + 1]
  if (!a || !b) return clips
  const overlap = Math.min(Math.max(seconds, MIN_CLIP), a.duration / 3, b.duration / 3)
  if (overlap < MIN_CLIP) return clips
  const nextOffset = Math.max(0, cameraClipEnd(a) - overlap)
  return withCameraClips(
    clips,
    clips.map((c) => {
      if (c.id === a.id) return { ...c, fadeOut: overlap }
      if (c.id === b.id) return { ...c, offset: nextOffset, fadeIn: overlap }
      return c
    }),
  )
}

/**
 * Detect a rendered dissolve between adjacent same-lane clips: two clips of the
 * same person/kind/layer whose timeline seats overlap AND whose facing edges both
 * carry a fade (as `dissolveCameraPair` writes). Returns the overlap band in
 * session time so the lane can draw a labeled crossfade region. The compositor
 * already renders this as a true crossfade via per-clip opacity — this is purely
 * a read for visualization, never a mutation.
 */
export function cameraDissolveSpans(
  clips: CameraClip[],
): { start: number; end: number; seconds: number; leftId: string; rightId: string }[] {
  const spans: { start: number; end: number; seconds: number; leftId: string; rightId: string }[] = []
  const ordered = withCameraClips(clips, clips)
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]
      if (
        a.personId !== b.personId ||
        cameraKind(a) !== cameraKind(b) ||
        cameraLayer(a) !== cameraLayer(b) ||
        cameraKind(a) !== 'camera'
      )
        continue
      const overlap = cameraClipEnd(a) - b.offset
      if (overlap > MIN_CLIP && (a.fadeOut || 0) > 0.01 && (b.fadeIn || 0) > 0.01) {
        spans.push({ start: b.offset, end: cameraClipEnd(a), seconds: overlap, leftId: a.id, rightId: b.id })
      }
      break
    }
  }
  return spans
}

/** True when this clip dissolves into (or from) an adjacent same-lane clip. */
export function clipHasDissolve(clips: CameraClip[], clipId: string): boolean {
  return cameraDissolveSpans(clips).some((s) => s.leftId === clipId || s.rightId === clipId)
}

/** Undo a dissolve: pull the right clip back to abut the left and clear the facing fades. */
export function clearCameraDissolve(clips: CameraClip[], clipId: string): CameraClip[] {
  const span = cameraDissolveSpans(clips).find((s) => s.leftId === clipId || s.rightId === clipId)
  if (!span) return clips
  const left = clips.find((c) => c.id === span.leftId)
  if (!left) return clips
  return withCameraClips(
    clips,
    clips.map((c) => {
      if (c.id === span.leftId) return { ...c, fadeOut: 0 }
      if (c.id === span.rightId) return { ...c, offset: cameraClipEnd(left), fadeIn: 0 }
      return c
    }),
  )
}

const MAX_KEYFRAMES = 4

export function setCameraKeyframes(clips: CameraClip[], clipId: string, keyframes: PictureKeyframe[]): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            keyframes: normalizeKeyframes(keyframes.slice(0, MAX_KEYFRAMES)),
          }
        : c,
    ),
  )
}

export function seedCameraKeyframes(clips: CameraClip[], clipId: string): CameraClip[] {
  const hit = clips.find((c) => c.id === clipId)
  if (!hit || clipKeyframes(hit).length > 0) return clips
  return setCameraKeyframes(clips, clipId, [
    { at: 0, opacity: 1, x: 0, y: 0 },
    { at: hit.duration, opacity: 1, x: 0, y: 0 },
  ])
}

export function addKeyframeAt(clips: CameraClip[], clipId: string, sessionTime: number): CameraClip[] {
  const hit = clips.find((c) => c.id === clipId)
  if (!hit) return clips
  const at = Math.max(0, Math.min(hit.duration, sessionTime - hit.offset))
  const existing = clipKeyframes(hit)
  if (existing.some((k) => Math.abs(k.at - at) < 0.04)) return clips
  if (existing.length >= MAX_KEYFRAMES) return clips
  const current = evalKeyframes(hit, sessionTime)
  return setCameraKeyframes(clips, clipId, [...existing, { at, opacity: current.opacity, x: current.x, y: current.y }])
}

export function updateKeyframe(
  clips: CameraClip[],
  clipId: string,
  index: number,
  patch: Partial<PictureKeyframe>,
): CameraClip[] {
  const hit = clips.find((c) => c.id === clipId)
  if (!hit) return clips
  const next = clipKeyframes(hit).map((k, i) => (i === index ? { ...k, ...patch } : k))
  return setCameraKeyframes(clips, clipId, next)
}

export function removeKeyframe(clips: CameraClip[], clipId: string, index: number): CameraClip[] {
  const hit = clips.find((c) => c.id === clipId)
  if (!hit) return clips
  return setCameraKeyframes(
    clips,
    clipId,
    clipKeyframes(hit).filter((_, i) => i !== index),
  )
}

export function setStingerStyle(clips: CameraClip[], clipId: string, style: StingerStyle): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => (c.id === clipId && cameraKind(c) === 'stinger' ? { ...c, stingerStyle: style } : c)),
  )
}
