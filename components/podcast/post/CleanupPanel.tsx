'use client'

/**
 * Clean-up & safety — the guided post-production flow for a finished episode. Everything
 * (transcription, bleeps, voice disguise, cuts) runs in this browser; nothing is uploaded until
 * the host presses "Replace episode audio". One step is open at a time (the recommended next
 * action); the rest are collapsed with a status chip so a non-technical host always has one
 * clear thing to do. Power options live under "More options" inside each step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ShieldCheck, Trash2, Undo2 } from 'lucide-react'
import { Button, Chip, Panel } from '@/components/studio-ui'
import { decodeUrl, encodeMp3 } from '@/lib/podcast/audio'
import { EMPTY_TEXT_EDIT, combineCuts, remapSpeakers, type TextEditState } from '@/lib/podcast/ai/text-edit'
import type { SafetyPatch } from '@/lib/podcast/safety/client'
import { finalCutStatus } from '@/lib/podcast/safety/checklist'
import { redactText, redactWords } from '@/lib/podcast/safety/protected-words'
import { DEFAULT_PLAN, type SafetyRecord } from '@/lib/podcast/safety/record'
import { BLEEP_MODE_LABEL, CUT_XFADE_S, remapChapters, remapWords, renderPlan, type DisguiseRegion, type EditPlan } from '@/lib/podcast/safety/render'
import type { DisguisePresetId } from '@/lib/podcast/safety/voice-disguise'
import { DISGUISE_PRESETS } from '@/lib/podcast/safety/voice-disguise'
import { episodeHasGuest, type EpisodeSafetyFields, type GuestConsentStatus } from '@/lib/studio/release'
import { cleanWords, transcriptKind, wordsToPlainText, type TranscriptWord } from '@/lib/studio/transcript'
import type { PodcastChapter, PodcastEpisode } from '@/lib/studio/types'
import { ChaptersSection } from './ChaptersSection'
import { DisguiseSection } from './DisguiseSection'
import { FillerSection, initialFillers, useFillerSuggestions, type FillerState } from './FillerSection'
import { GuestSignoffs } from './GuestSignoffs'
import { ProtectSection, initialProtect, useProtectedHits, type ProtectState } from './ProtectSection'
import { TranscribeSection } from './TranscribeSection'
import { TranscriptEditor } from '@/components/podcast/transcript/transcript-editor'
import { Btn, Note, Progress, StepCard, useClipPlayer, type StepStatus } from './ui'

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

type Region = DisguiseRegion & { preset: DisguisePresetId }

type Props = {
  episode: Episode
  disabled: boolean
  /** Save episode fields. The parent routes safety-only columns through the safety API. */
  save: (patch: Record<string, unknown>, label?: string) => Promise<PodcastEpisode | null>
  /** Upload the rendered file and PATCH audio fields + `extra` in one go. */
  publishAudio: (file: File, duration: number, extra: Record<string, unknown>, label: string) => Promise<boolean>
  revert: () => Promise<void>
  onError: (msg: string) => void
  /** Consent recorded in the guest booth (optional endpoint; null when unavailable). */
  guestConsent?: GuestConsentStatus | null
  /** The private working plan (GET /api/admin/podcast/safety/[id]); null while loading. */
  safety: { available: boolean; record: SafetyRecord | null } | null
  /** Persist plan changes / sign-offs through the safety route. Reports its own errors; resolves null on failure. */
  patchSafety: (patch: SafetyPatch, label?: string) => Promise<unknown>
  /** Permanently delete the replaced original upload. */
  deletePrevious: () => Promise<void>
}

const SAVE_DEBOUNCE_MS = 600

type StepId = 'transcribe' | 'protect' | 'disguise' | 'fillers' | 'text' | 'apply' | 'signoffs' | 'chapters'

function toPayload(protect: ProtectState, fillers: FillerState, regions: Region[], text: TextEditState = EMPTY_TEXT_EDIT): SafetyPatch {
  return {
    protected_terms: protect.terms,
    term_decisions: protect.decisions,
    filler_decisions: fillers.decisions,
    plan: {
      ...DEFAULT_PLAN,
      mode: protect.mode,
      pad: protect.pad,
      manual: protect.manual,
      disguise: regions.map(({ start, end, preset }) => ({ start, end, preset })),
      filler_words: fillers.fillerWords,
      include_pauses: fillers.includePauses,
      text_cuts: text.cuts,
      speakers: text.speakers,
    },
  }
}

export function CleanupPanel({ episode, disabled, save, publishAudio, revert, onError, guestConsent = null, safety, patchSafety, deletePrevious }: Props) {
  const storedWords = useMemo(() => cleanWords(episode.transcript_words), [episode.transcript_words])
  const [words, setWords] = useState<TranscriptWord[]>(storedWords)
  useEffect(() => setWords(storedWords), [storedWords])
  const canStoreWords = 'transcript_words' in episode

  const sourceRef = useRef<{ url: string; buffer: AudioBuffer } | null>(null)
  const [loadingSource, setLoadingSource] = useState(false)
  /** Duration of the decoded source (state, so it can drive the render). */
  const [sourceDuration, setSourceDuration] = useState(0)
  const getSource = useCallback(async () => {
    const url = episode.audio_url
    if (!url) throw new Error('Upload the episode audio first.')
    if (sourceRef.current?.url === url) return sourceRef.current.buffer
    setLoadingSource(true)
    try {
      const buffer = await decodeUrl(url)
      sourceRef.current = { url, buffer }
      setSourceDuration(buffer.duration)
      return buffer
    } catch {
      throw new Error('Could not load the episode audio into the browser (check the file plays and that storage allows downloads).')
    } finally {
      setLoadingSource(false)
    }
  }, [episode.audio_url])

  // ── Working plan: hydrated from the private record, then persisted on change ──
  const [protect, setProtect] = useState<ProtectState>(initialProtect)
  const [regions, setRegions] = useState<Region[]>([])
  const [fillers, setFillers] = useState<FillerState>(initialFillers)
  const [textEdit, setTextEdit] = useState<TextEditState>(EMPTY_TEXT_EDIT)
  const hydratedFor = useRef<string | null>(null)
  const persisted = Boolean(safety?.available)

  /** JSON of the last persisted (or hydrated) plan; empty until hydrated. */
  const lastSaved = useRef<string>('')

  useEffect(() => {
    if (!safety?.record || hydratedFor.current === episode.id) return
    const r = safety.record
    hydratedFor.current = episode.id
    const p: ProtectState = { terms: r.protected_terms, decisions: r.term_decisions, manual: r.plan.manual, mode: r.plan.mode, pad: r.plan.pad }
    const f: FillerState = { decisions: r.filler_decisions, fillerWords: r.plan.filler_words, includePauses: r.plan.include_pauses }
    const g: Region[] = r.plan.disguise.map((d) => ({ ...d, settings: DISGUISE_PRESETS[d.preset].settings }))
    const t: TextEditState = { cuts: r.plan.text_cuts, speakers: r.plan.speakers }
    lastSaved.current = JSON.stringify(toPayload(p, f, g, t))
    setProtect(p)
    setFillers(f)
    setRegions(g)
    setTextEdit(t)
  }, [safety, episode.id])

  // Decisions, manual ranges and disguise regions are times on a specific file: a new upload
  // or a revert changes the timeline, so they are cleared (terms and settings are kept).
  const seenAudio = useRef<string | null>(null)
  useEffect(() => {
    if (!lastSaved.current) return
    if (seenAudio.current === null) {
      seenAudio.current = episode.audio_url
      return
    }
    if (seenAudio.current === episode.audio_url) return
    seenAudio.current = episode.audio_url
    setProtect((p) => ({ ...p, decisions: {}, manual: [] }))
    setFillers((f) => ({ ...f, decisions: {} }))
    setRegions([])
    // Text cuts are baked in; speaker labels were moved onto the new timeline in doPublish.
    setTextEdit((t) => ({ ...t, cuts: [] }))
  }, [episode.audio_url, safety])

  const planPayload = useMemo(() => toPayload(protect, fillers, regions, textEdit), [protect, fillers, regions, textEdit])
  useEffect(() => {
    if (!persisted || !lastSaved.current) return
    const json = JSON.stringify(planPayload)
    if (json === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = json
      void patchSafety(planPayload)
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [planPayload, persisted, patchSafety])

  const hits = useProtectedHits(words, protect.terms)
  const suggestions = useFillerSuggestions(words, fillers)

  const [render, setRender] = useState<{ url: string; file: File; duration: number; plan: EditPlan } | null>(null)
  const [rendering, setRendering] = useState<{ label: string; value: number | null } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const clip = useClipPlayer(episode.audio_url)

  // Any change to the audio or plan invalidates a rendered preview.
  useEffect(() => {
    setRender((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
  }, [episode.audio_url, protect, regions, fillers, textEdit.cuts])
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
  }

  // Stable references: the text editor re-plans its live preview when these change.
  const acceptedHits = useMemo(() => hits.filter((h) => protect.decisions[h.id] === 'accept'), [hits, protect.decisions])
  const pendingHits = hits.filter((h) => !protect.decisions[h.id])
  const reviewComplete = protect.terms.length > 0 && words.length > 0 && pendingHits.length === 0
  const fillerCuts = useMemo(() => suggestions.filter((s) => fillers.decisions[s.id] === 'accept').map((s) => s.cut), [suggestions, fillers.decisions])
  const acceptedCuts = useMemo(() => combineCuts(textEdit.cuts, fillerCuts), [textEdit.cuts, fillerCuts])
  const bleepCount = acceptedHits.length + protect.manual.length
  const planEmpty = !bleepCount && !regions.length && !acceptedCuts.length
  const duration = episode.duration_seconds || sourceDuration || words[words.length - 1]?.e || 0
  const hasGuest = episodeHasGuest(episode, { guestConsent })
  const migrated = 'guest_final_cut_approved' in episode
  const protectedReviewed = Boolean(episode.protected_words_reviewed_at)
  const transcriptReviewed = Boolean(episode.transcript_reviewed_hash) && migrated
  const cut = finalCutStatus(episode)
  const finalCutOk = cut.approved && !cut.stale && !cut.incomplete

  async function markReviewed(nothingFound: boolean) {
    if (nothingFound && !window.confirm('Confirm you listened for names, places, schools and workplaces and this episode has nothing that could identify anyone?')) return
    await patchSafety({ protected_words_reviewed: true }, 'Protected-terms review recorded')
  }

  async function doRender() {
    if (pendingHits.length) {
      onError(`Check the ${pendingHits.length} remaining possible match${pendingHits.length === 1 ? '' : 'es'} in “Protect identities” first (bleep or keep each).`)
      openStep('protect')
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
      bleepCount ? `• ${bleepCount} protected word${bleepCount === 1 ? '' : 's'} covered` : '',
      regions.length ? `• voice disguised in ${regions.length} section${regions.length === 1 ? '' : 's'}` : '',
      acceptedCuts.length ? `• ${acceptedCuts.length} cut${acceptedCuts.length === 1 ? '' : 's'} (words, fillers, pauses)` : '',
      'The current file is kept for one-click revert until you delete it.',
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
    } else if (episode.transcript && transcriptKind(episode.transcript) === 'text' && bleepCount) {
      // No word timings: still scrub the plain transcript of the accepted terms.
      const terms = acceptedHits.map((h) => ({ text: h.term, kind: h.kind }))
      if (terms.length) extra.transcript = redactText(episode.transcript, terms)
    }
    if ('audio_url_previous' in episode) {
      extra.audio_url_previous = episode.audio_url
      extra.post_edit_snapshot = snapshot
    }
    if (reviewComplete && 'protected_words_reviewed_at' in episode) extra.protected_words_reviewed = true
    const ok = await publishAudio(render.file, render.duration, extra, 'Cleaned-up audio is now the episode audio')
    // On success the audio URL changes, which clears decisions/manual/regions (see above):
    // bleeps and cuts are baked in, terms stay so a second pass can catch anything missed.
    if (ok) {
      sourceRef.current = null
      setSourceDuration(0)
      setTextEdit({ cuts: [], speakers: remapSpeakers(textEdit.speakers, render.plan.cuts, src) })
    }
  }

  async function doDeletePrevious() {
    if (!window.confirm(
      'Permanently delete the original upload? It may still contain unbleeped names. You will no longer be able to revert to it. This cannot be undone.',
    )) return
    setDeleting(true)
    try {
      await deletePrevious()
    } finally {
      setDeleting(false)
    }
  }

  // ── Guided flow: statuses, the one recommended next action, and which step is open ──
  const status: Record<StepId, StepStatus> = {
    transcribe: words.length ? 'done' : 'todo',
    protect: protectedReviewed ? 'done' : 'todo',
    disguise: regions.length ? 'done' : 'optional',
    fillers: fillerCuts.length ? 'done' : 'optional',
    text: textEdit.cuts.length || textEdit.speakers.length ? 'done' : 'optional',
    apply: planEmpty ? (episode.audio_url_previous ? 'done' : 'locked') : 'todo',
    signoffs: finalCutOk ? 'done' : 'todo',
    chapters: (episode.chapters || []).length ? 'done' : 'optional',
  }

  const next = useMemo<{ id: StepId; text: string } | null>(() => {
    if (!episode.audio_url) return null
    if (!words.length) return { id: 'transcribe', text: 'Transcribe the episode so names can be found and captions made.' }
    if (pendingHits.length) return { id: 'protect', text: `Decide the ${pendingHits.length} possible match${pendingHits.length === 1 ? '' : 'es'} for the protected names — bleep or keep each one.` }
    if (!planEmpty && !render) return { id: 'apply', text: 'Build a preview of the cleaned-up audio, then listen before replacing the episode audio.' }
    if (render) return { id: 'apply', text: 'Listen to the “after” version, then replace the episode audio.' }
    if (!protectedReviewed && migrated) {
      return protect.terms.length
        ? { id: 'protect', text: 'Mark the protected-terms review done once every match is decided.' }
        : { id: 'protect', text: hasGuest ? 'List the guest’s real name, towns, schools and workplaces so every mention can be found and bleeped.' : 'List any names or places that must not be published — or mark the review done if this episode names no one.' }
    }
    if (!transcriptReviewed && migrated) return { id: 'transcribe', text: 'Read the transcript once for anything that could identify the guest, then tick “I read the whole transcript”.' }
    if (hasGuest && migrated && !finalCutOk) return { id: 'signoffs', text: cut.stale ? 'The audio changed after the guest approved it — play them this version and record their approval again.' : 'Let the guest hear the finished episode, then record their approval with the date and how they told you.' }
    return null
  }, [episode.audio_url, words.length, pendingHits.length, planEmpty, render, protectedReviewed, migrated, protect.terms.length, hasGuest, transcriptReviewed, finalCutOk, cut.stale])
  if (next) status[next.id] = 'next'

  const [openOverride, setOpenOverride] = useState<Partial<Record<StepId, boolean>>>({})
  const isOpen = (id: StepId) => openOverride[id] ?? (next ? next.id === id : false)
  const toggle = (id: StepId) => setOpenOverride((o) => ({ ...o, [id]: !isOpen(id) }))
  function openStep(id: StepId) {
    setOpenOverride((o) => ({ ...o, [id]: true }))
    requestAnimationFrame(() => document.getElementById(`cleanup-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const exclude = protect.terms.map((t) => t.text)
  const busy = disabled || Boolean(rendering) || loadingSource || deleting
  const fileBase = (episode.slug || 'episode').replace(/[^a-z0-9-]/gi, '-')
  const allDone = Boolean(episode.audio_url) && !next
  let n = 0
  const num = () => ++n

  return (
    <section id="cleanup" className="space-y-4" aria-labelledby="cleanup-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="studio-type-label text-ice">Post-production</p>
          <h2 id="cleanup-title" className="studio-type-section flex items-center gap-2 !text-[16px] normal-case tracking-normal">
            <ShieldCheck size={18} aria-hidden /> Clean-up &amp; safety
          </h2>
          <p className="studio-type-body mt-1 max-w-3xl text-[13px] text-silver">
            Works on the finished episode audio. Transcription, bleeps and voice disguise all happen on this computer — no audio is sent to any outside service. Nothing changes until you press “Replace episode audio”.
          </p>
        </div>
        {allDone && <Chip tone="success" dot>Ready for release</Chip>}
      </div>

      {!episode.audio_url ? (
        <Note>Upload the finished episode audio (or export a mix from the production room) first.</Note>
      ) : (
        <>
          {next && (
            <Panel elevation="floating" className="flex flex-wrap items-center gap-3 border-forged/50 p-4">
              <ArrowRight size={18} className="shrink-0 text-forged" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="studio-type-label text-ice">Next step</p>
                <p className="studio-type-body text-[14px] text-white">{next.text}</p>
              </div>
              <Button size="compact" variant="primary" onClick={() => openStep(next.id)}>Go</Button>
            </Panel>
          )}
          {loadingSource && <Progress value={null} label="Loading episode audio into this browser…" />}
          {safety && !safety.available && (
            <Note tone="block">
              Protected terms and your bleep/keep decisions cannot be saved until the 20260924000002_podcast_ai_safety.sql database update is applied — they will be lost when you leave this page.
            </Note>
          )}

          <StepCard
            id="cleanup-transcribe"
            n={num()}
            title="Transcribe"
            hint="Speech-to-text runs inside this browser; the audio is never sent anywhere. The first run downloads a speech model once, which your browser then keeps."
            status={status.transcribe}
            open={isOpen('transcribe')}
            onToggle={() => toggle('transcribe')}
            summary={words.length ? `${words.length.toLocaleString()} timed words${transcriptReviewed ? ' · reviewed' : migrated ? ' · not reviewed yet' : ''}` : 'No transcript yet'}
          >
            <TranscribeSection
              words={words}
              hasExistingTranscript={Boolean((episode.transcript || '').trim())}
              canStoreWords={canStoreWords}
              disabled={busy}
              getSource={getSource}
              onWords={onWords}
              onError={onError}
              fileBase={fileBase}
              review={{
                episode,
                hasGuest,
                onMark: (reviewed) => patchSafety({ transcript_reviewed: reviewed }, reviewed ? 'Transcript review recorded' : 'Transcript review removed'),
              }}
            />
          </StepCard>

          <StepCard
            id="cleanup-protect"
            n={num()}
            title="Protect identities"
            hint="List anything that could identify a survivor or guest: names, nicknames, family members, towns, streets, schools, workplaces, churches, social handles. Every possible match is shown for you to check — nothing is bleeped until you say so."
            status={status.protect}
            open={isOpen('protect')}
            onToggle={() => toggle('protect')}
            summary={
              protectedReviewed
                ? `Reviewed · ${protect.terms.length} term${protect.terms.length === 1 ? '' : 's'}`
                : protect.terms.length
                  ? `${protect.terms.length} term${protect.terms.length === 1 ? '' : 's'} · ${acceptedHits.length} to bleep · ${pendingHits.length} to check`
                  : 'No protected terms listed'
            }
          >
            <ProtectSection
              words={words}
              hits={hits}
              state={protect}
              onChange={setProtect}
              play={clip.play}
              playing={clip.playing}
              reviewedAt={episode.protected_words_reviewed_at}
              canMarkReviewed={reviewComplete && acceptedHits.length === 0 && protect.manual.length === 0}
              onMarkReviewed={(nothing) => void markReviewed(nothing)}
              persisted={persisted}
              disabled={busy}
            />
          </StepCard>

          <StepCard
            id="cleanup-disguise"
            n={num()}
            title="Disguise a voice"
            hint="Changes the pitch and the shape of the voice so a speaker is harder to recognise. Apply it to the guest’s part of the conversation or to the whole episode. Roughly 5–10 seconds of processing per minute of audio."
            status={status.disguise}
            open={isOpen('disguise')}
            onToggle={() => toggle('disguise')}
            summary={regions.length ? `${regions.length} section${regions.length === 1 ? '' : 's'} planned` : 'Not used'}
          >
            <DisguiseSection regions={regions} onChange={setRegions} duration={duration} getSource={getSource} disabled={busy} onError={onError} />
          </StepCard>

          <StepCard
            id="cleanup-fillers"
            n={num()}
            title="Tidy fillers, repeats and long pauses"
            hint="Suggests “um”, “uh” and similar, stuttered repeats, and long pauses to shorten. Accept the ones you want removed; nothing is cut until you apply."
            status={status.fillers}
            open={isOpen('fillers')}
            onToggle={() => toggle('fillers')}
            summary={words.length ? `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} · ${fillerCuts.length} accepted` : 'Needs a transcript'}
          >
            <FillerSection words={words} suggestions={suggestions} state={fillers} onChange={setFillers} play={clip.play} playing={clip.playing} disabled={busy} />
          </StepCard>

          <StepCard
            id="cleanup-text"
            n={num()}
            title="Edit by text"
            hint="Select words and press Delete to cut them from the audio — they stay struck through here until you apply. Click a paragraph’s speaker chip to name who is talking. “Play with edits” skips everything that is cut."
            status={status.text}
            open={isOpen('text')}
            onToggle={() => toggle('text')}
            summary={words.length ? `${textEdit.cuts.length} text cut${textEdit.cuts.length === 1 ? '' : 's'} · ${textEdit.speakers.length} speaker label${textEdit.speakers.length === 1 ? '' : 's'}` : 'Needs a transcript'}
          >
            <TranscriptEditor
              words={words}
              state={textEdit}
              onChange={setTextEdit}
              fillerCuts={fillerCuts}
              fillerRanges={suggestions}
              protectedRanges={acceptedHits}
              getSource={getSource}
              onApply={() => {
                clip.stop()
                openStep('apply')
                void doRender()
              }}
              disabled={busy}
              onError={onError}
              fileBase={fileBase}
            />
          </StepCard>

          <StepCard
            id="cleanup-apply"
            n={num()}
            title="Apply changes"
            hint="Builds a new MP3 in this browser. Listen to the before and after, then replace the episode audio. Captions, chapters and the transcript are shifted to match."
            status={status.apply}
            open={isOpen('apply')}
            onToggle={() => toggle('apply')}
            summary={planEmpty ? (episode.audio_url_previous ? 'Applied · previous audio kept for revert' : 'Nothing to apply yet') : `${bleepCount} bleep${bleepCount === 1 ? '' : 's'} · ${regions.length} disguise · ${acceptedCuts.length} cut${acceptedCuts.length === 1 ? '' : 's'}`}
          >
            <ul className="studio-type-body list-disc pl-5 text-[13px] text-silver-body">
              <li>{bleepCount} protected word{bleepCount === 1 ? '' : 's'} covered ({BLEEP_MODE_LABEL[protect.mode].toLowerCase()}, ±{Math.round(protect.pad * 1000)} ms){acceptedHits.length ? ', redacted in the transcript' : ''}</li>
              <li>{regions.length} voice-disguise section{regions.length === 1 ? '' : 's'}</li>
              <li>{acceptedCuts.length} cut{acceptedCuts.length === 1 ? '' : 's'} — {textEdit.cuts.length} from the text editor, {fillerCuts.length} filler / repeat / pause ({Math.round(CUT_XFADE_S * 1000)} ms crossfades)</li>
              {pendingHits.length > 0 && <li className="text-ice">{pendingHits.length} possible protected-word match{pendingHits.length === 1 ? '' : 'es'} still to check</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Btn tone={render ? 'default' : 'primary'} disabled={busy || planEmpty} onClick={() => void doRender()}>{render ? 'Build preview again' : 'Build preview'}</Btn>
              {render && <Btn tone="primary" disabled={busy} onClick={() => void doPublish()}>Replace episode audio</Btn>}
            </div>
            {rendering && <Progress value={rendering.value} label={rendering.label} />}
            {render && (
              <div className="grid gap-3 md:grid-cols-2">
                <figure className="space-y-1">
                  <figcaption className="studio-type-label">Before (current episode audio)</figcaption>
                  <audio controls preload="none" src={episode.audio_url} className="w-full" />
                </figure>
                <figure className="space-y-1">
                  <figcaption className="studio-type-label">After ({Math.round(render.duration / 60)} min, {(render.file.size / 1024 / 1024).toFixed(1)} MB, not saved yet)</figcaption>
                  <audio controls preload="metadata" src={render.url} className="w-full" />
                </figure>
              </div>
            )}
            {episode.audio_url_previous && (
              <div className="space-y-2 border-t border-divider pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Btn disabled={busy} onClick={() => void revert()}><Undo2 size={12} /> Revert to previous audio</Btn>
                  <Btn tone="danger" disabled={busy} loading={deleting} onClick={() => void doDeletePrevious()}>
                    <Trash2 size={12} /> Delete the original upload
                  </Btn>
                </div>
                <Note tone="block">
                  The previous file may still contain unbleeped names. Once you are happy with the safe version, delete it — it is removed from media storage and can no longer be reverted to.
                </Note>
              </div>
            )}
          </StepCard>

          {hasGuest && (
            <StepCard
              id="cleanup-signoffs"
              n={num()}
              title="Guest sign-offs"
              hint="Consent on file, and the guest’s approval of this exact final cut (date, how they told you, pinned to the audio file). Required before a guest episode can be released."
              status={status.signoffs}
              open={isOpen('signoffs')}
              onToggle={() => toggle('signoffs')}
              summary={finalCutOk ? `Approved ${episode.guest_final_cut_approved_on || ''}` : cut.stale ? 'Approval is for an earlier audio file' : 'Guest approval not recorded'}
            >
              <GuestSignoffs episode={episode} disabled={disabled} signOff={patchSafety} consent={guestConsent} />
            </StepCard>
          )}

          <StepCard
            id="cleanup-chapters"
            n={num()}
            title="Suggest chapters & show notes"
            hint="Finds where the conversation changes topic, using only the transcript (no outside AI). Titles are rough keyword guesses — rewrite them. Protected words are never used in titles."
            status={status.chapters}
            open={isOpen('chapters')}
            onToggle={() => toggle('chapters')}
            summary={(episode.chapters || []).length ? `${episode.chapters.length} chapter${episode.chapters.length === 1 ? '' : 's'}` : 'No chapters yet'}
          >
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
          </StepCard>
        </>
      )}
    </section>
  )
}
