'use client'

import { CheckCircle2, Circle, Mic2, Plus, Trash2 } from 'lucide-react'
import type {
  ContentTopic,
  EpisodeType,
  EpisodeVisibility,
  PodcastEpisode,
} from '@/lib/studio/types'

export type PlanCheck = { ok: boolean; label: string; required: boolean }

export type QueueFilter = 'planned' | 'needs_audio' | 'all'

type Props = {
  /** Full episode list, filtered view, and topics for the pick/create queue. */
  topics: ContentTopic[]
  queuedEpisodes: PodcastEpisode[]
  plannedTopics: ContentTopic[]
  selectedId: string
  filter: QueueFilter
  creating: boolean
  onFilterChange: (filter: QueueFilter) => void
  onSelect: (id: string) => void
  onOpenTopic: (topic: ContentTopic) => void

  /** New-episode draft form. */
  draftTitle: string
  draftSummary: string
  draftNotes: string
  draftGuest: string
  draftTopicId: string
  onDraftTitle: (v: string) => void
  onDraftSummary: (v: string) => void
  onDraftNotes: (v: string) => void
  onDraftGuest: (v: string) => void
  onDraftTopicId: (v: string) => void
  onCreate: () => void

  /** The loaded episode + its save handler. Null before one is picked. */
  episode: PodcastEpisode | null
  onSave: (patch: Record<string, unknown>, label?: string) => void
  onUploadCover: (file: File) => void
  uploadingCover: boolean

  /** Linked studio topic, so its talking points can be pulled into the script. */
  linkedTopic: ContentTopic | null
  onInsertTalkingPoints: () => void

  /** Chapters editor. */
  chapterStart: string
  chapterTitle: string
  onChapterStart: (v: string) => void
  onChapterTitle: (v: string) => void
  onAddChapter: () => void
  onRemoveChapter: (idx: number) => void
  formatMs: (ms: number) => string

  /** Compliance checklist surfaced up-front. */
  checks: PlanCheck[]
  complianceOk: boolean
  blockersText: string | null

  toLocalInput: (iso: string | null) => string
}

const input = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6]">{label}</span>
      {children}
    </label>
  )
}

function GroupCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-[#F6FAFC]">{title}</p>
        {hint && <p className="mt-0.5 text-[12px] text-[#A9B8C6]">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function EpisodePlan({
  topics,
  queuedEpisodes,
  plannedTopics,
  selectedId,
  filter,
  creating,
  onFilterChange,
  onSelect,
  onOpenTopic,
  draftTitle,
  draftSummary,
  draftNotes,
  draftGuest,
  draftTopicId,
  onDraftTitle,
  onDraftSummary,
  onDraftNotes,
  onDraftGuest,
  onDraftTopicId,
  onCreate,
  episode,
  onSave,
  onUploadCover,
  uploadingCover,
  linkedTopic,
  onInsertTalkingPoints,
  chapterStart,
  chapterTitle,
  onChapterStart,
  onChapterTitle,
  onAddChapter,
  onRemoveChapter,
  formatMs,
  checks,
  complianceOk,
  blockersText,
  toLocalInput,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Pick / create queue */}
      <section className="space-y-4 rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Plan the episode</p>
          <p className="mt-1 text-sm text-[#B8C4CF]">
            Pick a planned episode or write a new one, then fill in the details below. Everything here follows the
            episode into Record, Edit, and Publish — nothing is hidden until the end.
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
              onClick={() => onFilterChange(id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filter === id ? 'bg-[#1A232C] text-[#8DEBFF]' : 'text-[#B8C4CF] hover:bg-[#1A232C]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6]">
                Open a planned episode
              </span>
              <select value={selectedId} onChange={(e) => onSelect(e.target.value)} className={input}>
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
                <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6]">
                  Planned topics without an episode
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {plannedTopics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={creating}
                      onClick={() => onOpenTopic(topic)}
                      className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-left hover:border-[#53D6FF]"
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

          <div className="space-y-3 rounded-xl border border-[#27313B] bg-[#05070A] p-4">
            <p className="text-sm text-[#F6FAFC]">Write a new episode</p>
            <input
              value={draftTitle}
              onChange={(e) => onDraftTitle(e.target.value)}
              placeholder="Episode title"
              className={input}
            />
            <textarea
              value={draftSummary}
              onChange={(e) => onDraftSummary(e.target.value)}
              placeholder="One-line summary for the public page and RSS"
              rows={2}
              className={input}
            />
            <textarea
              value={draftNotes}
              onChange={(e) => onDraftNotes(e.target.value)}
              placeholder="Show notes / recording script"
              rows={4}
              className={input}
            />
            <input
              value={draftGuest}
              onChange={(e) => onDraftGuest(e.target.value)}
              placeholder="Guest name (optional)"
              className={input}
            />
            <select value={draftTopicId} onChange={(e) => onDraftTopicId(e.target.value)} className={input}>
              <option value="">No planned topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={creating}
              onClick={onCreate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#53D6FF] px-4 py-2 text-sm font-medium text-[#061016] disabled:opacity-40"
            >
              <Mic2 size={14} />
              {creating ? 'Opening…' : 'Create & open in studio'}
            </button>
          </div>
        </div>
      </section>

      {episode && (
        <>
          {/* Basics */}
          <GroupCard title="Basics" hint="What the episode is about — the essentials for the public page.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input
                  key={`title-${episode.id}`}
                  defaultValue={episode.title}
                  onBlur={(e) => {
                    const title = e.target.value.trim()
                    if (title && title !== episode.title) onSave({ title })
                  }}
                  className={input}
                />
              </Field>
              <Field label="Guest">
                <input
                  key={`guest-${episode.id}`}
                  defaultValue={episode.guest_name || ''}
                  onBlur={(e) => onSave({ guest_name: e.target.value.trim() || null })}
                  className={input}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Show notes / recording script">
                  <textarea
                    key={`notes-${episode.id}`}
                    defaultValue={episode.show_notes || ''}
                    rows={6}
                    onBlur={(e) => onSave({ show_notes: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
              {linkedTopic && (
                <div className="rounded-xl border border-[#27313B] bg-[#05070A] p-4 md:col-span-2">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-[#F6FAFC]">Cues from {linkedTopic.title}</p>
                    <button type="button" onClick={onInsertTalkingPoints} className="text-sm text-[#53D6FF]">
                      Insert into script
                    </button>
                  </div>
                  {linkedTopic.talking_points?.length ? (
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-[#B8C4CF]">
                      {linkedTopic.talking_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-[#A9B8C6]">This topic has no talking points yet.</p>
                  )}
                </div>
              )}
              <div className="md:col-span-2">
                <Field label="Guest bio">
                  <textarea
                    key={`bio-${episode.id}`}
                    defaultValue={episode.guest_bio || ''}
                    rows={3}
                    onBlur={(e) => onSave({ guest_bio: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
            </div>
          </GroupCard>

          {/* SEO & RSS */}
          <GroupCard title="SEO & RSS" hint="How the episode shows up in feeds, search, and podcast apps.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Summary">
                  <textarea
                    key={`summary-${episode.id}`}
                    defaultValue={episode.summary || ''}
                    rows={2}
                    onBlur={(e) => onSave({ summary: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
              <Field label="Keywords">
                <input
                  key={`kw-${episode.id}`}
                  defaultValue={(episode.keywords || []).join(', ')}
                  onBlur={(e) => {
                    const keywords = e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    onSave({ keywords })
                  }}
                  className={input}
                />
              </Field>
              <Field label="Slug">
                <input
                  key={`slug-${episode.id}`}
                  defaultValue={episode.slug}
                  onBlur={(e) => {
                    const slug = e.target.value.trim()
                    if (slug && slug !== episode.slug) onSave({ slug })
                  }}
                  className={input}
                />
              </Field>
              <Field label="Season">
                <input
                  key={`season-${episode.id}`}
                  type="number"
                  defaultValue={episode.season}
                  onBlur={(e) => onSave({ season: Number(e.target.value) })}
                  className={input}
                />
              </Field>
              <Field label="Episode number">
                <input
                  key={`epnum-${episode.id}`}
                  type="number"
                  defaultValue={episode.episode_number ?? ''}
                  onBlur={(e) => onSave({ episode_number: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Type">
                <select
                  value={episode.episode_type || 'full'}
                  onChange={(e) => onSave({ episode_type: e.target.value as EpisodeType })}
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
                  onChange={(e) => onSave({ visibility: e.target.value as EpisodeVisibility })}
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
                  onChange={(e) => onSave({ topic_id: e.target.value || null })}
                  className={input}
                >
                  <option value="">Unlinked</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Schedule publish">
                <input
                  key={`sched-${episode.id}`}
                  type="datetime-local"
                  defaultValue={toLocalInput(episode.scheduled_for)}
                  onBlur={(e) => {
                    const iso = e.target.value ? new Date(e.target.value).toISOString() : null
                    onSave({
                      scheduled_for: iso,
                      status: iso && episode.status === 'draft' ? 'scheduled' : episode.status,
                    })
                  }}
                  className={input}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Transcript">
                  <textarea
                    key={`transcript-${episode.id}`}
                    defaultValue={episode.transcript || ''}
                    rows={3}
                    onBlur={(e) => onSave({ transcript: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#B8C4CF] md:col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(episode.explicit)}
                  onChange={(e) => onSave({ explicit: e.target.checked })}
                />
                Mark episode explicit
              </label>
            </div>
          </GroupCard>

          {/* Art & chapters */}
          <GroupCard title="Art & chapters" hint="Cover art and chapter markers for players that support them.">
            <Field label="Cover art">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#27313B] px-3 py-2 text-sm text-[#B8C4CF]">
                {uploadingCover ? 'Uploading…' : episode.cover_url ? 'Replace cover' : 'Upload cover'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onUploadCover(file)
                  }}
                />
              </label>
              {episode.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={episode.cover_url}
                  alt=""
                  className="mt-2 h-16 w-16 rounded-lg border border-[#27313B] object-cover"
                />
              )}
            </Field>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-[#F6FAFC]">Chapters</p>
              <ul className="mb-2 space-y-1">
                {(episode.chapters || []).map((ch, idx) => (
                  <li
                    key={`${ch.start_ms}-${idx}`}
                    className="flex items-center justify-between gap-2 text-sm text-[#B8C4CF]"
                  >
                    <span>
                      <span className="text-[#8DEBFF]">{formatMs(ch.start_ms)}</span> — {ch.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveChapter(idx)}
                      className="inline-flex items-center gap-1 text-xs text-red-300"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <input
                  value={chapterStart}
                  onChange={(e) => onChapterStart(e.target.value)}
                  placeholder="1:30"
                  className={input}
                />
                <input
                  value={chapterTitle}
                  onChange={(e) => onChapterTitle(e.target.value)}
                  placeholder="Chapter title"
                  className={input}
                />
                <button
                  type="button"
                  onClick={onAddChapter}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#27313B] px-3 py-2 text-sm text-[#53D6FF]"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </GroupCard>

          {/* Compliance checklist — surfaced early so problems show up now, not at publish. */}
          <GroupCard title="Checklist" hint="Fix anything red before you get to Publish.">
            {!complianceOk && blockersText && (
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
          </GroupCard>
        </>
      )}
    </div>
  )
}
