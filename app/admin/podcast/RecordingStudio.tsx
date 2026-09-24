'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Mic2, Plus, Trash2 } from 'lucide-react'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import type {
  ContentTopic,
  EpisodeStatus,
  EpisodeType,
  EpisodeVisibility,
  PodcastChapter,
  PodcastEpisode,
} from '@/lib/studio/types'
import { EPISODE_PIPELINE } from '@/lib/studio/types'

type QueueFilter = 'planned' | 'needs_audio' | 'all'

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

  const checks = useMemo(() => {
    if (!episode) return []
    return [
      { ok: Boolean(episode.title.trim()), label: 'Title' },
      { ok: Boolean(episode.summary), label: 'Summary' },
      { ok: Boolean(episode.show_notes), label: 'Show notes / script' },
      { ok: Boolean(episode.audio_url), label: 'Recorded mix' },
      { ok: Boolean(episode.file_size && episode.file_size > 0), label: 'Hosted file size' },
      { ok: Boolean(episode.duration_seconds), label: 'Duration' },
      { ok: Boolean(episode.cover_url), label: 'Cover art' },
      { ok: episode.episode_number != null, label: 'Episode number' },
      { ok: (episode.chapters?.length || 0) > 0, label: 'Chapters' },
      { ok: Boolean(episode.transcript), label: 'Transcript' },
      { ok: episode.status !== 'scheduled' || Boolean(episode.scheduled_for), label: 'Schedule time (if scheduled)' },
      { ok: Boolean(episode.topic_id), label: 'Linked studio topic' },
    ]
  }, [episode])

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
    const seconds = durationSeconds || (await measureAudioDuration(asset.url)) || null
    await saveEpisode(
      {
        audio_url: asset.url,
        audio_mime: asset.mime_type || file.type,
        file_size: asset.size_bytes || file.size,
        duration_seconds: seconds,
        status: episode.status === 'draft' || episode.status === 'recording' ? 'editing' : episode.status,
      },
      'Mix saved to this episode',
    )
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
    if (!episode?.audio_url) {
      setError('Save a mix before publishing')
      return
    }
    if (!episode.file_size || episode.file_size < 1) {
      setError('Re-save the mix so Apple RSS has a file size')
      return
    }
    if (!episode.cover_url) {
      setError('Add square cover art before publishing')
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

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Production room</p>
          <p className="text-sm text-[#B8C4CF] mt-1">
            Pull a planned episode, write the show, record takes per person, mix, and publish — all in this room.
            Recording, punch-in, effects, and mixdown run in Chrome on this computer. Host and Guest can share one mic
            on a take, or each take a local mic and land on the same punch. Two mics follow the talker (quieter lane
            mutes; both recordings stay). Cam on a voice card is a local 720p preview; Record can write a parallel
            camera file. A-roll / PIP downloads encode as fast as this computer can. RSS publish stays the audio mix.
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          {([
            ['planned', 'Planned'],
            ['needs_audio', 'Needs audio'],
            ['all', 'All episodes'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === id ? 'bg-[#1A232C] text-[#8DEBFF]' : 'text-[#B8C4CF] hover:bg-[#1A232C]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">
                Open a planned episode
              </span>
              <select
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
                className={input}
              >
                <option value="">Select an episode…</option>
                {queuedEpisodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.title}
                    {ep.episode_number != null ? ` · S${ep.season}E${ep.episode_number}` : ''}
                    {` · ${ep.status}`}
                    {ep.audio_url ? ' · has audio' : ' · needs audio'}
                  </option>
                ))}
              </select>
            </label>

            {plannedTopics.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-2">
                  Planned topics without an episode
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {plannedTopics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={creating}
                      onClick={() => void openFromTopic(topic)}
                      className="w-full text-left rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 hover:border-[#53D6FF]"
                    >
                      <p className="text-sm text-[#F6FAFC]">{topic.title}</p>
                      <p className="text-[11px] text-[#A9B8C6]">
                        {topic.status}
                        {topic.scheduled_on ? ` · ${topic.scheduled_on}` : ''}
                        {topic.talking_points?.length ? ` · ${topic.talking_points.length} talking points` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#27313B] bg-[#05070A] p-4 space-y-3">
            <p className="text-sm text-[#F6FAFC]">Write a new episode</p>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Episode title"
              className={input}
            />
            <textarea
              value={draftSummary}
              onChange={(e) => setDraftSummary(e.target.value)}
              placeholder="One-line summary for the public page and RSS"
              rows={2}
              className={input}
            />
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Show notes / recording script"
              rows={4}
              className={input}
            />
            <input
              value={draftGuest}
              onChange={(e) => setDraftGuest(e.target.value)}
              placeholder="Guest name (optional)"
              className={input}
            />
            <select
              value={draftTopicId}
              onChange={(e) => setDraftTopicId(e.target.value)}
              className={input}
            >
              <option value="">No planned topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.title}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={creating}
              onClick={() => void writeNewEpisode()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#53D6FF] text-[#061016] px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              <Mic2 size={14} />
              {creating ? 'Opening…' : 'Create & open in studio'}
            </button>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}

      {!episode ? (
        <div className="rounded-2xl border border-dashed border-[#27313B] bg-[#151B22] px-5 py-16 text-center">
          <p className="text-sm text-[#B8C4CF]">
            Pull a planned episode, grab a studio topic, or write a new one to start recording.
          </p>
        </div>
      ) : (
        <>
          <section key={episode.id} className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <input
                defaultValue={episode.title}
                onBlur={(e) => {
                  const title = e.target.value.trim()
                  if (title && title !== episode.title) void saveEpisode({ title })
                }}
                className="flex-1 bg-transparent text-xl font-bold text-[#F6FAFC] focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
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
                  className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
                >
                  Episode page
                </Link>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={!episode.audio_url || episode.status === 'published'}
                  className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
                >
                  {episode.status === 'published' ? 'Live' : 'Publish now'}
                </button>
              </div>
            </div>

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-4 items-start">
              <div className="min-w-0">
                <PodcastAudioEditor
                  key={episode.id}
                  episodeId={episode.id}
                  audioUrl={episode.audio_url}
                  title={episode.title}
                  onExported={saveMix}
                  onPublished={publish}
                  onMarkChapter={markChapterAt}
                  chapters={episode.chapters}
                />
              </div>
              <aside className="lg:sticky lg:top-20 space-y-3">
                <Field label="Show notes / recording script">
                  <textarea
                    defaultValue={episode.show_notes || ''}
                    rows={16}
                    onBlur={(e) => void saveEpisode({ show_notes: e.target.value })}
                    className={input + ' min-h-[16rem]'}
                  />
                </Field>
                {linkedTopic && (
                  <div className="rounded-xl border border-[#27313B] bg-[#05070A] p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm text-[#F6FAFC]">Cues from {linkedTopic.title}</p>
                      <button type="button" onClick={insertTalkingPoints} className="text-sm text-[#53D6FF]">
                        Insert
                      </button>
                    </div>
                    {linkedTopic.talking_points?.length ? (
                      <ol className="list-decimal pl-5 space-y-1 text-sm text-[#B8C4CF]">
                        {linkedTopic.talking_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-[#A9B8C6]">This topic has no talking points yet.</p>
                    )}
                  </div>
                )}
              </aside>
            </div>

            <details className="rounded-xl border border-[#27313B] bg-[#05070A] px-4 py-3">
              <summary className="cursor-pointer text-sm text-[#B8C4CF]">Episode details</summary>
              <div className="grid md:grid-cols-2 gap-3 mt-4">
              <Field label="Summary">
                <textarea
                  defaultValue={episode.summary || ''}
                  rows={2}
                  onBlur={(e) => void saveEpisode({ summary: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Guest">
                <input
                  defaultValue={episode.guest_name || ''}
                  onBlur={(e) => void saveEpisode({ guest_name: e.target.value.trim() || null })}
                  className={input}
                />
              </Field>
              <Field label="Season">
                <input
                  type="number"
                  defaultValue={episode.season}
                  onBlur={(e) => void saveEpisode({ season: Number(e.target.value) })}
                  className={input}
                />
              </Field>
              <Field label="Episode number">
                <input
                  type="number"
                  defaultValue={episode.episode_number ?? ''}
                  onBlur={(e) => void saveEpisode({ episode_number: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Type">
                <select
                  value={episode.episode_type || 'full'}
                  onChange={(e) => void saveEpisode({ episode_type: e.target.value as EpisodeType })}
                  className={input}
                >
                  <option value="full">full</option>
                  <option value="trailer">trailer</option>
                  <option value="bonus">bonus</option>
                </select>
              </Field>
              <Field label="Visibility">
                <select
                  value={episode.visibility || 'public'}
                  onChange={(e) => void saveEpisode({ visibility: e.target.value as EpisodeVisibility })}
                  className={input}
                >
                  <option value="public">public</option>
                  <option value="unlisted">unlisted</option>
                  <option value="private">private</option>
                </select>
              </Field>
              <Field label="Studio topic">
                <select
                  value={episode.topic_id || ''}
                  onChange={(e) => void saveEpisode({ topic_id: e.target.value || null })}
                  className={input}
                >
                  <option value="">Unlinked</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="Schedule publish">
                <input
                  type="datetime-local"
                  defaultValue={toLocalInput(episode.scheduled_for)}
                  onBlur={(e) => {
                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null
                    void saveEpisode({
                      scheduled_for: iso,
                      status: iso && episode.status === 'draft' ? 'scheduled' : episode.status,
                    })
                  }}
                  className={input}
                />
              </Field>
              <Field label="Slug">
                <input
                  defaultValue={episode.slug}
                  onBlur={(e) => {
                    const slug = e.target.value.trim()
                    if (slug && slug !== episode.slug) void saveEpisode({ slug })
                  }}
                  className={input}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-[#B8C4CF] md:col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(episode.explicit)}
                  onChange={(e) => void saveEpisode({ explicit: e.target.checked })}
                />
                Mark episode explicit
              </label>
              <Field label="Guest bio">
                <textarea
                  defaultValue={episode.guest_bio || ''}
                  rows={3}
                  onBlur={(e) => void saveEpisode({ guest_bio: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Transcript">
                <textarea
                  defaultValue={episode.transcript || ''}
                  rows={3}
                  onBlur={(e) => void saveEpisode({ transcript: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Keywords">
                <input
                  defaultValue={(episode.keywords || []).join(', ')}
                  onBlur={(e) => {
                    const keywords = e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    void saveEpisode({ keywords })
                  }}
                  className={input}
                />
              </Field>
              <Field label="Cover art">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] cursor-pointer">
                  {uploadingCover ? 'Uploading…' : episode.cover_url ? 'Replace cover' : 'Upload cover'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadCover(file)
                    }}
                  />
                </label>
                {episode.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={episode.cover_url} alt="" className="mt-2 h-16 w-16 rounded-lg object-cover border border-[#27313B]" />
                )}
              </Field>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-[#F6FAFC] mb-2">Chapters</p>
              <ul className="space-y-1 mb-2">
                {(episode.chapters || []).map((ch, idx) => (
                  <li key={`${ch.start_ms}-${idx}`} className="flex items-center justify-between gap-2 text-sm text-[#B8C4CF]">
                    <span>
                      <span className="text-[#8DEBFF]">{formatMs(ch.start_ms)}</span> — {ch.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeChapter(idx)}
                      className="inline-flex items-center gap-1 text-xs text-red-300"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid md:grid-cols-[120px_1fr_auto] gap-2">
                <input value={chapterStart} onChange={(e) => setChapterStart(e.target.value)} placeholder="1:30" className={input} />
                <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Chapter title" className={input} />
                <button
                  type="button"
                  onClick={addChapter}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#53D6FF]"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
            </details>

            {saving && <p className="text-xs text-[#A9B8C6]">Saving…</p>}
          </section>

          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
            <p className="text-sm font-medium text-[#F6FAFC] mb-3">Ready to publish?</p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {checks.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm text-[#B8C4CF]">
                  {item.ok
                    ? <CheckCircle2 size={16} className="text-[#53D6FF]" />
                    : <Circle size={16} className="text-[#27313B]" />}
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
      {children}
    </label>
  )
}

const input = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'

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
