/** Local camera preview + punch-clock video file. Video stays off the audio mix. */

export const CAMERA_MAX_WIDTH = 1280
export const CAMERA_MAX_HEIGHT = 720
export const CAMERA_MAX_FPS = 30
/** Rough VP8 720p30 size — warn before arming Cam. */
export const CAMERA_MB_PER_MIN = 20

export function estimateCameraBytes(durationSec: number) {
  return Math.max(0, Math.round((durationSec / 60) * CAMERA_MB_PER_MIN * 1024 * 1024))
}

export const CAMERA_ARM_WARNING =
  `Camera files stay on this computer (~${CAMERA_MB_PER_MIN} MB per minute at 720p/30). They are not written to the RSS mix. A 40-minute take can be ~0.8 GB.`

export type CameraKind = 'camera' | 'title' | 'broll' | 'stinger'

export type CameraLayer = 'base' | 'overlay'

export type StingerStyle = 'black' | 'title'

/** Shotcut-style: a couple of linear points on the clip (seconds from in). */
export type PictureKeyframe = {
  at: number
  opacity: number
  /** Frame offset, −0.5 … 0.5 of program width. */
  x: number
  /** Frame offset, −0.5 … 0.5 of program height. */
  y: number
}

/** Shotcut-style color insert. 0 = bypass; ~-1..1. */
export type CameraFilter = {
  brightness: number
  contrast: number
  saturation: number
}

export const DEFAULT_CAMERA_FILTER: CameraFilter = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
}

export type CameraClip = {
  id: string
  personId: string
  url: string
  mime: string
  /** Session time where this clip sits on the shared punch clock. */
  offset: number
  /** Timeline length (not rewritten into the file). */
  duration: number
  /** Capture preroll skip. Kept aligned with sourceStart after edits. */
  trimStart: number
  /** Seconds into the source file (Shotcut / OpenTimelineIO media in). */
  sourceStart: number
  /** Full source file duration, for slip / trim-out bounds. */
  sourceDuration: number
  muted?: boolean
  /** Born-together group with audio clips from the same punch. */
  syncGroup?: string
  bytes: number
  /** Default camera. Title = Kdenlive title clip. B-roll = overlay movie. Stinger = black/title flash. */
  kind?: CameraKind
  /** Overlay composites on the program frame (Blender VSE / Kdenlive track). */
  layer?: CameraLayer
  /** Lower-third name (title clips) or stinger card. */
  label?: string
  /** Lower-third role / line two. */
  sublabel?: string
  /** Opacity ramp in (Kdenlive / MLT dissolve). */
  fadeIn?: number
  /** Opacity ramp out. */
  fadeOut?: number
  filter?: CameraFilter
  /** B-roll cover replaces A-roll; pip keeps A-roll. */
  overlayFit?: 'cover' | 'pip'
  /** OBS-style stinger: black flash or title card. */
  stingerStyle?: StingerStyle
  /** Opacity / position points — interpolated in picture.ts compose. */
  keyframes?: PictureKeyframe[]
}

export function newSyncGroupId() {
  return `av_${Math.random().toString(36).slice(2, 10)}`
}

/** Backfill clips saved before sourceStart existed. */
export function normalizeCameraClip(clip: CameraClip): CameraClip {
  const sourceStart = Number.isFinite(clip.sourceStart) ? clip.sourceStart : clip.trimStart || 0
  const sourceDuration =
    Number.isFinite(clip.sourceDuration) && clip.sourceDuration > 0
      ? clip.sourceDuration
      : Math.max(sourceStart + Math.max(0, clip.duration), 0.1)
  const kind: CameraKind =
    clip.kind === 'title' || clip.kind === 'broll' || clip.kind === 'stinger' ? clip.kind : 'camera'
  const layer: CameraLayer = clip.layer === 'overlay' || kind !== 'camera' ? 'overlay' : 'base'
  return {
    ...clip,
    kind,
    layer,
    sourceStart,
    trimStart: sourceStart,
    sourceDuration,
    muted: Boolean(clip.muted),
    fadeIn: Math.max(0, clip.fadeIn || 0),
    fadeOut: Math.max(0, clip.fadeOut || 0),
    overlayFit: clip.overlayFit === 'pip' ? 'pip' : kind === 'broll' ? 'cover' : clip.overlayFit,
    stingerStyle: kind === 'stinger' ? (clip.stingerStyle === 'title' ? 'title' : 'black') : clip.stingerStyle,
    keyframes: normalizeKeyframes(clip.keyframes),
    filter: clip.filter
      ? {
          brightness: clip.filter.brightness || 0,
          contrast: clip.filter.contrast || 0,
          saturation: clip.filter.saturation || 0,
        }
      : undefined,
  }
}

export function cameraKind(clip: CameraClip): CameraKind {
  return clip.kind === 'title' || clip.kind === 'broll' || clip.kind === 'stinger' ? clip.kind : 'camera'
}

/** Title / stinger — canvas graphic, no camera file. */
export function isGraphicClip(clip: CameraClip) {
  const kind = cameraKind(clip)
  return kind === 'title' || kind === 'stinger'
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function clampAxis(n: number) {
  return Math.max(-0.5, Math.min(0.5, n))
}

export function normalizeKeyframes(raw?: PictureKeyframe[] | null): PictureKeyframe[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw
    .map((k) => ({
      at: Math.max(0, Number.isFinite(k.at) ? k.at : 0),
      opacity: clamp01(Number.isFinite(k.opacity) ? k.opacity : 1),
      x: clampAxis(Number.isFinite(k.x) ? k.x : 0),
      y: clampAxis(Number.isFinite(k.y) ? k.y : 0),
    }))
    .sort((a, b) => a.at - b.at)
    .slice(0, 4)
}

export function clipKeyframes(clip: CameraClip): PictureKeyframe[] {
  return normalizeKeyframes(clip.keyframes) || []
}

export function evalKeyframes(clip: CameraClip, sessionTime: number): PictureKeyframe {
  const t = sessionTime - clip.offset
  const kfs = clipKeyframes(clip)
  if (kfs.length === 0) return { at: t, opacity: 1, x: 0, y: 0 }
  if (kfs.length === 1 || t <= kfs[0].at) return { ...kfs[0], at: t }
  const last = kfs[kfs.length - 1]
  if (t >= last.at) return { ...last, at: t }
  let i = 1
  while (i < kfs.length && kfs[i].at < t) i++
  const a = kfs[i - 1]
  const b = kfs[i]
  const u = (t - a.at) / Math.max(0.0001, b.at - a.at)
  return {
    at: t,
    opacity: a.opacity + (b.opacity - a.opacity) * u,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  }
}

export function clipTranslate(clip: CameraClip, sessionTime: number) {
  const kf = evalKeyframes(clip, sessionTime)
  return { x: kf.x, y: kf.y }
}

export function cameraLayer(clip: CameraClip): CameraLayer {
  if (clip.layer === 'overlay' || cameraKind(clip) !== 'camera') return 'overlay'
  return 'base'
}

/** Punched A-roll only — titles/B-roll stay off Linked/Unlinked drift. */
export function isLinkedPicture(clip: CameraClip) {
  return cameraKind(clip) === 'camera' && cameraLayer(clip) === 'base'
}

export function filterActive(filter?: CameraFilter | null) {
  if (!filter) return false
  return Math.abs(filter.brightness) > 0.001 || Math.abs(filter.contrast) > 0.001 || Math.abs(filter.saturation) > 0.001
}

export function cssCameraFilter(filter?: CameraFilter | null) {
  if (!filterActive(filter) || !filter) return 'none'
  return `brightness(${1 + filter.brightness}) contrast(${1 + filter.contrast}) saturate(${1 + filter.saturation})`
}

/** Opacity at session time (MLT / Kdenlive fade). */
export function clipOpacity(clip: CameraClip, sessionTime: number) {
  if (clip.muted) return 0
  const t = sessionTime - clip.offset
  if (t < 0 || t >= clip.duration) return 0
  const fadeIn = clip.fadeIn || 0
  const fadeOut = clip.fadeOut || 0
  let alpha = 1
  if (fadeIn > 0.0005 && t < fadeIn) alpha = Math.max(0, Math.min(1, t / fadeIn))
  if (fadeOut > 0.0005 && t > clip.duration - fadeOut) {
    alpha = Math.min(alpha, Math.max(0, Math.min(1, (clip.duration - t) / fadeOut)))
  }
  return alpha * evalKeyframes(clip, sessionTime).opacity
}

export function cameraSourceStart(clip: CameraClip) {
  return normalizeCameraClip(clip).sourceStart
}

export function cameraClipEnd(clip: CameraClip) {
  return clip.offset + clip.duration
}

export function camerasAtTime(clips: CameraClip[], sessionTime: number, personId?: string) {
  return clips.filter(
    (c) =>
      (!personId || c.personId === personId) &&
      !c.muted &&
      sessionTime >= c.offset - 0.0001 &&
      sessionTime < cameraClipEnd(c) - 0.0001,
  )
}

export function cameraAtTime(clips: CameraClip[], sessionTime: number, personId?: string) {
  return camerasAtTime(clips, sessionTime, personId)[0] || null
}

export function pictureEnd(clips: CameraClip[]) {
  return clips.reduce((max, clip) => Math.max(max, cameraClipEnd(clip)), 0)
}

/** File time to show for this session time (ffmpeg -ss style). */
export function cameraSourceTime(clip: CameraClip, sessionTime: number) {
  return sessionTime - clip.offset + cameraSourceStart(clip)
}

export type CameraCapture = {
  key: string
  recorder: MediaRecorder
  done: Promise<Blob>
}

export function videoInputConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    width: { ideal: CAMERA_MAX_WIDTH, max: CAMERA_MAX_WIDTH },
    height: { ideal: CAMERA_MAX_HEIGHT, max: CAMERA_MAX_HEIGHT },
    frameRate: { ideal: CAMERA_MAX_FPS, max: CAMERA_MAX_FPS },
    aspectRatio: { ideal: 16 / 9 },
  }
}

export async function openCameraStream(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a camera')
  }
  if (!window.isSecureContext) {
    throw new Error('Camera needs a secure context (localhost or HTTPS)')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: videoInputConstraints(deviceId),
  })
  const live = stream.getVideoTracks().some((t) => t.readyState === 'live')
  if (!live) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('Camera track ended as soon as it opened')
  }
  return stream
}

export function cameraRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ]
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export function startCameraCapture(key: string, stream: MediaStream): CameraCapture {
  const videoOnly = new MediaStream(stream.getVideoTracks())
  const mime = cameraRecorderMime()
  const recorder = mime ? new MediaRecorder(videoOnly, { mimeType: mime }) : new MediaRecorder(videoOnly)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }))
    }
    recorder.onerror = () => reject(new Error('Camera recorder failed'))
  })
  recorder.start(250)
  return { key, recorder, done }
}

export function newCameraClipId() {
  return `cam_${Math.random().toString(36).slice(2, 10)}`
}

export function newTitleClip(opts: {
  personId: string
  offset: number
  label: string
  sublabel?: string
  duration?: number
}): CameraClip {
  const duration = Math.max(0.4, opts.duration ?? 5)
  return normalizeCameraClip({
    id: newCameraClipId(),
    personId: opts.personId,
    url: '',
    mime: 'text/plain',
    offset: Math.max(0, opts.offset),
    duration,
    trimStart: 0,
    sourceStart: 0,
    sourceDuration: duration,
    bytes: 0,
    kind: 'title',
    layer: 'overlay',
    label: opts.label.trim() || 'Title',
    sublabel: opts.sublabel?.trim() || '',
    fadeIn: 0.25,
    fadeOut: 0.35,
  })
}

export function newStingerClip(opts: {
  personId: string
  offset: number
  style?: StingerStyle
  label?: string
  sublabel?: string
  duration?: number
}): CameraClip {
  const duration = Math.max(0.2, opts.duration ?? 0.45)
  const style: StingerStyle = opts.style === 'title' ? 'title' : 'black'
  return normalizeCameraClip({
    id: newCameraClipId(),
    personId: opts.personId,
    url: '',
    mime: 'text/plain',
    offset: Math.max(0, opts.offset),
    duration,
    trimStart: 0,
    sourceStart: 0,
    sourceDuration: duration,
    bytes: 0,
    kind: 'stinger',
    layer: 'overlay',
    stingerStyle: style,
    label: (opts.label || (style === 'title' ? 'Title' : '')).trim(),
    sublabel: opts.sublabel?.trim() || '',
    fadeIn: 0.05,
    fadeOut: 0.12,
  })
}

export function newBrollClip(opts: {
  personId: string
  url: string
  mime: string
  offset: number
  duration: number
  bytes: number
  overlayFit?: 'cover' | 'pip'
}): CameraClip {
  const duration = Math.max(0.1, opts.duration)
  return normalizeCameraClip({
    id: newCameraClipId(),
    personId: opts.personId,
    url: opts.url,
    mime: opts.mime || 'video/webm',
    offset: Math.max(0, opts.offset),
    duration,
    trimStart: 0,
    sourceStart: 0,
    sourceDuration: duration,
    bytes: opts.bytes,
    kind: 'broll',
    layer: 'overlay',
    overlayFit: opts.overlayFit || 'cover',
    fadeIn: 0.2,
    fadeOut: 0.2,
  })
}

export function measureVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video')
    el.preload = 'metadata'
    const finish = (value: number) => {
      el.removeAttribute('src')
      el.load()
      resolve(value)
    }
    el.onloadedmetadata = () => {
      const d = el.duration
      finish(Number.isFinite(d) && d > 0 ? d : 0)
    }
    el.onerror = () => finish(0)
    el.src = url
  })
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function isQuotaError(err: unknown) {
  if (err instanceof DOMException) {
    return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014
  }
  return err instanceof Error && /quota|storage/i.test(err.message)
}

/** Remaining IndexedDB/origin space, if the browser will say. */
export async function cameraStorageHint(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const { usage, quota } = await navigator.storage.estimate()
    if (!quota) return null
    const left = Math.max(0, quota - (usage || 0))
    return `${formatBytes(left)} free of ${formatBytes(quota)} in this browser`
  } catch {
    return null
  }
}

export function streamHasVideo(stream: MediaStream | null | undefined) {
  return Boolean(stream?.getVideoTracks().some((t) => t.readyState !== 'ended'))
}

export function streamHasLiveVideo(stream: MediaStream | null | undefined) {
  return Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted))
}
