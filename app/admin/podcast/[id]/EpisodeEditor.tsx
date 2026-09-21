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
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-react'
import { RevisionHistory } from '@/src/features/content/RevisionHistory'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
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
      // Large audio bypasses the ~6MB Netlify function body via signed direct upload
      const useSigned = kind === 'audio' && file.size > 4.5 * 1024 * 1024
      let asset: { url: string; mime_type?: string; size_bytes?: number }

      if (useSigned) {
        const signRes = await fetch('/api/admin/media/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mime_type: file.type || 'audio/mpeg',
            size_bytes: file.size,
          }),
        })
        const signed = await signRes.json()
        if (!signRes.ok) throw new Error(signed.error || 'Could not start upload')
        const put = await fetch(signed.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'audio/mpeg' },
          body: file,
        })
        if (!put.ok) throw new Error('Direct storage upload failed')
        const completeRes = await fetch('/api/admin/media/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: signed.path,
            filename: file.name,
            mime_type: file.type || 'audio/mpeg',
            size_bytes: file.size,
            alt: episode?.title || file.name,
            publicUrl: signed.publicUrl,
          }),
        })
        asset = await completeRes.json()
        if (!completeRes.ok) throw new Error((asset as { error?: string }).error || 'Upload finalize failed')
      } else {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('alt', episode?.title || file.name)
        const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
        asset = await res.json()
        if (!res.ok) throw new Error((asset as { error?: string }).error || 'Upload failed')
      }

      if (kind === 'cover') {
        await save({ cover_url: asset.url }, 'Cover saved')
      } else {
        const seconds = duration ?? await measureDuration(asset.url)
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
    if (!episode) return
    await save(
      {
        status: 'published',
        published_at: new Date().toISOString(),
        visibility: episode.visibility === 'private' ? episode.visibility : 'public',
      },
      'Published to /podcast and RSS',
    )
  }

  async function unpublish() {
    if (!episode) return
    if (!window.confirm('Unpublish this episode from the site, RSS, and sitemap?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/studio/episodes/${episode.id}/unpublish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unpublish failed')
      setEpisode({
        ...data,
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        ad_markers: Array.isArray(data.ad_markers) ? data.ad_markers : [],
      })
      setOk('Unpublished — removed from public RSS and sitemap')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unpublish failed')
    } finally {
      setSaving(false)
    }
  }

  async function openPreview() {
    if (!episode) return
    const res = await fetch(`/api/admin/studio/episodes/${episode.id}/preview`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not create preview')
      return
    }
    window.open(data.url, '_blank')
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

  async function promoteEpisode() {
    if (!episode) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/studio/episodes/${episode.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createCampaign: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Promote failed')
      const bits = [
        data.clipsUpdated ? `Prefill ${data.clipsUpdated} clip${data.clipsUpdated === 1 ? '' : 's'}` : null,
        data.campaignId ? 'draft campaign ready' : null,
      ].filter(Boolean)
      setOk(bits.join(' · ') || 'Promote ready')
      if (data.campaignUrl) window.open(data.campaignUrl, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed')
    } finally {
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
      { ok: Boolean(episode.consent_confirmed), label: 'Survivor consent / no identifying details' },
      { ok: Boolean(episode.graphic_detail_reviewed), label: 'Graphic / trauma detail reviewed' },
      { ok: Boolean(episode.identifying_info_reviewed), label: 'Identifying details reviewed' },
      { ok: !episode.show_public_advisory || Boolean(episode.content_warning?.trim()), label: 'Public advisory written (if enabled)' },
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
          <button
            type="button"
            onClick={() => void publish()}
            disabled={episode.status === 'published'}
            className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
          >
            {episode.status === 'published' ? 'Live' : 'Publish now'}
          </button>
          {episode.status === 'published' && (
            <button
              type="button"
              onClick={() => void unpublish()}
              className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            >
              Unpublish
            </button>
          )}
          <button
            type="button"
            onClick={() => void openPreview()}
            className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            Preview link
          </button>
          <button
            type="button"
            onClick={() => void promoteEpisode()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#53D6FF]"
          >
            <Megaphone size={14} />
            Promote to social
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
        <label className="flex items-start gap-2 text-sm text-[#B8C4CF] md:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(episode.consent_confirmed)}
            onChange={(e) => void save({ consent_confirmed: e.target.checked })}
            className="mt-0.5"
          />
          I confirm survivor consent is on file, or this episode contains no identifying survivor details.
        </label>
        <label className="flex items-start gap-2 text-sm text-[#B8C4CF] md:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(episode.graphic_detail_reviewed)}
            onChange={(e) => void save({ graphic_detail_reviewed: e.target.checked })}
            className="mt-0.5"
          />
          I reviewed this episode for graphic or trauma-heavy detail.
        </label>
        <label className="flex items-start gap-2 text-sm text-[#B8C4CF] md:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(episode.identifying_info_reviewed)}
            onChange={(e) => void save({ identifying_info_reviewed: e.target.checked })}
            className="mt-0.5"
          />
          I confirmed no identifying survivor details appear without consent.
        </label>
        <label className="flex items-start gap-2 text-sm text-[#B8C4CF] md:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(episode.show_public_advisory)}
            onChange={(e) => void save({ show_public_advisory: e.target.checked })}
            className="mt-0.5"
          />
          Show a content advisory on the public episode page.
        </label>
        {episode.show_public_advisory && (
          <div className="md:col-span-2">
            <Field label="Content advisory">
              <textarea
                defaultValue={episode.content_warning || ''}
                rows={2}
                onBlur={(e) => void save({ content_warning: e.target.value.trim() || null })}
                className={input}
                placeholder="This episode discusses trafficking, violence, or other trauma. Take care while listening."
              />
            </Field>
          </div>
        )}
        <Field label="Identity protection">
          <select
            value={episode.identity_protection || 'anonymous'}
            onChange={(e) => void save({ identity_protection: e.target.value })}
            className={input}
          >
            <option value="anonymous">anonymous</option>
            <option value="pseudonym">pseudonym</option>
            <option value="first_name">first name only</option>
            <option value="real_name">real name (explicit consent)</option>
          </select>
        </Field>
        {episode.lufs_integrated != null && (
          <p className="text-xs text-[#A9B8C6] md:col-span-2">
            Mix loudness {Number(episode.lufs_integrated).toFixed(1)} LUFS
            {episode.lufs_true_peak != null ? ` · true peak ${Number(episode.lufs_true_peak).toFixed(1)} dBTP` : ''}
            {' '}(target −16 LUFS / −1 dBTP)
          </p>
        )}
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
          audioUrl={episode.audio_url}
          title={episode.title}
          onExported={async (file, duration, loudness) => {
            await uploadFile(file, 'audio', duration)
            await save({
              status: episode.status === 'draft' ? 'editing' : episode.status,
              lufs_integrated: loudness?.lufsIntegrated ?? null,
              lufs_true_peak: loudness?.truePeakDb ?? null,
            }, 'Edited audio hosted')
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

      <RevisionHistory
        listUrl={`/api/admin/studio/episodes/${episode.id}/revisions`}
        onRestored={() => void load()}
      />
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

function measureDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(Math.round(audio.duration) || null)
    audio.onerror = () => resolve(null)
    audio.src = url
  })
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
