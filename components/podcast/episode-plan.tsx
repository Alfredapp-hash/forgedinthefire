'use client'

import { CheckCircle2, Circle, Mic2, Plus, Trash2 } from 'lucide-react'
import { Button, Checkbox, EmptyState, Input, Panel, Select, Textarea } from '@/components/studio-ui'
import type {
  ContentTopic,
  EpisodeType,
  EpisodeVisibility,
  PodcastEpisode,
} from '@/lib/studio/types'

export type PlanCheck = { ok: boolean; label: string; required: boolean; field?: string | null }

export type QueueFilter = 'planned' | 'needs_audio' | 'all'

/** Coarse queue grouping for the card list — collapses the fine-grained
 *  pipeline into the four buckets a host thinks in. */
type QueueGroup = 'planned' | 'in_progress' | 'ready' | 'published'

const QUEUE_GROUPS: { id: QueueGroup; label: string }[] = [
  { id: 'planned', label: 'Planned' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'ready', label: 'Ready to edit' },
  { id: 'published', label: 'Published' },
]

function queueGroup(ep: PodcastEpisode): QueueGroup {
  if (ep.status === 'published') return 'published'
  if (ep.status === 'archived') return 'published'
  // Has a mix and is being finished → ready to edit / review.
  if (ep.status === 'editing' || ep.status === 'review' || ep.status === 'scheduled') return 'ready'
  if (ep.audio_url) return 'ready'
  if (ep.status === 'recording') return 'in_progress'
  return 'planned'
}

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
  /** Jump/scroll to the Plan field a failing checklist row fixes. */
  onJumpField?: (field: string | null) => void

  toLocalInput: (iso: string | null) => string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="studio-type-label mb-1.5 block text-silver-label">{label}</span>
      {children}
    </label>
  )
}

/** Build the stable DOM id a Plan field carries so the publish checklist can
 *  scroll/focus straight to it. Kept in sync with COMPLIANCE_FIELD in RecordingStudio. */
function fieldId(field: string, episodeId: string) {
  return `plan-field-${field}-${episodeId}`
}

/**
 * Stable, unique React key for a chapter row. Chapters are stored without an
 * id, so we derive one from the fields that identify it — start_ms (which feed
 * compliance guarantees is unique across an episode's chapters) plus the title
 * as a tiebreak. This is stable across reorders/edits in a way `start_ms+idx`
 * was not, so React never reuses the wrong row's DOM/input state.
 */
function chapterKey(ch: { start_ms: number; title: string }, idx: number) {
  return `ch-${ch.start_ms}-${ch.title || idx}`
}

function GroupCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Panel elevation="raised" className="p-6">
      <div className="mb-5">
        <p className="studio-type-section !text-[16px]">{title}</p>
        {hint && <p className="studio-type-body mt-1 text-silver-body">{hint}</p>}
      </div>
      {children}
    </Panel>
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
  onJumpField,
  toLocalInput,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Pick / create queue */}
      <Panel elevation="raised" className="space-y-5 p-6">
        <div>
          <p className="studio-type-label text-ice">Plan the episode</p>
          <p className="studio-type-body mt-1.5 text-silver-body">
            Pick a planned episode or write a new one, then fill in the details below. Everything here follows the
            episode into Record, Edit, and Publish — nothing is hidden until the end.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {([
            ['planned', 'Planned'],
            ['needs_audio', 'Needs audio'],
            ['all', 'All episodes'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id)}
              className={`studio-type-button rounded-control px-3 py-1.5 transition-colors duration-150 ease-calm ${
                filter === id
                  ? 'bg-surface-raised text-ice shadow-inset-top'
                  : 'text-silver-body hover:bg-surface-raised hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {/* Status-grouped card queue: replaces the flat <select> so the host
                sees each episode's stage, S#E#, summary, and audio state at a glance. */}
            {queuedEpisodes.length === 0 ? (
              <Panel elevation="flat">
                <EmptyState
                  size="compact"
                  icon={<Mic2 size={18} />}
                  title="No episodes in this view"
                  description="Write one on the right, or switch the filter above."
                />
              </Panel>
            ) : (
              <div className="space-y-4">
                {QUEUE_GROUPS.map((group) => {
                  const items = queuedEpisodes.filter((ep) => queueGroup(ep) === group.id)
                  if (items.length === 0) return null
                  return (
                    <div key={group.id}>
                      <p className="studio-type-label mb-2 flex items-center gap-2 text-silver-label">
                        {group.label}
                        <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-ice">{items.length}</span>
                      </p>
                      <div className="space-y-2">
                        {items.map((ep) => {
                          const active = ep.id === selectedId
                          const seLabel = ep.episode_number != null ? `S${ep.season}E${ep.episode_number}` : null
                          const summary = ep.summary?.trim() || ep.show_notes?.trim() || 'No summary yet'
                          return (
                            <button
                              key={ep.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => onSelect(ep.id)}
                              className={`w-full rounded-control border px-3 py-2.5 text-left shadow-inset-top transition-[border-color,box-shadow] duration-150 ease-calm ${
                                active
                                  ? 'border-forged/60 bg-surface-raised shadow-glow-subtle'
                                  : 'border-divider bg-obsidian hover:border-forged/60 hover:shadow-glow-subtle'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="studio-type-body min-w-0 flex-1 truncate text-white">{ep.title}</span>
                                {seLabel && (
                                  <span className="studio-type-label shrink-0 text-silver-label">{seLabel}</span>
                                )}
                                <span
                                  className={`studio-type-label shrink-0 ${ep.audio_url ? 'text-forged' : 'text-silver-label'}`}
                                  title={ep.audio_url ? 'Audio uploaded' : 'No audio yet'}
                                >
                                  {ep.audio_url ? 'audio ✓' : 'audio ✗'}
                                </span>
                              </div>
                              <p className="studio-type-label mt-0.5 truncate text-silver-body">{summary}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {plannedTopics.length > 0 && (
              <div>
                <p className="studio-type-label mb-2 text-silver-label">
                  Planned topics without an episode
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {plannedTopics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={creating}
                      onClick={() => onOpenTopic(topic)}
                      className="w-full rounded-control border border-divider bg-obsidian px-3 py-2.5 text-left shadow-inset-top transition-[border-color,box-shadow] duration-150 ease-calm hover:border-forged/60 hover:shadow-glow-subtle disabled:pointer-events-none disabled:opacity-40"
                    >
                      <p className="studio-type-body text-white">{topic.title}</p>
                      <p className="studio-type-label mt-0.5 text-silver-label">
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

          <Panel elevation="flat" className="space-y-3 p-4">
            <p className="studio-type-column">Write a new episode</p>
            <Input
              value={draftTitle}
              onChange={(e) => onDraftTitle(e.target.value)}
              placeholder="Episode title"
            />
            <Textarea
              value={draftSummary}
              onChange={(e) => onDraftSummary(e.target.value)}
              placeholder="One-line summary for the public page and RSS"
              rows={2}
            />
            <Textarea
              value={draftNotes}
              onChange={(e) => onDraftNotes(e.target.value)}
              placeholder="Show notes / recording script"
              rows={4}
            />
            <Input
              value={draftGuest}
              onChange={(e) => onDraftGuest(e.target.value)}
              placeholder="Guest name (optional)"
            />
            <Select aria-label="Planned topic" value={draftTopicId} onChange={(e) => onDraftTopicId(e.target.value)}>
              <option value="">No planned topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              size="touch"
              loading={creating}
              disabled={creating}
              onClick={onCreate}
              className="w-full"
            >
              <Mic2 size={14} />
              {creating ? 'Opening…' : 'Create & open in studio'}
            </Button>
          </Panel>
        </div>
      </Panel>

      {episode && (
        <>
          {/* Basics */}
          <GroupCard title="Basics" hint="What the episode is about — the essentials for the public page.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <Input
                  id={fieldId('title', episode.id)}
                  key={`title-${episode.id}`}
                  defaultValue={episode.title}
                  onBlur={(e) => {
                    const title = e.target.value.trim()
                    if (title && title !== episode.title) onSave({ title })
                  }}
                />
              </Field>
              <Field label="Guest">
                <Input
                  key={`guest-${episode.id}`}
                  defaultValue={episode.guest_name || ''}
                  onBlur={(e) => onSave({ guest_name: e.target.value.trim() || null })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Show notes / recording script">
                  <Textarea
                    id={fieldId('notes', episode.id)}
                    key={`notes-${episode.id}`}
                    defaultValue={episode.show_notes || ''}
                    rows={6}
                    onBlur={(e) => onSave({ show_notes: e.target.value })}
                  />
                </Field>
              </div>
              {linkedTopic && (
                <Panel elevation="flat" className="p-4 md:col-span-2">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="studio-type-column">Cues from {linkedTopic.title}</p>
                    <button
                      type="button"
                      onClick={onInsertTalkingPoints}
                      className="studio-type-button text-forged transition-colors hover:text-ice"
                    >
                      Insert into script
                    </button>
                  </div>
                  {linkedTopic.talking_points?.length ? (
                    <ol className="studio-type-body list-decimal space-y-1 pl-5 text-silver-body">
                      {linkedTopic.talking_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="studio-type-body text-silver-label">This topic has no talking points yet.</p>
                  )}
                </Panel>
              )}
              <div className="md:col-span-2">
                <Field label="Guest bio">
                  <Textarea
                    key={`bio-${episode.id}`}
                    defaultValue={episode.guest_bio || ''}
                    rows={3}
                    onBlur={(e) => onSave({ guest_bio: e.target.value })}
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
                  <Textarea
                    id={fieldId('summary', episode.id)}
                    key={`summary-${episode.id}`}
                    defaultValue={episode.summary || ''}
                    rows={2}
                    onBlur={(e) => onSave({ summary: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Keywords">
                <Input
                  key={`kw-${episode.id}`}
                  defaultValue={(episode.keywords || []).join(', ')}
                  onBlur={(e) => {
                    const keywords = e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    onSave({ keywords })
                  }}
                />
              </Field>
              <Field label="Slug">
                <Input
                  key={`slug-${episode.id}`}
                  defaultValue={episode.slug}
                  onBlur={(e) => {
                    const slug = e.target.value.trim()
                    if (slug && slug !== episode.slug) onSave({ slug })
                  }}
                />
              </Field>
              <Field label="Season">
                <Input
                  key={`season-${episode.id}`}
                  type="number"
                  defaultValue={episode.season}
                  onBlur={(e) => onSave({ season: Number(e.target.value) })}
                />
              </Field>
              <Field label="Episode number">
                <Input
                  id={fieldId('epnum', episode.id)}
                  key={`epnum-${episode.id}`}
                  type="number"
                  defaultValue={episode.episode_number ?? ''}
                  onBlur={(e) => onSave({ episode_number: e.target.value })}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={episode.episode_type || 'full'}
                  onChange={(e) => onSave({ episode_type: e.target.value as EpisodeType })}
                >
                  <option value="full">full</option>
                  <option value="trailer">trailer</option>
                  <option value="bonus">bonus</option>
                </Select>
              </Field>
              <Field label="Visibility">
                <Select
                  value={episode.visibility || 'public'}
                  onChange={(e) => onSave({ visibility: e.target.value as EpisodeVisibility })}
                >
                  <option value="public">public</option>
                  <option value="unlisted">unlisted</option>
                  <option value="private">private</option>
                </Select>
              </Field>
              <Field label="Studio topic">
                <Select
                  id={fieldId('topic', episode.id)}
                  value={episode.topic_id || ''}
                  onChange={(e) => onSave({ topic_id: e.target.value || null })}
                >
                  <option value="">Unlinked</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Schedule publish">
                <Input
                  id={fieldId('sched', episode.id)}
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
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Transcript">
                  <Textarea
                    id={fieldId('transcript', episode.id)}
                    key={`transcript-${episode.id}`}
                    defaultValue={episode.transcript || ''}
                    rows={3}
                    onBlur={(e) => onSave({ transcript: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Checkbox
                  checked={Boolean(episode.explicit)}
                  onChange={(e) => onSave({ explicit: e.target.checked })}
                  label="Mark episode explicit"
                />
              </div>
            </div>
          </GroupCard>

          {/* Art & chapters */}
          <GroupCard title="Art & chapters" hint="Cover art and chapter markers for players that support them.">
            <Field label="Cover art">
              <label className="studio-type-button inline-flex cursor-pointer items-center gap-2 rounded-control border border-divider bg-surface-raised px-3 py-2 text-silver shadow-inset-top transition-[border-color,box-shadow] duration-150 ease-calm hover:border-forged/60 hover:shadow-glow-subtle">
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
                  className="mt-2 h-16 w-16 rounded-tile border border-divider object-cover"
                />
              )}
            </Field>

            <div className="mt-5" id={fieldId('chapters', episode.id)}>
              <p className="studio-type-column mb-2.5">Chapters</p>
              <ul className="mb-3 space-y-1.5">
                {(episode.chapters || []).map((ch, idx) => (
                  <li
                    key={chapterKey(ch, idx)}
                    className="studio-type-body flex items-center justify-between gap-2 text-silver-body"
                  >
                    <span className="min-w-0 break-words">
                      <span className="studio-type-timecode text-ice">{formatMs(ch.start_ms)}</span> — {ch.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveChapter(idx)}
                      className="studio-type-label inline-flex shrink-0 items-center gap-1 text-heart transition-colors hover:brightness-110"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <Input
                  aria-label="Chapter start time (minutes:seconds)"
                  value={chapterStart}
                  onChange={(e) => onChapterStart(e.target.value)}
                  placeholder="1:30"
                />
                <Input
                  aria-label="Chapter title"
                  value={chapterTitle}
                  onChange={(e) => onChapterTitle(e.target.value)}
                  placeholder="Chapter title"
                />
                <Button variant="secondary" size="compact" onClick={onAddChapter}>
                  <Plus size={14} /> Add
                </Button>
              </div>
            </div>
          </GroupCard>

          {/* Compliance checklist — surfaced early so problems show up now, not at publish. */}
          <GroupCard title="Checklist" hint="Fix anything flagged before you get to Publish.">
            {!complianceOk && blockersText && (
              <p className="studio-type-label mb-4 rounded-control border border-heart/40 bg-heart/10 px-3 py-2 text-heart">
                Publish blocked · {blockersText}
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => {
                const failing = item.required && !item.ok
                const jumpable = !item.ok && Boolean(item.field) && Boolean(onJumpField)
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
                    {jumpable && <span className="studio-type-label shrink-0 text-ice">Fix →</span>}
                    {failing && !jumpable && <span className="studio-type-label shrink-0 text-heart">required</span>}
                  </>
                )
                return (
                  <li key={item.label}>
                    {jumpable ? (
                      <button
                        type="button"
                        onClick={() => onJumpField?.(item.field ?? null)}
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
          </GroupCard>
        </>
      )}
    </div>
  )
}
