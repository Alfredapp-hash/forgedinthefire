'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WHISPER_MODELS, transcribeBuffer, type WhisperModelId } from '@/lib/podcast/ai/whisper'
import { realignWords, wordsToPlainText, type TranscriptWord } from '@/lib/studio/transcript'
import { Btn, Progress, StepHeading, cardCls, inputCls, labelCls } from './ui'

type Props = {
  words: TranscriptWord[]
  hasExistingTranscript: boolean
  canStoreWords: boolean
  disabled: boolean
  getSource: () => Promise<AudioBuffer>
  onWords: (words: TranscriptWord[], label: string) => Promise<void>
  onError: (msg: string) => void
}

function webgpuLikely() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function TranscribeSection({ words, hasExistingTranscript, canStoreWords, disabled, getSource, onWords, onError }: Props) {
  const [model, setModel] = useState<WhisperModelId>('base')
  const [device, setDevice] = useState<'auto' | 'wasm'>('auto')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ label: string; value: number | null } | null>(null)
  const [usedDevice, setUsedDevice] = useState<'webgpu' | 'wasm' | null>(null)
  const plain = wordsToPlainText(words)
  const [draft, setDraft] = useState(plain)
  const abortRef = useRef<AbortController | null>(null)
  const startedAt = useRef(0)

  // Refresh the editable text when words change from outside (new transcription, publish).
  useEffect(() => setDraft(plain), [plain])

  useEffect(() => () => abortRef.current?.abort(), [])

  const gpu = webgpuLikely()
  const size = WHISPER_MODELS[model].downloadMb[device === 'wasm' || !gpu ? 'wasm' : 'webgpu']

  async function run() {
    if ((words.length || hasExistingTranscript) && !window.confirm('Replace the current transcript with a new automatic one? Edits you made to the old transcript will be lost.')) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setUsedDevice(null)
    setProgress({ label: 'Loading episode audio into this browser…', value: null })
    try {
      const buffer = await getSource()
      startedAt.current = performance.now()
      const result = await transcribeBuffer(buffer, {
        model,
        device,
        signal: ctrl.signal,
        onDevice: setUsedDevice,
        onProgress: (p) => {
          if (p.stage === 'prepare') setProgress({ label: p.message, value: null })
          else if (p.stage === 'download') {
            setProgress({
              label: `Downloading the speech model once (${Math.round(p.loaded / 1e6)} of ${Math.round(p.total / 1e6) || '…'} MB) — it is saved in this browser for next time`,
              value: p.total ? p.loaded / p.total : null,
            })
          } else {
            const elapsed = (performance.now() - startedAt.current) / 1000
            const eta = p.done > 1 ? Math.round(((elapsed / p.done) * (p.total - p.done)) / 60) : null
            setProgress({
              label: `Transcribing part ${Math.min(p.done + 1, p.total)} of ${p.total} · ${p.words} words so far${eta != null ? ` · about ${eta || '<1'} min left` : ''}`,
              value: p.total ? p.done / p.total : null,
            })
          }
        },
      })
      if (!result.length) throw new Error('No speech was recognised. Check the episode audio plays correctly.')
      await onWords(result, `Transcribed ${result.length.toLocaleString()} words${canStoreWords ? ' — timed captions ready' : ''}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg !== 'Cancelled') onError(`Transcription failed: ${msg}. Try “Compatibility mode” below, or a shorter file.`)
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  async function saveEdits() {
    const next = realignWords(words, draft)
    if (!next.length) return onError('The transcript is empty.')
    await onWords(next, 'Transcript edits saved (timings kept)')
  }

  const dirty = words.length > 0 && draft.trim() !== plain.trim()

  return (
    <div className={cardCls}>
      <StepHeading
        n={1}
        title="Transcribe"
        hint="Speech-to-text runs inside this browser. The audio is never sent anywhere. The first run downloads a speech model, which your browser then keeps."
      />
      <fieldset className="grid gap-3 md:grid-cols-2" disabled={running || disabled}>
        <legend className="sr-only">Transcription settings</legend>
        <div role="radiogroup" aria-label="Accuracy" className="space-y-1">
          <span className={labelCls}>Accuracy</span>
          {(Object.keys(WHISPER_MODELS) as WhisperModelId[]).map((id) => (
            <label key={id} className="flex items-start gap-2 text-sm text-[#F6FAFC]">
              <input type="radio" name="whisper-model" value={id} checked={model === id} onChange={() => setModel(id)} className="mt-1" />
              <span>
                {WHISPER_MODELS[id].label}
                <span className="block text-xs text-[#A9B8C6]">{WHISPER_MODELS[id].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className={labelCls}>Engine</span>
            <select value={device} onChange={(e) => setDevice(e.target.value as 'auto' | 'wasm')} className={inputCls}>
              <option value="auto">Automatic (uses the graphics chip when available — fastest)</option>
              <option value="wasm">Compatibility mode (slower, works everywhere)</option>
            </select>
          </label>
          <p className="text-xs text-[#A9B8C6]">
            One-time download ≈ {size} MB. {gpu ? 'This browser supports GPU acceleration.' : 'No GPU acceleration in this browser (Safari/Firefox may be slow) — Chrome or Edge on a laptop is fastest.'}
          </p>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <Btn tone="primary" disabled={disabled} onClick={() => void run()}>
            {words.length ? 'Transcribe again' : 'Transcribe episode'}
          </Btn>
        ) : (
          <Btn tone="danger" onClick={() => abortRef.current?.abort()}>Cancel</Btn>
        )}
        {running && <Loader2 size={14} className="animate-spin text-[#8DEBFF]" aria-hidden />}
        {usedDevice && <span className="text-xs text-[#A9B8C6]">Running on {usedDevice === 'webgpu' ? 'graphics chip (WebGPU)' : 'processor (WebAssembly)'}</span>}
        {!canStoreWords && <span className="text-xs text-[#FFB86B]">Timed captions need the 20260924000002 database update; plain text will still be saved.</span>}
      </div>
      {progress && <Progress value={progress.value} label={progress.label} />}

      {words.length > 0 && (
        <div className="space-y-2">
          <label className="block">
            <span className={labelCls}>Transcript — fix any mistakes, then save (timings are kept)</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className={`${inputCls} font-mono text-xs leading-relaxed`}
              aria-describedby="transcript-edit-hint"
            />
          </label>
          <p id="transcript-edit-hint" className="text-xs text-[#A9B8C6]">
            {words.length.toLocaleString()} timed words. Speakers are not labelled. Automatic transcripts miss names and can mishear words — read it through before publishing.
          </p>
          <Btn tone="accent" disabled={!dirty || disabled || running} onClick={() => void saveEdits()}>Save transcript edits</Btn>
        </div>
      )}
    </div>
  )
}
