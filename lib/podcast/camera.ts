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

export type CameraClip = {
  id: string
  personId: string
  url: string
  mime: string
  /** Session time where the take starts (punch). */
  offset: number
  /** Playable length after skipping preroll. */
  duration: number
  /** Seconds to skip at the start of the file (same preroll as audio). */
  trimStart: number
  bytes: number
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
