/**
 * Render a share clip in the browser: slice + bleep the episode audio, build captions, then encode
 * in a Worker (OffscreenCanvas + WebCodecs), on the main thread (WebCodecs), or as a last resort
 * with MediaRecorder in real time. Output: MP4 (or WebM) + PNG poster + SRT.
 */
import { applyBleeps } from '@/lib/podcast/safety/render'
import { asTerms } from '@/lib/podcast/safety/protected-words'
import type { ProtectedTerm } from '@/lib/podcast/safety/record'
import { captionGroups, clipSrt, clipWords, fitGroups, redactionsInClip, validateClipRange } from './captions'
import type { ClipWorkerRequest, ClipWorkerResponse } from './clip.worker'
import { cancelledError, encodeClip, paintPoster, videoFrameAt, type ClipAudio } from './encode'
import { clipLayout } from './layout'
import { paintClipFrame, planPaint } from './paint'
import { CLIP_FPS, type ClipRenderInput, type ClipRenderResult, type ClipSpec } from './types'
import { computePeaks, type Peaks } from './waveform'

/** Poster frame: a third of the way in, where captions are usually on screen. */
const POSTER_AT = 1 / 3

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelledError()
}

/** Cut `[startSec, endSec)` out of a decoded buffer and bleep any redacted stretch inside it. */
export function sliceClipAudio(buffer: AudioBuffer, startSec: number, endSec: number, bleeps: { start: number; end: number }[]): ClipAudio {
  const rate = buffer.sampleRate
  const from = Math.max(0, Math.floor(startSec * rate))
  const to = Math.min(buffer.length, Math.ceil(endSec * rate))
  const length = Math.max(1, to - from)
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels))
  const slice = new AudioBuffer({ length, sampleRate: rate, numberOfChannels: channels })
  for (let c = 0; c < channels; c++) {
    slice.copyToChannel(buffer.getChannelData(c).subarray(from, from + length), c)
  }
  if (bleeps.length) applyBleeps(slice, bleeps, 'tone')
  return { channels: Array.from({ length: channels }, (_, c) => slice.getChannelData(c)), sampleRate: rate }
}

async function loadCover(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

function renderInWorker(
  spec: ClipSpec,
  peaks: Peaks,
  audio: ClipAudio,
  cover: ImageBitmap | null,
  video: Blob | null,
  signal: AbortSignal | undefined,
  onProgress: (f: number) => void,
): Promise<{ video: Blob; mime: string; ext: 'mp4' | 'webm'; poster: Blob } | 'unsupported'> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./clip.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve('unsupported')
      return
    }
    const id = 1
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      worker.postMessage({ type: 'cancel', id } satisfies ClipWorkerRequest)
      finish()
      reject(cancelledError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onerror = () => {
      finish()
      resolve('unsupported')
    }
    worker.onmessage = (event: MessageEvent<ClipWorkerResponse>) => {
      const msg = event.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction)
      else if (msg.type === 'done') {
        finish()
        resolve({ video: msg.video, mime: msg.mime, ext: msg.ext, poster: msg.poster })
      } else {
        finish()
        if (msg.cancelled) reject(cancelledError())
        else if (msg.unsupported) resolve('unsupported')
        else reject(new Error(msg.error))
      }
    }
    // Channel data is cloned (not transferred) so a fallback path can still use it.
    const req: ClipWorkerRequest = {
      type: 'render',
      id,
      spec,
      peaks: { values: peaks.values, perSec: peaks.perSec, duration: peaks.duration },
      channels: audio.channels,
      sampleRate: audio.sampleRate,
      cover,
      video,
      posterAt: (spec.range.endSec - spec.range.startSec) * POSTER_AT,
    }
    try {
      worker.postMessage(req, cover ? [cover] : [])
    } catch {
      finish()
      resolve('unsupported')
    }
  })
}

/** Last resort: play the clip at 1x through canvas.captureStream + MediaRecorder. */
async function renderRealtime(
  spec: ClipSpec,
  peaks: Peaks,
  audio: ClipAudio,
  cover: ImageBitmap | null,
  signal: AbortSignal | undefined,
  onProgress: (f: number) => void,
): Promise<{ blob: Blob; mime: string; ext: 'mp4' | 'webm' }> {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser cannot record video from a canvas')
  }
  const plan = planPaint(spec)
  const canvas = document.createElement('canvas')
  canvas.width = plan.layout.width
  canvas.height = plan.layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not open a 2D canvas')
  const duration = spec.range.endSec - spec.range.startSec

  const audioCtx = new AudioContext()
  const buffer = audioCtx.createBuffer(audio.channels.length, audio.channels[0].length, audio.sampleRate)
  audio.channels.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c))
  const dest = audioCtx.createMediaStreamDestination()
  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(dest)

  const stream = canvas.captureStream(CLIP_FPS)
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  const candidates = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  const mime = candidates.find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' }))
    recorder.onerror = () => reject(new Error('Clip recorder failed'))
  })
  await audioCtx.resume().catch(() => {})
  const started = audioCtx.currentTime
  recorder.start(250)
  source.start()
  let aborted = false
  const assets = { cover, frame: null, peaks }
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (signal?.aborted) {
        aborted = true
        resolve()
        return
      }
      const t = audioCtx.currentTime - started
      paintClipFrame(ctx, plan, assets, t)
      onProgress(Math.min(1, t / duration))
      if (t >= duration) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  if (recorder.state !== 'inactive') recorder.stop()
  try {
    source.stop()
  } catch {
    /* ended */
  }
  await audioCtx.close().catch(() => {})
  const blob = await done
  if (aborted) throw cancelledError()
  const isMp4 = (blob.type || '').includes('mp4')
  return { blob, mime: blob.type || 'video/webm', ext: isMp4 ? 'mp4' : 'webm' }
}

/** Build the on-screen caption words + SRT for a spec (shared by the preview and the render). */
export function buildClipCaptions(input: Pick<ClipRenderInput, 'words' | 'redactions' | 'terms'> & { range: ClipSpec['range']; aspect: ClipSpec['aspect'] }) {
  const terms = asTerms((input.terms || []) as ProtectedTerm[])
  const words = clipWords(input.words, input.range, input.redactions, terms)
  const layout = clipLayout(input.aspect)
  const groups = fitGroups(captionGroups(words, { maxChars: layout.captionChars * layout.captionLines }), layout.captionChars, layout.captionLines)
  return { words, groups, srt: clipSrt(groups, layout.captionChars) }
}

export async function renderClip(input: ClipRenderInput): Promise<ClipRenderResult> {
  const { signal } = input
  const check = validateClipRange(input.spec.range, input.audio.duration)
  if (!check.ok) throw new Error(check.error)
  const range = check.range
  const duration = range.endSec - range.startSec
  const progress = (stage: string, fraction: number | null, realtime = false) => input.onProgress?.({ stage, fraction, realtime })

  progress('Preparing audio…', null)
  const inClip = redactionsInClip(input.redactions, range)
  const audio = sliceClipAudio(input.audio, range.startSec, range.endSec, inClip)
  const peaks = computePeaks(audio.channels, audio.sampleRate, 0, duration)
  const { words, srt } = buildClipCaptions({ words: input.words, redactions: input.redactions, terms: input.terms, range, aspect: input.spec.aspect })
  const spec: ClipSpec = { ...input.spec, range, words }
  throwIfAborted(signal)

  progress('Loading artwork…', null)
  const cover = await loadCover(input.coverUrl)
  throwIfAborted(signal)
  const video = input.video || null
  const base = { duration, srt, redactedCount: inClip.length }

  const canUseWebCodecs = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined'
  if (canUseWebCodecs && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    progress('Rendering clip…', 0)
    // The worker takes ownership of the bitmap; keep a copy for the main-thread fallback.
    const coverForWorker = cover ? await createImageBitmap(cover) : null
    const result = await renderInWorker(spec, peaks, audio, coverForWorker, video, signal, (f) => progress('Rendering clip…', f))
    if (result !== 'unsupported') {
      cover?.close()
      return { ...base, video: result.video, mime: result.mime, ext: result.ext, poster: result.poster, realtime: false, path: 'worker' }
    }
  }
  throwIfAborted(signal)

  if (canUseWebCodecs) {
    try {
      progress('Rendering clip…', 0)
      const canvas = document.createElement('canvas')
      const job = { spec, peaks, audio, cover, video, isCancelled: () => Boolean(signal?.aborted), onProgress: (f: number) => progress('Rendering clip…', f) }
      const result = await encodeClip(job, canvas)
      const frame = video ? await videoFrameAt(video, range.startSec + duration * POSTER_AT).catch(() => null) : null
      const poster = await paintPoster(job, document.createElement('canvas'), duration * POSTER_AT, frame?.bitmap ?? null)
      frame?.bitmap.close()
      cover?.close()
      return { ...base, video: result.blob, mime: result.mime, ext: result.ext, poster, realtime: false, path: 'main' }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      /* fall through to the realtime recorder */
    }
  }
  throwIfAborted(signal)

  progress('Recording clip in real time…', 0, true)
  const result = await renderRealtime(spec, peaks, audio, cover, signal, (f) => progress('Recording clip in real time…', f, true))
  const poster = await paintPoster({ spec, peaks, cover }, document.createElement('canvas'), duration * POSTER_AT)
  cover?.close()
  return { ...base, video: result.blob, mime: result.mime, ext: result.ext, poster, realtime: true, path: 'realtime' }
}

/** Paint a single preview frame (main thread) — used by the clip maker's live preview. */
export async function paintPreview(
  canvas: HTMLCanvasElement,
  spec: ClipSpec,
  peaks: Peaks,
  cover: ImageBitmap | null,
  t: number,
) {
  const plan = planPaint(spec)
  canvas.width = plan.layout.width
  canvas.height = plan.layout.height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  paintClipFrame(ctx, plan, { cover, frame: null, peaks }, t)
}

export { loadCover }
