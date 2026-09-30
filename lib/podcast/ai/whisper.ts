/**
 * Client side of in-browser transcription. Decodes/resamples to 16 kHz mono, cuts the
 * episode into ≤30 s windows at the quietest moment near each boundary (so words are not
 * sliced), and feeds them one by one to the Whisper worker. Nothing is uploaded.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'
import type { WhisperModelId, WorkerIn, WorkerOut } from './whisper-types'

export { WHISPER_MODELS } from './whisper-types'
export type { WhisperModelId } from './whisper-types'

export const WHISPER_RATE = 16000
const WINDOW_S = 30
const SEARCH_S = 6

export type TranscribeProgress =
  | { stage: 'prepare'; message: string }
  | { stage: 'download'; loaded: number; total: number }
  | { stage: 'transcribe'; done: number; total: number; words: number }

export type TranscribeOptions = {
  model: WhisperModelId
  device?: 'auto' | 'webgpu' | 'wasm'
  onProgress?: (p: TranscribeProgress) => void
  onDevice?: (device: 'webgpu' | 'wasm') => void
  signal?: AbortSignal
}

/** Mono 16 kHz copy of a decoded buffer (what Whisper expects). */
export async function toWhisperInput(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * WHISPER_RATE)
  const offline = new OfflineAudioContext(1, Math.max(1, length), WHISPER_RATE)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination) // down-mix to mono by the graph (speakers → mono rules)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/** Window boundaries (in samples) at quiet points no more than 30 s apart. */
export function chunkBoundaries(audio: Float32Array, rate = WHISPER_RATE): number[] {
  const bounds = [0]
  const win = WINDOW_S * rate
  const frame = Math.round(0.05 * rate)
  let start = 0
  while (audio.length - start > win) {
    const hi = start + win
    const lo = Math.max(start + rate * 10, hi - SEARCH_S * rate)
    let best = hi
    let bestEnergy = Infinity
    for (let f = lo; f + frame <= hi; f += frame) {
      let e = 0
      for (let i = f; i < f + frame; i++) e += audio[i] * audio[i]
      if (e < bestEnergy) {
        bestEnergy = e
        best = f + Math.floor(frame / 2)
      }
    }
    bounds.push(best)
    start = best
  }
  bounds.push(audio.length)
  return bounds
}

function rms(a: Float32Array) {
  let e = 0
  for (let i = 0; i < a.length; i += 4) e += a[i] * a[i]
  return Math.sqrt(e / Math.max(1, a.length / 4))
}

export function createWhisperWorker(): Worker {
  return new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
}

/** Transcribe a whole episode → timed words. Throws 'Cancelled' when aborted. */
export async function transcribeBuffer(buffer: AudioBuffer, opts: TranscribeOptions): Promise<TranscriptWord[]> {
  opts.onProgress?.({ stage: 'prepare', message: 'Preparing audio…' })
  const audio = await toWhisperInput(buffer)
  const bounds = chunkBoundaries(audio)
  const worker = createWhisperWorker()
  const pending = new Map<number, { resolve: (w: TranscriptWord[]) => void; reject: (e: Error) => void }>()
  let loadResolve: ((d: 'webgpu' | 'wasm') => void) | null = null
  let loadReject: ((e: Error) => void) | null = null

  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data
    if (msg.type === 'status') opts.onProgress?.({ stage: 'prepare', message: msg.message })
    else if (msg.type === 'download') opts.onProgress?.({ stage: 'download', loaded: msg.loaded, total: msg.total })
    else if (msg.type === 'ready') loadResolve?.(msg.device)
    else if (msg.type === 'result') {
      pending.get(msg.id)?.resolve(msg.words)
      pending.delete(msg.id)
    } else if (msg.type === 'error') {
      const err = new Error(msg.message)
      if (msg.id != null) {
        pending.get(msg.id)?.reject(err)
        pending.delete(msg.id)
      } else loadReject?.(err)
    }
  }
  worker.onerror = (e) => {
    const err = new Error(e.message || 'The transcription worker stopped unexpectedly.')
    loadReject?.(err)
    pending.forEach((p) => p.reject(err))
    pending.clear()
  }
  const abort = () => {
    worker.terminate()
    const err = new Error('Cancelled')
    loadReject?.(err)
    pending.forEach((p) => p.reject(err))
    pending.clear()
  }
  opts.signal?.addEventListener('abort', abort, { once: true })
  const send = (msg: WorkerIn, transfer: Transferable[] = []) => worker.postMessage(msg, transfer)

  try {
    const device = await new Promise<'webgpu' | 'wasm'>((resolve, reject) => {
      loadResolve = resolve
      loadReject = reject
      send({ type: 'load', model: opts.model, device: opts.device ?? 'auto' })
    })
    opts.onDevice?.(device)
    const words: TranscriptWord[] = []
    const total = bounds.length - 1
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new Error('Cancelled')
      opts.onProgress?.({ stage: 'transcribe', done: i, total, words: words.length })
      const chunk = audio.slice(bounds[i], bounds[i + 1])
      // Near-silent windows make Whisper hallucinate ("Thank you."): skip them.
      if (rms(chunk) < 0.002) continue
      const offset = bounds[i] / WHISPER_RATE
      const part = await new Promise<TranscriptWord[]>((resolve, reject) => {
        pending.set(i, { resolve, reject })
        send({ type: 'chunk', id: i, audio: chunk, offset }, [chunk.buffer])
      })
      words.push(...dedupeRepeats(part))
    }
    opts.onProgress?.({ stage: 'transcribe', done: total, total, words: words.length })
    return words.map((w) => ({ w: w.w, s: Math.round(w.s * 100) / 100, e: Math.round(w.e * 100) / 100 }))
  } finally {
    opts.signal?.removeEventListener('abort', abort)
    worker.terminate()
  }
}

/** Drop Whisper's runaway loops (the same 1–4 word phrase repeated 4+ times). */
function dedupeRepeats(words: TranscriptWord[]): TranscriptWord[] {
  const out: TranscriptWord[] = []
  const key = (w: TranscriptWord) => w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  for (const w of words) {
    out.push(w)
    for (let n = 1; n <= 4; n++) {
      const reps = 4
      if (out.length < n * reps) continue
      const tail = out.slice(-n * reps)
      const unit = tail.slice(0, n).map(key).join(' ')
      let same = true
      for (let r = 1; r < reps && same; r++) same = tail.slice(r * n, r * n + n).map(key).join(' ') === unit
      if (same) {
        out.splice(out.length - n, n)
        break
      }
    }
  }
  return out
}
