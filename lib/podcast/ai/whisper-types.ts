/** Shared between the Whisper worker and its client wrapper. */

export type WhisperModelId = 'base' | 'small'

export const WHISPER_MODELS: Record<WhisperModelId, { repo: string; label: string; hint: string; downloadMb: { webgpu: number; wasm: number } }> = {
  base: {
    // *_timestamped variants export cross-attentions → word-level timestamps.
    repo: 'onnx-community/whisper-base.en_timestamped',
    label: 'Fast (base.en)',
    hint: 'Good for clear studio speech. About 5–10 minutes for a 45-minute episode on a laptop.',
    downloadMb: { webgpu: 165, wasm: 77 },
  },
  small: {
    repo: 'onnx-community/whisper-small.en_timestamped',
    label: 'Better (small.en)',
    hint: 'Fewer mistakes with names, accents and phone audio. 2–4× slower; larger one-time download.',
    downloadMb: { webgpu: 410, wasm: 249 },
  },
}

export type WorkerIn =
  | { type: 'load'; model: WhisperModelId; device: 'auto' | 'webgpu' | 'wasm' }
  | { type: 'chunk'; id: number; audio: Float32Array; offset: number }

export type WorkerOut =
  | { type: 'status'; message: string }
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; id: number; words: { w: string; s: number; e: number }[] }
  | { type: 'error'; id?: number; message: string }
