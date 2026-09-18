'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Loader2, Upload } from 'lucide-react'
import { StudioCanvasEditor } from '@/components/studio/studio-canvas'
import { DEFAULT_HASHTAGS, type StudioTemplate, type TopicBundle, type TopicStatus } from '@/lib/studio/types'
import { emptyCanvas, normalizeCanvas } from '@/lib/studio/canvas'
import { PODCAST } from '@/lib/podcast-meta'

const STATUSES: TopicStatus[] = ['idea', 'planned', 'in_production', 'published', 'archived']

export function TopicWorkspace({ topicId }: { topicId: string }) {
  const [bundle, setBundle] = useState<TopicBundle | null>(null)
  const [templates, setTemplates] = useState<StudioTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [points, setPoints] = useState('')
  const [clipId, setClipId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const [topicRes, tplRes] = await Promise.all([
      fetch(`/api/admin/studio/topics/${topicId}`),
      fetch('/api/admin/studio/templates'),
    ])
    const data = await topicRes.json()
    const tpls = await tplRes.json()
    if (!topicRes.ok) {
      setError(data.error || 'Could not load topic')
      return
    }
    setBundle(data)
    setPoints((data.topic.talking_points || []).join('\n'))
    if (Array.isArray(tpls)) setTemplates(tpls)
    if (!clipId && data.clips?.[0]) setClipId(data.clips[0].id)
  }

  useEffect(() => { void load() }, [topicId])

  const clip = bundle?.clips.find((c) => c.id === clipId) || bundle?.clips[0]

  async function saveTopic(patch: Record<string, unknown>, label = 'Saved') {
    if (!bundle) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/studio/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setBundle({ ...bundle, topic: data })
      setOk(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveEpisode(patch: Record<string, unknown>) {
    if (!bundle) return
    setSaving(true)
    setError(null)
    try {
      if (!bundle.episode) {
        const res = await fetch('/api/admin/studio/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic_id: topicId,
            title: bundle.topic.title,
            summary: bundle.topic.summary,
            ...patch,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not create episode')
        setBundle({ ...bundle, episode: data })
      } else {
        const res = await fetch('/api/admin/studio/episodes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: bundle.episode.id, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not update episode')
        setBundle({ ...bundle, episode: data })
      }
      setOk('Episode saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Episode save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveClip(id: string, patch: Record<string, unknown>) {
    if (!bundle) return
    const res = await fetch('/api/admin/studio/clips', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Clip save failed')
      return
    }
    setBundle({
      ...bundle,
      clips: bundle.clips.map((c) => (c.id === id ? data : c)),
    })
  }

  async function createBlog() {
    if (!bundle) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bundle.topic.title,
          slug: bundle.topic.slug,
          excerpt: bundle.topic.summary || '',
          status: 'draft',
          template: 'standard',
          category: 'resources',
          topicId: topicId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create post')
      await saveTopic({ blog_post_id: data.id }, 'Blog draft linked')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blog create failed')
    } finally {
      setSaving(false)
    }
  }

  async function uploadAudio(file: File) {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt', bundle?.topic.title || 'Podcast audio')
      const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
      const asset = await res.json()
      if (!res.ok) throw new Error(asset.error || 'Upload failed')
      const duration = await new Promise<number | null>((resolve) => {
        const audio = document.createElement('audio')
        audio.preload = 'metadata'
        audio.onloadedmetadata = () => resolve(Math.round(audio.duration) || null)
        audio.onerror = () => resolve(null)
        audio.src = asset.url
      })
      await saveEpisode({
        audio_url: asset.url,
        audio_mime: asset.mime_type || file.type,
        file_size: asset.size_bytes || file.size,
        duration_seconds: duration,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function sendToSocial() {
    if (!bundle) return
    const posts = bundle.clips.map((c) => ({
      platform: c.platform === 'youtube_shorts' ? 'youtube' : c.platform,
      caption: [c.hook, c.caption, c.cta, DEFAULT_HASHTAGS.join(' ')].filter(Boolean).join('\n\n'),
      link_url: 'https://forgedinthefireohio.org/blog',
    }))
    const res = await fetch('/api/admin/social/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bundle.topic.title,
        source_type: 'topic',
        source_id: bundle.topic.id,
        posts,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not create campaign')
      return
    }
    setOk('Draft sent to Social Publisher')
  }

  if (!bundle) {
    return <p className="text-[#A9B8C6] flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading topic…</p>
  }

  const { topic, episode, blog } = bundle

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link href="/admin/studio" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF]">
        <ArrowLeft size={14} /> Studio
      </Link>
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          <input
            defaultValue={topic.title}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== topic.title) {
                void saveTopic({ title: e.target.value.trim() })
              }
            }}
            className="w-full bg-transparent text-2xl font-bold text-[#F6FAFC] focus:outline-none"
          />
          <p className="text-xs text-[#A9B8C6]">/{topic.slug}</p>
        </div>
        <select
          value={topic.status}
          onChange={(e) => void saveTopic({ status: e.target.value })}
          className="rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#F6FAFC]"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </header>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <h2 className="text-sm font-medium text-[#F6FAFC]">Talking points</h2>
        <textarea
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          onBlur={() => void saveTopic({ talking_points: points.split('\n').map((l) => l.trim()).filter(Boolean) })}
          rows={5}
          className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          placeholder={'One point per line\nWhat dignity looks like this week\nA resource, not a spectacle'}
        />
        <textarea
          defaultValue={topic.summary || ''}
          onBlur={(e) => void saveTopic({ summary: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          placeholder="Short summary for blog excerpt + episode description"
        />
        <label className="text-xs text-[#A9B8C6]">
          Biweekly date
          <input
            type="date"
            defaultValue={topic.scheduled_on || ''}
            onBlur={(e) => void saveTopic({ scheduled_on: e.target.value })}
            className="ml-2 rounded border border-[#27313B] bg-[#05070A] px-2 py-1 text-[#F6FAFC]"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-[#F6FAFC]">Blog post</h2>
          {blog ? (
            <Link href={`/admin/blog/${blog.id}`} className="text-sm text-[#53D6FF]">
              Open editor · {blog.status}
            </Link>
          ) : (
            <button type="button" onClick={() => void createBlog()} className="text-sm text-[#53D6FF]">
              Create draft from this topic
            </button>
          )}
        </div>
        <p className="text-sm text-[#A9B8C6]">
          The existing Blog Studio editor stays intact. This only links a draft so the package stays together.
        </p>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#F6FAFC]">Podcast episode</h2>
          {episode && (
            <Link href={`/admin/podcast/${episode.id}`} className="text-sm text-[#53D6FF]">
              Open audio editor
            </Link>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            defaultValue={episode?.title || topic.title}
            onBlur={(e) => void saveEpisode({ title: e.target.value })}
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
            placeholder="Episode title"
          />
          <input
            defaultValue={episode?.slug || topic.slug}
            onBlur={(e) => void saveEpisode({ slug: e.target.value })}
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
            placeholder="slug"
          />
          <input
            type="number"
            defaultValue={episode?.season ?? 1}
            onBlur={(e) => void saveEpisode({ season: Number(e.target.value) })}
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          />
          <input
            type="number"
            defaultValue={episode?.episode_number ?? ''}
            onBlur={(e) => void saveEpisode({ episode_number: e.target.value })}
            placeholder="Episode number"
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          />
        </div>
        <textarea
          defaultValue={episode?.summary || topic.summary || ''}
          onBlur={(e) => void saveEpisode({ summary: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          placeholder="Episode summary"
        />
        <textarea
          defaultValue={episode?.transcript || ''}
          onBlur={(e) => void saveEpisode({ transcript: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          placeholder="Transcript (optional, shown on the public episode page)"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] cursor-pointer">
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Upload audio'}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadAudio(file)
              }}
            />
          </label>
          <select
            defaultValue={episode?.status || 'draft'}
            onChange={(e) => void saveEpisode({ status: e.target.value })}
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          >
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="published">published</option>
          </select>
          {episode?.audio_url && (
            <audio controls src={episode.audio_url} className="max-w-xs" />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-[#F6FAFC]">Social canvases</h2>
          <div className="flex gap-2">
            {bundle.clips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClipId(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  clip?.id === c.id ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'
                }`}
              >
                {c.platform.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        {clip && (
          <>
            <StudioCanvasEditor
              value={clip.canvas}
              format={clip.format}
              templates={templates.filter((t) => t.kind !== 'blog')}
              onChange={(canvas) => void saveClip(clip.id, { canvas, format: canvas.format })}
            />
            <div className="grid md:grid-cols-2 gap-3">
              <ClipField label="Hook" value={clip.hook} onSave={(v) => void saveClip(clip.id, { hook: v })} />
              <ClipField label="CTA" value={clip.cta} onSave={(v) => void saveClip(clip.id, { cta: v })} />
              <ClipField label="Script" value={clip.script} rows={4} onSave={(v) => void saveClip(clip.id, { script: v })} />
              <ClipField
                label="Caption + hashtags"
                value={clip.caption || DEFAULT_HASHTAGS.join(' ')}
                rows={4}
                onSave={(v) => void saveClip(clip.id, { caption: v })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(clip.caption || '')
                  setOk('Caption copied')
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              >
                <Copy size={14} /> Copy caption
              </button>
              <button
                type="button"
                onClick={() => void sendToSocial()}
                className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium"
              >
                Send package to Social Publisher
              </button>
              <button
                type="button"
                onClick={() => void saveClip(clip.id, { canvas: emptyCanvas(normalizeCanvas(clip.canvas).format) })}
                className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              >
                Clear canvas
              </button>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
        <h2 className="text-sm font-medium text-[#F6FAFC] mb-2">RSS preview</h2>
        <p className="text-sm text-[#A9B8C6] mb-3">
          Published episodes appear in the public feed. Directories read this URL.
        </p>
        <code className="block rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">
          {PODCAST.feed}
        </code>
        {episode?.status === 'published' && episode.audio_url && (
          <p className="text-sm text-[#8DEBFF] mt-3">
            This episode will appear at /podcast/{episode.slug} and in RSS.
          </p>
        )}
        {saving && <p className="text-xs text-[#A9B8C6] mt-2">Saving…</p>}
      </section>
    </div>
  )
}

function ClipField({
  label,
  value,
  rows = 2,
  onSave,
}: {
  label: string
  value: string | null
  rows?: number
  onSave: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
      <textarea
        defaultValue={value || ''}
        rows={rows}
        onBlur={(e) => onSave(e.target.value)}
        className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
      />
    </label>
  )
}
