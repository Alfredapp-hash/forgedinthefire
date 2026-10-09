/**
 * WebCodecs + mediabunny encode loop for a share clip. Runs identically inside the clip worker
 * (OffscreenCanvas) and on the main thread (a plain canvas), so it takes a canvas rather than
 * creating one and never touches `document`.
 */
import { paintClipFrame, planPaint, type Ctx2D, type PaintAssets, type Picture } from './paint'
import { CLIP_FPS, type ClipSpec } from './types'
import type { Peaks } from './waveform'

export type ClipAudio = { channels: Float32Array[]; sampleRate: number }

export type EncodeJob = {
  spec: ClipSpec
  peaks: Peaks
  audio: ClipAudio
  cover: ImageBitmap | null
  /** Program video (episode timeline). Frames come from `range.startSec + t`. */
  video?: Blob | null
  /** Where in the video the clip starts (seconds). Defaults to `spec.range.startSec`. */
  videoOffsetSec?: number
  isCancelled?: () => boolean
  onProgress?: (fraction: number) => void
}

export type EncodeResult = { blob: Blob; mime: string; ext: 'mp4' | 'webm' }

export type EncodePlan = {
  format: import('mediabunny').OutputFormat
  video: import('mediabunny').VideoCodec
  audio: import('mediabunny').AudioCodec
  mime: string
  ext: 'webm' | 'mp4'
}

export function cancelledError() {
  return new DOMException('Clip render cancelled', 'AbortError')
}

/** MP4 (H.264 / AAC) first for sharing; WebM (VP9 / Opus) when the browser cannot write MP4. */
export async function pickClipEncodePlan(width: number, height: number, audio: ClipAudio): Promise<EncodePlan | null> {
  const mb = await import('mediabunny')
  const videoOpts = { width, height, frameRate: CLIP_FPS, quality: mb.QUALITY_HIGH } as const
  const audioOpts = { numberOfChannels: audio.channels.length || 2, sampleRate: audio.sampleRate } as const
  const mp4 = async (): Promise<EncodePlan | null> => {
    const video = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'av1', 'vp9'], videoOpts)
    const audioCodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], audioOpts)
    if (!video || !audioCodec) return null
    return { format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), video, audio: audioCodec, mime: 'video/mp4', ext: 'mp4' }
  }
  const webm = async (): Promise<EncodePlan | null> => {
    const video = await mb.getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], videoOpts)
    const opus = await mb.canEncodeAudio('opus', audioOpts)
    if (!video || !opus) return null
    return { format: new mb.WebMOutputFormat(), video, audio: 'opus', mime: 'video/webm', ext: 'webm' }
  }
  return (await mp4()) || (await webm())
}

type DecodedSample = {
  timestamp: number
  duration: number
  displayWidth: number
  displayHeight: number
  draw: (ctx: Ctx2D, dx: number, dy: number, dw?: number, dh?: number) => void
  close: () => void
}

type FrameSource = { at: (sourceSec: number) => Promise<Picture | null>; close: () => void }

/** Forward-only decode cursor over the program video (MediaRecorder WebM often has one key frame). */
async function openVideoFrames(video: Blob): Promise<FrameSource | null> {
  const mb = await import('mediabunny')
  const input = new mb.Input({
    source: new mb.BlobSource(video, { maxCacheSize: 32 * 1024 * 1024 }),
    formats: [mb.MP4, mb.WEBM, mb.MATROSKA, mb.QTFF],
  })
  let track: Awaited<ReturnType<typeof input.getPrimaryVideoTrack>> = null
  try {
    track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) throw new Error('no decodable video track')
  } catch {
    input.dispose()
    return null
  }
  const sink = new mb.VideoSampleSink(track)
  let iter: AsyncGenerator<DecodedSample, void, unknown> | null = null
  let cur: DecodedSample | null = null
  let next: DecodedSample | null = null
  let ended = false
  const closeAll = async () => {
    cur?.close()
    next?.close()
    cur = next = null
    ended = false
    if (iter) {
      const old = iter
      iter = null
      try {
        await old.return(undefined)
      } catch {
        /* decoder closed */
      }
    }
  }
  const pull = async () => {
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
    async at(sourceSec) {
      const t = Math.max(0, sourceSec)
      const back = cur && t < cur.timestamp - 0.05
      const far = cur && t > cur.timestamp + 4
      if (!iter || !cur || back || far) await restart(t)
      while (cur && next && next.timestamp <= t + 1e-4) {
        cur.close()
        cur = next
        next = await pull()
      }
      if (!cur) return null
      const sample = cur
      return {
        width: sample.displayWidth,
        height: sample.displayHeight,
        draw: (ctx, dx, dy, dw, dh) => sample.draw(ctx, dx, dy, dw, dh),
      }
    },
    close() {
      void closeAll().finally(() => input.dispose())
    },
  }
}

/** Interleave-free planar f32 chunk of the clip audio for mediabunny's AudioSample. */
function planarChunk(audio: ClipAudio, from: number, to: number): Float32Array {
  const n = to - from
  const out = new Float32Array(n * audio.channels.length)
  for (let c = 0; c < audio.channels.length; c++) out.set(audio.channels[c].subarray(from, to), c * n)
  return out
}

/**
 * Encode the clip on `canvas` (already sized to the layout). Resolves with the container bytes.
 */
export async function encodeClip(job: EncodeJob, canvas: HTMLCanvasElement | OffscreenCanvas): Promise<EncodeResult> {
  const mb = await import('mediabunny')
  const plan = planPaint(job.spec)
  const { layout } = plan
  const encode = await pickClipEncodePlan(layout.width, layout.height, job.audio)
  if (!encode) throw new Error('This browser cannot encode MP4 or WebM video')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx2D | null
  if (!ctx) throw new Error('Could not open a 2D canvas')

  const duration = job.spec.range.endSec - job.spec.range.startSec
  const frames = Math.max(1, Math.round(duration * CLIP_FPS))
  const frameDur = 1 / CLIP_FPS
  const videoFrames = job.video ? await openVideoFrames(job.video) : null
  const videoOffset = job.videoOffsetSec ?? job.spec.range.startSec

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: encode.format, target })
  const videoSource = new mb.CanvasSource(canvas, {
    codec: encode.video,
    quality: mb.QUALITY_HIGH,
    latencyMode: 'quality',
    keyFrameInterval: 2,
  })
  const audioSource = new mb.AudioSampleSource({ codec: encode.audio, quality: mb.QUALITY_HIGH })
  output.addVideoTrack(videoSource, { frameRate: CLIP_FPS })
  output.addAudioTrack(audioSource)

  const assets: PaintAssets = { cover: job.cover, frame: null, peaks: job.peaks }
  let finished = false
  try {
    await output.start()
    // Audio in one-second pieces so encoder backpressure is respected.
    const total = job.audio.channels[0]?.length || 0
    const step = job.audio.sampleRate
    for (let from = 0; from < total; from += step) {
      if (job.isCancelled?.()) throw cancelledError()
      const to = Math.min(total, from + step)
      const sample = new mb.AudioSample({
        data: planarChunk(job.audio, from, to),
        format: 'f32-planar',
        numberOfChannels: job.audio.channels.length,
        sampleRate: job.audio.sampleRate,
        timestamp: from / job.audio.sampleRate,
      })
      await audioSource.add(sample)
      sample.close()
    }
    audioSource.close()

    for (let i = 0; i < frames; i++) {
      if (job.isCancelled?.()) throw cancelledError()
      const t = i * frameDur
      assets.frame = videoFrames ? await videoFrames.at(videoOffset + t) : null
      paintClipFrame(ctx, plan, assets, t)
      await videoSource.add(t, frameDur, { keyFrame: i === 0 || i % (CLIP_FPS * 2) === 0 })
      if (i % 6 === 0) {
        job.onProgress?.(i / frames)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    videoSource.close()
    await output.finalize()
    finished = true
  } finally {
    videoFrames?.close()
    if (!finished) {
      try {
        await output.cancel()
      } catch {
        /* encoder already dead */
      }
    }
  }
  const buffer = target.buffer
  if (!buffer || buffer.byteLength < 64) throw new Error('The clip encoder produced an empty file')
  job.onProgress?.(1)
  return { blob: new Blob([buffer], { type: encode.mime }), mime: encode.mime, ext: encode.ext }
}

/** PNG poster: one painted frame at `t`. */
export async function paintPoster(
  job: Pick<EncodeJob, 'spec' | 'peaks' | 'cover'>,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  t: number,
  frame: Picture | null = null,
): Promise<Blob> {
  const plan = planPaint(job.spec)
  canvas.width = plan.layout.width
  canvas.height = plan.layout.height
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx2D | null
  if (!ctx) throw new Error('Could not open a 2D canvas')
  paintClipFrame(ctx, plan, { cover: job.cover, frame, peaks: job.peaks }, t)
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the poster'))), 'image/png')
  })
}

/** Frame at `t` of the program video (for the poster and the preview). */
export async function videoFrameAt(video: Blob, sourceSec: number): Promise<{ bitmap: ImageBitmap } | null> {
  const frames = await openVideoFrames(video)
  if (!frames) return null
  try {
    const pic = await frames.at(sourceSec)
    if (!pic) return null
    const off = new OffscreenCanvas(pic.width, pic.height)
    const ctx = off.getContext('2d')
    if (!ctx) return null
    if ('draw' in pic) pic.draw(ctx, 0, 0, pic.width, pic.height)
    return { bitmap: await createImageBitmap(off) }
  } finally {
    frames.close()
  }
}
