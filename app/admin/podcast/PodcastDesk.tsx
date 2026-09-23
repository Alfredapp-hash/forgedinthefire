'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AudioLines,
  BarChart3,
  Code2,
  Copy,
  Globe2,
  Lock,
  Mic2,
  Plus,
  Radio,
  Rss,
  Settings2,
} from 'lucide-react'
import type {
  ContentTopic,
  PodcastDistributionRow,
  PodcastEpisode,
  PodcastShow,
  PodcastSubscriber,
  EpisodeStatus,
} from '@/lib/studio/types'
import { DISTRIBUTION_LABELS, EPISODE_PIPELINE } from '@/lib/studio/types'
import { PODCAST } from '@/lib/podcast-meta'
import { RecordingStudio } from './RecordingStudio'
import { LiveControlRoom } from '@/components/podcast/live-control-room'
import { setAdminPath } from '@/lib/fbot/path-signal'

type DeskTab = 'studio' | 'live' | 'episodes' | 'show' | 'distribution' | 'analytics' | 'private' | 'embeds'

type AnalyticsPayload = {
  days: number
  total: number
  by_day: { date: string; count: number }[]
  by_app: { name: string; count: number }[]
  by_country: { name: string; count: number }[]
  episode_compare: {
    id: string
    title: string
    season: number
    episode_number: number | null
    published_at: string | null
    downloads: number
  }[]
}

const PIPELINE_COLS: EpisodeStatus[] = [
  'draft',
  'recording',
  'editing',
  'review',
  'scheduled',
  'published',
]

const DESK_TABS: DeskTab[] = ['studio', 'live', 'episodes', 'show', 'distribution', 'analytics', 'private', 'embeds']

export function PodcastDesk() {
  const [tab, setTab] = useState<DeskTab>('studio')
  const [studioEpisodeId, setStudioEpisodeId] = useState('')
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([])
  const [topics, setTopics] = useState<ContentTopic[]>([])
  const [show, setShow] = useState<PodcastShow | null>(null)
  const [distribution, setDistribution] = useState<PodcastDistributionRow[]>([])
  const [subscribers, setSubscribers] = useState<PodcastSubscriber[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [topicId, setTopicId] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [subEmail, setSubEmail] = useState('')
  const [subName, setSubName] = useState('')

  async function loadCore() {
    const [epRes, topicRes, showRes] = await Promise.all([
      fetch('/api/admin/studio/episodes'),
      fetch('/api/admin/studio/topics'),
      fetch('/api/admin/podcast/shows'),
    ])
    const eps = await epRes.json()
    const tps = await topicRes.json()
    const shows = await showRes.json()
    if (Array.isArray(eps)) setEpisodes(eps)
    else setError(eps.error || 'Could not load episodes')
    if (Array.isArray(tps)) setTopics(tps)
    if (Array.isArray(shows) && shows.length) {
      const def = shows.find((s: PodcastShow) => s.is_default) || shows[0]
      setShow(def)
      return def as PodcastShow
    }
    return null
  }

  async function loadShowExtras(showId: string) {
    const [distRes, subRes, anRes] = await Promise.all([
      fetch(`/api/admin/podcast/distribution?show_id=${showId}`),
      fetch(`/api/admin/podcast/subscribers?show_id=${showId}`),
      fetch(`/api/admin/podcast/analytics?show_id=${showId}&days=30`),
    ])
    const dist = await distRes.json()
    const subs = await subRes.json()
    const an = await anRes.json()
    if (Array.isArray(dist)) setDistribution(dist)
    if (Array.isArray(subs)) setSubscribers(subs)
    if (an && !an.error) setAnalytics(an)
  }

  useEffect(() => {
    void (async () => {
      const s = await loadCore()
      if (s?.id) await loadShowExtras(s.id)
    })()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nextTab = params.get('tab')
    const episode = params.get('episode')
    if (episode) {
      setStudioEpisodeId(episode)
      setTab('studio')
      if (!nextTab) {
        params.set('tab', 'studio')
        setAdminPath(`/admin/podcast?${params.toString()}`)
      }
      return
    }
    if (nextTab && DESK_TABS.includes(nextTab as DeskTab)) {
      setTab(nextTab as DeskTab)
      return
    }
    setAdminPath('/admin/podcast?tab=studio')
  }, [])

  function openStudio(episodeId?: string) {
    const id = episodeId || studioEpisodeId
    if (episodeId) setStudioEpisodeId(episodeId)
    setTab('studio')
    const params = new URLSearchParams()
    params.set('tab', 'studio')
    if (id) params.set('episode', id)
    setAdminPath(`/admin/podcast?${params.toString()}`)
  }

  function setDeskTab(id: DeskTab) {
    if (id === 'studio') {
      openStudio()
      return
    }
    setTab(id)
    setAdminPath(`/admin/podcast?tab=${id}`)
  }

  function selectStudioEpisode(id: string) {
    setStudioEpisodeId(id)
    const params = new URLSearchParams()
    params.set('tab', 'studio')
    if (id) params.set('episode', id)
    setAdminPath(`/admin/podcast?${params.toString()}`)
  }

  async function createEpisode() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/studio/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary,
          topic_id: topicId || null,
          show_id: show?.id || null,
          status: 'draft',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create episode')
      setEpisodes((prev) => [data, ...prev])
      setTitle('')
      setSummary('')
      setTopicId('')
      openStudio(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function saveShow(patch: Partial<PodcastShow>) {
    if (!show) return
    setError(null)
    const res = await fetch('/api/admin/podcast/shows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: show.id, ...patch }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not save show')
      return
    }
    setShow(data)
    setOk('Show settings saved')
  }

  async function updateDistribution(
    row: PodcastDistributionRow,
    status: string,
    listing_url?: string | null,
  ) {
    const body: Record<string, unknown> = { id: row.id, status }
    if (listing_url !== undefined) body.listing_url = listing_url
    const res = await fetch('/api/admin/podcast/distribution', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Update failed')
      return
    }
    setDistribution((prev) => prev.map((d) => (d.id === data.id ? data : d)))
  }

  async function addSubscriber() {
    if (!subEmail.trim() || !show) return
    const res = await fetch('/api/admin/podcast/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: show.id, email: subEmail, name: subName || null }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Invite failed')
      return
    }
    setSubscribers((prev) => [data, ...prev])
    setSubEmail('')
    setSubName('')
    setOk('Private subscriber invited')
  }

  async function revokeSubscriber(id: string) {
    const res = await fetch('/api/admin/podcast/subscribers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'revoked' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Revoke failed')
      return
    }
    setSubscribers((prev) => prev.map((s) => (s.id === id ? data : s)))
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return episodes
    return episodes.filter((e) =>
      [e.title, e.summary, e.guest_name, e.slug].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    )
  }, [episodes, query])

  const columns = Object.fromEntries(
    PIPELINE_COLS.map((status) => [status, filtered.filter((e) => e.status === status)])
  ) as Record<(typeof PIPELINE_COLS)[number], PodcastEpisode[]>

  const site = show?.website_url || PODCAST.site
  const feedUrl = `${site.replace(/\/$/, '')}/podcast/rss.xml`
  const embedSnippet = `<iframe src="${site.replace(/\/$/, '')}/podcast/embed" width="100%" height="180" frameborder="0" allow="autoplay" title="${show?.title || PODCAST.title}"></iframe>`

  const tabs: { id: DeskTab; label: string; icon: typeof Mic2 }[] = [
    { id: 'studio', label: 'Production room', icon: AudioLines },
    { id: 'live', label: 'Live show', icon: Radio },
    { id: 'episodes', label: 'Episodes', icon: Mic2 },
    { id: 'show', label: 'Show', icon: Settings2 },
    { id: 'distribution', label: 'Distribution', icon: Globe2 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'private', label: 'Private feed', icon: Lock },
    { id: 'embeds', label: 'Embeds + RSS', icon: Code2 },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#8DEBFF] mb-1">Enterprise audio</p>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Podcast Console</h1>
          <p className="text-sm text-[#A9B8C6] max-w-2xl">
            Production pipeline, scheduling, chapters, private feeds, directory distribution, and analytics —
            built to replace Captivate / Transistor / Buzzsprout for this show.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/studio" className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Studio topics
          </Link>
          <button
            type="button"
            onClick={() => openStudio()}
            className="px-3 py-2 rounded-lg border border-[#53D6FF] text-sm text-[#53D6FF]"
          >
            Production room
          </button>
          <Link href="/podcast" target="_blank" className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
            Public show
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-[#27313B] pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDeskTab(id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              tab === id ? 'bg-[#1A232C] text-[#8DEBFF]' : 'text-[#B8C4CF] hover:bg-[#1A232C]'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}

      {tab === 'studio' && (
        <RecordingStudio
          episodes={episodes}
          topics={topics}
          selectedId={studioEpisodeId}
          onSelect={selectStudioEpisode}
          onEpisodesChange={setEpisodes}
        />
      )}

      {tab === 'live' && <LiveControlRoom episodes={episodes} />}

      {tab === 'episodes' && (
        <>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <p className="text-sm text-[#F6FAFC]">New episode</p>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, guest, slug…"
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] md:w-72"
              />
            </div>
            <div className="grid md:grid-cols-[1fr_1fr_220px_auto] gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Episode title"
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
              />
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line summary"
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
              />
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
              >
                <option value="">No topic yet</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!title.trim() || creating}
                onClick={() => void createEpisode()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#53D6FF] text-[#061016] px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                <Plus size={14} />
                Create
              </button>
            </div>
          </section>

          <div className="grid lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {PIPELINE_COLS.map((status) => (
              <div key={status} className="rounded-2xl border border-[#27313B] bg-[#151B22] p-3 min-h-[180px]">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-3">
                  {status} · {columns[status].length}
                </p>
                <div className="space-y-2">
                  {columns[status].map((ep) => (
                    <div
                      key={ep.id}
                      className="rounded-lg border border-[#27313B] bg-[#05070A] p-3 space-y-2"
                    >
                      <Link href={`/admin/podcast/${ep.id}`} className="block hover:text-[#8DEBFF]">
                        <p className="text-sm text-[#F6FAFC] line-clamp-2">{ep.title}</p>
                        <p className="text-[11px] text-[#A9B8C6] mt-1">
                          S{ep.season}{ep.episode_number != null ? `E${ep.episode_number}` : ''}
                          {ep.visibility !== 'public' ? ` · ${ep.visibility}` : ''}
                          {ep.scheduled_for ? ` · ${new Date(ep.scheduled_for).toLocaleString()}` : ''}
                          {' · '}{ep.audio_url ? 'audio ready' : 'needs audio'}
                        </p>
                      </Link>
                      <button
                        type="button"
                        onClick={() => openStudio(ep.id)}
                        className="text-[11px] text-[#53D6FF]"
                      >
                        Open in production room
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'show' && show && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 grid md:grid-cols-2 gap-4">
          {(
            [
              ['title', 'Show title'],
              ['author', 'Author'],
              ['email', 'Owner email'],
              ['category', 'Category'],
              ['subcategory', 'Subcategory'],
              ['language', 'Language'],
              ['cover_url', 'Cover URL'],
              ['website_url', 'Website'],
              ['copyright', 'Copyright'],
              ['owner_name', 'Owner name'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
              <input
                defaultValue={(show[key] as string | null) || ''}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v !== ((show[key] as string | null) || '')) void saveShow({ [key]: v || null })
                }}
                className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
              />
            </label>
          ))}
          <label className="block md:col-span-2">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">Description</span>
            <textarea
              defaultValue={show.description}
              rows={4}
              onBlur={(e) => {
                if (e.target.value !== show.description) void saveShow({ description: e.target.value })
              }}
              className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
            <input
              type="checkbox"
              checked={show.explicit}
              onChange={(e) => void saveShow({ explicit: e.target.checked })}
            />
            Mark show explicit
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">iTunes type</span>
            <select
              value={show.itunes_type}
              onChange={(e) => void saveShow({ itunes_type: e.target.value as 'episodic' | 'serial' })}
              className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
            >
              <option value="episodic">episodic</option>
              <option value="serial">serial</option>
            </select>
          </label>
        </section>
      )}

      {tab === 'distribution' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
            <p className="text-sm font-medium text-[#F6FAFC]">Hosted RSS — submit this URL once</p>
            <p className="text-xs text-[#A9B8C6]">
              Episodes you publish are hosted on this site and listed in the public feed. Apple Podcasts,
              Spotify, and Amazon Music all ingest that feed — you do not re-upload audio to each store.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] break-all">
                {PODCAST.feed}
              </code>
              <button
                type="button"
                onClick={() => void copyText('rss', PODCAST.feed)}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              >
                <Copy size={14} /> {copied === 'rss' ? 'Copied' : 'Copy RSS'}
              </button>
            </div>
            <ul className="text-sm text-[#B8C4CF] space-y-2 list-disc pl-5">
              <li>
                <strong className="text-[#F6FAFC]">Apple Podcasts:</strong> podcastsconnect.apple.com → Add a show → RSS feed → paste URL → validate artwork (1400×1400+) and owner email.
              </li>
              <li>
                <strong className="text-[#F6FAFC]">Spotify:</strong> podcasters.spotify.com → Add your podcast → RSS → claim with the email on the feed.
              </li>
              <li>
                <strong className="text-[#F6FAFC]">Amazon Music:</strong> podcasters.amazon.com → Add podcast via RSS → complete Amazon Music for Podcasters listing.
              </li>
            </ul>
          </section>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] divide-y divide-[#27313B]">
            {distribution.length === 0 && (
              <p className="p-5 text-sm text-[#A9B8C6]">
                Apply the podcast enterprise migration to seed Apple, Spotify, Amazon, and more — then track submission status here.
              </p>
            )}
            {distribution.map((row) => (
              <div key={row.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <p className="text-[#F6FAFC]">{DISTRIBUTION_LABELS[row.platform] || row.platform}</p>
                  <p className="text-xs text-[#A9B8C6]">
                    {row.status.replace('_', ' ')}
                    {row.listing_url ? ` · ${row.listing_url}` : ''}
                  </p>
                  <input
                    defaultValue={row.listing_url || ''}
                    placeholder="Public listing URL once live"
                    onBlur={(e) => {
                      const listing_url = e.target.value.trim() || null
                      if (listing_url !== (row.listing_url || null)) {
                        void updateDistribution(row, row.status, listing_url)
                      }
                    }}
                    className="w-full max-w-md rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-1.5 text-xs text-[#F6FAFC]"
                  />
                </div>
                <select
                  value={row.status}
                  onChange={(e) => void updateDistribution(row, e.target.value)}
                  className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
                >
                  <option value="not_started">not started</option>
                  <option value="submitted">submitted</option>
                  <option value="in_review">in review</option>
                  <option value="live">live</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid md:grid-cols-3 gap-3 flex-1">
              <Stat label="Events (30d)" value={String(analytics?.total ?? 0)} />
              <Stat label="Top app" value={analytics?.by_app[0]?.name || '—'} />
              <Stat label="Top country" value={analytics?.by_country[0]?.name || '—'} />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!analytics) return
                const lines = [
                  'episode,season,episode_number,published_at,downloads',
                  ...analytics.episode_compare.map((ep) =>
                    [
                      JSON.stringify(ep.title),
                      ep.season,
                      ep.episode_number ?? '',
                      ep.published_at || '',
                      ep.downloads,
                    ].join(',')
                  ),
                ]
                const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `podcast-analytics-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] shrink-0"
            >
              Export CSV
            </button>
          </div>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-3">Daily downloads / plays</p>
            <div className="flex items-end gap-1 h-32">
              {(analytics?.by_day || []).slice(-30).map((d) => {
                const max = Math.max(1, ...(analytics?.by_day.map((x) => x.count) || [1]))
                const h = Math.max(4, Math.round((d.count / max) * 100))
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                    <div className="w-full rounded-t bg-[#53D6FF]/80" style={{ height: `${h}%` }} />
                  </div>
                )
              })}
              {!analytics?.by_day?.length && (
                <p className="text-sm text-[#A9B8C6]">No events yet. Plays and RSS downloads will appear here.</p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#05070A] text-[#A9B8C6] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Episode</th>
                  <th className="text-left px-4 py-3">Published</th>
                  <th className="text-right px-4 py-3">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27313B]">
                {(analytics?.episode_compare || []).map((ep) => (
                  <tr key={ep.id}>
                    <td className="px-4 py-3 text-[#F6FAFC]">
                      <Link href={`/admin/podcast/${ep.id}`} className="hover:text-[#8DEBFF]">
                        {ep.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#A9B8C6]">
                      {ep.published_at ? new Date(ep.published_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-[#8DEBFF]">{ep.downloads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === 'private' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
            <p className="text-sm text-[#F6FAFC]">Invite private subscriber</p>
            <p className="text-xs text-[#A9B8C6]">
              Each person gets a unique RSS URL (Transistor-class). Mark episodes as visibility=private to keep them off the public feed.
            </p>
            <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                placeholder="email@example.com"
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
              />
              <input
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Name (optional)"
                className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
              />
              <button
                type="button"
                onClick={() => void addSubscriber()}
                className="rounded-lg bg-[#53D6FF] text-[#061016] px-4 py-2 text-sm font-medium"
              >
                Invite
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] divide-y divide-[#27313B]">
            {subscribers.map((sub) => {
              const privateFeed = `${site.replace(/\/$/, '')}/podcast/private/${sub.token}/rss.xml`
              return (
                <div key={sub.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[#F6FAFC]">{sub.name || sub.email}</p>
                      <p className="text-xs text-[#A9B8C6]">{sub.email} · {sub.status}</p>
                    </div>
                    {sub.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => void revokeSubscriber(sub.id)}
                        className="text-sm text-red-300"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-start">
                    <code className="flex-1 text-[11px] text-[#8DEBFF] break-all">{privateFeed}</code>
                    <button
                      type="button"
                      onClick={() => void copyText(sub.id, privateFeed)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#27313B] text-xs text-[#F6FAFC]"
                    >
                      <Copy size={12} />
                      {copied === sub.id ? 'Copied' : 'Copy feed'}
                    </button>
                  </div>
                </div>
              )
            })}
            {!subscribers.length && (
              <p className="p-5 text-sm text-[#A9B8C6]">No private subscribers yet.</p>
            )}
          </section>
        </div>
      )}

      {tab === 'embeds' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Public RSS</p>
            <div className="flex flex-col sm:flex-row gap-2 items-start">
              <code className="flex-1 text-xs text-[#8DEBFF] break-all">{feedUrl}</code>
              <button
                type="button"
                onClick={() => void copyText('rss', feedUrl)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#F6FAFC]"
              >
                <Rss size={14} />
                {copied === 'rss' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Embed player</p>
            <textarea
              readOnly
              value={embedSnippet}
              rows={4}
              className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-xs text-[#8DEBFF] font-mono"
            />
            <button
              type="button"
              onClick={() => void copyText('embed', embedSnippet)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm"
            >
              <Code2 size={14} />
              {copied === 'embed' ? 'Copied' : 'Copy embed code'}
            </button>
          </section>
          <p className="text-xs text-[#A9B8C6] inline-flex items-center gap-2">
            <Radio size={12} />
            Pipeline stages: {EPISODE_PIPELINE.join(' → ')}
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6]">{label}</p>
      <p className="text-xl text-[#F6FAFC] mt-1">{value}</p>
    </div>
  )
}
