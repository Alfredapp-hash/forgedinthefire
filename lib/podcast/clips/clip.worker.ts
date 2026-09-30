/**
 * Off-main-thread clip encode: OffscreenCanvas + WebCodecs + mediabunny. The main thread decodes
 * the episode audio (no AudioContext in workers), slices and bleeps the clip, computes peaks and
 * transfers the channel data here. Replies `unsupported` when this browser's worker lacks
 * OffscreenCanvas / VideoEncoder so the caller can fall back to the main thread.
 */
import { encodeClip, paintPoster, videoFrameAt } from './encode'
import type { ClipSpec } from './types'
import type { Peaks } from './waveform'

export type ClipWorkerRequest =
  | {
      type: 'render'
      id: number
      spec: ClipSpec
      peaks: { values: Float32Array; perSec: number; duration: number }
      channels: Float32Array[]
      sampleRate: number
      cover: ImageBitmap | null
      video: Blob | null
      posterAt: number
    }
  | { type: 'cancel'; id: number }

export type ClipWorkerResponse =
  | { type: 'progress'; id: number; fraction: number }
  | { type: 'done'; id: number; video: Blob; mime: string; ext: 'mp4' | 'webm'; poster: Blob }
  | { type: 'error'; id: number; error: string; unsupported?: boolean; cancelled?: boolean }

type Scope = {
  onmessage: ((event: MessageEvent<ClipWorkerRequest>) => void) | null
  postMessage: (message: ClipWorkerResponse, transfer?: Transferable[]) => void
}

const scope = self as unknown as Scope
const cancelled = new Set<number>()

scope.onmessage = (event) => {
  const msg = event.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.id)
    return
  }
  void run(msg)
}

async function run(msg: Extract<ClipWorkerRequest, { type: 'render' }>) {
  const { id } = msg
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    scope.postMessage({ type: 'error', id, error: 'Worker cannot encode video here', unsupported: true })
    return
  }
  try {
    const peaks: Peaks = msg.peaks
    const canvas = new OffscreenCanvas(16, 16)
    const job = {
      spec: msg.spec,
      peaks,
      audio: { channels: msg.channels, sampleRate: msg.sampleRate },
      cover: msg.cover,
      video: msg.video,
      isCancelled: () => cancelled.has(id),
      onProgress: (fraction: number) => scope.postMessage({ type: 'progress', id, fraction }),
    }
    const result = await encodeClip(job, canvas)
    const frame = msg.video ? await videoFrameAt(msg.video, msg.spec.range.startSec + msg.posterAt).catch(() => null) : null
    const poster = await paintPoster(job, new OffscreenCanvas(16, 16), msg.posterAt, frame?.bitmap ?? null)
    frame?.bitmap.close()
    scope.postMessage({ type: 'done', id, video: result.blob, mime: result.mime, ext: result.ext, poster })
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError'
    scope.postMessage({
      type: 'error',
      id,
      error: err instanceof Error ? err.message : String(err),
      cancelled: isAbort || cancelled.has(id),
    })
  } finally {
    cancelled.delete(id)
    msg.cover?.close()
  }
}
