/** Local canvas A-roll / Host+Guest PIP. Does not write episode.audio_url or the RSS mix. */

import {
  cameraClipEnd,
  cameraKind,
  cameraLayer,
  camerasAtTime,
  cameraSourceTime,
  clipOpacity,
  clipTranslate,
  cssCameraFilter,
  isGraphicClip,
  normalizeCameraClip,
  type CameraClip,
} from '@/lib/podcast/camera'

export type PictureMode = 'a-roll' | 'pip'

/** One-click Program layout — not an OBS scene graph. */
export type PictureScene = 'host' | 'guest' | 'pip'

export function sceneFromPictureMode(mode: PictureMode): PictureScene {
  return mode === 'pip' ? 'pip' : 'host'
}

export type PictureRenderResult = {
  blob: Blob
  /** True only for the MediaRecorder fallback — wall-clock 1×. */
  realtime: boolean
}

export const PICTURE_WIDTH = 1280
export const PICTURE_HEIGHT = 720
const WIDTH = PICTURE_WIDTH
const HEIGHT = PICTURE_HEIGHT
const FPS = 30
const FRAME = 1 / FPS

export type TimedPaint = {
  clip: CameraClip
  source: PaintSource | null
  opacity: number
  x: number
  y: number
}

type FramePainter = {
  at: (sessionTime: number) => Promise<TimedPaint[]>
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

function asClipList(clips: CameraClip | CameraClip[] | null | undefined): CameraClip[] {
  if (!clips) return []
  return (Array.isArray(clips) ? clips : [clips]).map(normalizeCameraClip)
}

function pictureLayers(host: CameraClip[], guest: CameraClip[]) {
  const seen = new Set<string>()
  const overlays: CameraClip[] = []
  for (const clip of [...host, ...guest]) {
    if (cameraLayer(clip) !== 'overlay' || seen.has(clip.id)) continue
    seen.add(clip.id)
    overlays.push(clip)
  }
  return {
    host: host.filter((c) => cameraLayer(c) === 'base'),
    guest: guest.filter((c) => cameraLayer(c) === 'base'),
    overlays,
  }
}

function timedFromVideos(
  clips: CameraClip[],
  els: Map<string, HTMLVideoElement>,
  t: number,
): TimedPaint[] {
  const painted: TimedPaint[] = []
  for (const clip of camerasAtTime(clips, t)) {
    const opacity = clipOpacity(clip, t)
    if (opacity <= 0) continue
    const { x, y } = clipTranslate(clip, t)
    if (isGraphicClip(clip) || !clip.url) {
      painted.push({ clip, source: null, opacity, x, y })
      continue
    }
    const el = els.get(clip.url)
    if (el) void seekVideo(el, sourceTime(clip, t))
    painted.push({ clip, source: el || null, opacity, x, y })
  }
  return painted
}

function sourceTime(clip: CameraClip, sessionTime: number) {
  return cameraSourceTime(clip, sessionTime)
}

function pictureSpan(audioDur: number, host: CameraClip[], guest: CameraClip[]) {
  return Math.max(
    audioDur,
    ...host.map((c) => cameraClipEnd(c)),
    ...guest.map((c) => cameraClipEnd(c)),
    0.5,
  )
}

function yieldUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

type SourcePainter = {
  atSource: (sourceSec: number) => Promise<PaintSource | null>
  close: () => void
}

async function openDecodedSource(url: string): Promise<SourcePainter> {
  const blob = await fetch(url).then((res) => {
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
    async atSource(sourceSec) {
      const t = Math.max(0, sourceSec)
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
      const sample = await sink.getSample(t)
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

async function openSeekSource(url: string, startSec: number): Promise<SourcePainter> {
  const el = await loadVideo(url, startSec)
  return {
    async atSource(sourceSec) {
      await seekVideo(el, Math.max(0, sourceSec))
      return el
    },
    close() {
      el.pause()
      el.removeAttribute('src')
      el.load()
    },
  }
}

async function openSourcePainter(url: string, startSec: number): Promise<SourcePainter> {
  try {
    return await openDecodedSource(url)
  } catch {
    return openSeekSource(url, startSec)
  }
}

async function openClipSetPainter(clips: CameraClip[]): Promise<FramePainter | null> {
  const live = clips.filter((c) => c.url || isGraphicClip(c))
  if (live.length === 0) return null
  const urls = [...new Set(live.map((c) => c.url).filter(Boolean))]
  const sources = new Map<string, SourcePainter>()
  for (const url of urls) {
    const first = live.find((c) => c.url === url)!
    sources.set(url, await openSourcePainter(url, cameraSourceTime(first, first.offset)))
  }
  return {
    async at(sessionTime) {
      const hits = camerasAtTime(live, sessionTime)
      const painted: TimedPaint[] = []
      for (const clip of hits) {
        const opacity = clipOpacity(clip, sessionTime)
        if (opacity <= 0) continue
        const { x, y } = clipTranslate(clip, sessionTime)
        if (isGraphicClip(clip) || !clip.url) {
          painted.push({ clip, source: null, opacity, x, y })
          continue
        }
        const painter = sources.get(clip.url)
        if (!painter) continue
        painted.push({
          clip,
          source: await painter.atSource(sourceTime(clip, sessionTime)),
          opacity,
          x,
          y,
        })
      }
      return painted
    },
    close() {
      sources.forEach((p) => p.close())
      sources.clear()
    },
  }
}

function paintTitle(ctx: CanvasRenderingContext2D, clip: CameraClip, w: number, h: number) {
  const name = (clip.label || 'Title').slice(0, 80)
  const sub = (clip.sublabel || '').slice(0, 80)
  const pad = Math.round(h * 0.05)
  const barH = sub ? Math.round(h * 0.122) : Math.round(h * 0.08)
  const barW = Math.min(Math.round(w * 0.55), 640)
  const y = h - pad - barH
  ctx.fillStyle = 'rgba(5, 7, 10, 0.78)'
  ctx.fillRect(pad, y, barW, barH)
  ctx.fillStyle = '#53D6FF'
  ctx.fillRect(pad, y, 4, barH)
  ctx.fillStyle = '#F6FAFC'
  ctx.font = `600 ${Math.round(h * 0.039)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(name, pad + 18, y + (sub ? Math.round(barH * 0.42) : Math.round(barH * 0.66)), barW - 36)
  if (sub) {
    ctx.fillStyle = '#8DEBFF'
    ctx.font = `400 ${Math.round(h * 0.022)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(sub, pad + 18, y + Math.round(barH * 0.74), barW - 36)
  }
}

function paintStinger(ctx: CanvasRenderingContext2D, clip: CameraClip, w: number, h: number) {
  ctx.fillStyle = '#05070A'
  ctx.fillRect(0, 0, w, h)
  if ((clip.stingerStyle || 'black') !== 'title') return
  const name = (clip.label || 'Title').slice(0, 80)
  const sub = (clip.sublabel || '').slice(0, 80)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#F6FAFC'
  ctx.font = `700 ${Math.round(h * 0.078)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(name, w / 2, h / 2 - (sub ? Math.round(h * 0.02) : 0), Math.round(w * 0.82))
  if (sub) {
    ctx.fillStyle = '#8DEBFF'
    ctx.font = `400 ${Math.round(h * 0.03)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(sub, w / 2, h / 2 + Math.round(h * 0.05), Math.round(w * 0.82))
  }
  ctx.textAlign = 'left'
}

function paintTimed(
  ctx: CanvasRenderingContext2D,
  layer: TimedPaint,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity))
  ctx.filter = cssCameraFilter(layer.clip.filter)
  ctx.translate((layer.x || 0) * WIDTH, (layer.y || 0) * HEIGHT)
  const kind = cameraKind(layer.clip)
  if (kind === 'stinger') {
    paintStinger(ctx, layer.clip, WIDTH, HEIGHT)
  } else if (kind === 'title' || !layer.source) {
    if (kind === 'title') paintTitle(ctx, layer.clip, WIDTH, HEIGHT)
  } else {
    paintCover(ctx, layer.source, x, y, w, h)
  }
  ctx.restore()
}

function paintStack(ctx: CanvasRenderingContext2D, stack: TimedPaint[], x: number, y: number, w: number, h: number) {
  for (const layer of stack) {
    if (isGraphicClip(layer.clip)) continue
    paintTimed(ctx, layer, x, y, w, h)
  }
}

function overlayRank(clip: CameraClip) {
  const kind = cameraKind(clip)
  if (kind === 'stinger') return 2
  if (kind === 'title') return 1
  return 0
}

export function splitPictureStacks(layers: TimedPaint[]) {
  const base: TimedPaint[] = []
  const overlays: TimedPaint[] = []
  for (const layer of layers) {
    if (cameraLayer(layer.clip) === 'overlay' || cameraKind(layer.clip) !== 'camera') overlays.push(layer)
    else base.push(layer)
  }
  return { base, overlays }
}

function paintSceneLayout(
  ctx: CanvasRenderingContext2D,
  scene: PictureScene,
  host: TimedPaint[],
  guest: TimedPaint[],
) {
  if (scene === 'guest') {
    if (guest.length) paintStack(ctx, guest, 0, 0, WIDTH, HEIGHT)
    else if (host.length) paintStack(ctx, host, 0, 0, WIDTH, HEIGHT)
    return
  }
  if (host.length) paintStack(ctx, host, 0, 0, WIDTH, HEIGHT)
  else if (guest.length && scene === 'host') paintStack(ctx, guest, 0, 0, WIDTH, HEIGHT)
  if (scene === 'pip' && guest.length) {
    const pipW = Math.round(WIDTH * 0.28)
    const pipH = Math.round(HEIGHT * 0.28)
    const pad = 24
    ctx.fillStyle = '#0C141C'
    ctx.fillRect(WIDTH - pipW - pad - 4, HEIGHT - pipH - pad - 4, pipW + 8, pipH + 8)
    paintStack(ctx, guest, WIDTH - pipW - pad, HEIGHT - pipH - pad, pipW, pipH)
  }
}

function paintOverlayStack(ctx: CanvasRenderingContext2D, overlays: TimedPaint[]) {
  const ordered = [...overlays].sort((a, b) => overlayRank(a.clip) - overlayRank(b.clip))
  for (const layer of ordered) {
    if (layer.opacity <= 0) continue
    if (cameraKind(layer.clip) === 'stinger') {
      paintTimed(ctx, layer, 0, 0, WIDTH, HEIGHT)
      continue
    }
    if (cameraKind(layer.clip) === 'title') {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity))
      ctx.translate((layer.x || 0) * WIDTH, (layer.y || 0) * HEIGHT)
      paintTitle(ctx, layer.clip, WIDTH, HEIGHT)
      ctx.restore()
      continue
    }
    if (layer.clip.overlayFit === 'pip') {
      const pipW = Math.round(WIDTH * 0.28)
      const pipH = Math.round(HEIGHT * 0.28)
      const pad = 24
      paintTimed(ctx, layer, pad, HEIGHT - pipH - pad, pipW, pipH)
    } else {
      paintTimed(ctx, layer, 0, 0, WIDTH, HEIGHT)
    }
  }
}

export function paintProgramFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    mode?: PictureMode
    scene?: PictureScene
    fromScene?: PictureScene
    /** 0 = fromScene, 1 = scene. Used for Fade to Program. */
    mix?: number
    host: TimedPaint[]
    guest: TimedPaint[]
    overlays?: TimedPaint[]
    width?: number
    height?: number
  },
) {
  const width = opts.width || WIDTH
  const height = opts.height || HEIGHT
  const scene = opts.scene || sceneFromPictureMode(opts.mode || 'a-roll')
  const mix = opts.mix == null ? 1 : Math.max(0, Math.min(1, opts.mix))
  const fromScene = opts.fromScene && opts.fromScene !== scene && mix < 0.999 ? opts.fromScene : null
  ctx.save()
  ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0)
  ctx.fillStyle = '#05070A'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const host = opts.host.filter((l) => l.opacity > 0)
  const guest = opts.guest.filter((l) => l.opacity > 0)
  if (fromScene) {
    ctx.save()
    ctx.globalAlpha = 1 - mix
    paintSceneLayout(ctx, fromScene, host, guest)
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = mix
    paintSceneLayout(ctx, scene, host, guest)
    ctx.restore()
  } else {
    paintSceneLayout(ctx, scene, host, guest)
  }
  paintOverlayStack(ctx, opts.overlays || [])
  ctx.restore()
}

function composeLayers(
  ctx: CanvasRenderingContext2D,
  mode: PictureMode,
  host: TimedPaint[],
  guest: TimedPaint[],
  overlays: TimedPaint[],
) {
  paintProgramFrame(ctx, { mode, host, guest, overlays })
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
  host: CameraClip[]
  guest: CameraClip[]
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

  const layers = pictureLayers(opts.host, opts.guest)
  const duration = Math.max(pictureSpan(opts.audio.duration, opts.host, opts.guest), FRAME)
  const frames = Math.max(1, Math.round(duration * FPS))

  const hostPainter = await openClipSetPainter(layers.host)
  const guestPainter =
    opts.mode === 'pip' && layers.guest.length > 0 && layers.guest !== layers.host
      ? await openClipSetPainter(layers.guest)
      : null
  const overlayPainter = await openClipSetPainter(layers.overlays)

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
      const host = hostPainter ? await hostPainter.at(t) : []
      const guest = guestPainter ? await guestPainter.at(t) : []
      const overlays = overlayPainter ? await overlayPainter.at(t) : []
      composeLayers(ctx, opts.mode, host, guest, overlays)
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
    overlayPainter?.close()
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
  host: CameraClip[]
  guest: CameraClip[]
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

  const layers = pictureLayers(opts.host, opts.guest)
  const hostUrls = [...new Set(layers.host.map((c) => c.url).filter(Boolean))]
  const guestUrls = [...new Set(layers.guest.map((c) => c.url).filter(Boolean))].filter((url) => !hostUrls.includes(url))
  const overlayUrls = [...new Set(layers.overlays.map((c) => c.url).filter(Boolean))].filter(
    (url) => !hostUrls.includes(url) && !guestUrls.includes(url),
  )
  const hostEls = new Map<string, HTMLVideoElement>()
  const guestEls = new Map<string, HTMLVideoElement>()
  const overlayEls = new Map<string, HTMLVideoElement>()
  for (const url of hostUrls) {
    const first = layers.host.find((c) => c.url === url)!
    hostEls.set(url, await loadVideo(url, cameraSourceTime(first, first.offset)))
  }
  if (opts.mode === 'pip') {
    for (const url of guestUrls) {
      const first = layers.guest.find((c) => c.url === url)!
      guestEls.set(url, await loadVideo(url, cameraSourceTime(first, first.offset)))
    }
  }
  for (const url of overlayUrls) {
    const first = layers.overlays.find((c) => c.url === url)!
    overlayEls.set(url, await loadVideo(url, cameraSourceTime(first, first.offset)))
  }

  const duration = pictureSpan(opts.audio.duration, opts.host, opts.guest)

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
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = audioCtx.currentTime - started
      const allEls = new Map([...hostEls, ...guestEls, ...overlayEls])
      composeLayers(
        ctx,
        opts.mode,
        timedFromVideos(layers.host, allEls, t),
        opts.mode === 'pip' ? timedFromVideos(layers.guest, allEls, t) : [],
        timedFromVideos(layers.overlays, allEls, t),
      )
      opts.onProgress?.(Math.min(1, t / duration), { realtime: true })
      if (t >= duration) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  hostEls.forEach((el) => el.pause())
  guestEls.forEach((el) => el.pause())
  overlayEls.forEach((el) => el.pause())
  if (recorder.state !== 'inactive') recorder.stop()
  await audioCtx.close().catch(() => {})
  const release = (el: HTMLVideoElement) => {
    el.removeAttribute('src')
    el.load()
  }
  hostEls.forEach(release)
  guestEls.forEach(release)
  overlayEls.forEach(release)
  return done
}

export async function renderPictureMix(opts: {
  mode: PictureMode
  host: CameraClip | CameraClip[] | null
  guest: CameraClip | CameraClip[] | null
  audio: AudioBuffer
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}): Promise<PictureRenderResult> {
  const host = asClipList(opts.host)
  const guest = asClipList(opts.guest)
  if (host.length === 0 && guest.length === 0) {
    throw new Error('Need at least one camera file for a picture export')
  }
  const normalized = { ...opts, host, guest }

  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      opts.onProgress?.(0, { realtime: false })
      const blob = await renderFastPicture(normalized)
      return { blob, realtime: false }
    } catch {
      /* WebCodecs/mux failed — last resort is the old 1× capture */
    }
  }

  opts.onProgress?.(0, { realtime: true })
  return { blob: await renderRealtimePicture(normalized), realtime: true }
}
