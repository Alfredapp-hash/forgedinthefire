/**
 * In-browser Whisper (transformers.js) — runs in a module Web Worker so the editor stays
 * responsive. Audio never leaves the device: the only network traffic is the one-time
 * download of the library (jsDelivr) and model weights (huggingface.co), cached by the
 * browser afterwards.
 *
 * transformers.js is NOT an npm dependency on purpose (its onnxruntime-node postinstall
 * breaks our builds). It is loaded at runtime from jsDelivr's ESM bundle, pinned.
 */
import type { WhisperModelId, WorkerIn, WorkerOut } from './whisper-types'
import { WHISPER_MODELS } from './whisper-types'

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm'

type Pipeline = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{
  text: string
  chunks?: { text: string; timestamp: [number | null, number | null] }[]
}>

const ctx = self as unknown as {
  postMessage: (msg: WorkerOut) => void
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null
}

let asr: Pipeline | null = null
let loadedKey = ''

function post(msg: WorkerOut) {
  ctx.postMessage(msg)
}

async function pickDevice(requested: 'auto' | 'webgpu' | 'wasm') {
  if (requested === 'wasm') return { device: 'wasm' as const, f16: false }
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu
  if (!gpu) return { device: 'wasm' as const, f16: false }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { device: 'wasm' as const, f16: false }
    return { device: 'webgpu' as const, f16: adapter.features.has('shader-f16') }
  } catch {
    return { device: 'wasm' as const, f16: false }
  }
}

async function load(model: WhisperModelId, requested: 'auto' | 'webgpu' | 'wasm') {
  const { device, f16 } = await pickDevice(requested)
  const key = `${model}:${device}`
  if (asr && loadedKey === key) {
    post({ type: 'ready', device })
    return
  }
  post({ type: 'status', message: 'Loading the speech-recognition library…' })
  const tf = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ TRANSFORMERS_URL as string)
  tf.env.allowLocalModels = false
  // WebGPU: fp16 encoder when the GPU supports it (half the download), 4-bit decoder.
  // WASM: 8-bit weights everywhere — smallest download, runs on any device.
  const dtype = device === 'webgpu'
    ? { encoder_model: f16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' }
    : { encoder_model: 'q8', decoder_model_merged: 'q8' }
  asr = await tf.pipeline('automatic-speech-recognition', WHISPER_MODELS[model].repo, {
    device,
    dtype,
    progress_callback: (p: { status: string; loaded?: number; total?: number; progress?: number }) => {
      if (p.status === 'progress_total') {
        post({ type: 'download', loaded: p.loaded ?? 0, total: p.total ?? 0 })
      }
    },
  }) as Pipeline
  loadedKey = key
  post({ type: 'ready', device })
}

async function transcribe(id: number, audio: Float32Array, offset: number) {
  if (!asr) throw new Error('Model not loaded')
  const out = await asr(audio, { return_timestamps: 'word' })
  const words: { w: string; s: number; e: number }[] = []
  const dur = audio.length / 16000
  for (const c of out.chunks || []) {
    const text = (c.text || '').trim()
    if (!text) continue
    const [s0, e0] = c.timestamp
    const s = Math.max(0, Math.min(dur, s0 ?? e0 ?? 0))
    const e = Math.max(s, Math.min(dur, e0 ?? s + 0.3))
    words.push({ w: text, s: offset + s, e: offset + e })
  }
  post({ type: 'result', id, words })
}

ctx.onmessage = (event) => {
  const msg = event.data
  const run = async () => {
    if (msg.type === 'load') await load(msg.model, msg.device)
    else if (msg.type === 'chunk') await transcribe(msg.id, msg.audio, msg.offset)
  }
  run().catch((err: unknown) => {
    post({ type: 'error', id: msg.type === 'chunk' ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) })
  })
}
