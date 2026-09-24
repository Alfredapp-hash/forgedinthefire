'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import type {
  ContentTopic,
  PodcastAdMarker,
  PodcastChapter,
  PodcastEpisode,
  EpisodeStatus,
  EpisodeType,
  EpisodeVisibility,
} from '@/lib/studio/types'
import { EPISODE_PIPELINE } from '@/lib/studio/types'

export function EpisodeEditor({ episodeId }: { episodeId: string }) {
  const router = useRouter()
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null)
  const [topics, setTopics] = useState<ContentTopic[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterStart, setChapterStart] = useState('0:00')
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    const [epRes, tps] = await Promise.all([
      fetch(`/api/admin/studio/episodes/${episodeId}`).then((r) => r.json()),
      fetch('/api/admin/studio/topics').then((r) => r.json()),
    ])
    if (Array.isArray(tps)) setTopics(tps)
    if (epRes?.id) {
      setEpisode({
        ...epRes,
        chapters: Array.isArray(epRes.chapters) ? epRes.chapters : [],
        keywords: Array.isArray(epRes.keywords) ? epRes.keywords : [],
        ad_markers: Array.isArray(epRes.ad_markers) ? epRes.ad_markers : [],
        episode_type: epRes.episode_type || 'full',
        visibility: epRes.visibility || 'public',
        show_notes: epRes.show_notes ?? null,
        guest_name: epRes.guest_name ?? null,
        guest_bio: epRes.guest_bio ?? null,
        scheduled_for: epRes.scheduled_for ?? null,
      })
    } else setError(epRes.error || 'Episode not found')
  }

  useEffect(() => { void load() }, [episodeId])

  async function save(patch: Record<string, unknown>, label = 'Saved') {
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
      setEpisode({
        ...data,
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        ad_markers: Array.isArray(data.ad_markers) ? data.ad_markers : [],
      })
      setOk(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function uploadFile(file: File, kind: 'audio' | 'cover', duration?: number) {
    setUploading(true)
    setError(null)
    try {
      const asset = await uploadPodcastMedia(file, episode?.title || file.name)
      if (kind === 'cover') {
        await save({ cover_url: asset.url }, 'Cover saved')
      } else {
        const seconds = duration ?? await measureAudioDuration(asset.url)
        await save({
          audio_url: asset.url,
          audio_mime: asset.mime_type || file.type,
          file_size: asset.size_bytes || file.size,
          duration_seconds: seconds,
        }, 'Audio saved')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function publish() {
    if (!episode?.audio_url) {
      setError('Upload or record audio before publishing')
      return
    }
    if (!episode.file_size || episode.file_size < 1) {
      setError('Audio is missing file size — re-save the mix so Apple RSS enclosure length is valid')
      return
    }
    if (!episode.cover_url) {
      setError('Add episode cover art (Apple: square ≥1400px; aim for 3000×3000 show/episode art)')
      return
    }
    await save(
      {
        status: 'published',
        published_at: new Date().toISOString(),
        visibility: episode.visibility === 'private' ? episode.visibility : 'public',
      },
      'Published to /podcast and RSS',
    )
  }

  async function removeEpisode() {
    if (!episode) return
    if (!window.confirm(`Delete “${episode.title}”? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/studio/episodes?id=${episode.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Delete failed')
      return
    }
    router.push('/admin/podcast')
  }

  async function duplicateEpisode() {
    if (!episode) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/studio/episodes/${episode.id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Duplicate failed')
      router.push(`/admin/podcast/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed')
      setSaving(false)
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  function addChapter() {
    if (!episode) return
    const start_ms = parseTimestamp(chapterStart)
    if (!chapterTitle.trim() || start_ms == null) {
      setError('Chapter needs a title and start time like 1:30 or 0:01:05')
      return
    }
    const next: PodcastChapter[] = [...(episode.chapters || []), { start_ms, title: chapterTitle.trim() }]
      .sort((a, b) => a.start_ms - b.start_ms)
    void save({ chapters: next }, 'Chapter added')
    setChapterTitle('')
  }

  function removeChapter(idx: number) {
    if (!episode) return
    const next = episode.chapters.filter((_, i) => i !== idx)
    void save({ chapters: next }, 'Chapter removed')
  }

  function addAdMarker(position: PodcastAdMarker['position']) {
    if (!episode) return
    const next: PodcastAdMarker[] = [
      ...(episode.ad_markers || []),
      { position, offset_ms: position === 'mid' ? Math.round((episode.duration_seconds || 0) * 500) : null, label: `${position} roll` },
    ]
    void save({ ad_markers: next }, 'Ad marker added')
  }

  const checks = useMemo(() => {
    if (!episode) return []
    return [
      { ok: Boolean(episode.title.trim()), label: 'Title' },
      { ok: Boolean(episode.summary), label: 'Summary' },
      { ok: Boolean(episode.show_notes), label: 'Show notes' },
      { ok: Boolean(episode.audio_url), label: 'Audio file' },
      { ok: Boolean(episode.file_size && episode.file_size > 0), label: 'Enclosure file size (Apple RSS)' },
      { ok: Boolean(episode.duration_seconds), label: 'Duration measured' },
      { ok: Boolean(episode.cover_url), label: 'Cover art (square; aim 3000×3000)' },
      { ok: episode.episode_number != null, label: 'Episode number' },
      { ok: (episode.chapters?.length || 0) > 0, label: 'Chapters' },
      { ok: Boolean(episode.transcript), label: 'Transcript → VTT in RSS' },
      { ok: episode.status !== 'scheduled' || Boolean(episode.scheduled_for), label: 'Schedule time (if scheduled)' },
      { ok: Boolean(episode.topic_id), label: 'Linked biweekly topic' },
    ]
  }, [episode])

  if (!episode) {
    return <p className="text-[#A9B8C6] flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading episode…</p>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/admin/podcast" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF]">
        <ArrowLeft size={14} /> All episodes
      </Link>
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <input
          defaultValue={episode.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== episode.title && void save({ title: e.target.value.trim() })}
          className="flex-1 bg-transparent text-2xl font-bold text-[#F6FAFC] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={episode.status}
            onChange={(e) => {
              const status = e.target.value as EpisodeStatus
              if (status === 'published' && !episode.audio_url) {
                setError('Upload or record audio before publishing')
                return
              }
              void save({ status })
            }}
            className="rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#F6FAFC]"
          >
            {EPISODE_PIPELINE.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Link
            href={`/admin/podcast?tab=studio&episode=${episode.id}`}
            className="px-3 py-2 rounded-lg border border-[#53D6FF] text-sm text-[#53D6FF]"
          >
            Production room
          </Link>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={!episode.audio_url || episode.status === 'published'}
            className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
          >
            {episode.status === 'published' ? 'Live' : 'Publish now'}
          </button>
          <button
            type="button"
            onClick={() => void duplicateEpisode()}
            className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => void removeEpisode()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-red-300"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </header>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 grid md:grid-cols-2 gap-3">
        <Field label="Slug">
          <input defaultValue={episode.slug} onBlur={(e) => void save({ slug: e.target.value })} className={input} />
        </Field>
        <Field label="Topic">
          <select
            value={episode.topic_id || ''}
            onChange={(e) => void save({ topic_id: e.target.value || null })}
            className={input}
          >
            <option value="">Unlinked</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
        <Field label="Season">
          <input type="number" defaultValue={episode.season} onBlur={(e) => void save({ season: Number(e.target.value) })} className={input} />
        </Field>
        <Field label="Episode number">
          <input type="number" defaultValue={episode.episode_number ?? ''} onBlur={(e) => void save({ episode_number: e.target.value })} className={input} />
        </Field>
        <Field label="Episode type">
          <select
            value={episode.episode_type || 'full'}
            onChange={(e) => void save({ episode_type: e.target.value as EpisodeType })}
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
            onChange={(e) => void save({ visibility: e.target.value as EpisodeVisibility })}
            className={input}
          >
            <option value="public">public</option>
            <option value="unlisted">unlisted</option>
            <option value="private">private (token feed only)</option>
          </select>
        </Field>
        <Field label="Schedule publish (local)">
          <input
            type="datetime-local"
            defaultValue={toLocalInput(episode.scheduled_for)}
            onBlur={(e) => {
              const iso = e.target.value ? new Date(e.target.value).toISOString() : null
              void save({
                scheduled_for: iso,
                status: iso && episode.status === 'draft' ? 'scheduled' : episode.status,
              })
            }}
            className={input}
          />
        </Field>
        <Field label="Guest name">
          <input
            defaultValue={episode.guest_name || ''}
            onBlur={(e) => void save({ guest_name: e.target.value.trim() || null })}
            className={input}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Summary">
            <textarea defaultValue={episode.summary || ''} rows={2} onBlur={(e) => void save({ summary: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Guest bio">
            <textarea defaultValue={episode.guest_bio || ''} rows={2} onBlur={(e) => void save({ guest_bio: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Show notes">
            <textarea defaultValue={episode.show_notes || ''} rows={5} onBlur={(e) => void save({ show_notes: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Transcript">
            <textarea defaultValue={episode.transcript || ''} rows={6} onBlur={(e) => void save({ transcript: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Keywords (comma-separated)">
            <input
              defaultValue={(episode.keywords || []).join(', ')}
              onBlur={(e) => {
                const keywords = e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                void save({ keywords })
              }}
              className={input}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
          <input type="checkbox" checked={episode.explicit} onChange={(e) => void save({ explicit: e.target.checked })} />
          Mark explicit
        </label>
        {episode.topic_id && (
          <Link href={`/admin/studio/topics/${episode.topic_id}`} className="text-sm text-[#53D6FF]">
            Open linked topic
          </Link>
        )}
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC]">Chapters</p>
        <ul className="space-y-2">
          {(episode.chapters || []).map((ch, idx) => (
            <li key={`${ch.start_ms}-${idx}`} className="flex items-center justify-between gap-3 text-sm text-[#B8C4CF]">
              <span><span className="text-[#8DEBFF]">{formatMs(ch.start_ms)}</span> — {ch.title}</span>
              <button type="button" onClick={() => removeChapter(idx)} className="text-red-300 text-xs">Remove</button>
            </li>
          ))}
          {!episode.chapters?.length && <p className="text-sm text-[#A9B8C6]">No chapters yet. Listeners jump by section in supporting apps.</p>}
        </ul>
        <div className="grid md:grid-cols-[120px_1fr_auto] gap-2">
          <input value={chapterStart} onChange={(e) => setChapterStart(e.target.value)} placeholder="1:30" className={input} />
          <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Chapter title" className={input} />
          <button type="button" onClick={addChapter} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#53D6FF]">
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC]">Sponsor / ad markers</p>
        <p className="text-xs text-[#A9B8C6]">Track pre / mid / post slots without a paid ad server.</p>
        <div className="flex flex-wrap gap-2">
          {(['pre', 'mid', 'post'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => addAdMarker(pos)}
              className="px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            >
              Add {pos}-roll
            </button>
          ))}
        </div>
        <ul className="space-y-1 text-sm text-[#B8C4CF]">
          {(episode.ad_markers || []).map((m, i) => (
            <li key={`${m.position}-${i}`}>
              {m.position}
              {m.offset_ms != null ? ` @ ${formatMs(m.offset_ms)}` : ''} — {m.label}
              {m.sponsor ? ` (${m.sponsor})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[#F6FAFC]">Episode audio</p>
              <p className="text-xs text-[#A9B8C6]">
                Hosted on forgedinthefireohio.org media storage · served via /podcast and RSS to Apple, Spotify, Amazon
              </p>
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] cursor-pointer">
              Upload cover art
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadFile(file, 'cover')
              }} />
            </label>
          </div>
          {episode.audio_url && (
            <audio controls src={episode.audio_url} className="w-full max-w-xl" />
          )}
          {episode.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={episode.cover_url} alt="" className="h-24 w-24 rounded-lg object-cover border border-[#27313B]" />
          )}
          {uploading && <p className="text-sm text-[#8DEBFF]">Uploading to site host…</p>}
        </div>

        <PodcastAudioEditor
          episodeId={episode.id}
          audioUrl={episode.audio_url}
          title={episode.title}
          chapters={episode.chapters}
          onMarkChapter={(seconds) => {
            const title = chapterTitle.trim() || `Chapter ${(episode.chapters?.length || 0) + 1}`
            const start_ms = Math.round(Math.max(0, seconds) * 1000)
            const next = [...(episode.chapters || []), { start_ms, title }].sort((a, b) => a.start_ms - b.start_ms)
            void save({ chapters: next }, 'Chapter marked')
            setChapterTitle('')
          }}
          onExported={async (file, duration) => {
            await uploadFile(file, 'audio', duration)
            await save({ status: episode.status === 'draft' ? 'editing' : episode.status }, 'Edited audio hosted')
          }}
          onPublished={async () => {
            await publish()
          }}
        />
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC] flex items-center gap-2">
          <Code2 size={14} /> Share · embed · RSS item
        </p>
        <div className="grid gap-2">
          <code className="block rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/podcast/${episode.slug}` : `/podcast/${episode.slug}`}
          </code>
          <code className="block rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">
            {`<iframe src="/podcast/embed" width="100%" height="180" frameborder="0" allow="autoplay" title="${episode.title}"></iframe>`}
          </code>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyText('link', `${window.location.origin}/podcast/${episode.slug}`)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            <Copy size={14} /> {copied === 'link' ? 'Copied' : 'Copy page link'}
          </button>
          <button
            type="button"
            onClick={() =>
              void copyText(
                'embed',
                `<iframe src="${window.location.origin}/podcast/embed" width="100%" height="180" frameborder="0" allow="autoplay" title="${episode.title}"></iframe>`
              )
            }
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            <Copy size={14} /> {copied === 'embed' ? 'Copied' : 'Copy embed'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
        <p className="text-sm font-medium text-[#F6FAFC] mb-3">Publish checklist</p>
        <ul className="space-y-2">
          {checks.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm text-[#B8C4CF]">
              {item.ok
                ? <CheckCircle2 size={16} className="text-[#53D6FF]" />
                : <Circle size={16} className="text-[#27313B]" />}
              {item.label}
            </li>
          ))}
        </ul>
        {saving && <p className="text-xs text-[#A9B8C6] mt-3">Saving…</p>}
      </section>
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
