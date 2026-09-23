'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Rocket,
  Trash2,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { CleanupPanel, type PostSnapshot } from '@/components/podcast/post/CleanupPanel'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import { LEGACY_COVER_URLS, PODCAST } from '@/lib/podcast-meta'
import {
  loudnessTarget,
  releaseBlockers,
  releaseChecks,
  type EpisodeSafetyFields,
  type ReleaseCheck,
} from '@/lib/studio/release'
import { cleanWords, realignWords, transcriptKind } from '@/lib/studio/transcript'
import { measureHostedLoudness, measureImage, normalizeHostedAudio } from '@/lib/studio/release-audio'
import type {
  ContentTopic,
  EpisodeStatus,
  EpisodeType,
  EpisodeVisibility,
  PodcastAdMarker,
  PodcastChapter,
  PodcastEpisode,
  PodcastShow,
} from '@/lib/studio/types'

type Loudness = { lufs: number; peakDb: number; channels: number }

/** Statuses staff can pick directly; publish / schedule go through the release panel. */
const WORKFLOW_STATUSES: EpisodeStatus[] = ['draft', 'recording', 'editing', 'review', 'archived']
const AUTO_MEASURE_MAX_SECONDS = 45 * 60

function normalizeEpisode(raw: PodcastEpisode): PodcastEpisode {
  return {
    ...raw,
    chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    ad_markers: Array.isArray(raw.ad_markers) ? raw.ad_markers : [],
    episode_type: raw.episode_type || 'full',
    visibility: raw.visibility || 'public',
    show_notes: raw.show_notes ?? null,
    guest_name: raw.guest_name ?? null,
    guest_bio: raw.guest_bio ?? null,
    scheduled_for: raw.scheduled_for ?? null,
  }
}

export function EpisodeEditor({ episodeId }: { episodeId: string }) {
  const router = useRouter()
  const [episode, setEpisode] = useState<PodcastEpisode | null>(null)
  const episodeRef = useRef<PodcastEpisode | null>(null)
  episodeRef.current = episode
  const [topics, setTopics] = useState<ContentTopic[]>([])
  const [show, setShow] = useState<PodcastShow | null>(null)
  const [siblings, setSiblings] = useState<PodcastEpisode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterStart, setChapterStart] = useState('0:00')
  const [copied, setCopied] = useState<string | null>(null)
  const [loudness, setLoudness] = useState<Loudness | null>(null)
  const loudnessRef = useRef<Loudness | null>(null)
  loudnessRef.current = loudness
  const [loudnessState, setLoudnessState] = useState<'idle' | 'measuring' | 'failed'>('idle')
  const [normalizing, setNormalizing] = useState<string | null>(null)
  const [cover, setCover] = useState<{ width: number; height: number } | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const [releaseMode, setReleaseMode] = useState<'now' | 'schedule'>('now')
  const [scheduleAt, setScheduleAt] = useState('')
  const checklistRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [epRes, tps, shows, all] = await Promise.all([
      fetch(`/api/admin/studio/episodes/${episodeId}`).then((r) => r.json()),
      fetch('/api/admin/studio/topics').then((r) => r.json()).catch(() => []),
      fetch('/api/admin/podcast/shows').then((r) => r.json()).catch(() => []),
      fetch('/api/admin/studio/episodes').then((r) => r.json()).catch(() => []),
    ])
    if (Array.isArray(tps)) setTopics(tps)
    if (Array.isArray(shows)) setShow((shows as PodcastShow[]).find((s) => s.is_default) || shows[0] || null)
    if (Array.isArray(all)) setSiblings(all)
    if (epRes?.id) {
      const ep = normalizeEpisode(epRes)
      setEpisode(ep)
      setScheduleAt(toLocalInput(ep.scheduled_for))
      if (ep.status === 'scheduled') setReleaseMode('schedule')
      if (ep.loudness_lufs != null && Number.isFinite(ep.loudness_lufs)) {
        setLoudness({ lufs: ep.loudness_lufs, peakDb: ep.loudness_peak_db ?? -Infinity, channels: ep.audio_channels ?? 2 })
      }
    } else setError(epRes?.error || 'Episode not found')
  }, [episodeId])

  useEffect(() => { void load() }, [load])

  const effectiveCover = useMemo(() => {
    if (episode?.cover_url) return episode.cover_url
    const showCover = show?.cover_url && !LEGACY_COVER_URLS.includes(show.cover_url) ? show.cover_url : null
    return showCover || '/podcast/cover-3000.jpg'
  }, [episode?.cover_url, show?.cover_url])

  useEffect(() => {
    let live = true
    setCover(null)
    setCoverFailed(false)
    void measureImage(effectiveCover).then((size) => {
      if (!live) return
      if (size) setCover(size)
      else setCoverFailed(true)
    })
    return () => { live = false }
  }, [effectiveCover])

  async function save(patch: Record<string, unknown>, label = 'Saved') {
    const current = episodeRef.current
    if (!current) return null
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const res = await fetch('/api/admin/studio/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      const next = normalizeEpisode(data)
      episodeRef.current = next
      setEpisode(next)
      setOk(label)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      return null
    } finally {
      setSaving(false)
    }
  }

  /** Loudness columns need 20260923000002_podcast_release.sql — never let a missing column block work. */
  async function persistLoudness(value: Loudness) {
    const current = episodeRef.current
    if (!current) return
    await fetch('/api/admin/studio/episodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: current.id,
        loudness_lufs: Number(value.lufs.toFixed(2)),
        loudness_peak_db: Number.isFinite(value.peakDb) ? Number(value.peakDb.toFixed(2)) : null,
        audio_channels: value.channels,
      }),
    }).catch(() => {})
  }

  async function measure(url: string, persist = true) {
    setLoudnessState('measuring')
    try {
      const result = await measureHostedLoudness(url)
      if (!Number.isFinite(result.lufs)) throw new Error('silent')
      const value = { lufs: result.lufs, peakDb: result.peakDb, channels: result.channels }
      loudnessRef.current = value
      setLoudness(value)
      setLoudnessState('idle')
      if (persist) void persistLoudness(value)
      return value
    } catch {
      setLoudnessState('failed')
      return null
    }
  }

  // Measure automatically for typical-length episodes when nothing is stored yet.
  useEffect(() => {
    if (!episode?.audio_url || loudness || loudnessState !== 'idle') return
    if ((episode.duration_seconds || 0) > AUTO_MEASURE_MAX_SECONDS) return
    void measure(episode.audio_url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.audio_url])

  /**
   * Host a new audio file and PATCH the episode. `extra` rides along in the same PATCH.
   * `sameContent` (loudness normalize, clean-up render) keeps word timings and the
   * protected-words review; any other replacement clears them, because a different edit
   * may not contain the bleeps and the captions would drift.
   */
  async function uploadAudio(
    file: File,
    duration?: number,
    label = 'Audio uploaded',
    extra: Record<string, unknown> = {},
    sameContent = false,
  ) {
    setUploading('Uploading audio…')
    setError(null)
    loudnessRef.current = null
    setLoudness(null)
    setLoudnessState('idle')
    const localUrl = URL.createObjectURL(file)
    try {
      // Measure the local file while it uploads (no CORS, no second download).
      const [asset, loud] = await Promise.all([
        uploadPodcastMedia(file, episodeRef.current?.title || file.name),
        measure(localUrl, false),
      ])
      const seconds = duration ?? (await measureAudioDuration(localUrl)) ?? (await measureAudioDuration(asset.url))
      const current = episodeRef.current as (PodcastEpisode & EpisodeSafetyFields) | null
      const reset: Record<string, unknown> = {}
      let note = ''
      if (!sameContent && current) {
        if (Array.isArray(current.transcript_words) && current.transcript_words.length) {
          reset.transcript_words = null
          note += ' · timed captions cleared (re-run Transcribe)'
        }
        if (current.protected_words_reviewed_at) {
          reset.protected_words_reviewed = false
          note += ' · protected-words review needs redoing'
        }
      }
      const saved = await save({
        audio_url: asset.url,
        audio_mime: asset.mime_type || file.type || 'audio/mpeg',
        file_size: asset.size_bytes || file.size,
        duration_seconds: seconds ? Math.round(seconds) : null,
        ...reset,
        ...extra,
      }, label + note)
      if (saved && loud) void persistLoudness(loud)
      return saved
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      return null
    } finally {
      URL.revokeObjectURL(localUrl)
      setUploading(null)
    }
  }

  async function uploadCover(file: File) {
    setUploading('Uploading artwork…')
    setError(null)
    const preview = URL.createObjectURL(file)
    try {
      const size = await measureImage(preview)
      if (size && (Math.abs(size.width - size.height) > 2 || size.width < 1400)) {
        const proceed = window.confirm(
          `This image is ${size.width}×${size.height}. Apple needs a square image of at least 1400×1400 (3000×3000 is best). Upload anyway?`,
        )
        if (!proceed) return
      }
      const asset = await uploadPodcastMedia(file, `${episodeRef.current?.title || 'Episode'} cover`)
      await save({ cover_url: asset.url }, 'Artwork saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      URL.revokeObjectURL(preview)
      setUploading(null)
    }
  }

  async function normalize() {
    const current = episodeRef.current
    if (!current?.audio_url) return
    setError(null)
    try {
      const result = await normalizeHostedAudio(current.audio_url, current.slug || current.title, setNormalizing)
      setNormalizing('Uploading levelled MP3…')
      const saved = await uploadAudio(result.file, result.duration, `Loudness set to ${result.loudness.lufs.toFixed(1)} LUFS and re-hosted`, {}, true)
      if (saved) {
        const value = { lufs: result.loudness.lufs, peakDb: result.loudness.peakDb, channels: result.loudness.channels }
        setLoudness(value)
        void persistLoudness(value)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Normalize failed — try exporting from the production room with “Match −16 LUFS”.')
    } finally {
      setNormalizing(null)
    }
  }

  /** One-click revert of the last Clean-up & safety render. */
  async function revertCleanup() {
    const current = episodeRef.current as (PodcastEpisode & EpisodeSafetyFields) | null
    if (!current?.audio_url_previous) return
    if (!window.confirm('Go back to the audio from before the last clean-up? Bleeps and voice disguise from that clean-up will be undone.')) return
    const snap = (current.post_edit_snapshot || null) as PostSnapshot | null
    const patch: Record<string, unknown> = {
      audio_url: current.audio_url_previous,
      audio_url_previous: null,
      post_edit_snapshot: null,
    }
    if (snap) {
      patch.audio_mime = snap.audio_mime
      patch.file_size = snap.file_size
      patch.duration_seconds = snap.duration_seconds
      patch.transcript = snap.transcript ?? ''
      patch.transcript_words = snap.transcript_words
      patch.chapters = snap.chapters
    }
    loudnessRef.current = null
    setLoudness(null)
    setLoudnessState('idle')
    const saved = await save(patch, 'Reverted to the previous audio')
    if (saved?.audio_url) void measure(saved.audio_url)
  }

  function checksFor(ep: PodcastEpisode | null, loud: Loudness | null): ReleaseCheck[] {
    if (!ep) return []
    return releaseChecks(ep, {
      show: { cover_url: effectiveCover },
      loudness: loud,
      loudnessUnavailable: loudnessState === 'failed',
      cover,
      coverUnavailable: coverFailed,
      siblings,
    })
  }

  const checks = checksFor(episode, loudness)
  const blockers = releaseBlockers(checks)
  const warnings = checks.filter((c) => c.level === 'warn')

  async function release(mode: 'now' | 'schedule') {
    const current = episodeRef.current
    const live = releaseBlockers(checksFor(current, loudnessRef.current))
    if (!current || live.length) {
      setError(`Fix ${live.length} item${live.length === 1 ? '' : 's'} in the checklist first: ${live.map((b) => b.label).join(', ')}`)
      checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (mode === 'schedule') {
      const when = scheduleAt ? new Date(scheduleAt) : null
      if (!when || Number.isNaN(when.getTime())) {
        setError('Pick the date and time the episode should go live.')
        return
      }
      if (when.getTime() <= Date.now() + 60_000) {
        if (!window.confirm('That time has already passed. Publish now instead?')) return
        return void release('now')
      }
      await save(
        { status: 'scheduled', scheduled_for: when.toISOString() },
        `Scheduled for ${when.toLocaleString()} — it will go live automatically (within 15 minutes of that time).`,
      )
      return
    }
    if (!window.confirm(`Publish “${current.title}” now? It will appear on the website and in Apple Podcasts, Spotify and other apps (apps refresh within a few hours).`)) return
    await save({ status: 'published' }, 'Published — live on /podcast and in the RSS feed')
  }

  async function unpublish() {
    const current = episodeRef.current
    if (!current) return
    const msg = current.status === 'scheduled'
      ? 'Cancel the scheduled release? The episode goes back to Review.'
      : 'Take this episode offline? It disappears from the website and feed (apps that already downloaded it keep their copy).'
    if (!window.confirm(msg)) return
    await save({ status: 'review' }, current.status === 'scheduled' ? 'Schedule cancelled' : 'Unpublished — moved to Review')
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

  function saveChapters(next: PodcastChapter[], label: string) {
    return save({ chapters: next.slice().sort((a, b) => a.start_ms - b.start_ms) }, label)
  }

  function addChapter() {
    if (!episode) return
    const start_ms = parseTimestamp(chapterStart)
    if (!chapterTitle.trim() || start_ms == null) {
      setError('A chapter needs a title and a start time like 1:30 or 0:01:05')
      return
    }
    void saveChapters([...(episode.chapters || []), { start_ms, title: chapterTitle.trim() }], 'Chapter added')
    setChapterTitle('')
  }

  function updateChapter(idx: number, patch: Partial<PodcastChapter>) {
    if (!episode) return
    const next = episode.chapters.map((ch, i) => (i === idx ? { ...ch, ...patch } : ch))
    void saveChapters(next, 'Chapter updated')
  }

  function removeChapter(idx: number) {
    if (!episode) return
    void saveChapters(episode.chapters.filter((_, i) => i !== idx), 'Chapter removed')
  }

  function addAdMarker(position: PodcastAdMarker['position']) {
    if (!episode) return
    const next: PodcastAdMarker[] = [
      ...(episode.ad_markers || []),
      { position, offset_ms: position === 'mid' ? Math.round((episode.duration_seconds || 0) * 500) : null, label: `${position} roll` },
    ]
    void save({ ad_markers: next }, 'Ad marker added')
  }

  if (!episode) {
    return error
      ? <p className="text-sm text-red-300">{error}</p>
      : <p className="text-[#A9B8C6] flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading episode…</p>
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : PODCAST.site
  const publicUrl = `${origin}/podcast/${episode.slug}`
  const embedCode = `<iframe src="${origin}/podcast/embed?episode=${episode.slug}" width="100%" height="200" frameborder="0" title="${episode.title.replace(/"/g, '&quot;')}"></iframe>`
  const isLive = episode.status === 'published'
  const isScheduled = episode.status === 'scheduled'
  const target = loudnessTarget(loudness?.channels ?? episode.audio_channels ?? 2)
  const busy = Boolean(saving || uploading || normalizing)

  const actionFor = (id: string): React.ReactNode => {
    switch (id) {
      case 'audio':
      case 'file_size':
      case 'duration':
        return <FileButton label="Upload MP3" accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" disabled={busy} onFile={(f) => void uploadAudio(f)} />
      case 'audio_format':
        return <ActionButton icon={<Wand2 size={14} />} disabled={busy} onClick={() => void normalize()}>Normalize & convert to MP3</ActionButton>
      case 'loudness':
      case 'peak':
        return loudness
          ? <ActionButton icon={<Wand2 size={14} />} disabled={busy} onClick={() => void normalize()}>Normalize loudness</ActionButton>
          : <ActionButton disabled={busy || loudnessState === 'measuring'} onClick={() => episode.audio_url && void measure(episode.audio_url)}>
              {loudnessState === 'measuring' ? 'Measuring…' : 'Measure loudness'}
            </ActionButton>
      case 'cover':
      case 'cover_format':
        return <FileButton label="Upload artwork" accept="image/jpeg,image/png" disabled={busy} onFile={(f) => void uploadCover(f)} />
      case 'title':
        return <JumpButton to="field-title" />
      case 'summary':
        return <JumpButton to="field-summary" />
      case 'show_notes':
        return <JumpButton to="field-show_notes" />
      case 'numbering':
        return <JumpButton to="field-episode_number" />
      case 'transcript':
        return <JumpButton to="field-transcript" />
      case 'chapters':
        return <JumpButton to="chapters" />
      case 'guest_consent':
      case 'guest_final_cut':
        return <JumpButton to="guest-signoffs" label="Record sign-off" />
      case 'protected_words':
        return <JumpButton to="protect" label="Review names" />
      default:
        return null
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/admin/podcast?tab=episodes" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF]">
        <ArrowLeft size={14} /> All episodes
      </Link>

      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <input
            id="field-title"
            key={`title-${episode.updated_at}`}
            defaultValue={episode.title}
            aria-label="Episode title"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== episode.title && void save({ title: e.target.value.trim() })}
            className="w-full bg-transparent text-2xl font-bold text-[#F6FAFC] focus:outline-none"
          />
          <p className="mt-1 text-xs text-[#A9B8C6]">
            <StatusPill status={episode.status} />
            {isScheduled && episode.scheduled_for ? ` · goes live ${new Date(episode.scheduled_for).toLocaleString()}` : ''}
            {isLive && episode.published_at ? ` · live since ${new Date(episode.published_at).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={WORKFLOW_STATUSES.includes(episode.status) ? episode.status : ''}
            onChange={(e) => {
              const status = e.target.value as EpisodeStatus
              if ((isLive || isScheduled) && !window.confirm(`Move this ${isLive ? 'live' : 'scheduled'} episode to “${status}”? It will be taken off the feed.`)) return
              void save({ status }, `Moved to ${status}`)
            }}
            aria-label="Workflow stage"
            className="rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#F6FAFC]"
          >
            {!WORKFLOW_STATUSES.includes(episode.status) && <option value="" disabled>{episode.status}</option>}
            {WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Link
            href={`/admin/podcast?tab=studio&episode=${episode.id}`}
            className="px-3 py-2 rounded-lg border border-[#53D6FF] text-sm text-[#53D6FF]"
          >
            Production room
          </Link>
          <button type="button" onClick={() => void duplicateEpisode()} className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Duplicate
          </button>
          <button type="button" onClick={() => void removeEpisode()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-red-300">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </header>

      <div aria-live="polite">
        {error && <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        {ok && !error && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
        {(uploading || normalizing) && (
          <p className="flex items-center gap-2 text-sm text-[#8DEBFF]"><Loader2 size={14} className="animate-spin" /> {normalizing || uploading}</p>
        )}
      </div>

      {/* ── Export & publish: the one obvious path from finished audio to every podcast app ── */}
      <section ref={checklistRef} className="rounded-2xl border border-[#53D6FF]/40 bg-[#151B22] p-5 md:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#8DEBFF]">Export & publish</p>
            <h2 className="text-lg font-semibold text-[#F6FAFC]">
              {isLive ? 'This episode is live' : isScheduled ? 'Release scheduled' : blockers.length ? `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix before release` : 'Ready to release'}
            </h2>
            <p className="text-sm text-[#A9B8C6] max-w-2xl">
              Work down the list. Green is done, amber is a recommendation, red must be fixed. Once it is all green or amber,
              publish now or pick a time — the website, RSS feed, Apple Podcasts, Spotify and YouTube Music all update from here.
            </p>
          </div>
          {isLive && (
            <a href={`/podcast/${episode.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#53D6FF]">
              View public page <ExternalLink size={14} />
            </a>
          )}
        </div>

        <ol className="divide-y divide-[#27313B] rounded-xl border border-[#27313B] bg-[#05070A]">
          {checks.map((c) => (
            <li key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {c.level === 'ok' ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#53D6FF]" aria-label="Done" />
                ) : c.level === 'warn' ? (
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#FFB86B]" aria-label="Recommended" />
                ) : (
                  <XCircle size={18} className="mt-0.5 shrink-0 text-red-300" aria-label="Must fix" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-[#F6FAFC]">
                    {c.label}
                    {c.detail && <span className="ml-2 text-xs text-[#A9B8C6]">{c.detail}</span>}
                  </p>
                  {c.level !== 'ok' && c.fix && <p className="text-xs text-[#A9B8C6]">{c.fix}</p>}
                </div>
              </div>
              {c.level !== 'ok' && <div className="sm:ml-auto">{actionFor(c.id)}</div>}
            </li>
          ))}
        </ol>

        {!isLive && !isScheduled && (
          <div className="rounded-xl border border-[#27313B] bg-[#05070A] p-4 space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When to release">
              {(['now', 'schedule'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={releaseMode === mode}
                  onClick={() => setReleaseMode(mode)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    releaseMode === mode ? 'border-[#53D6FF] text-[#F6FAFC] bg-[#1A232C]' : 'border-[#27313B] text-[#B8C4CF]'
                  }`}
                >
                  {mode === 'now' ? <Rocket size={14} /> : <CalendarClock size={14} />}
                  {mode === 'now' ? 'Publish now' : 'Schedule for later'}
                </button>
              ))}
            </div>
            {releaseMode === 'schedule' && (
              <label className="block max-w-xs">
                <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">Go live at (your local time)</span>
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className={input} />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || blockers.length > 0}
                onClick={() => void release(releaseMode)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#53D6FF] px-5 py-2.5 text-sm font-semibold text-[#061016] disabled:opacity-40"
              >
                {releaseMode === 'now' ? <Rocket size={16} /> : <CalendarClock size={16} />}
                {releaseMode === 'now' ? 'Publish episode' : 'Schedule release'}
              </button>
              <p className="text-xs text-[#A9B8C6]">
                {blockers.length
                  ? `Fix the red item${blockers.length === 1 ? '' : 's'} above to unlock.`
                  : warnings.length
                    ? `${warnings.length} recommendation${warnings.length === 1 ? '' : 's'} — fine to release, better if fixed.`
                    : 'Everything checks out.'}
              </p>
            </div>
          </div>
        )}

        {(isLive || isScheduled) && (
          <div className="flex flex-wrap gap-2">
            {isScheduled && (
              <button type="button" disabled={busy || blockers.length > 0} onClick={() => void release('now')} className="inline-flex items-center gap-2 rounded-lg bg-[#53D6FF] px-4 py-2 text-sm font-semibold text-[#061016] disabled:opacity-40">
                <Rocket size={14} /> Publish now instead
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void unpublish()} className="rounded-lg border border-[#27313B] px-4 py-2 text-sm text-[#B8C4CF]">
              {isScheduled ? 'Cancel schedule' : 'Unpublish'}
            </button>
            {isLive && (
              <button type="button" onClick={() => void copyText('link', publicUrl)} className="inline-flex items-center gap-1 rounded-lg border border-[#27313B] px-4 py-2 text-sm text-[#B8C4CF]">
                <Copy size={14} /> {copied === 'link' ? 'Copied' : 'Copy link to share'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Audio & artwork ── */}
      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#F6FAFC]">Episode audio & artwork</p>
            <p className="text-xs text-[#A9B8C6]">MP3 is safest for every app. Hosted on the site&apos;s media storage and delivered through the RSS feed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FileButton label={episode.audio_url ? 'Replace audio' : 'Upload finished MP3'} icon={<Upload size={14} />} accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav" disabled={busy} onFile={(f) => void uploadAudio(f)} />
            <FileButton label={episode.cover_url ? 'Replace artwork' : 'Upload episode artwork'} accept="image/jpeg,image/png" disabled={busy} onFile={(f) => void uploadCover(f)} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={effectiveCover} alt="" className="h-28 w-28 rounded-lg object-cover border border-[#27313B]" />
          <div className="flex-1 space-y-2">
            {episode.audio_url
              ? <audio controls preload="metadata" src={episode.audio_url} className="w-full max-w-xl" />
              : <p className="text-sm text-[#A9B8C6]">No audio yet — upload a finished file or export from the editor below.</p>}
            <p className="text-xs text-[#A9B8C6]">
              {episode.cover_url ? 'Episode artwork' : 'Using show artwork'}
              {cover ? ` · ${cover.width}×${cover.height}` : ''}
              {episode.duration_seconds ? ` · ${formatMs(episode.duration_seconds * 1000)}` : ''}
              {episode.file_size ? ` · ${(episode.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
              {loudness ? ` · ${loudness.lufs.toFixed(1)} LUFS (target ${target}, ${loudness.channels >= 2 ? 'stereo' : 'mono'})` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* ── Clean-up & safety: transcription, bleeps, voice disguise, tidy-up — all in the browser ── */}
      <CleanupPanel
        episode={episode as PodcastEpisode & EpisodeSafetyFields}
        disabled={busy}
        save={save}
        publishAudio={async (file, duration, extra, label) => Boolean(await uploadAudio(file, duration, label, extra, true))}
        revert={revertCleanup}
        onError={(msg) => { setOk(null); setError(msg) }}
      />

      {/* ── Details ── */}
      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 grid md:grid-cols-2 gap-3" key={`details-${episode.id}`}>
        <div className="md:col-span-2">
          <Field label="Summary (1–2 sentences, shown under the title in apps)" id="field-summary">
            <textarea defaultValue={episode.summary || ''} rows={2} onBlur={(e) => e.target.value !== (episode.summary || '') && void save({ summary: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Show notes (paste links as-is — they become clickable)" id="field-show_notes">
            <textarea defaultValue={episode.show_notes || ''} rows={6} onBlur={(e) => e.target.value !== (episode.show_notes || '') && void save({ show_notes: e.target.value })} className={input} />
          </Field>
        </div>
        <Field label="Season">
          <input type="number" min={1} defaultValue={episode.season} onBlur={(e) => Number(e.target.value) !== episode.season && void save({ season: Number(e.target.value) })} className={input} />
        </Field>
        <Field label="Episode number" id="field-episode_number">
          <input type="number" min={1} defaultValue={episode.episode_number ?? ''} onBlur={(e) => e.target.value !== String(episode.episode_number ?? '') && void save({ episode_number: e.target.value })} className={input} />
        </Field>
        <Field label="Episode type">
          <select value={episode.episode_type || 'full'} onChange={(e) => void save({ episode_type: e.target.value as EpisodeType })} className={input}>
            <option value="full">Full episode</option>
            <option value="trailer">Trailer</option>
            <option value="bonus">Bonus</option>
          </select>
        </Field>
        <Field label="Content rating">
          <div className="flex gap-2" role="radiogroup" aria-label="Content rating">
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={episode.explicit === value}
                onClick={() => episode.explicit !== value && void save({ explicit: value }, value ? 'Marked explicit' : 'Marked clean')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${episode.explicit === value ? 'border-[#53D6FF] bg-[#1A232C] text-[#F6FAFC]' : 'border-[#27313B] text-[#B8C4CF]'}`}
              >
                {value ? 'Explicit' : 'Clean'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Visibility">
          <select value={episode.visibility || 'public'} onChange={(e) => void save({ visibility: e.target.value as EpisodeVisibility })} className={input}>
            <option value="public">Public — website + every podcast app</option>
            <option value="unlisted">Unlisted — link only, not in the public feed</option>
            <option value="private">Private — subscriber feeds only</option>
          </select>
        </Field>
        <Field label="Topic">
          <select value={episode.topic_id || ''} onChange={(e) => void save({ topic_id: e.target.value || null })} className={input}>
            <option value="">Unlinked</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
        <Field label="Guest name">
          <input defaultValue={episode.guest_name || ''} onBlur={(e) => e.target.value.trim() !== (episode.guest_name || '') && void save({ guest_name: e.target.value.trim() || null })} className={input} />
        </Field>
        <Field label="Page address (slug)">
          <input key={`slug-${episode.slug}`} defaultValue={episode.slug} onBlur={(e) => e.target.value !== episode.slug && void save({ slug: e.target.value }, 'Address updated')} className={input} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Guest bio">
            <textarea defaultValue={episode.guest_bio || ''} rows={2} onBlur={(e) => e.target.value !== (episode.guest_bio || '') && void save({ guest_bio: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Transcript (paste WebVTT or SRT for timed captions, or plain text)" id="field-transcript">
            <textarea
              key={`transcript-${episode.updated_at}`}
              defaultValue={episode.transcript || ''}
              rows={6}
              onBlur={(e) => {
                const value = e.target.value
                if (value === (episode.transcript || '')) return
                const words = cleanWords((episode as PodcastEpisode & EpisodeSafetyFields).transcript_words)
                // Plain-text edits of a browser transcript keep their timings; a pasted VTT/SRT takes over captions.
                if (words.length && !value.trim()) void save({ transcript: value, transcript_words: null })
                else if (words.length && transcriptKind(value) === 'text') {
                  void save({ transcript: value, transcript_words: realignWords(words, value) })
                } else void save({ transcript: value })
              }}
              className={`${input} font-mono text-xs`}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Keywords (comma-separated)">
            <input
              defaultValue={(episode.keywords || []).join(', ')}
              onBlur={(e) => {
                const keywords = e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                if (keywords.join(',') !== (episode.keywords || []).join(',')) void save({ keywords })
              }}
              className={input}
            />
          </Field>
        </div>
        {episode.topic_id && (
          <Link href={`/admin/studio/topics/${episode.topic_id}`} className="text-sm text-[#53D6FF]">Open linked topic</Link>
        )}
      </section>

      {/* ── Chapters ── */}
      <section id="chapters" className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-[#F6FAFC]">Chapters</p>
          <p className="text-xs text-[#A9B8C6]">Optional. Listeners jump between sections on the website and in apps that support chapters. Start the first one at 0:00.</p>
        </div>
        <ul className="space-y-2">
          {(episode.chapters || []).map((ch, idx) => (
            <li key={`${idx}-${ch.start_ms}-${ch.title}`} className="grid gap-2 md:grid-cols-[100px_1fr_1fr_auto] items-center">
              <input
                defaultValue={formatMs(ch.start_ms)}
                aria-label="Start time"
                onBlur={(e) => {
                  const ms = parseTimestamp(e.target.value)
                  if (ms == null) { setError('Use a time like 1:30 or 0:01:05'); return }
                  if (ms !== ch.start_ms) updateChapter(idx, { start_ms: ms })
                }}
                className={`${input} tabular-nums`}
              />
              <input defaultValue={ch.title} aria-label="Chapter title" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== ch.title && updateChapter(idx, { title: e.target.value.trim() })} className={input} />
              <input defaultValue={ch.url || ''} placeholder="Link (optional, https://…)" aria-label="Chapter link" onBlur={(e) => (e.target.value.trim() || null) !== (ch.url || null) && updateChapter(idx, { url: e.target.value.trim() || null })} className={input} />
              <button type="button" onClick={() => removeChapter(idx)} className="text-red-300 text-xs px-2">Remove</button>
            </li>
          ))}
          {!episode.chapters?.length && <p className="text-sm text-[#A9B8C6]">No chapters yet.</p>}
        </ul>
        <div className="grid md:grid-cols-[100px_1fr_auto] gap-2">
          <input value={chapterStart} onChange={(e) => setChapterStart(e.target.value)} placeholder="1:30" aria-label="New chapter start" className={input} />
          <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Chapter title" aria-label="New chapter title" className={input} onKeyDown={(e) => e.key === 'Enter' && addChapter()} />
          <button type="button" onClick={addChapter} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#53D6FF]">
            <Plus size={14} /> Add
          </button>
        </div>
        <p className="text-xs text-[#A9B8C6]">Tip: in the editor below, press <kbd className="rounded border border-[#27313B] px-1">C</kbd> to drop a chapter at the playhead.</p>
      </section>

      {/* ── Browser editor (trim, level, export) ── */}
      <details className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5" open={!episode.audio_url}>
        <summary className="cursor-pointer text-sm font-medium text-[#F6FAFC]">Edit audio in the browser (trim, level, export)</summary>
        <div className="mt-4">
          <PodcastAudioEditor
            episodeId={episode.id}
            audioUrl={episode.audio_url}
            title={episode.title}
            chapters={episode.chapters}
            onMarkChapter={(seconds) => {
              const current = episodeRef.current
              if (!current) return
              const title = chapterTitle.trim() || `Chapter ${(current.chapters?.length || 0) + 1}`
              const start_ms = Math.round(Math.max(0, seconds) * 1000)
              void saveChapters([...(current.chapters || []), { start_ms, title }], 'Chapter marked')
              setChapterTitle('')
            }}
            onExported={async (file, duration) => {
              const current = episodeRef.current
              const saved = await uploadAudio(file, duration, 'Edited audio hosted')
              if (saved && current && ['draft', 'recording'].includes(current.status)) {
                await save({ status: 'editing' }, 'Edited audio hosted')
              }
            }}
            onPublished={async () => {
              // Same gate as the Publish button: checklist must be clear.
              await release('now')
            }}
          />
        </div>
      </details>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC]">Sponsor / ad markers</p>
        <p className="text-xs text-[#A9B8C6]">Track pre / mid / post slots without a paid ad server.</p>
        <div className="flex flex-wrap gap-2">
          {(['pre', 'mid', 'post'] as const).map((pos) => (
            <button key={pos} type="button" onClick={() => addAdMarker(pos)} className="px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
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

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC] flex items-center gap-2">
          <Code2 size={14} /> Share · embed
        </p>
        <div className="grid gap-2">
          <code className="block rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">{publicUrl}</code>
          <code className="block rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">{embedCode}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyText('link', publicUrl)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            <Copy size={14} /> {copied === 'link' ? 'Copied' : 'Copy page link'}
          </button>
          <button type="button" onClick={() => void copyText('embed', embedCode)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            <Copy size={14} /> {copied === 'embed' ? 'Copied' : 'Copy embed'}
          </button>
        </div>
        {!isLive && <p className="text-xs text-[#A9B8C6]">The page link works once the episode is published.</p>}
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: EpisodeStatus }) {
  const tone = status === 'published' ? 'text-[#061016] bg-[#53D6FF]' : status === 'scheduled' ? 'text-[#061016] bg-[#FFB86B]' : 'text-[#B8C4CF] bg-[#1A232C]'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${tone}`}>{status === 'published' ? 'live' : status}</span>
}

function ActionButton({ children, onClick, disabled, icon }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#53D6FF] px-3 py-1.5 text-xs text-[#53D6FF] disabled:opacity-40">
      {icon}
      {children}
    </button>
  )
}

function FileButton({ label, accept, onFile, disabled, icon }: { label: string; accept: string; onFile: (file: File) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <label className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#53D6FF] px-3 py-1.5 text-xs text-[#53D6FF] ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
      {icon}
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function JumpButton({ to, label = 'Go to field' }: { to: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(to)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const focusable = el?.matches('input,textarea,select') ? el : el?.querySelector<HTMLElement>('input,textarea,select')
        ;(focusable as HTMLElement | null | undefined)?.focus({ preventScroll: true })
      }}
      className="whitespace-nowrap rounded-lg border border-[#27313B] px-3 py-1.5 text-xs text-[#B8C4CF]"
    >
      {label}
    </button>
  )
}

function Field({ label, children, id }: { label: string; children: React.ReactNode; id?: string }) {
  return (
    <label className="block" id={id}>
      <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
      {children}
    </label>
  )
}

const input = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (!value.trim() || parts.some((n) => Number.isNaN(n) || n < 0)) return null
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
