'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Button, Input, Panel, Toaster, toast } from '@/components/studio-ui'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { ClipMaker } from '@/components/podcast/post/clip-maker'
import { PODCAST } from '@/lib/podcast-meta'
import { measureAudioDuration, uploadPodcastMedia } from '@/lib/podcast/media-upload'
import { checkFeedCompliance } from '@/lib/podcast/compliance'
// ── Clean-up & safety (AI + survivor-safety stream) ──────────────────────────
import { CleanupPanel, type PostSnapshot } from '@/components/podcast/post/CleanupPanel'
import { deletePreviousAudio, loadSafetyRecord, patchSafety as patchSafetyRecord, type SafetyPatch } from '@/lib/podcast/safety/client'
import type { SafetyRecord } from '@/lib/podcast/safety/record'
import type { EpisodeSafetyFields, GuestConsentStatus } from '@/lib/studio/release'
// ────────────────────────────────────────────────────────────────────────────
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
  // Type-to-confirm delete modal + soft-delete/undo bookkeeping.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // ── Clean-up & safety: private plan, sign-offs, consent, revert ────────────
  const episodeRef = useRef<PodcastEpisode | null>(null)
  useEffect(() => {
    episodeRef.current = episode
  }, [episode])
  /** Private Clean-up & safety plan (protected terms + decisions). null until loaded. */
  const [safety, setSafety] = useState<{ available: boolean; record: SafetyRecord | null } | null>(null)
  useEffect(() => {
    let live = true
    loadSafetyRecord(episodeId)
      .then((r) => live && setSafety({ available: r.available, record: r.record }))
      .catch(() => live && setSafety({ available: false, record: null }))
    return () => { live = false }
  }, [episodeId])

  /** Consent guests gave in the booth (optional endpoint; null when it is not deployed). */
  const [guestConsent, setGuestConsent] = useState<GuestConsentStatus | null>(null)
  const loadConsent = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/episodes/${episodeId}/consent`, { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as GuestConsentStatus | null
      setGuestConsent(res.ok && data && typeof data.available === 'boolean' ? data : null)
    } catch {
      setGuestConsent(null)
    }
  }, [episodeId])
  useEffect(() => {
    void loadConsent()
    const onFocus = () => void loadConsent()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadConsent])

  /** Plan changes and sign-offs go through /api/admin/podcast/safety (stamped + hashed server-side). */
  const patchSafety = useCallback(async (patch: SafetyPatch, label?: string) => {
    const isSignoff =
      patch.guest_final_cut !== undefined || patch.transcript_reviewed !== undefined ||
      patch.protected_words_reviewed !== undefined || patch.guest_consent_confirmed !== undefined
    if (isSignoff) {
      setSaving(true)
      setError(null)
    }
    try {
      const res = await patchSafetyRecord(episodeId, patch)
      if (res.episode) setEpisode(normalizeEpisode(res.episode))
      if (res.record) setSafety((s) => ({ available: true, record: res.record ?? s?.record ?? null }))
      if (label) {
        setOk(label)
        toast({ title: label, tone: 'success' })
      }
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setError(message)
      toast({ title: 'Save failed', description: message, tone: 'error' })
      return null
    } finally {
      if (isSignoff) setSaving(false)
    }
  }, [episodeId])

  /** Permanently delete the replaced original upload (may contain unbleeped names). */
  async function deletePrevious() {
    setError(null)
    try {
      const res = await deletePreviousAudio(episodeId)
      if (res.episode) setEpisode(normalizeEpisode(res.episode))
      const label = res.deleted
        ? 'Original upload deleted from media storage'
        : res.reason === 'still_in_use'
          ? 'That file is still used by another episode — only the revert was removed'
          : res.reason === 'not_project_storage'
            ? 'That file is not in this project’s storage — only the revert was removed'
            : 'Nothing to delete'
      setOk(label)
      toast({ title: label, tone: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the previous audio'
      setError(message)
      toast({ title: 'Delete failed', description: message, tone: 'error' })
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
    await save(patch, 'Reverted to the previous audio')
  }

  /** Upload a rendered "safe version" and PATCH audio fields + `extra` (transcript, chapters, snapshot). */
  async function publishAudio(file: File, duration: number, extra: Record<string, unknown>, label: string) {
    setUploading(true)
    setError(null)
    try {
      const asset = await uploadPodcastMedia(file, episodeRef.current?.title || file.name)
      const seconds = (duration > 0 ? Math.round(duration) : null) ?? (await measureAudioDuration(asset.url))
      const saved = await save({
        audio_url: asset.url,
        audio_mime: asset.mime_type || file.type || 'audio/mpeg',
        file_size: asset.size_bytes || file.size,
        duration_seconds: seconds ?? episodeRef.current?.duration_seconds ?? null,
        ...extra,
      }, label)
      return Boolean(saved)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      toast({ title: 'Upload failed', description: message, tone: 'error' })
      return false
    } finally {
      setUploading(false)
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  async function load() {
    const [epRes, tps] = await Promise.all([
      fetch(`/api/admin/studio/episodes/${episodeId}`).then((r) => r.json()),
      fetch('/api/admin/studio/topics').then((r) => r.json()),
    ])
    if (Array.isArray(tps)) setTopics(tps)
    if (epRes?.id) setEpisode(normalizeEpisode(epRes))
    else setError(epRes.error || 'Episode not found')
  }

  useEffect(() => { void load() }, [episodeId])

  async function save(patch: Record<string, unknown>, label = 'Saved'): Promise<PodcastEpisode | null> {
    const current = episodeRef.current
    if (!current) return null
    setSaving(true)
    setError(null)
    try {
      // Post-production columns are not on the episodes PATCH whitelist: they go through the
      // safety route (which also stamps sign-offs server-side). Audio fields go first so a
      // snapshot always refers to the file that was just replaced.
      const rowPatch: Record<string, unknown> = {}
      const safetyPatch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (SAFETY_ROW_KEYS.has(k)) safetyPatch[k] = v
        else rowPatch[k] = v
      }
      let data: PodcastEpisode | null = null
      if (Object.keys(rowPatch).length) {
        const res = await fetch('/api/admin/studio/episodes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: current.id, ...rowPatch }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Save failed')
        data = json
      }
      if (Object.keys(safetyPatch).length) {
        const res = await patchSafetyRecord(current.id, safetyPatch as SafetyPatch)
        if (res.episode) data = res.episode
        if (res.record) setSafety((s) => ({ available: true, record: res.record ?? s?.record ?? null }))
      }
      const next = data ? normalizeEpisode(data) : current
      setEpisode(next)
      setOk(label)
      toast({ title: label, tone: 'success' })
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setError(message)
      toast({ title: 'Save failed', description: message, tone: 'error' })
      return null
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
        const measured =
          (duration && duration > 0 ? Math.round(duration) : null) ??
          (await measureAudioDuration(asset.url))
        // Preserve an existing duration rather than clobbering it with null.
        const seconds = measured ?? episode?.duration_seconds ?? null
        const fileSize = asset.size_bytes || file.size
        // New audio content: timed captions and the protected-terms review no longer apply.
        const reset: Record<string, unknown> = {}
        const current = episodeRef.current as (PodcastEpisode & EpisodeSafetyFields) | null
        if (current && Array.isArray(current.transcript_words) && current.transcript_words.length) reset.transcript_words = null
        if (current?.protected_words_reviewed_at) reset.protected_words_reviewed = false
        await save({
          audio_url: asset.url,
          audio_mime: asset.mime_type || file.type,
          file_size: fileSize,
          duration_seconds: seconds,
          ...reset,
        }, 'Audio saved')
        if (!seconds) {
          const message = 'Audio saved, but duration could not be measured — set it manually before publishing (RSS needs it)'
          setError(message)
          toast({ title: 'Duration missing', description: message, tone: 'error', duration: 8000 })
        } else if (!fileSize) {
          const message = 'Audio saved, but file size is missing — re-upload before publishing'
          setError(message)
          toast({ title: 'File size missing', description: message, tone: 'error', duration: 8000 })
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      toast({ title: 'Upload failed', description: message, tone: 'error' })
    } finally {
      setUploading(false)
    }
  }

  async function publish() {
    if (!episode) return
    const gate = checkFeedCompliance(episode)
    if (!gate.ok) {
      const blockers = gate.blockers.map((b) => b.detail || b.label).join('; ')
      setError(`Cannot publish — ${blockers}`)
      toast({ title: 'Publish blocked', description: `Fix these first: ${blockers}`, tone: 'error', duration: 8000 })
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

  /**
   * Safe delete: instead of a bare window.confirm + irreversible DELETE, we
   *   1. require the host to type the title (type-to-confirm modal),
   *   2. soft-delete by moving the episode to `archived` (reversible via PATCH),
   *   3. show a 6s Undo toast that restores the prior status,
   *   4. only hard-DELETE once the undo window elapses.
   * The episode leaves the public feed immediately (archived), but nothing is
   * destroyed until the host has had a real chance to undo.
   */
  async function removeEpisode() {
    if (!episode) return
    const target = episode
    const priorStatus = target.status
    setConfirmDelete(false)
    setConfirmText('')
    setDeleting(true)
    setError(null)

    // Step 1 — soft delete (archive) so it drops out of the feed but stays recoverable.
    try {
      const res = await fetch('/api/admin/studio/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, status: 'archived' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
      setDeleting(false)
      toast({ title: 'Delete failed', description: message, tone: 'error' })
      return
    }

    let undone = false

    // Step 4 — hard delete after the undo window, unless the host undid it.
    const purge = window.setTimeout(() => {
      if (undone) return
      void fetch(`/api/admin/studio/episodes?id=${target.id}`, { method: 'DELETE' }).finally(() => {
        router.push('/admin/podcast')
      })
    }, 6000)

    // Step 3 — Undo toast restores the prior status.
    toast({
      title: `Deleted “${target.title}”`,
      description: 'Archived now, permanently removed in a moment.',
      tone: 'neutral',
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true
          window.clearTimeout(purge)
          setDeleting(false)
          void fetch('/api/admin/studio/episodes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: target.id, status: priorStatus }),
          })
            .then((res) => {
              if (!res.ok) throw new Error('Restore failed')
              return res.json()
            })
            .then((data) => {
              setEpisode(normalizeEpisode(data))
              toast({ title: 'Restored', tone: 'success' })
            })
            .catch(() => {
              toast({
                title: 'Could not restore',
                description: 'Reopen the episode from All episodes to check its status.',
                tone: 'error',
              })
            })
        },
      },
    })
  }

  async function duplicateEpisode() {
    if (!episode) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/studio/episodes/${episode.id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Duplicate failed')
      toast({
        title: 'Episode duplicated',
        description: 'A copy is ready to edit.',
        tone: 'success',
        action: {
          label: 'Open copy',
          onClick: () => router.push(`/admin/podcast/${data.id}`),
        },
      })
      setSaving(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Duplicate failed'
      setError(message)
      setSaving(false)
      toast({ title: 'Duplicate failed', description: message, tone: 'error' })
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
      toast({ title: 'Chapter needs a title and start time', description: 'Use a start time like 1:30 or 0:01:05.', tone: 'error' })
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

  const compliance = useMemo(
    () => (episode ? checkFeedCompliance(episode) : null),
    [episode],
  )

  const checks = useMemo(() => {
    if (!episode) return []
    const feed = (compliance?.checks ?? []).map((c) => ({
      ok: c.ok,
      label: c.detail && !c.ok ? `${c.label} — ${c.detail}` : c.label,
      required: c.required,
      field: COMPLIANCE_FIELD[c.id] ?? null,
    }))
    return [
      ...feed,
      { ok: Boolean(episode.show_notes), label: 'Show notes', required: false, field: 'notes' },
      { ok: episode.episode_number != null, label: 'Episode number', required: false, field: 'epnum' },
      { ok: (episode.chapters?.length || 0) > 0, label: 'Chapters', required: false, field: 'chapters' },
      { ok: Boolean(episode.transcript), label: 'Transcript → VTT in RSS', required: false, field: 'transcript' },
      { ok: episode.status !== 'scheduled' || Boolean(episode.scheduled_for), label: 'Schedule time (if scheduled)', required: false, field: 'sched' },
      { ok: Boolean(episode.topic_id), label: 'Linked biweekly topic', required: false, field: 'topic' },
    ]
  }, [episode, compliance])

  // Scroll/focus the field a failing checklist row fixes.
  function jumpToField(field: string | null) {
    if (!field || !episode) return
    const el = document.getElementById(field.startsWith('cleanup-') ? field : `ep-field-${field}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      el.focus({ preventScroll: true })
    }
  }

  if (!episode) {
    return <p className="text-[#A9B8C6] flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading episode…</p>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Toaster />

      {confirmDelete && episode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/70 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-episode-title"
        >
          <Panel elevation="raised" className="w-full max-w-md p-6">
            <p id="delete-episode-title" className="studio-type-section !text-[16px] text-white">
              Delete this episode?
            </p>
            <p className="studio-type-body mt-2 text-silver-body">
              This removes “{episode.title}” from the site and RSS. You&rsquo;ll get a few seconds to undo before it&rsquo;s
              permanently deleted. Type the episode title to confirm.
            </p>
            <div className="mt-4">
              <Input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={episode.title}
                aria-label="Type the episode title to confirm deletion"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="compact"
                onClick={() => { setConfirmDelete(false); setConfirmText('') }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="compact"
                disabled={confirmText.trim() !== episode.title.trim()}
                onClick={() => void removeEpisode()}
              >
                <Trash2 size={14} /> Delete episode
              </Button>
            </div>
          </Panel>
        </div>
      )}

      <Link href="/admin/podcast" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF]">
        <ArrowLeft size={14} /> All episodes
      </Link>
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <input
          id="ep-field-title"
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
                toast({ title: 'Add audio before publishing', tone: 'error' })
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
            disabled={episode.status === 'published' || !compliance?.ok}
            title={compliance && !compliance.ok ? compliance.blockers.map((b) => b.detail || b.label).join('; ') : undefined}
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
            onClick={() => { setConfirmText(''); setConfirmDelete(true) }}
            disabled={deleting}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-red-300 disabled:opacity-40"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete'}
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
            id="ep-field-topic"
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
          <input id="ep-field-epnum" type="number" defaultValue={episode.episode_number ?? ''} onBlur={(e) => void save({ episode_number: e.target.value })} className={input} />
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
            id="ep-field-sched"
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
            <textarea id="ep-field-summary" defaultValue={episode.summary || ''} rows={2} onBlur={(e) => void save({ summary: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Guest bio">
            <textarea defaultValue={episode.guest_bio || ''} rows={2} onBlur={(e) => void save({ guest_bio: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Show notes">
            <textarea id="ep-field-notes" defaultValue={episode.show_notes || ''} rows={5} onBlur={(e) => void save({ show_notes: e.target.value })} className={input} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Transcript">
            <textarea id="ep-field-transcript" defaultValue={episode.transcript || ''} rows={6} onBlur={(e) => void save({ transcript: e.target.value })} className={input} />
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

      <section id="ep-field-chapters" className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <p className="text-sm font-medium text-[#F6FAFC]">Chapters</p>
        <ul className="space-y-2">
          {(episode.chapters || []).map((ch, idx) => (
            <li key={`ch-${ch.start_ms}-${ch.title || idx}`} className="flex items-center justify-between gap-3 text-sm text-[#B8C4CF]">
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
            <label id="ep-field-cover" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] cursor-pointer">
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

      {/* ── Clean-up & safety: transcription, bleeps, voice disguise, text edits — all in the browser ── */}
      <CleanupPanel
        episode={episode as PodcastEpisode & EpisodeSafetyFields}
        disabled={saving || uploading || deleting}
        save={save}
        publishAudio={publishAudio}
        revert={revertCleanup}
        onError={(message) => {
          setError(message)
          toast({ title: message, tone: 'error', duration: 8000 })
        }}
        guestConsent={guestConsent}
        safety={safety}
        patchSafety={patchSafety}
        deletePrevious={deletePrevious}
      />
      {/* ── end Clean-up & safety ── */}

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
        <p className="text-sm font-medium text-[#F6FAFC] mb-1">Publish checklist</p>
        {compliance && !compliance.ok && (
          <p className="text-xs text-red-300 mb-3">
            Publish blocked: {compliance.blockers.map((b) => b.detail || b.label).join('; ')}
          </p>
        )}
        <ul className="space-y-2">
          {checks.map((item) => {
            const failing = item.required && !item.ok
            const jumpable = !item.ok && Boolean(item.field)
            const icon = item.ok
              ? <CheckCircle2 size={16} className="text-[#53D6FF]" />
              : <Circle size={16} className={item.required ? 'text-red-400' : 'text-[#27313B]'} />
            const cls = `flex items-center gap-2 text-sm ${failing ? 'text-red-300' : 'text-[#B8C4CF]'}`
            return (
              <li key={item.label}>
                {jumpable ? (
                  <button
                    type="button"
                    onClick={() => jumpToField(item.field)}
                    className={`${cls} w-full text-left hover:text-[#8DEBFF]`}
                  >
                    {icon}
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[#53D6FF]">Fix →</span>
                  </button>
                ) : (
                  <div className={cls}>
                    {icon}
                    <span className="flex-1">{item.label}</span>
                    {failing && <span className="text-[10px] uppercase tracking-wide">required</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {saving && <p className="text-xs text-[#A9B8C6] mt-3">Saving…</p>}
      </section>

      {/* ── Share clips: 15–90 s audiograms cut from the finished audio, rendered in the browser.
             Protected names stay bleeped and captioned "[removed]". Last block of the Publish area. ── */}
      <Panel elevation="raised" className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="studio-type-section !text-[14px]">Share clips</p>
          <p className="studio-type-body text-[12px] text-silver">
            Cut a short vertical, square or wide clip with animated captions for social posts. Saved clips show on the public episode page.
          </p>
        </div>
        <ClipMaker
          key={episode.id}
          episode={episode}
          showTitle={PODCAST.title}
          coverUrl={episode.cover_url || PODCAST.image}
          disabled={saving || uploading}
        />
      </Panel>
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

/** Maps a feed-compliance check id to the field that fixes it (ep-field-<field>). */
const COMPLIANCE_FIELD: Record<string, string> = {
  title: 'title',
  summary: 'summary',
  cover_url: 'cover',
  chapters: 'chapters',
  // Survivor-safety items live in the Clean-up & safety flow (ids are section anchors).
  guest_final_cut: 'cleanup-signoffs',
  guest_review_required: 'cleanup-signoffs',
  protected_words: 'cleanup-protect',
  transcript_review: 'cleanup-transcribe',
}

/** Episode columns that must go through /api/admin/podcast/safety (not on the episodes PATCH whitelist). */
const SAFETY_ROW_KEYS = new Set(['transcript_words', 'audio_url_previous', 'post_edit_snapshot', 'protected_words_reviewed', 'guest_consent_confirmed'])

/** Fill the array/nullable fields the editor relies on; keeps every other column (safety, loudness…). */
function normalizeEpisode(row: Record<string, unknown>): PodcastEpisode {
  const r = row as PodcastEpisode & Record<string, unknown>
  return {
    ...r,
    chapters: Array.isArray(r.chapters) ? r.chapters : [],
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    ad_markers: Array.isArray(r.ad_markers) ? r.ad_markers : [],
    episode_type: r.episode_type || 'full',
    visibility: r.visibility || 'public',
    show_notes: r.show_notes ?? null,
    guest_name: r.guest_name ?? null,
    guest_bio: r.guest_bio ?? null,
    scheduled_for: r.scheduled_for ?? null,
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
