/** Local canvas A-roll / Host+Guest PIP. Does not write episode.audio_url or the RSS mix. */

import type { CameraClip } from '@/lib/podcast/camera'

export type PictureMode = 'a-roll' | 'pip'

const WIDTH = 1280
const HEIGHT = 720
const FPS = 30

function loadVideo(url: string, startSec: number) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const el = document.createElement('video')
    el.preload = 'auto'
    el.muted = true
    el.playsInline = true
    el.onloadeddata = () => {
      if (startSec > 0.04) el.currentTime = startSec
      resolve(el)
    }
    el.onerror = () => reject(new Error('Could not load a camera file for picture export'))
    el.src = url
  })
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const vw = video.videoWidth || w
  const vh = video.videoHeight || h
  const scale = Math.max(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export async function renderPictureMix(opts: {
  mode: PictureMode
  host: CameraClip | null
  guest: CameraClip | null
  audio: AudioBuffer
  onProgress?: (ratio: number) => void
}): Promise<Blob> {
  const lead = opts.mode === 'pip' ? opts.host || opts.guest : opts.host || opts.guest
  if (!lead) throw new Error('Need at least one camera file for a picture export')
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser cannot record a canvas picture mix')
  }

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const hostEl = opts.host ? await loadVideo(opts.host.url, opts.host.trimStart) : null
  const guestEl = opts.guest && opts.guest !== opts.host ? await loadVideo(opts.guest.url, opts.guest.trimStart) : null

  const duration = Math.max(
    opts.audio.duration,
    opts.host ? opts.host.offset + opts.host.duration : 0,
    opts.guest ? opts.guest.offset + opts.guest.duration : 0,
    0.5,
  )

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  const source = audioCtx.createBufferSource()
  source.buffer = opts.audio
  source.connect(dest)

  const frames = canvas.captureStream(FPS)
  dest.stream.getAudioTracks().forEach((track) => frames.addTrack(track))
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  )
  const recorder = mime ? new MediaRecorder(frames, { mimeType: mime }) : new MediaRecorder(frames)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }))
    recorder.onerror = () => reject(new Error('Picture recorder failed'))
  })

  const started = audioCtx.currentTime
  recorder.start(250)
  source.start()
  if (hostEl) void hostEl.play().catch(() => {})
  if (guestEl) void guestEl.play().catch(() => {})

  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = audioCtx.currentTime - started
      ctx.fillStyle = '#05070A'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      const hostActive =
        hostEl && opts.host && t >= opts.host.offset && t <= opts.host.offset + opts.host.duration
      const guestActive =
        guestEl && opts.guest && t >= opts.guest.offset && t <= opts.guest.offset + opts.guest.duration

      if (hostActive && hostEl) drawCover(ctx, hostEl, 0, 0, WIDTH, HEIGHT)
      else if (guestActive && guestEl && opts.mode === 'a-roll') drawCover(ctx, guestEl, 0, 0, WIDTH, HEIGHT)

      if (opts.mode === 'pip' && guestActive && guestEl) {
        const pipW = Math.round(WIDTH * 0.28)
        const pipH = Math.round(HEIGHT * 0.28)
        const pad = 24
        ctx.fillStyle = '#0C141C'
        ctx.fillRect(WIDTH - pipW - pad - 4, HEIGHT - pipH - pad - 4, pipW + 8, pipH + 8)
        drawCover(ctx, guestEl, WIDTH - pipW - pad, HEIGHT - pipH - pad, pipW, pipH)
      } else if (opts.mode === 'a-roll' && !hostActive && guestActive && guestEl) {
        drawCover(ctx, guestEl, 0, 0, WIDTH, HEIGHT)
      }

      opts.onProgress?.(Math.min(1, t / duration))
      if (t >= duration) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  hostEl?.pause()
  guestEl?.pause()
  if (recorder.state !== 'inactive') recorder.stop()
  await audioCtx.close().catch(() => {})
  hostEl?.removeAttribute('src')
  guestEl?.removeAttribute('src')
  return done
}
