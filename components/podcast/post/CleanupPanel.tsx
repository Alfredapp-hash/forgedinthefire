'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, Undo2 } from 'lucide-react'
import { decodeUrl, encodeMp3 } from '@/lib/podcast/audio'
import { REDACTION_LABEL, redactText, redactWords } from '@/lib/podcast/safety/protected-words'
import { remapChapters, remapWords, renderPlan, type EditPlan } from '@/lib/podcast/safety/render'
import type { DisguisePresetId } from '@/lib/podcast/safety/voice-disguise'
import type { DisguiseRegion } from '@/lib/podcast/safety/render'
import type { EpisodeSafetyFields } from '@/lib/studio/release'
import { cleanWords, transcriptKind, wordsToPlainText, type TranscriptWord } from '@/lib/studio/transcript'
import type { PodcastChapter, PodcastEpisode } from '@/lib/studio/types'
import { ChaptersSection } from './ChaptersSection'
import { DisguiseSection } from './DisguiseSection'
import { FillerSection, initialFillers, type FillerState } from './FillerSection'
import { GuestSignoffs } from './GuestSignoffs'
import { ProtectSection, initialProtect, type ProtectState } from './ProtectSection'
import { TranscribeSection } from './TranscribeSection'
import { Btn, Progress, StepHeading, cardCls, useClipPlayer } from './ui'

type Episode = PodcastEpisode & EpisodeSafetyFields

export type PostSnapshot = {
  audio_url: string | null
  audio_mime: string | null
  file_size: number | null
  duration_seconds: number | null
  transcript: string | null
  transcript_words: TranscriptWord[] | null
  chapters: PodcastChapter[]
}

type Props = {
  episode: Episode
  disabled: boolean
  save: (patch: Record<string, unknown>, label?: string) => Promise<PodcastEpisode | null>
  /** Upload the rendered file and PATCH audio fields + `extra` in one request. */
  publishAudio: (file: File, duration: number, extra: Record<string, unknown>, label: string) => Promise<boolean>
  revert: () => Promise<void>
  onError: (msg: string) => void
}

export function CleanupPanel({ episode, disabled, save, publishAudio, revert, onError }: Props) {
  const storedWords = useMemo(() => cleanWords(episode.transcript_words), [episode.transcript_words])
  const [words, setWords] = useState<TranscriptWord[]>(storedWords)
  useEffect(() => setWords(storedWords), [storedWords])
  const canStoreWords = 'transcript_words' in episode

  const sourceRef = useRef<{ url: string; buffer: AudioBuffer } | null>(null)
  const [loadingSource, setLoadingSource] = useState(false)
  const getSource = useCallback(async () => {
    const url = episode.audio_url
    if (!url) throw new Error('Upload the episode audio first.')
    if (sourceRef.current?.url === url) return sourceRef.current.buffer
    setLoadingSource(true)
    try {
      const buffer = await decodeUrl(url)
      sourceRef.current = { url, buffer }
      return buffer
    } catch {
      throw new Error('Could not load the episode audio into the browser (check the file plays and that storage allows downloads).')
    } finally {
      setLoadingSource(false)
    }
  }, [episode.audio_url])

  const [protect, setProtect] = useState<ProtectState>(initialProtect)
  const [regions, setRegions] = useState<(DisguiseRegion & { preset: DisguisePresetId })[]>([])
  const [fillers, setFillers] = useState<FillerState>(initialFillers)
  const [render, setRender] = useState<{ url: string; file: File; duration: number; plan: EditPlan } | null>(null)
  const [rendering, setRendering] = useState<{ label: string; value: number | null } | null>(null)
  const clip = useClipPlayer(episode.audio_url)

  // Any change to the audio or plan invalidates a rendered preview.
  useEffect(() => {
    setRender((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
  }, [episode.audio_url, protect, regions, fillers])
  useEffect(() => () => {
    setRender((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
  }, [])

  async function onWords(next: TranscriptWord[], label: string) {
    setWords(next)
    const patch: Record<string, unknown> = { transcript: wordsToPlainText(next) }
    if (canStoreWords) patch.transcript_words = next
    await save(patch, label)
    // A fresh transcript means earlier search results point at stale indices.
    setProtect((p) => ({ ...p, hits: [], decisions: {}, searchedTerms: null }))
    setFillers(initialFillers)
  }

  const acceptedHits = protect.hits.filter((h) => protect.decisions[h.id] === 'accept')
  const pendingHits = protect.hits.filter((h) => !protect.decisions[h.id])
  const searchedCurrent = protect.searchedTerms != null && protect.searchedTerms.join('\n') === protect.terms.join('\n') && protect.terms.length > 0
  const reviewComplete = searchedCurrent && pendingHits.length === 0
  const acceptedCuts = fillers.suggestions.filter((s) => fillers.decisions[s.id] === 'accept').map((s) => s.cut)
  const bleepCount = acceptedHits.length + protect.manual.length
  const planEmpty = !bleepCount && !regions.length && !acceptedCuts.length
  const duration = episode.duration_seconds || sourceRef.current?.buffer.duration || words[words.length - 1]?.e || 0

  async function markReviewed(nothingFound: boolean) {
    if (nothingFound && !window.confirm('Confirm you listened for names, places, schools and workplaces and this episode has nothing that could identify anyone?')) return
    await save({ protected_words_reviewed: true }, 'Protected-words review recorded')
  }

  async function doRender() {
    if (pendingHits.length) {
      onError(`Check the ${pendingHits.length} remaining possible match${pendingHits.length === 1 ? '' : 'es'} in step 2 first (accept or reject each).`)
      document.getElementById('protect')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const plan: EditPlan = {
      bleeps: [...acceptedHits.map((h) => ({ start: h.start, end: h.end })), ...protect.manual],
      bleepMode: protect.mode,
      bleepPad: protect.pad,
      disguise: regions.map(({ start, end, settings }) => ({ start, end, settings })),
      cuts: acceptedCuts,
    }
    setRendering({ label: 'Loading episode audio…', value: null })
    try {
      const source = await getSource()
      const out = await renderPlan(source, plan, (p) => setRendering({ label: p.stage, value: p.fraction ?? null }))
      setRendering({ label: 'Encoding MP3…', value: null })
      await new Promise((r) => setTimeout(r, 30))
      const blob = await encodeMp3(out)
      const base = (episode.slug || 'episode').replace(/[^a-z0-9-]/gi, '-')
      const file = new File([blob], `${base}-clean-${Date.now()}.mp3`, { type: 'audio/mpeg' })
      setRender((r) => {
        if (r) URL.revokeObjectURL(r.url)
        return { url: URL.createObjectURL(blob), file, duration: out.duration, plan }
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Rendering failed')
    } finally {
      setRendering(null)
    }
  }

  async function doPublish() {
    if (!render) return
    const msg = [
      'Replace the episode audio with the cleaned-up version?',
      bleepCount ? `• ${bleepCount} protected word${bleepCount === 1 ? '' : 's'} bleeped` : '',
      regions.length ? `• voice disguised in ${regions.length} section${regions.length === 1 ? '' : 's'}` : '',
      acceptedCuts.length ? `• ${acceptedCuts.length} filler/pause edit${acceptedCuts.length === 1 ? '' : 's'}` : '',
      'The current file is kept for one-click revert.',
    ].filter(Boolean).join('\n')
    if (!window.confirm(msg)) return
    const src = sourceRef.current?.buffer.duration ?? duration
    const redacted = acceptedHits.length ? redactWords(words, acceptedHits) : words
    const nextWords = remapWords(redacted, render.plan.cuts, src)
    const snapshot: PostSnapshot = {
      audio_url: episode.audio_url,
      audio_mime: episode.audio_mime,
      file_size: episode.file_size,
      duration_seconds: episode.duration_seconds,
      transcript: episode.transcript,
      transcript_words: canStoreWords ? storedWords : null,
      chapters: episode.chapters || [],
    }
    const extra: Record<string, unknown> = {
      chapters: remapChapters(episode.chapters || [], render.plan.cuts, src),
    }
    if (nextWords.length) {
      extra.transcript = wordsToPlainText(nextWords)
      if (canStoreWords) extra.transcript_words = nextWords
    } else if (episode.transcript && transcriptKind(episode.transcript) === 'text' && protect.searchedTerms?.length && bleepCount) {
      // No word timings: still scrub the plain transcript of the accepted terms.
      const terms = Array.from(new Set(acceptedHits.map((h) => h.term)))
      if (terms.length) extra.transcript = redactText(episode.transcript, terms)
    }
    if ('audio_url_previous' in episode) {
      extra.audio_url_previous = episode.audio_url
      extra.post_edit_snapshot = snapshot
    }
    if (reviewComplete && 'protected_words_reviewed_at' in episode) extra.protected_words_reviewed = true
    const ok = await publishAudio(render.file, render.duration, extra, 'Cleaned-up audio is now the episode audio')
    if (ok) {
      sourceRef.current = null
      setProtect((p) => ({ ...initialProtect, terms: p.terms, mode: p.mode, pad: p.pad }))
      setRegions([])
      setFillers(initialFillers)
    }
  }

  const exclude = protect.terms
  const busy = disabled || Boolean(rendering) || loadingSource

  return (
    <section id="cleanup" className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4" aria-labelledby="cleanup-title">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#8DEBFF]">Post-production</p>
        <h2 id="cleanup-title" className="flex items-center gap-2 text-lg font-semibold text-[#F6FAFC]">
          <ShieldCheck size={18} aria-hidden /> Clean-up & safety
        </h2>
        <p className="text-sm text-[#A9B8C6] max-w-3xl">
          Works on the finished episode audio. Everything — transcription, bleeps, voice disguise — happens on this computer;
          no audio is sent to any outside service. Nothing changes until you press “Replace episode audio”.
        </p>
      </div>

      {!episode.audio_url ? (
        <p className="text-sm text-[#A9B8C6]">Upload the finished episode audio first.</p>
      ) : (
        <>
          <GuestSignoffs episode={episode} disabled={disabled} save={save} />
          {loadingSource && <Progress value={null} label="Loading episode audio into this browser…" />}

          <TranscribeSection
            words={words}
            hasExistingTranscript={Boolean((episode.transcript || '').trim())}
            canStoreWords={canStoreWords}
            disabled={busy}
            getSource={getSource}
            onWords={onWords}
            onError={onError}
          />

          <ProtectSection
            words={words}
            state={protect}
            onChange={setProtect}
            play={clip.play}
            playing={clip.playing}
            reviewedAt={episode.protected_words_reviewed_at}
            canMarkReviewed={reviewComplete && acceptedHits.length === 0 && protect.manual.length === 0}
            onMarkReviewed={(nothing) => void markReviewed(nothing)}
            disabled={busy}
          />

          <DisguiseSection regions={regions} onChange={setRegions} duration={duration} getSource={getSource} disabled={busy} onError={onError} />

          <FillerSection words={words} state={fillers} onChange={setFillers} play={clip.play} playing={clip.playing} disabled={busy} />

          <div className={cardCls}>
            <StepHeading
              n={5}
              title="Apply changes"
              hint="Builds a new MP3 in this browser. Listen to the before and after, then replace the episode audio. Captions, chapters and the transcript are shifted to match."
            />
            <ul className="text-sm text-[#B8C4CF] list-disc pl-5">
              <li>{bleepCount} bleep{bleepCount === 1 ? '' : 's'} ({protect.mode === 'tone' ? '1 kHz tone at −20 dBFS' : 'silence'}){acceptedHits.length ? `, shown as “${REDACTION_LABEL}” in the transcript` : ''}</li>
              <li>{regions.length} voice-disguise section{regions.length === 1 ? '' : 's'}</li>
              <li>{acceptedCuts.length} filler / pause edit{acceptedCuts.length === 1 ? '' : 's'} (15 ms crossfades)</li>
              {pendingHits.length > 0 && <li className="text-[#FFB86B]">{pendingHits.length} possible protected-word match{pendingHits.length === 1 ? '' : 'es'} still to check</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Btn tone="primary" disabled={busy || planEmpty} onClick={() => void doRender()}>Build preview</Btn>
              {render && <Btn tone="accent" disabled={busy} onClick={() => void doPublish()}>Replace episode audio</Btn>}
            </div>
            {rendering && <Progress value={rendering.value} label={rendering.label} />}
            {render && (
              <div className="grid gap-3 md:grid-cols-2">
                <figure className="space-y-1">
                  <figcaption className="text-xs text-[#A9B8C6]">Before (current episode audio)</figcaption>
                  <audio controls preload="none" src={episode.audio_url} className="w-full" />
                </figure>
                <figure className="space-y-1">
                  <figcaption className="text-xs text-[#A9B8C6]">After ({Math.round(render.duration / 60)} min, {(render.file.size / 1024 / 1024).toFixed(1)} MB, not saved yet)</figcaption>
                  <audio controls preload="metadata" src={render.url} className="w-full" />
                </figure>
              </div>
            )}
            {episode.audio_url_previous && (
              <div className="flex flex-wrap items-center gap-2 border-t border-[#27313B] pt-3">
                <Btn disabled={busy} onClick={() => void revert()}><Undo2 size={12} /> Revert to previous audio</Btn>
                <span className="text-xs text-[#A9B8C6]">
                  The previous file (which may still contain unbleeped names) stays in media storage until someone deletes it in Media.
                </span>
              </div>
            )}
          </div>

          <ChaptersSection
            words={words}
            existing={episode.chapters || []}
            showNotes={episode.show_notes || ''}
            exclude={exclude}
            disabled={busy}
            onSaveChapters={async (chapters) => { await save({ chapters }, 'Chapters saved') }}
            onAppendNotes={async (text) => {
              const current = (episode.show_notes || '').trim()
              await save({ show_notes: current ? `${current}\n\n${text}` : text }, 'Show notes updated')
            }}
          />
        </>
      )}
    </section>
  )
}
