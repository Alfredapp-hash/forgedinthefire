/** Camera-lane edits. Same clock as audio; never rewrites the webm or PCM. */

import {
  cameraClipEnd,
  cameraKind,
  cameraLayer,
  cameraSourceStart,
  clipKeyframes,
  evalKeyframes,
  newCameraClipId,
  newProgramCutId,
  normalizeCameraClip,
  normalizeKeyframes,
  normalizeProgramCuts,
  type CameraClip,
  type CameraFilter,
  type PictureKeyframe,
  type ProgramCut,
  type ProgramScene,
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

export function splitCameraRange(clips: CameraClip[], start: number, end: number, personId?: string) {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < MIN_CLIP) return clips
  return splitCameraAt(splitCameraAt(clips, a, personId), b, personId)
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

export function removeCameraClip(clips: CameraClip[], clipId: string): CameraClip[] {
  return withCameraClips(
    clips,
    clips.filter((c) => c.id !== clipId),
  )
}

/** Shallow patch for label / sublabel / overlayFit etc. — goes through normalize. */
export function patchCameraClip(clips: CameraClip[], clipId: string, patch: Partial<CameraClip>): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => (c.id === clipId ? { ...c, ...patch, id: c.id } : c)),
  )
}

/** Set a graphic (title / stinger) clip length; camera and B-roll stay bounded by their file. */
export function setGraphicDuration(clips: CameraClip[], clipId: string, seconds: number): CameraClip[] {
  return withCameraClips(
    clips,
    clips.map((c) => {
      if (c.id !== clipId) return c
      const kind = cameraKind(c)
      if (kind !== 'title' && kind !== 'stinger') return c
      const duration = Math.max(0.2, Math.min(600, seconds))
      return {
        ...c,
        duration,
        sourceDuration: duration,
        fadeIn: Math.min(c.fadeIn || 0, duration / 2),
        fadeOut: Math.min(c.fadeOut || 0, duration / 2),
      }
    }),
  )
}

/* ---------------------------------------------------------------------------------------------
 * Program scene cuts (Host / Guest / PIP). One list on the session clock, like an OBS Studio-mode
 * switch log. Picture export and the Program monitor both read it via programStateAt().
 * ------------------------------------------------------------------------------------------- */

/** A cut to the scene already on air does nothing — drop it so the list stays readable. */
export function dropRedundantCuts(cuts: ProgramCut[], fallback: ProgramScene = 'host'): ProgramCut[] {
  const out: ProgramCut[] = []
  let current = fallback
  for (const cut of normalizeProgramCuts(cuts)) {
    if (cut.scene === current) continue
    out.push(cut)
    current = cut.scene
  }
  return out
}

/** Add (or replace within one frame) a scene cut at `at`. */
export function addProgramCut(
  cuts: ProgramCut[],
  at: number,
  scene: ProgramScene,
  fade = 0,
  fallback: ProgramScene = 'host',
): ProgramCut[] {
  const t = Math.max(0, at)
  const kept = cuts.filter((c) => Math.abs(c.at - t) >= 1 / 60)
  return dropRedundantCuts([...kept, { id: newProgramCutId(), at: t, scene, fade }], fallback)
}

export function removeProgramCut(cuts: ProgramCut[], cutId: string, fallback: ProgramScene = 'host') {
  return dropRedundantCuts(
    cuts.filter((c) => c.id !== cutId),
    fallback,
  )
}

export function moveProgramCut(cuts: ProgramCut[], cutId: string, at: number, fallback: ProgramScene = 'host') {
  return dropRedundantCuts(
    cuts.map((c) => (c.id === cutId ? { ...c, at: Math.max(0, at) } : c)),
    fallback,
  )
}

export function setProgramCutFade(cuts: ProgramCut[], cutId: string, fade: number) {
  return normalizeProgramCuts(cuts.map((c) => (c.id === cutId ? { ...c, fade: Math.max(0, fade) } : c)))
}

export function setProgramCutScene(
  cuts: ProgramCut[],
  cutId: string,
  scene: ProgramScene,
  fallback: ProgramScene = 'host',
) {
  return dropRedundantCuts(
    cuts.map((c) => (c.id === cutId ? { ...c, scene } : c)),
    fallback,
  )
}

/** Ripple-delete on the picture clock also pulls later scene cuts. */
export function rippleProgramCuts(cuts: ProgramCut[], start: number, end: number, fallback: ProgramScene = 'host') {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  const gap = b - a
  if (gap < MIN_CLIP) return cuts
  return dropRedundantCuts(
    cuts.filter((c) => c.at < a || c.at >= b).map((c) => (c.at >= b ? { ...c, at: Math.max(0, c.at - gap) } : c)),
    fallback,
  )
}
