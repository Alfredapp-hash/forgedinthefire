/**
 * Local canvas Program picture: A-roll / Host+Guest PIP / scene-cut program video, titles, stingers.
 * Does not write episode.audio_url or the RSS mix.
 *
 * Encoding goes through mediabunny (MPL-2.0 library, used unmodified as an npm dependency) with
 * WebCodecs; MediaRecorder + canvas.captureStream is the realtime fallback.
 */

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
  newStingerClip,
  newTitleClip,
  normalizeCameraClip,
  programStateAt,
  PROGRAM_FADE_SEC,
  type CameraClip,
  type ProgramCut,
  type ProgramScene,
  type ProgramState,
} from '@/lib/podcast/camera'

export type PictureMode = 'a-roll' | 'pip'

/** One-click Program layout — not an OBS scene graph. Same union as camera.ts `ProgramScene`. */
export type PictureScene = ProgramScene

export function sceneFromPictureMode(mode: PictureMode): PictureScene {
  return mode === 'pip' ? 'pip' : 'host'
}

export type PictureRenderResult = {
  blob: Blob
  /** True only for the MediaRecorder fallback — wall-clock 1×. */
  realtime: boolean
  /** Container actually written (may differ from the request if the browser cannot encode it). */
  mime?: string
  /** True when the file was streamed to a `writable` (then `blob` is empty). */
  streamed?: boolean
}

/** 'auto' = WebM if the browser can encode it, else MP4. */
export type VideoExportFormat = 'auto' | 'webm' | 'mp4'

/** Minimal shape of a FileSystemWritableFileStream / mediabunny StreamTarget writable. */
export type PictureWritable = WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number }>

export const PICTURE_WIDTH = 1280
export const PICTURE_HEIGHT = 720
export const PICTURE_FPS = 30
const WIDTH = PICTURE_WIDTH
const HEIGHT = PICTURE_HEIGHT
const FPS = PICTURE_FPS
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

function abortError() {
  return new DOMException('Picture export cancelled', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
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

function isVideoElement(source: unknown): source is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (video.readyState < 2) return
  const vw = video.videoWidth || w
  const vh = video.videoHeight || h
  const scale = Math.max(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

function paintCover(
  ctx: CanvasRenderingContext2D,
  source: PaintSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (isVideoElement(source)) {
    drawCover(ctx, source, x, y, w, h)
    return
  }
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
  }
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

/**
 * Split a whole session's camera clips into Program stacks: `guest` person base clips, every other
 * person's base clips as `host`, and every title / B-roll / stinger as overlays.
 */
export function programLayers(clips: CameraClip[]) {
  const list = clips.map(normalizeCameraClip)
  return {
    host: list.filter((c) => cameraLayer(c) === 'base' && c.personId !== 'guest'),
    guest: list.filter((c) => cameraLayer(c) === 'base' && c.personId === 'guest'),
    overlays: list.filter((c) => cameraLayer(c) === 'overlay'),
  }
}

function sourceTime(clip: CameraClip, sessionTime: number) {
  return cameraSourceTime(clip, sessionTime)
}

function pictureSpan(audioDur: number, clips: CameraClip[]) {
  return Math.max(audioDur, ...clips.map((c) => cameraClipEnd(c)), 0.5)
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

type DecodedSample = PaintSource & { timestamp: number; duration: number; close: () => void }

/**
 * Sequential decode cursor over one camera file. MediaRecorder WebM often has a single key frame, so
 * random `getSample(t)` per frame would re-decode from the start every time. We keep one forward
 * `samples()` iterator and only restart it on a backwards seek or a long forward jump.
 */
async function openDecodedSource(url: string): Promise<SourcePainter> {
  const blob = await fetch(url).then((res) => {
    if (!res.ok) throw new Error('camera fetch failed')
    return res.blob()
  })
  const mb = await import('mediabunny')
  const input = new mb.Input({
    source: new mb.BlobSource(blob, { maxCacheSize: 32 * 1024 * 1024 }),
    formats: [mb.WEBM, mb.MP4, mb.MATROSKA, mb.QTFF],
  })
  const track = await input.getPrimaryVideoTrack()
  if (!track) {
    input.dispose()
    throw new Error('no video track')
  }
  if (!(await track.canDecode())) {
    input.dispose()
    throw new Error('cannot decode this camera file with WebCodecs')
  }
  const sink = new mb.VideoSampleSink(track)
  let iter: AsyncGenerator<DecodedSample, void, unknown> | null = null
  let cur: DecodedSample | null = null
  let next: DecodedSample | null = null
  let ended = false

  const closeAll = async () => {
    cur?.close()
    next?.close()
    cur = null
    next = null
    ended = false
    if (iter) {
      const old = iter
      iter = null
      try {
        await old.return(undefined)
      } catch {
        /* decoder already closed */
      }
    }
  }

  const pull = async (): Promise<DecodedSample | null> => {
    if (!iter || ended) return null
    const step = await iter.next()
    if (step.done) {
      ended = true
      return null
    }
    return step.value
  }

  const restart = async (t: number) => {
    await closeAll()
    iter = sink.samples(Math.max(0, t)) as unknown as AsyncGenerator<DecodedSample, void, unknown>
    cur = await pull()
    next = cur ? await pull() : null
  }

  return {
    async atSource(sourceSec) {
      const t = Math.max(0, sourceSec)
      const jumpBack = cur && t < cur.timestamp - FRAME * 1.5
      const jumpFar = cur && t > cur.timestamp + 4
      if (!iter || !cur || jumpBack || jumpFar) await restart(t)
      while (cur && next && next.timestamp <= t + 1e-4) {
        cur.close()
        cur = next
        next = await pull()
      }
      return cur
    },
    close() {
      void closeAll().finally(() => input.dispose())
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

/** One decoder per (url, clip) so split pieces of the same file each keep a forward-only cursor. */
async function openClipSetPainter(clips: CameraClip[]): Promise<FramePainter | null> {
  const live = clips.filter((c) => c.url || isGraphicClip(c))
  if (live.length === 0) return null
  const sources = new Map<string, SourcePainter>()
  const keyFor = (clip: CameraClip) => `${clip.url}#${clip.id}`
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
        const key = keyFor(clip)
        let painter = sources.get(key)
        if (!painter) {
          painter = await openSourcePainter(clip.url, sourceTime(clip, sessionTime))
          sources.set(key, painter)
        }
        painted.push({
          clip,
          source: await painter.atSource(sourceTime(clip, sessionTime)),
          opacity,
          x,
          y,
        })
      }
      // Free decoders for clips that are behind us — long sessions have many split pieces.
      for (const [key, painter] of sources) {
        const id = key.slice(key.lastIndexOf('#') + 1)
        const clip = live.find((c) => c.id === id)
        if (!clip || cameraClipEnd(clip) < sessionTime - 1) {
          painter.close()
          sources.delete(key)
        }
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
  ctx.globalAlpha = ctx.globalAlpha * Math.max(0, Math.min(1, layer.opacity))
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
  else if (guest.length && (scene === 'host' || scene === 'pip')) {
    // No host picture — let the guest fill the frame instead of a PIP over black.
    paintStack(ctx, guest, 0, 0, WIDTH, HEIGHT)
    return
  }
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
  ctx.globalAlpha = 1
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

type SceneAt = (sessionTime: number) => Pick<ProgramState, 'scene' | 'fromScene' | 'mix'>

function fixedScene(scene: PictureScene): SceneAt {
  return () => ({ scene, fromScene: scene, mix: 1 })
}

function cutsScene(cuts: ProgramCut[], fallback: PictureScene): SceneAt {
  return (t) => programStateAt(cuts, t, fallback)
}

function scenesUsed(cuts: ProgramCut[] | undefined, fallback: PictureScene) {
  return new Set<PictureScene>([fallback, ...(cuts || []).map((c) => c.scene)])
}

type EncodePlan = {
  format: import('mediabunny').OutputFormat
  video: import('mediabunny').VideoCodec
  audio: import('mediabunny').AudioCodec
  mime: string
  ext: 'webm' | 'mp4'
  quality: import('mediabunny').Quality
}

async function pickEncodePlan(
  format: VideoExportFormat,
  audio: { numberOfChannels: number; sampleRate: number } | null,
  streaming: boolean,
): Promise<EncodePlan | null> {
  const mb = await import('mediabunny')
  const videoOpts = { width: WIDTH, height: HEIGHT, frameRate: FPS, quality: mb.QUALITY_HIGH } as const
  const audioOpts = { numberOfChannels: audio?.numberOfChannels || 2, sampleRate: audio?.sampleRate || 48000 } as const

  const webm = async (): Promise<EncodePlan | null> => {
    const video = await mb.getFirstEncodableVideoCodec(['vp8', 'vp9', 'av1'], videoOpts)
    const opus = audio ? await mb.canEncodeAudio('opus', audioOpts) : true
    if (!video || !opus) return null
    return { format: new mb.WebMOutputFormat(), video, audio: 'opus', mime: 'video/webm', ext: 'webm', quality: mb.QUALITY_HIGH }
  }
  const mp4 = async (): Promise<EncodePlan | null> => {
    const video = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], videoOpts)
    const audioCodec = audio ? await mb.getFirstEncodableAudioCodec(['aac', 'opus'], audioOpts) : 'aac'
    if (!video || !audioCodec) return null
    return {
      // In-memory fast start moves `moov` to the front for web playback; streamed files keep it at the end.
      format: new mb.Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' }),
      video,
      audio: audioCodec,
      mime: 'video/mp4',
      ext: 'mp4',
      quality: mb.QUALITY_HIGH,
    }
  }
  if (format === 'mp4') return (await mp4()) || (await webm())
  return (await webm()) || (await mp4())
}

type RenderJob = {
  host: CameraClip[]
  guest: CameraClip[]
  overlays: CameraClip[]
  needGuest: boolean
  sceneAt: SceneAt
  /** null = picture-only file (no audio track). */
  audio: AudioBuffer | null
  format: VideoExportFormat
  writable?: PictureWritable
  signal?: AbortSignal
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}

async function renderFastPicture(job: RenderJob): Promise<PictureRenderResult> {
  const mb = await import('mediabunny')
  const plan = await pickEncodePlan(job.format, job.audio, Boolean(job.writable))
  if (!plan) throw new Error('This browser cannot encode a picture mix faster than realtime')

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const all = [...job.host, ...job.guest, ...job.overlays]
  const duration = Math.max(pictureSpan(job.audio?.duration || 0, all), FRAME)
  const frames = Math.max(1, Math.round(duration * FPS))

  const hostPainter = await openClipSetPainter(job.host)
  const guestPainter = job.needGuest ? await openClipSetPainter(job.guest) : null
  const overlayPainter = await openClipSetPainter(job.overlays)

  const target = job.writable ? new mb.StreamTarget(job.writable, { chunked: true }) : new mb.BufferTarget()
  const output = new mb.Output({ format: plan.format, target })
  const videoSource = new mb.CanvasSource(canvas, {
    codec: plan.video,
    quality: plan.quality,
    latencyMode: 'quality',
    keyFrameInterval: 2,
  })
  const audioSource = job.audio
    ? new mb.AudioBufferSource({
        codec: plan.audio,
        quality: plan.quality,
      })
    : null
  output.addVideoTrack(videoSource, { frameRate: FPS })
  if (audioSource) output.addAudioTrack(audioSource)

  let finished = false
  try {
    await output.start()
    if (audioSource && job.audio) {
      await audioSource.add(job.audio)
      audioSource.close()
    }
    for (let i = 0; i < frames; i++) {
      throwIfAborted(job.signal)
      const t = i * FRAME
      const state = job.sceneAt(t)
      const host = hostPainter ? await hostPainter.at(t) : []
      const guest = guestPainter ? await guestPainter.at(t) : []
      const overlays = overlayPainter ? await overlayPainter.at(t) : []
      paintProgramFrame(ctx, { scene: state.scene, fromScene: state.fromScene, mix: state.mix, host, guest, overlays })
      await videoSource.add(t, FRAME, { keyFrame: i === 0 || i % (FPS * 2) === 0 })
      if (i % 12 === 0) {
        job.onProgress?.(i / frames, { realtime: false })
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

  if (job.writable) {
    return { blob: new Blob([], { type: plan.mime }), realtime: false, mime: plan.mime, streamed: true }
  }
  const buffer = (target as InstanceType<typeof mb.BufferTarget>).buffer
  if (!buffer || buffer.byteLength < 64) throw new Error('Picture encoder produced an empty file')
  return { blob: new Blob([buffer], { type: plan.mime }), realtime: false, mime: plan.mime }
}

/** Keep a playing <video> near `want` without seeking every frame (seeks stall playback). */
function steerVideo(el: HTMLVideoElement, want: number, playing: boolean) {
  const target = Math.max(0, want)
  if (!playing) {
    if (!el.paused) el.pause()
    if (Math.abs(el.currentTime - target) > FRAME * 0.75 && !el.seeking) {
      try {
        el.currentTime = target
      } catch {
        /* seek can fail mid-load */
      }
    }
    return
  }
  if (el.paused) {
    try {
      el.currentTime = target
    } catch {
      /* ignore */
    }
    void el.play().catch(() => {})
    return
  }
  if (Math.abs(el.currentTime - target) > 0.25 && !el.seeking) {
    try {
      el.currentTime = target
    } catch {
      /* ignore */
    }
  }
}

/**
 * Paint layers for one session time from `<video>` elements keyed by URL. Elements are steered to the
 * clip's source time (played when `playing`, seeked otherwise). Used by the realtime export and the
 * Program monitor.
 */
export function timedLayersFromVideos(
  clips: CameraClip[],
  videos: Map<string, HTMLVideoElement>,
  sessionTime: number,
  playing = false,
): TimedPaint[] {
  const painted: TimedPaint[] = []
  const used = new Set<HTMLVideoElement>()
  for (const clip of camerasAtTime(clips, sessionTime)) {
    const opacity = clipOpacity(clip, sessionTime)
    if (opacity <= 0) continue
    const { x, y } = clipTranslate(clip, sessionTime)
    if (isGraphicClip(clip) || !clip.url) {
      painted.push({ clip, source: null, opacity, x, y })
      continue
    }
    const el = videos.get(clip.url) || null
    if (el && !used.has(el)) {
      steerVideo(el, sourceTime(clip, sessionTime), playing)
      used.add(el)
    }
    painted.push({ clip, source: el, opacity, x, y })
  }
  return painted
}

async function renderRealtimePicture(job: RenderJob): Promise<PictureRenderResult> {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser cannot record a canvas picture mix')
  }

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const all = [...job.host, ...(job.needGuest ? job.guest : []), ...job.overlays]
  const els = new Map<string, HTMLVideoElement>()
  for (const clip of all) {
    if (!clip.url || els.has(clip.url)) continue
    els.set(clip.url, await loadVideo(clip.url, cameraSourceTime(clip, clip.offset)))
  }

  const duration = pictureSpan(job.audio?.duration || 0, all)

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  const source = audioCtx.createBufferSource()
  if (job.audio) {
    source.buffer = job.audio
    source.connect(dest)
  }

  const frames = canvas.captureStream(FPS)
  if (job.audio) dest.stream.getAudioTracks().forEach((track) => frames.addTrack(track))
  const wantMp4 = job.format === 'mp4'
  const candidates = wantMp4
    ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  const mime = candidates.find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = mime ? new MediaRecorder(frames, { mimeType: mime }) : new MediaRecorder(frames)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }))
    recorder.onerror = () => reject(new Error('Picture recorder failed'))
  })

  await audioCtx.resume().catch(() => {})
  const started = audioCtx.currentTime
  recorder.start(250)
  source.start()
  let aborted = false
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (job.signal?.aborted) {
        aborted = true
        resolve()
        return
      }
      const t = audioCtx.currentTime - started
      const state = job.sceneAt(t)
      paintProgramFrame(ctx, {
        scene: state.scene,
        fromScene: state.fromScene,
        mix: state.mix,
        host: timedLayersFromVideos(job.host, els, t, true),
        guest: job.needGuest ? timedLayersFromVideos(job.guest, els, t, true) : [],
        overlays: timedLayersFromVideos(job.overlays, els, t, true),
      })
      job.onProgress?.(Math.min(1, t / duration), { realtime: true })
      if (t >= duration) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  els.forEach((el) => el.pause())
  if (recorder.state !== 'inactive') recorder.stop()
  try {
    source.stop()
  } catch {
    /* already ended */
  }
  await audioCtx.close().catch(() => {})
  els.forEach((el) => {
    el.removeAttribute('src')
    el.load()
  })
  const blob = await done
  if (aborted) throw abortError()
  if (job.writable) {
    const writer = job.writable.getWriter()
    await writer.write({ type: 'write', data: new Uint8Array(await blob.arrayBuffer()), position: 0 })
    await writer.close()
    return { blob: new Blob([], { type: blob.type }), realtime: true, mime: blob.type, streamed: true }
  }
  return { blob, realtime: true, mime: blob.type }
}

async function runRender(job: RenderJob): Promise<PictureRenderResult> {
  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      job.onProgress?.(0, { realtime: false })
      return await renderFastPicture(job)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (job.writable && (job.writable as WritableStream).locked) {
        // The fast path already took the file writer — cannot hand it to the fallback.
        throw err instanceof Error ? err : new Error('Picture export failed')
      }
      /* WebCodecs/mux failed — last resort is the old 1× capture */
    }
  }
  job.onProgress?.(0, { realtime: true })
  return renderRealtimePicture(job)
}

/** Fixed A-roll or PIP export (the original API). `cuts` switches scenes over time when given. */
export async function renderPictureMix(opts: {
  mode: PictureMode
  host: CameraClip | CameraClip[] | null
  guest: CameraClip | CameraClip[] | null
  audio: AudioBuffer
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
  /** Optional Program scene cuts on the session clock (overrides `mode` after the first cut). */
  cuts?: ProgramCut[]
  format?: VideoExportFormat
  signal?: AbortSignal
  writable?: PictureWritable
}): Promise<PictureRenderResult> {
  const host = asClipList(opts.host)
  const guest = asClipList(opts.guest)
  if (host.length === 0 && guest.length === 0) {
    throw new Error('Need at least one camera file for a picture export')
  }
  const layers = pictureLayers(host, guest)
  const fallback = sceneFromPictureMode(opts.mode)
  const used = scenesUsed(opts.cuts, fallback)
  return runRender({
    ...layers,
    needGuest: used.has('pip') || used.has('guest'),
    sceneAt: opts.cuts?.length ? cutsScene(opts.cuts, fallback) : fixedScene(fallback),
    audio: opts.audio,
    format: opts.format || 'auto',
    writable: opts.writable,
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
}

/**
 * Whole-session Program export: every camera / title / B-roll / stinger clip, switched by the scene
 * cuts, with the mixed episode audio. `guest` person clips are the Guest source; everyone else is Host.
 */
export async function renderProgramVideo(opts: {
  clips: CameraClip[]
  cuts?: ProgramCut[]
  /** Scene before the first cut. Default 'host'. */
  startScene?: PictureScene
  /** Mixed episode audio; null writes a picture-only file. */
  audio: AudioBuffer | null
  format?: VideoExportFormat
  signal?: AbortSignal
  writable?: PictureWritable
  onProgress?: (ratio: number, info?: { realtime: boolean }) => void
}): Promise<PictureRenderResult> {
  const layers = programLayers(opts.clips.filter((c) => !c.muted))
  if (layers.host.length + layers.guest.length + layers.overlays.length === 0) {
    throw new Error('Nothing on the picture lanes to export — record a camera take or add a title first')
  }
  const fallback = opts.startScene || 'host'
  const used = scenesUsed(opts.cuts, fallback)
  return runRender({
    ...layers,
    needGuest: used.has('pip') || used.has('guest') || layers.host.length === 0,
    sceneAt: cutsScene(opts.cuts || [], fallback),
    audio: opts.audio,
    format: opts.format || 'auto',
    writable: opts.writable,
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
}

/* ---------------------------------------------------------------------------------------------
 * Live Program compositor — for Live mode / streaming. Paints host + guest live video into one
 * canvas with the same layouts, fades, lower thirds and stingers as the editor export.
 * ------------------------------------------------------------------------------------------- */

export type CompositorSource = HTMLVideoElement | MediaStream | null | undefined

export type ProgramCompositor = {
  canvas: HTMLCanvasElement
  /** canvas.captureStream(fps) — add an audio track to send it to a peer / MediaRecorder. */
  stream: MediaStream
  getScene: () => PictureScene
  /** Cut (fade 0) or dissolve (seconds) to a scene. */
  setScene: (scene: PictureScene, opts?: { fade?: number }) => void
  setSources: (sources: { hostVideo?: CompositorSource; guestVideo?: CompositorSource }) => void
  /** Show a lower third for `seconds` (default 5). Returns an id for hideTitle. */
  showTitle: (opts: { label: string; sublabel?: string; seconds?: number }) => string
  hideTitle: (id?: string) => void
  /** OBS-style stinger flash (black, or a title card when `label` is given). */
  stinger: (opts?: { label?: string; sublabel?: string; seconds?: number }) => void
  stop: () => void
}

function videoFromSource(source: CompositorSource, owned: HTMLVideoElement[]): HTMLVideoElement | null {
  if (!source) return null
  if (isVideoElement(source)) return source
  const el = document.createElement('video')
  el.muted = true
  el.playsInline = true
  el.autoplay = true
  el.srcObject = source
  void el.play().catch(() => {})
  owned.push(el)
  return el
}

const LIVE_CLIP_BASE: Omit<CameraClip, 'id' | 'personId'> = {
  url: '',
  mime: 'video/live',
  offset: 0,
  duration: Number.MAX_SAFE_INTEGER,
  trimStart: 0,
  sourceStart: 0,
  sourceDuration: Number.MAX_SAFE_INTEGER,
  bytes: 0,
  kind: 'camera',
  layer: 'base',
}

/**
 * Create a live Program canvas.
 *
 * ```ts
 * const pgm = createProgramCompositor({ hostVideo: hostStream, guestVideo: guestStream, scene: 'pip' })
 * pgm.setScene('guest', { fade: 0.45 })
 * pgm.showTitle({ label: 'Jane Doe', sublabel: 'Guest' })
 * peer.addTrack(pgm.stream.getVideoTracks()[0], pgm.stream)
 * pgm.stop()
 * ```
 *
 * Painting runs on a timer (not rAF) so a hidden tab keeps sending frames, though browsers may
 * throttle it to ~1 fps in the background.
 */
export function createProgramCompositor(opts: {
  hostVideo?: CompositorSource
  guestVideo?: CompositorSource
  scene?: PictureScene
  width?: number
  height?: number
  fps?: number
}): ProgramCompositor {
  const width = opts.width || WIDTH
  const height = opts.height || HEIGHT
  const fps = Math.max(1, Math.min(60, opts.fps || FPS))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const owned: HTMLVideoElement[] = []
  let host = videoFromSource(opts.hostVideo, owned)
  let guest = videoFromSource(opts.guestVideo, owned)
  let scene: PictureScene = opts.scene || 'host'
  let fromScene: PictureScene = scene
  let fadeStart = 0
  let fadeDur = 0
  const t0 = performance.now()
  const clock = () => (performance.now() - t0) / 1000
  let overlays: CameraClip[] = []

  const hostClip: CameraClip = { ...LIVE_CLIP_BASE, id: 'live-host', personId: 'host' }
  const guestClip: CameraClip = { ...LIVE_CLIP_BASE, id: 'live-guest', personId: 'guest' }
  const live = (clip: CameraClip, el: HTMLVideoElement | null): TimedPaint[] =>
    el && el.readyState >= 2 ? [{ clip, source: el, opacity: 1, x: 0, y: 0 }] : []

  const paint = () => {
    const now = clock()
    overlays = overlays.filter((c) => cameraClipEnd(c) > now)
    const mix = fadeDur > 0 ? Math.min(1, (now - fadeStart) / fadeDur) : 1
    paintProgramFrame(ctx, {
      scene,
      fromScene: mix < 1 ? fromScene : scene,
      mix,
      host: live(hostClip, host),
      guest: live(guestClip, guest),
      overlays: overlays
        .filter((c) => now >= c.offset)
        .map((clip) => ({ clip, source: null, opacity: clipOpacity(clip, now), x: 0, y: 0 })),
      width,
      height,
    })
  }
  paint()
  const timer = window.setInterval(paint, Math.round(1000 / fps))
  const stream = canvas.captureStream(fps)

  const release = (el: HTMLVideoElement | null) => {
    if (!el) return
    const idx = owned.indexOf(el)
    if (idx >= 0) {
      el.pause()
      el.srcObject = null
      owned.splice(idx, 1)
    }
  }

  return {
    canvas,
    stream,
    getScene: () => scene,
    setScene(next, o) {
      if (next === scene) return
      const fade = Math.max(0, o?.fade ?? 0)
      const now = clock()
      const running = fadeDur > 0 && now - fadeStart < fadeDur
      fromScene = running ? fromScene : scene
      scene = next
      fadeStart = now
      fadeDur = fade
    },
    setSources(sources) {
      if ('hostVideo' in sources) {
        release(host)
        host = videoFromSource(sources.hostVideo, owned)
      }
      if ('guestVideo' in sources) {
        release(guest)
        guest = videoFromSource(sources.guestVideo, owned)
      }
    },
    showTitle({ label, sublabel, seconds }) {
      const clip = newTitleClip({ personId: 'host', offset: clock(), label, sublabel, duration: seconds ?? 5 })
      overlays = [...overlays.filter((c) => cameraKind(c) !== 'title'), clip]
      return clip.id
    },
    hideTitle(id) {
      const now = clock()
      overlays = overlays.map((c) =>
        cameraKind(c) === 'title' && (!id || c.id === id)
          ? { ...c, duration: Math.max(0.01, now - c.offset + (c.fadeOut || 0.3)), fadeOut: c.fadeOut || 0.3 }
          : c,
      )
    },
    stinger(o) {
      const clip = newStingerClip({
        personId: 'host',
        offset: clock(),
        style: o?.label ? 'title' : 'black',
        label: o?.label,
        sublabel: o?.sublabel,
        duration: o?.seconds ?? (o?.label ? 0.7 : 0.4),
      })
      overlays = [...overlays, clip]
    },
    stop() {
      window.clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      ;[...owned].forEach(release)
    },
  }
}

export { PROGRAM_FADE_SEC }
