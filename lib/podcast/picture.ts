/** Local canvas A-roll / Host+Guest PIP. Does not write episode.audio_url or the RSS mix. */

import type { CameraClip } from '@/lib/podcast/camera'

export type PictureMode = 'a-roll' | 'pip'

export type PictureRenderResult = {
  blob: Blob
  /** True only for the MediaRecorder fallback — wall-clock 1×. */
  realtime: boolean
}

const WIDTH = 1280
const HEIGHT = 720
const FPS = 30
const FRAME = 1 / FPS

type FramePainter = {
  at: (sessionTime: number) => Promise<PaintSource | null>
  close: () => void
}

type PaintSource =
  | HTMLVideoElement
  | {
      displayWidth: number
      displayHeight: number
      timestamp: number
      duration: number
      draw: (
        context: CanvasRenderingContext2D,
        dx: number,
        dy: number,
        dWidth?: number,
        dHeight?: number,
      ) => void
      drawWithFit?: (
        context: CanvasRenderingContext2D,
        options: { fit: 'fill' | 'contain' | 'cover' },
      ) => void
      close?: () => void
    }

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

function seekVideo(el: HTMLVideoElement, time: number) {
  const target = Math.max(0, time)
  if (Math.abs(el.currentTime - target) < FRAME * 0.6) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      el.removeEventListener('seeked', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, 280)
    el.addEventListener('seeked', finish, { once: true })
    el.currentTime = target
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

function paintCover(
  ctx: CanvasRenderingContext2D,
  source: PaintSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if ('drawWithFit' in source && source.drawWithFit && x === 0 && y === 0 && w === WIDTH && h === HEIGHT) {
    source.drawWithFit(ctx, { fit: 'cover' })
    return
  }
  if ('draw' in source && typeof source.draw === 'function' && 'displayWidth' in source) {
    const vw = source.displayWidth || w
    const vh = source.displayHeight || h
    const scale = Math.max(w / vw, h / vh)
    const dw = vw * scale
    const dh = vh * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    source.draw(ctx, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
    return
  }
  drawCover(ctx, source as HTMLVideoElement, x, y, w, h)
}

function clipActive(clip: CameraClip | null, t: number) {
  return Boolean(clip && t >= clip.offset && t <= clip.offset + clip.duration)
}

function sourceTime(clip: CameraClip, sessionTime: number) {
  return sessionTime - clip.offset + clip.trimStart
}

function yieldUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

async function openDecodedPainter(clip: CameraClip): Promise<FramePainter> {
  const blob = await fetch(clip.url).then((res) => {
    if (!res.ok) throw new Error('camera fetch failed')
    return res.blob()
  })
  const mb = await import('mediabunny')
  const input = new mb.Input({
    source: new mb.BlobSource(blob, { maxCacheSize: 32 * 1024 * 1024 }),
    formats: [mb.WEBM, mb.MP4, mb.MATROSKA],
  })
  const track = await input.getPrimaryVideoTrack()
  if (!track) {
    input.dispose()
    throw new Error('no video track')
  }
  const sink = new mb.VideoSampleSink(track)
  let held: PaintSource | null = null
  return {
    async at(sessionTime) {
      if (!clipActive(clip, sessionTime)) return null
      const t = sourceTime(clip, sessionTime)
      if (
        held &&
        'timestamp' in held &&
        t >= held.timestamp - 0.001 &&
        t < held.timestamp + Math.max(held.duration || FRAME, FRAME)
      ) {
        return held
      }
      if (held && 'close' in held) held.close?.()
      held = null
      const sample = await sink.getSample(Math.max(0, t))
      if (!sample) return null
      held = sample
      return sample
    },
    close() {
      if (held && 'close' in held) held.close?.()
      held = null
      input.dispose()
    },
  }
}

async function openSeekPainter(clip: CameraClip): Promise<FramePainter> {
  const el = await loadVideo(clip.url, clip.trimStart)
  return {
    async at(sessionTime) {
      if (!clipActive(clip, sessionTime)) return null
      await seekVideo(el, Math.max(0, sourceTime(clip, sessionTime)))
      return el
    },
    close() {
      el.pause()
      el.removeAttribute('src')
      el.load()
    },
  }
}

async function openPainter(clip: CameraClip | null): Promise<FramePainter | null> {
  if (!clip) return null
  try {
    return await openDecodedPainter(clip)
  } catch {
    return openSeekPainter(clip)
  }
}

function composeFrame(
  ctx: CanvasRenderingContext2D,
  mode: PictureMode,
  host: PaintSource | null,
  guest: PaintSource | null,
) {
  ctx.fillStyle = '#05070A'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  if (host) paintCover(ctx, host, 0, 0, WIDTH, HEIGHT)
  else if (guest && mode === 'a-roll') paintCover(ctx, guest, 0, 0, WIDTH, HEIGHT)
  if (mode === 'pip' && guest) {
    const pipW = Math.round(WIDTH * 0.28)
    const pipH = Math.round(HEIGHT * 0.28)
    const pad = 24
    ctx.fillStyle = '#0C141C'
    ctx.fillRect(WIDTH - pipW - pad - 4, HEIGHT - pipH - pad - 4, pipW + 8, pipH + 8)
    paintCover(ctx, guest, WIDTH - pipW - pad, HEIGHT - pipH - pad, pipW, pipH)
  }
}

async function pickEncodePlan() {
  const mb = await import('mediabunny')
  const video = await mb.getFirstEncodableVideoCodec(['vp8', 'vp9', 'av1'], {
    width: WIDTH,
    height: HEIGHT,
    frameRate: FPS,
    quality: mb.QUALITY_HIGH,
  })
  const opus = await mb.canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 })
  if (video && opus) {
    return {
      format: new mb.WebMOutputFormat(),
      video,
      audio: 'opus' as const,
      mime: 'video/webm',
      quality: mb.QUALITY_HIGH,
    }
  }
  const avc = await mb.canEncodeVideo('avc', { width: WIDTH, height: HEIGHT, frameRate: FPS })
  const aac = await mb.canEncodeAudio('aac', { numberOfChannels: 2 })
  if (avc && aac) {
    return {
      format: new mb.Mp4OutputFormat(),
      video: 'avc' as const,
      audio: 'aac' as const,
      mime: 'video/mp4',
      quality: mb.QUALITY_HIGH,
    }
  }
  return null
}

async function renderFastPicture(opts: {
  mode: PictureMode
  host: CameraClip | null
  guest: CameraClip | null
  audio: AudioBuffer
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}): Promise<Blob> {
  const mb = await import('mediabunny')
  const plan = await pickEncodePlan()
  if (!plan) throw new Error('This browser cannot encode a picture mix faster than realtime')

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const duration = Math.max(
    opts.audio.duration,
    opts.host ? opts.host.offset + opts.host.duration : 0,
    opts.guest ? opts.guest.offset + opts.guest.duration : 0,
    FRAME,
  )
  const frames = Math.max(1, Math.round(duration * FPS))

  const hostPainter = await openPainter(opts.host)
  const guestPainter =
    opts.mode === 'pip' && opts.guest && opts.guest !== opts.host ? await openPainter(opts.guest) : null

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: plan.format, target })
  const videoSource = new mb.CanvasSource(canvas, {
    codec: plan.video,
    quality: plan.quality,
    latencyMode: 'quality',
    keyFrameInterval: 2,
  })
  const audioSource = new mb.AudioBufferSource({
    codec: plan.audio,
    quality: plan.quality,
  })
  output.addVideoTrack(videoSource)
  output.addAudioTrack(audioSource)
  await output.start()
  await audioSource.add(opts.audio)
  audioSource.close()

  let finished = false
  try {
    for (let i = 0; i < frames; i++) {
      const t = i * FRAME
      const host = hostPainter ? await hostPainter.at(t) : null
      const guest = guestPainter ? await guestPainter.at(t) : null
      composeFrame(ctx, opts.mode, host, guest)
      await videoSource.add(t, FRAME, { keyFrame: i === 0 || i % (FPS * 2) === 0 })
      if (i % 12 === 0) {
        opts.onProgress?.(i / frames, { realtime: false })
        await yieldUi()
      }
    }
    videoSource.close()
    await output.finalize()
    finished = true
  } finally {
    hostPainter?.close()
    guestPainter?.close()
    if (!finished) {
      try {
        await output.cancel()
      } catch {
        /* encoder already dead */
      }
    }
  }

  const buffer = target.buffer
  if (!buffer || buffer.byteLength < 64) throw new Error('Picture encoder produced an empty file')
  return new Blob([buffer], { type: plan.mime })
}

async function renderRealtimePicture(opts: {
  mode: PictureMode
  host: CameraClip | null
  guest: CameraClip | null
  audio: AudioBuffer
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}): Promise<Blob> {
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
      const hostActive = hostEl && clipActive(opts.host, t)
      const guestActive = guestEl && clipActive(opts.guest, t)
      composeFrame(ctx, opts.mode, hostActive ? hostEl : null, guestActive ? guestEl : null)
      opts.onProgress?.(Math.min(1, t / duration), { realtime: true })
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

export async function renderPictureMix(opts: {
  mode: PictureMode
  host: CameraClip | null
  guest: CameraClip | null
  audio: AudioBuffer
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}): Promise<PictureRenderResult> {
  const lead = opts.mode === 'pip' ? opts.host || opts.guest : opts.host || opts.guest
  if (!lead) throw new Error('Need at least one camera file for a picture export')

  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      opts.onProgress?.(0, { realtime: false })
      const blob = await renderFastPicture(opts)
      return { blob, realtime: false }
    } catch {
      /* WebCodecs/mux failed — last resort is the old 1× capture */
    }
  }

  opts.onProgress?.(0, { realtime: true })
  return { blob: await renderRealtimePicture(opts), realtime: true }
}
