'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { StudioStageBar } from '@/components/podcast/studio-stage-bar'
import { EpisodePlan, type QueueFilter } from '@/components/podcast/episode-plan'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import { checkFeedCompliance } from '@/lib/podcast/compliance'
import { type StudioStage } from '@/lib/podcast/stage'
import type {
  ContentTopic,
  EpisodeStatus,
  PodcastChapter,
  PodcastEpisode,
} from '@/lib/studio/types'
import { EPISODE_PIPELINE } from '@/lib/studio/types'

/** Editor mounted with an optional `stage` prop the audio-editor engineer is adding.
 *  Typed here so passing `stage` stays type-safe before that prop lands. */
const StagedAudioEditor = PodcastAudioEditor as (
  props: React.ComponentProps<typeof PodcastAudioEditor> & { stage?: StudioStage },
) => React.ReactElement

type Props = {
  episodes: PodcastEpisode[]
  topics: ContentTopic[]
  selectedId: string
  onSelect: (id: string) => void
  onEpisodesChange: (episodes: PodcastEpisode[]) => void
}

const PLANNED_STATUSES: EpisodeStatus[] = ['draft', 'recording', 'editing', 'review', 'scheduled']

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
    const feed = (compliance?.checks ?? []).map((c) => ({
      ok: c.ok,
      label: c.detail && !c.ok ? `${c.label} — ${c.detail}` : c.label,
      required: c.required,
    }))
    return [
      ...feed,
      { ok: Boolean(episode.show_notes), label: 'Show notes / script', required: false },
      { ok: episode.episode_number != null, label: 'Episode number', required: false },
      { ok: (episode.chapters?.length || 0) > 0, label: 'Chapters added', required: false },
      { ok: Boolean(episode.transcript), label: 'Transcript', required: false },
      { ok: episode.status !== 'scheduled' || Boolean(episode.scheduled_for), label: 'Schedule time (if scheduled)', required: false },
      { ok: Boolean(episode.topic_id), label: 'Linked studio topic', required: false },
    ]
  }, [episode, compliance])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
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
      return created
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create episode')
      return null
    } finally {
      setCreating(false)
    }
  }

  async function writeNewEpisode() {
    const title = draftTitle.trim()
    if (!title) {
      setError('Give the episode a title before opening the studio')
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
      setError('Mix saved, but duration could not be measured — set it manually before publishing (RSS needs it)')
    } else if (!fileSize) {
      setError('Mix saved, but file size is missing — re-upload before publishing')
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
      setError(err instanceof Error ? err.message : 'Cover upload failed')
    } finally {
      setUploadingCover(false)
    }
  }

  async function publish() {
    if (!episode) return
    const gate = checkFeedCompliance(episode)
    if (!gate.ok) {
      setError(`Cannot publish — ${gate.blockers.map((b) => b.detail || b.label).join('; ')}`)
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
      return
    }
    if (status === 'scheduled' && !episode.scheduled_for) {
      setError('Set a schedule time before marking this episode scheduled')
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

  return (
    <div className="space-y-4">
      {!episode ? (
        // No episode loaded yet: show the Plan queue so the host can pick or write one.
        <>
          {error && <p className="text-sm text-red-300">{error}</p>}
          {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
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
          {/* Persistent header: identity + stage switcher, always visible across stages. */}
          <StudioStageBar episode={episode} stage={stage} onStageChange={setStage} />

          {/* Status control + jump to the standalone episode page, on every stage. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={episode.status}
              onChange={(e) => changeStatus(e.target.value as EpisodeStatus)}
              className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
            >
              {EPISODE_PIPELINE.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <Link
              href={`/admin/podcast/${episode.id}`}
              className="rounded-lg border border-[#27313B] px-3 py-2 text-sm text-[#B8C4CF]"
            >
              Episode page
            </Link>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}
          {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
          {saving && <p className="text-xs text-[#A9B8C6]">Saving…</p>}

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
              toLocalInput={toLocalInput}
            />
          )}

          {/* Publish stage: compliance summary + publish CTA, on top of the mounted editor. */}
          {stage === 'publish' && (
            <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#F6FAFC]">Ready to publish?</p>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={episode.status === 'published' || !compliance?.ok}
                  title={blockersText || undefined}
                  className="rounded-lg bg-[#53D6FF] px-4 py-2 text-sm font-medium text-[#061016] disabled:opacity-40"
                >
                  {episode.status === 'published' ? 'Live' : 'Publish now'}
                </button>
              </div>
              {blockersText && (
                <p className="mb-3 text-xs text-red-300">Publish blocked: {blockersText}</p>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {checks.map((item) => (
                  <li
                    key={item.label}
                    className={`flex items-center gap-2 text-sm ${
                      item.required && !item.ok ? 'text-red-300' : 'text-[#B8C4CF]'
                    }`}
                  >
                    {item.ok ? (
                      <CheckCircle2 size={16} className="text-[#53D6FF]" />
                    ) : (
                      <Circle size={16} className={item.required ? 'text-red-400' : 'text-[#27313B]'} />
                    )}
                    {item.label}
                    {item.required && !item.ok && (
                      <span className="text-[10px] uppercase tracking-wide">required</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            Editor stays MOUNTED across record/edit/publish so the live session and
            recording state are never dropped. During Plan we hide it (never unmount)
            so the plan metadata gets the full width. The editor renders its own
            record/edit/publish content from the `stage` prop.
          */}
          <div className={stage === 'plan' ? 'hidden' : ''} aria-hidden={stage === 'plan'}>
            <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
              <StagedAudioEditor
                episodeId={episode.id}
                audioUrl={episode.audio_url}
                title={episode.title}
                onExported={saveMix}
                onPublished={publish}
                onMarkChapter={markChapterAt}
                chapters={episode.chapters}
                stage={stage}
              />
            </section>
          </div>
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
