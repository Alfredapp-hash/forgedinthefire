'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Button, Panel, Select, Toaster, toast } from '@/components/studio-ui'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { StudioStageBar, type StageBarStatus } from '@/components/podcast/studio-stage-bar'
import { EpisodePlan, type QueueFilter } from '@/components/podcast/episode-plan'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import { checkFeedCompliance } from '@/lib/podcast/compliance'
import { deriveBoothStatus } from '@/lib/podcast/booth-layout'
import { STUDIO_STAGE_LABEL, type StudioStage } from '@/lib/podcast/stage'
import type {
  ContentTopic,
  EpisodeStatus,
  PodcastChapter,
  PodcastEpisode,
} from '@/lib/studio/types'
import { EPISODE_PIPELINE } from '@/lib/studio/types'

type Props = {
  episodes: PodcastEpisode[]
  topics: ContentTopic[]
  selectedId: string
  onSelect: (id: string) => void
  onEpisodesChange: (episodes: PodcastEpisode[]) => void
}

const PLANNED_STATUSES: EpisodeStatus[] = ['draft', 'recording', 'editing', 'review', 'scheduled']

/** Maps a feed-compliance check id to the Plan-stage form field that fixes it.
 *  Ids with no editable Plan field (audio enclosure, byte length, duration, mime)
 *  are fixed by exporting a mix — see COMPLIANCE_STAGE. */
const COMPLIANCE_FIELD: Record<string, string> = {
  title: 'title',
  summary: 'summary',
  cover_url: 'cover',
  chapters: 'chapters',
}

/** Checks with no Plan field still get a "Fix →": they jump to the stage that
 *  produces the missing thing (a saved mix fixes the audio file, size and duration). */
const COMPLIANCE_STAGE: Record<string, StudioStage> = {
  audio_url: 'edit',
  file_size: 'edit',
  duration: 'edit',
  audio_mime: 'edit',
}

/** Plain-language episode status labels (the raw enum is snake_case). */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  recording: 'Recording',
  editing: 'Editing',
  review: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
}
function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function RecordingStudio({
  episodes,
  topics,
  selectedId,
  onSelect,
  onEpisodesChange,
}: Props) {
  const [stage, setStage] = useState<StudioStage>('plan')
  const [filter, setFilter] = useState<QueueFilter>('planned')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSummary, setDraftSummary] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftGuest, setDraftGuest] = useState('')
  const [draftTopicId, setDraftTopicId] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterStart, setChapterStart] = useState('0:00')
  const [uploadingCover, setUploadingCover] = useState(false)
  // First-run guidance banner: explains the Plan→Record→Edit→Publish flow.
  // Dismissal is remembered so seasoned hosts never see it again.
  const [showTip, setShowTip] = useState(false)
  /** Unsaved timeline edits in the editor — used to warn before leaving to the episode page. */
  const [editorDirty, setEditorDirty] = useState(false)
  /** Live transport signals from the editor (recording / count-in / busy / clock) for the header chip. */
  const [transport, setTransport] = useState({ recording: false, countIn: false, saving: false, elapsedSec: 0 })
  /** Stage heading receives focus on every stage change (WCAG 2.4.3) — skipped on mount.
   *  The Sound Booth stage moves focus to its RecordButton instead (see BoothStage). */
  const stageHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const stageMountedRef = useRef(false)
  useEffect(() => {
    if (!stageMountedRef.current) {
      stageMountedRef.current = true
      return
    }
    if (stage === 'record') return
    stageHeadingRef.current?.focus({ preventScroll: false })
  }, [stage])

  useEffect(() => {
    try {
      setShowTip(window.localStorage.getItem('studio-flow-tip-dismissed') !== '1')
    } catch {
      setShowTip(true)
    }
  }, [])

  function dismissTip() {
    setShowTip(false)
    try {
      window.localStorage.setItem('studio-flow-tip-dismissed', '1')
    } catch {
      /* ignore storage failures */
    }
  }

  const episode = useMemo(
    () => episodes.find((ep) => ep.id === selectedId) || null,
    [episodes, selectedId],
  )

  const linkedTopicIds = useMemo(
    () => new Set(episodes.map((ep) => ep.topic_id).filter(Boolean) as string[]),
    [episodes],
  )

  const queuedEpisodes = useMemo(() => {
    const list =
      filter === 'needs_audio'
        ? episodes.filter((ep) => !ep.audio_url)
        : filter === 'planned'
          ? episodes.filter((ep) => PLANNED_STATUSES.includes(ep.status))
          : episodes
    if (selectedId && !list.some((ep) => ep.id === selectedId)) {
      const selected = episodes.find((ep) => ep.id === selectedId)
      if (selected) return [selected, ...list]
    }
    return list
  }, [episodes, filter, selectedId])

  const plannedTopics = useMemo(
    () =>
      topics.filter(
        (topic) =>
          (topic.status === 'idea' || topic.status === 'planned' || topic.status === 'in_production') &&
          !linkedTopicIds.has(topic.id),
      ),
    [topics, linkedTopicIds],
  )

  const linkedTopic = useMemo(
    () => topics.find((topic) => topic.id === episode?.topic_id) || null,
    [topics, episode?.topic_id],
  )

  const compliance = useMemo(
    () => (episode ? checkFeedCompliance(episode) : null),
    [episode],
  )

  const checks = useMemo(() => {
    if (!episode) return []
    // Feed-compliance blockers (must pass to publish) + advisory production items.
    // `field` maps each item to the Plan-stage input it fixes, so a failing
    // checklist row can jump the host straight to the thing to correct.
    const feed = (compliance?.checks ?? []).map((c) => ({
      ok: c.ok,
      label: c.detail && !c.ok ? `${c.label} — ${c.detail}` : c.label,
      required: c.required,
      field: COMPLIANCE_FIELD[c.id] ?? null,
      stage: COMPLIANCE_STAGE[c.id] ?? null,
    }))
    return [
      ...feed,
      { ok: Boolean(episode.show_notes), label: 'Show notes / script', required: false, field: 'notes', stage: null },
      { ok: episode.episode_number != null, label: 'Episode number', required: false, field: 'epnum', stage: null },
      { ok: (episode.chapters?.length || 0) > 0, label: 'Chapters added', required: false, field: 'chapters', stage: null },
      { ok: Boolean(episode.transcript), label: 'Transcript', required: false, field: 'transcript', stage: null },
      { ok: episode.status !== 'scheduled' || Boolean(episode.scheduled_for), label: 'Schedule time (if scheduled)', required: false, field: 'sched', stage: null },
      { ok: Boolean(episode.topic_id), label: 'Linked studio topic', required: false, field: 'topic', stage: null },
    ]
  }, [episode, compliance])

  // Jump from a failing checklist row to the Plan-stage field that fixes it:
  // switch to Plan, then focus/scroll the field once it has mounted.
  function jumpToField(field: string | null) {
    if (!field) return
    setStage('plan')
    if (!episode) return
    const targetId = `plan-field-${field}-${episode.id}`
    window.setTimeout(() => {
      const el = document.getElementById(targetId)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        el.focus({ preventScroll: true })
      }
    }, 60)
  }

  function replaceEpisode(next: PodcastEpisode) {
    const exists = episodes.some((ep) => ep.id === next.id)
    onEpisodesChange(exists ? episodes.map((ep) => (ep.id === next.id ? next : ep)) : [next, ...episodes])
  }

  async function saveEpisode(patch: Record<string, unknown>, label = 'Saved') {
    if (!episode) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/studio/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: episode.id, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      replaceEpisode(normalizeEpisode(data))
      setOk(label)
      toast({ title: label, tone: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setError(message)
      toast({ title: 'Save failed', description: message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function createEpisode(body: Record<string, unknown>, label: string) {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/studio/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'recording', ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create episode')
      const created = normalizeEpisode(data)
      replaceEpisode(created)
      onSelect(created.id)
      setOk(label)
      toast({ title: label, tone: 'success' })
      return created
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create episode'
      setError(message)
      toast({ title: 'Could not create episode', description: message, tone: 'error' })
      return null
    } finally {
      setCreating(false)
    }
  }

  async function writeNewEpisode() {
    const title = draftTitle.trim()
    if (!title) {
      setError('Give the episode a title before opening the studio')
      toast({ title: 'Add a title first', description: 'The episode needs a title before it can open in the studio.', tone: 'error' })
      return
    }
    const created = await createEpisode(
      {
        title,
        summary: draftSummary.trim() || null,
        show_notes: draftNotes.trim() || null,
        guest_name: draftGuest.trim() || null,
        topic_id: draftTopicId || null,
      },
      'Episode opened in the studio — keep writing, then record',
    )
    if (created) {
      setDraftTitle('')
      setDraftSummary('')
      setDraftNotes('')
      setDraftGuest('')
      setDraftTopicId('')
    }
  }

  async function openFromTopic(topic: ContentTopic) {
    const notes = [
      topic.summary ? `Summary: ${topic.summary}` : '',
      ...(topic.talking_points || []).map((point, i) => `${i + 1}. ${point}`),
    ]
      .filter(Boolean)
      .join('\n\n')
    await createEpisode(
      {
        title: topic.title,
        summary: topic.summary,
        show_notes: notes || null,
        topic_id: topic.id,
      },
      `Pulled “${topic.title}” from the planned topics`,
    )
  }

  async function saveVideo(file: File) {
    if (!episode) throw new Error('Pick or write an episode first')
    const asset = await uploadPodcastMedia(file, `${episode.title} (video)`)
    await saveEpisode(
      {
        video_url: asset.url,
        video_mime: asset.mime_type || file.type || 'video/mp4',
        video_size: asset.size_bytes || file.size,
      },
      'Video saved — watch on the site + video feed',
    )
  }

  async function saveMix(file: File, durationSeconds: number) {
    if (!episode) throw new Error('Pick or write an episode first')
    const asset = await uploadPodcastMedia(file, episode.title)
    const measured =
      (durationSeconds && durationSeconds > 0 ? Math.round(durationSeconds) : null) ??
      (await measureAudioDuration(asset.url))
    // Never overwrite a known-good duration with null on a re-save.
    const seconds = measured ?? episode.duration_seconds ?? null
    const fileSize = asset.size_bytes || file.size
    const patch: Record<string, unknown> = {
      audio_url: asset.url,
      audio_mime: asset.mime_type || file.type,
      file_size: fileSize,
      duration_seconds: seconds,
      status: episode.status === 'draft' || episode.status === 'recording' ? 'editing' : episode.status,
    }
    await saveEpisode(patch, 'Mix saved to this episode')
    if (!seconds) {
      const message = 'Mix saved, but duration could not be measured — set it manually before publishing (RSS needs it)'
      setError(message)
      toast({ title: 'Duration missing', description: message, tone: 'error', duration: 8000 })
    } else if (!fileSize) {
      const message = 'Mix saved, but file size is missing — re-upload before publishing'
      setError(message)
      toast({ title: 'File size missing', description: message, tone: 'error', duration: 8000 })
    }
  }

  async function uploadCover(file: File) {
    if (!episode) return
    setUploadingCover(true)
    setError(null)
    try {
      const asset = await uploadPodcastMedia(file, `${episode.title} cover`)
      await saveEpisode({ cover_url: asset.url }, 'Cover saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cover upload failed'
      setError(message)
      toast({ title: 'Cover upload failed', description: message, tone: 'error' })
    } finally {
      setUploadingCover(false)
    }
  }

  async function publish() {
    if (!episode) return
    const gate = checkFeedCompliance(episode)
    if (!gate.ok) {
      const blockers = gate.blockers.map((b) => b.detail || b.label).join('; ')
      setError(`Cannot publish — ${blockers}`)
      toast({
        title: 'Publish blocked',
        description: `Fix these first: ${blockers}`,
        tone: 'error',
        duration: 8000,
      })
      return
    }
    await saveEpisode(
      {
        status: 'published',
        published_at: new Date().toISOString(),
        visibility: episode.visibility === 'private' ? episode.visibility : 'public',
      },
      'Published to /podcast and RSS',
    )
  }

  function changeStatus(status: EpisodeStatus) {
    if (!episode) return
    if (status === 'published' && !episode.audio_url) {
      setError('Save a mix before publishing')
      toast({ title: 'Save a mix before publishing', tone: 'error' })
      return
    }
    if (status === 'scheduled' && !episode.scheduled_for) {
      setError('Set a schedule time before marking this episode scheduled')
      toast({ title: 'Set a schedule time first', description: 'Add a publish date before marking this scheduled.', tone: 'error' })
      return
    }
    void saveEpisode({ status })
  }

  function markChapterAt(seconds: number) {
    if (!episode) return
    const title = chapterTitle.trim() || `Chapter ${(episode.chapters?.length || 0) + 1}`
    const start_ms = Math.round(Math.max(0, seconds) * 1000)
    const next: PodcastChapter[] = [...(episode.chapters || []), { start_ms, title }].sort(
      (a, b) => a.start_ms - b.start_ms,
    )
    void saveEpisode({ chapters: next }, `Chapter at ${formatMs(start_ms)}`)
    setChapterTitle('')
  }

  function addChapter() {
    if (!episode) return
    const start_ms = parseTimestamp(chapterStart)
    if (!chapterTitle.trim() || start_ms == null) {
      setError('Chapter needs a title and start time like 1:30')
      toast({ title: 'Chapter needs a title and start time', description: 'Use a start time like 1:30.', tone: 'error' })
      return
    }
    const next: PodcastChapter[] = [...(episode.chapters || []), { start_ms, title: chapterTitle.trim() }].sort(
      (a, b) => a.start_ms - b.start_ms,
    )
    void saveEpisode({ chapters: next }, 'Chapter added')
    setChapterTitle('')
  }

  function removeChapter(idx: number) {
    if (!episode) return
    const next = (episode.chapters || []).filter((_, i) => i !== idx)
    void saveEpisode({ chapters: next }, 'Chapter removed')
  }

  function insertTalkingPoints() {
    if (!episode || !linkedTopic?.talking_points?.length) return
    const block = linkedTopic.talking_points.map((point, i) => `${i + 1}. ${point}`).join('\n')
    const show_notes = [episode.show_notes, block].filter(Boolean).join('\n\n')
    void saveEpisode({ show_notes }, 'Talking points added to the script')
  }

  const blockersText = compliance && !compliance.ok
    ? compliance.blockers.map((b) => b.detail || b.label).join('; ')
    : null

  const headerStatus: StageBarStatus = {
    phase: deriveBoothStatus({
      recording: transport.recording,
      countIn: transport.countIn,
      saving: transport.saving || saving || uploadingCover,
    }),
    elapsedSec: transport.elapsedSec,
  }

  return (
    <div className="space-y-4">
      {/* Single Toaster mount for the whole studio: every surface's toast() renders here. */}
      <Toaster />

      {showTip && (
        <Panel elevation="raised" className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="studio-type-label text-ice">How the studio works</p>
            <p className="studio-type-body mt-1 text-silver-body">
              Move an episode through four stages: <span className="text-white">Plan</span> the details, record your
              takes in the <span className="text-white">Sound Booth</span>, <span className="text-white">Edit</span> the mix,
              then <span className="text-white">Publish</span> to the site and RSS. Everything you enter follows the
              episode through every stage — use the stage bar to move between them.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="studio-type-label -mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-silver-label transition-colors hover:text-white"
          >
            <X size={14} /> Got it
          </button>
        </Panel>
      )}

      {!episode ? (
        // No episode loaded yet: show the Plan queue so the host can pick or write one.
        <>
          {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
          {ok && <p className="text-sm text-[#8DEBFF]" role="status">{ok}</p>}
          <EpisodePlan
            topics={topics}
            queuedEpisodes={queuedEpisodes}
            plannedTopics={plannedTopics}
            selectedId={selectedId}
            filter={filter}
            creating={creating}
            onFilterChange={setFilter}
            onSelect={onSelect}
            onOpenTopic={(topic) => void openFromTopic(topic)}
            draftTitle={draftTitle}
            draftSummary={draftSummary}
            draftNotes={draftNotes}
            draftGuest={draftGuest}
            draftTopicId={draftTopicId}
            onDraftTitle={setDraftTitle}
            onDraftSummary={setDraftSummary}
            onDraftNotes={setDraftNotes}
            onDraftGuest={setDraftGuest}
            onDraftTopicId={setDraftTopicId}
            onCreate={() => void writeNewEpisode()}
            episode={null}
            onSave={(patch, label) => void saveEpisode(patch, label)}
            onUploadCover={(file) => void uploadCover(file)}
            uploadingCover={uploadingCover}
            linkedTopic={linkedTopic}
            onInsertTalkingPoints={insertTalkingPoints}
            chapterStart={chapterStart}
            chapterTitle={chapterTitle}
            onChapterStart={setChapterStart}
            onChapterTitle={setChapterTitle}
            onAddChapter={addChapter}
            onRemoveChapter={removeChapter}
            formatMs={formatMs}
            checks={[]}
            complianceOk
            blockersText={null}
            toLocalInput={toLocalInput}
          />
        </>
      ) : (
        <>
          {/* Persistent header: title, subtitle, status chip and the stage tabs — always visible. */}
          <StudioStageBar episode={episode} stage={stage} onStageChange={setStage} status={headerStatus} />

          {/* Status control + jump to the standalone episode page, on every stage. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select
              aria-label="Episode status"
              value={episode.status}
              onChange={(e) => changeStatus(e.target.value as EpisodeStatus)}
              className="w-auto"
            >
              {EPISODE_PIPELINE.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </Select>
            <Link
              href={`/admin/podcast/${episode.id}`}
              onClick={(e) => {
                // Takes autosave on this computer, but the mix is not saved to the
                // episode until Export — warn before leaving with unsaved edits.
                if (
                  editorDirty &&
                  !window.confirm('You have edits that are not saved to the episode yet. Leave the studio anyway?')
                ) {
                  e.preventDefault()
                }
              }}
              className="studio-type-button inline-flex items-center rounded-control border border-divider bg-surface-raised px-3 py-2 text-silver shadow-inset-top transition-[border-color,box-shadow] duration-150 ease-calm hover:border-forged/60 hover:text-white hover:shadow-glow-subtle"
            >
              Episode page
            </Link>
          </div>

          {/* Stage heading: the focus target on every stage change, and the page's h2 landmark.
              The Sound Booth renders its own h2 and focuses its RecordButton. */}
          {stage !== 'record' && (
            <h2
              ref={stageHeadingRef}
              tabIndex={-1}
              className="studio-type-label text-ice outline-none focus-visible:ring-2 focus-visible:ring-ice/60 rounded-control"
            >
              {STUDIO_STAGE_LABEL[stage]}
              <span className="sr-only"> stage</span>
            </h2>
          )}

          {error && <p className="studio-type-body text-heart" role="alert">{error}</p>}
          {ok && <p className="studio-type-body text-ice" role="status">{ok}</p>}
          {saving && <p className="studio-type-label text-silver-label" role="status">Saving…</p>}

          {/* Plan stage: queue + all metadata + checklist. */}
          {stage === 'plan' && (
            <EpisodePlan
              topics={topics}
              queuedEpisodes={queuedEpisodes}
              plannedTopics={plannedTopics}
              selectedId={selectedId}
              filter={filter}
              creating={creating}
              onFilterChange={setFilter}
              onSelect={onSelect}
              onOpenTopic={(topic) => void openFromTopic(topic)}
              draftTitle={draftTitle}
              draftSummary={draftSummary}
              draftNotes={draftNotes}
              draftGuest={draftGuest}
              draftTopicId={draftTopicId}
              onDraftTitle={setDraftTitle}
              onDraftSummary={setDraftSummary}
              onDraftNotes={setDraftNotes}
              onDraftGuest={setDraftGuest}
              onDraftTopicId={setDraftTopicId}
              onCreate={() => void writeNewEpisode()}
              episode={episode}
              onSave={(patch, label) => void saveEpisode(patch, label)}
              onUploadCover={(file) => void uploadCover(file)}
              uploadingCover={uploadingCover}
              linkedTopic={linkedTopic}
              onInsertTalkingPoints={insertTalkingPoints}
              chapterStart={chapterStart}
              chapterTitle={chapterTitle}
              onChapterStart={setChapterStart}
              onChapterTitle={setChapterTitle}
              onAddChapter={addChapter}
              onRemoveChapter={removeChapter}
              formatMs={formatMs}
              checks={checks}
              complianceOk={Boolean(compliance?.ok)}
              blockersText={blockersText}
              onJumpField={jumpToField}
              toLocalInput={toLocalInput}
            />
          )}

          {/*
            Editor stays MOUNTED across record/edit/publish so the live session and
            recording state are never dropped. During Plan we hide it (never unmount)
            so the plan metadata gets the full width. The editor renders its own
            record/edit/publish content from the `stage` prop.
          */}
          <div className={stage === 'plan' ? 'hidden' : ''} aria-hidden={stage === 'plan'}>
            <Panel elevation="raised" className={stage === 'record' ? 'p-0' : 'p-5'}>
              <PodcastAudioEditor
                episodeId={episode.id}
                audioUrl={episode.audio_url}
                title={episode.title}
                script={episode.show_notes}
                episodeStatus={episode.status}
                onExported={saveMix}
                onVideoExported={saveVideo}
                onPublished={publish}
                onMarkChapter={markChapterAt}
                chapters={episode.chapters}
                stage={stage}
                onGoToStage={setStage}
                onDirtyChange={setEditorDirty}
                onTransportStatus={setTransport}
              />
            </Panel>
          </div>

          {/* Publish stage: compliance summary + publish CTA. Sits BELOW the editor's export
              buttons so the thing that fixes "no audio" (Export episode) is never off-screen. */}
          {stage === 'publish' && (
            <Panel elevation="raised" className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="studio-type-label text-ice">Publish</p>
                  <p className="studio-type-section mt-0.5 !text-[16px]">Ready to publish?</p>
                </div>
                <Button
                  variant="primary"
                  size="touch"
                  onClick={() => void publish()}
                  disabled={episode.status === 'published' || !compliance?.ok}
                  title={blockersText || undefined}
                >
                  {episode.status === 'published' ? 'Live' : 'Publish now'}
                </Button>
              </div>
              {blockersText && (
                <div className="mb-4 rounded-control border border-heart/40 bg-heart/10 px-3 py-2.5">
                  <p className="studio-type-label text-heart">Publish blocked · {blockersText}</p>
                  <p className="studio-type-body mt-1 text-silver-body">
                    If a mix is missing or too quiet, re-record in the <span className="text-white">Sound Booth</span> or re-mix in{' '}
                    <span className="text-white">Edit</span>; metadata gaps jump to <span className="text-white">Plan</span>{' '}
                    from the list below.
                  </p>
                </div>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {checks.map((item) => {
                  const failing = item.required && !item.ok
                  const jumpable = !item.ok && Boolean(item.field || item.stage)
                  const icon = item.ok ? (
                    <CheckCircle2 size={16} className="shrink-0 text-forged" />
                  ) : (
                    <Circle size={16} className={`shrink-0 ${item.required ? 'text-heart' : 'text-divider'}`} />
                  )
                  const rowClass = `studio-type-body flex w-full items-center gap-2.5 rounded-control border px-3 py-2 text-left transition-[border-color,box-shadow] duration-150 ease-calm ${
                    failing
                      ? 'border-heart/40 bg-heart/5 text-heart'
                      : 'border-divider bg-obsidian/40 text-silver-body'
                  } ${jumpable ? 'hover:border-forged/60 hover:shadow-glow-subtle' : ''}`
                  const body = (
                    <>
                      {icon}
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {jumpable && (
                        <span className="studio-type-label shrink-0 text-ice">
                          {item.field ? 'Fix →' : `Fix in ${STUDIO_STAGE_LABEL[item.stage as StudioStage]} →`}
                        </span>
                      )}
                      {failing && !jumpable && <span className="studio-type-label shrink-0 text-heart">required</span>}
                    </>
                  )
                  return (
                    <li key={item.label}>
                      {jumpable ? (
                        <button
                          type="button"
                          onClick={() => (item.field ? jumpToField(item.field) : item.stage && setStage(item.stage))}
                          className={rowClass}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={rowClass}>{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

function normalizeEpisode(raw: PodcastEpisode): PodcastEpisode {
  return {
    ...raw,
    chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    ad_markers: Array.isArray(raw.ad_markers) ? raw.ad_markers : [],
    episode_type: raw.episode_type || 'full',
    visibility: raw.visibility || 'public',
  }
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 1) return Math.round(parts[0] * 1000)
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000)
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000)
  return null
}

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
