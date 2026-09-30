'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'
import { Checkbox, Select, Textarea } from '@/components/studio-ui'
import { WHISPER_MODELS, transcribeBuffer, type WhisperModelId } from '@/lib/podcast/ai/whisper'
import { transcriptReviewStatus, type TranscriptReviewStatus } from '@/lib/podcast/safety/checklist'
import { cuesToSrt, cuesToVtt, realignWords, wordsToCues, wordsToPlainText, type TranscriptWord } from '@/lib/studio/transcript'
import { Advanced, Btn, Note, Progress } from './ui'

type Props = {
  words: TranscriptWord[]
  hasExistingTranscript: boolean
  canStoreWords: boolean
  disabled: boolean
  getSource: () => Promise<AudioBuffer>
  onWords: (words: TranscriptWord[], label: string) => Promise<void>
  onError: (msg: string) => void
  /** Episode fields for the "Transcript reviewed" sign-off (undefined → not shown). */
  review?: {
    episode: Parameters<typeof transcriptReviewStatus>[0]
    onMark: (reviewed: boolean) => Promise<unknown>
    hasGuest: boolean
  }
  /** Base name for downloaded caption files. */
  fileBase?: string
}

/** Same writers the public transcript.vtt / .srt / .txt routes and the RSS <podcast:transcript> use. */
export function transcriptDownload(words: TranscriptWord[], kind: 'vtt' | 'srt' | 'txt') {
  const cues = wordsToCues(words)
  if (kind === 'vtt') return { body: cuesToVtt(cues), type: 'text/vtt' }
  if (kind === 'srt') return { body: cuesToSrt(cues), type: 'application/x-subrip' }
  return { body: wordsToPlainText(words), type: 'text/plain' }
}

function webgpuLikely() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function TranscribeSection({ words, hasExistingTranscript, canStoreWords, disabled, getSource, onWords, onError, review, fileBase = 'episode' }: Props) {
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
      if (msg !== 'Cancelled') onError(`Transcription failed: ${msg}. Try “Compatibility mode” under Options, or a shorter file.`)
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
  const reviewStatus: TranscriptReviewStatus | null = review ? transcriptReviewStatus(review.episode) : null

  function download(kind: 'vtt' | 'srt' | 'txt') {
    const { body, type } = transcriptDownload(words, kind)
    const url = URL.createObjectURL(new Blob([body], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBase}-transcript.${kind}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <Btn tone="primary" disabled={disabled} onClick={() => void run()}>
            {words.length ? 'Transcribe again' : 'Transcribe this episode'}
          </Btn>
        ) : (
          <Btn tone="danger" onClick={() => abortRef.current?.abort()}>Cancel</Btn>
        )}
        {usedDevice && (
          <span className="studio-type-body text-[12px] text-silver">
            Running on {usedDevice === 'webgpu' ? 'the graphics chip (WebGPU)' : 'the processor (WebAssembly)'}
          </span>
        )}
        {words.length > 0 && !running && (
          <span className="studio-type-body text-[12px] text-silver">{words.length.toLocaleString()} timed words</span>
        )}
      </div>
      {progress && <Progress value={progress.value} label={progress.label} />}
      {!canStoreWords && (
        <Note>Timed captions need the 20260924000002 database update; plain text will still be saved.</Note>
      )}

      <Advanced title="Options: accuracy and engine">
        <fieldset className="grid gap-3 md:grid-cols-2" disabled={running || disabled}>
          <legend className="sr-only">Transcription settings</legend>
          <div role="radiogroup" aria-label="Accuracy" className="space-y-2">
            <span className="studio-type-label block">Accuracy</span>
            {(Object.keys(WHISPER_MODELS) as WhisperModelId[]).map((id) => (
              <label key={id} className="studio-type-body flex items-start gap-2 text-[13px] text-white">
                <input type="radio" name="whisper-model" value={id} checked={model === id} onChange={() => setModel(id)} className="mt-1 accent-forged" />
                <span>
                  {WHISPER_MODELS[id].label}
                  <span className="block text-[12px] text-silver">{WHISPER_MODELS[id].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <Select label="Engine" value={device} onChange={(e) => setDevice(e.target.value as 'auto' | 'wasm')}>
              <option value="auto">Automatic (uses the graphics chip when available — fastest)</option>
              <option value="wasm">Compatibility mode (slower, works everywhere)</option>
            </Select>
            <p className="studio-type-body text-[12px] text-silver">
              One-time download ≈ {size} MB. {gpu ? 'This browser supports GPU acceleration.' : 'No GPU acceleration in this browser (Safari/Firefox may be slow) — Chrome or Edge on a laptop is fastest.'}
            </p>
          </div>
        </fieldset>
      </Advanced>

      {words.length > 0 && (
        <Advanced title="Fix words in the transcript / download captions">
          <Textarea
            label="Transcript — fix any mistakes, then save (timings are kept)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="font-mono text-[12px] leading-relaxed"
            hint="Speakers are not labelled here (use “Edit by text” for that). Automatic transcripts miss names and can mishear words — read it through before publishing."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn tone="accent" disabled={!dirty || disabled || running} onClick={() => void saveEdits()}>Save transcript edits</Btn>
            <span className="studio-type-body text-[12px] text-silver">Download:</span>
            {(['vtt', 'srt', 'txt'] as const).map((k) => (
              <Btn key={k} onClick={() => download(k)} disabled={running}><Download size={12} /> {k.toUpperCase()}</Btn>
            ))}
          </div>
        </Advanced>
      )}

      {review && reviewStatus && reviewStatus !== 'unsupported' && (
        <div id="transcript-review" className="space-y-2 border-t border-divider pt-3">
          {reviewStatus === 'reviewed' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="studio-type-body flex items-center gap-1 text-[13px] text-lane-cohost-2">
                <CheckCircle2 size={14} aria-hidden /> Transcript reviewed
                {review.episode.transcript_reviewed_at ? ` ${new Date(review.episode.transcript_reviewed_at).toLocaleString()}` : ''}
                {review.episode.transcript_reviewed_by ? ` by ${review.episode.transcript_reviewed_by}` : ''}.
              </span>
              <Btn disabled={disabled || running} onClick={() => void review.onMark(false)}>Undo</Btn>
            </div>
          ) : (
            <>
              <p className={`studio-type-body text-[13px] ${review.hasGuest && reviewStatus !== 'no_transcript' ? 'text-white' : 'text-silver'}`}>
                {reviewStatus === 'no_transcript'
                  ? 'Transcribe (or paste a transcript in the episode details) first.'
                  : reviewStatus === 'changed'
                    ? 'The transcript changed since it was last reviewed — read it through again.'
                    : review.hasGuest
                      ? 'Required before release: read the transcript once for anything that could identify the guest — names, places, workplaces, dates.'
                      : 'Recommended: read the transcript once before release.'}
              </p>
              <Checkbox
                label="I read the whole transcript for anything that could identify the guest"
                disabled={disabled || running || reviewStatus === 'no_transcript' || dirty}
                checked={false}
                onChange={(e) => {
                  if (e.target.checked) void review.onMark(true)
                }}
                hint={dirty ? 'Save your transcript edits first.' : undefined}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
