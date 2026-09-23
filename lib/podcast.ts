import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DistributionPlatform, PodcastEpisode, PodcastShow } from '@/lib/studio/types'
export { PODCAST } from '@/lib/podcast-meta'
import { LEGACY_COVER_URLS, PODCAST as META } from '@/lib/podcast-meta'

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Service-role client without cookies — server-only reads RLS hides from anon. */
export function podcastServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Service role when configured, else anon (RLS still exposes public + unlisted published rows). */
export function podcastReadClient(): SupabaseClient | null {
  return podcastServiceClient() ?? publicClient()
}

export async function getDefaultShow(): Promise<PodcastShow | null> {
  const supabase = publicClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('podcast_shows')
    .select('*')
    .eq('is_default', true)
    .maybeSingle()
  return (data as PodcastShow | null) ?? null
}

export type ShowMeta = ReturnType<typeof showToMeta>

export function showToMeta(show: PodcastShow | null) {
  const site = (show?.website_url || META.site).replace(/\/$/, '')
  const cover = show?.cover_url && !LEGACY_COVER_URLS.includes(show.cover_url) ? show.cover_url : `${site}/podcast/cover-3000.jpg`
  return {
    title: show?.title || META.title,
    author: show?.author || META.author,
    email: show?.email || META.email,
    site,
    page: `${site}/podcast`,
    feed: `${site}/podcast/rss.xml`,
    category: show?.category || META.category,
    subcategory: show?.subcategory || null,
    description: show?.description || META.description,
    image: absoluteUrl(cover, site),
    language: show?.language || 'en-us',
    explicit: show?.explicit ?? false,
    itunes_type: show?.itunes_type || 'episodic',
    copyright: show?.copyright || `© ${new Date().getFullYear()} ${show?.title || META.title}`,
    owner_name: show?.owner_name || show?.title || META.title,
    podcast_guid: show?.podcast_guid || null,
    funding: show?.funding_url || `${site}/donate`,
    funding_label: META.fundingLabel,
    locked: show?.locked ?? true,
    updated_at: show?.updated_at || null,
  }
}

export function absoluteUrl(url: string, site: string) {
  if (/^https?:\/\//i.test(url)) return url
  return `${site.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

/** Released = published AND release time has passed (published_at is the pubDate). */
export function isReleased(ep: Pick<PodcastEpisode, 'status' | 'published_at' | 'audio_url'>, now = Date.now()) {
  if (ep.status !== 'published' || !ep.audio_url) return false
  if (!ep.published_at) return true
  const t = Date.parse(ep.published_at)
  return Number.isNaN(t) || t <= now
}

function sortByRelease(list: PodcastEpisode[]) {
  return list.sort((a, b) => Date.parse(b.published_at || b.created_at) - Date.parse(a.published_at || a.created_at))
}

/**
 * Columns the public lists (site, RSS, embed) need — every PodcastEpisode field, but not the heavy
 * editor-only columns (transcript_words word timings, post_edit_snapshot, safety bookkeeping).
 */
export const EPISODE_LIST_COLUMNS = [
  'id', 'guid', 'topic_id', 'show_id', 'title', 'slug', 'summary', 'show_notes', 'guest_name', 'guest_bio',
  'audio_url', 'audio_mime', 'duration_seconds', 'file_size', 'cover_url', 'transcript', 'season',
  'episode_number', 'episode_type', 'visibility', 'explicit', 'status', 'scheduled_for', 'published_at',
  'chapters', 'keywords', 'ad_markers', 'loudness_lufs', 'loudness_peak_db', 'audio_channels', 'created_by',
  'created_at', 'updated_at',
].join(', ')

function isUndefinedColumn(err: { code?: string; message?: string }) {
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist/i.test(err.message || '')
}

export async function getPublishedEpisodes(opts?: {
  includePrivate?: boolean
  includeUnlisted?: boolean
}): Promise<PodcastEpisode[]> {
  // Private episodes are hidden from anon by RLS — the private feed needs the service role.
  const supabase = opts?.includePrivate ? podcastServiceClient() : publicClient()
  if (!supabase) return []
  const visibility = opts?.includePrivate
    ? opts.includeUnlisted
      ? ['public', 'unlisted', 'private']
      : ['public', 'private']
    : opts?.includeUnlisted
      ? ['public', 'unlisted']
      : ['public']

  const query = (columns: string) =>
    supabase
      .from('podcast_episodes')
      .select(columns)
      .eq('status', 'published')
      .not('audio_url', 'is', null)
      .in('visibility', visibility)
      .order('published_at', { ascending: false })
  let { data, error } = await query(EPISODE_LIST_COLUMNS)
  // A database that predates one of the listed columns: fall back rather than empty the feed.
  if (error && isUndefinedColumn(error)) ({ data, error } = await query('*'))

  if (error) {
    console.error('Podcast list error:', error.message)
    return []
  }
  const now = Date.now()
  return sortByRelease(((data ?? []) as unknown as PodcastEpisode[]).filter((ep) => isReleased(ep, now)))
}

export type Subscriber = { id: string; show_id: string; email: string; token: string }

export async function verifySubscriberToken(token: string | null | undefined): Promise<Subscriber | null> {
  if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null
  const supabase = podcastServiceClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('podcast_subscribers')
    .select('id, show_id, email, token')
    .eq('token', token)
    .eq('status', 'active')
    .maybeSingle()
  return (data as Subscriber | null) ?? null
}

/**
 * A released episode by slug. Public + unlisted for everyone; private only with a
 * valid subscriber token (used by transcript / chapters links in private feeds).
 */
export async function getPublishedEpisode(slug: string, opts?: { token?: string | null }): Promise<PodcastEpisode | null> {
  const sub = opts?.token ? await verifySubscriberToken(opts.token) : null
  const supabase = sub ? podcastServiceClient() : publicClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('podcast_episodes')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !data) return null
  const ep = data as PodcastEpisode
  if (!isReleased(ep)) return null
  if (ep.visibility === 'private' && !sub) return null
  return ep
}

export type SubscribeLink = { platform: DistributionPlatform; url: string }

/** Directory listings marked live in the Distribution tab (service role; table is not anon-readable). */
export async function getSubscribeLinks(showId: string | null | undefined): Promise<SubscribeLink[]> {
  const supabase = podcastServiceClient()
  if (!supabase || !showId) return []
  const { data, error } = await supabase
    .from('podcast_distribution')
    .select('platform, status, listing_url')
    .eq('show_id', showId)
    .eq('status', 'live')
  if (error) return []
  return (data ?? [])
    .filter((row) => row.platform !== 'rss' && isSafeHttpUrl(row.listing_url))
    .map((row) => ({ platform: row.platform as DistributionPlatform, url: String(row.listing_url) }))
}

export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Byte length of a hosted file (HEAD, falling back to a 1-byte ranged GET). */
export async function probeRemoteSize(url: string): Promise<number | null> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', cache: 'no-store' })
    const len = Number(head.headers.get('content-length'))
    if (head.ok && len > 0) return len
  } catch {
    // fall through
  }
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow', cache: 'no-store' })
    const range = res.headers.get('content-range')
    const total = range ? Number(range.split('/')[1]) : NaN
    void res.body?.cancel()
    if (total > 0) return total
  } catch {
    // unreachable host
  }
  return null
}

/** Rough listening-app attribution from the request User-Agent. */
export function guessApp(ua: string) {
  const s = ua.toLowerCase()
  if (s.includes('spotify')) return 'Spotify'
  if (s.includes('applecoremedia') || s.includes('podcasts/') || s.includes('itunes')) return 'Apple Podcasts'
  if (s.includes('overcast')) return 'Overcast'
  if (s.includes('pocket casts') || s.includes('pocketcasts')) return 'Pocket Casts'
  if (s.includes('amazon') || s.includes('alexa')) return 'Amazon Music'
  if (s.includes('youtube') || s.includes('google-podcasts') || s.includes('googlepodcasts')) return 'YouTube Music'
  if (s.includes('castbox')) return 'Castbox'
  if (s.includes('podcastaddict')) return 'Podcast Addict'
  if (s.includes('fountain') || s.includes('podverse') || s.includes('castamatic') || s.includes('podfriend')) return 'Podcasting 2.0 app'
  if (s.includes('bot') || s.includes('crawler') || s.includes('spider')) return 'Bot'
  if (s.includes('chrome') || s.includes('firefox') || s.includes('safari')) return 'Web player'
  return 'Other'
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 1) return ''
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Apple accepts whole seconds or HH:MM:SS; whole seconds is the least ambiguous. */
export function itunesDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 1) return ''
  return String(Math.round(seconds))
}

/** ISO 8601 duration for schema.org (PT1H2M3S). */
export function isoDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 1) return undefined
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`
}

export function escapeXml(value: string) {
  return value
    // Strip characters that are illegal in XML 1.0 (control chars except tab/newline/CR)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatChapterStart(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

export function sortedChapters<T extends { start_ms: number }>(chapters: T[] | null | undefined): T[] {
  return (Array.isArray(chapters) ? chapters : [])
    .filter((c) => c && Number.isFinite(c.start_ms))
    .slice()
    .sort((a, b) => a.start_ms - b.start_ms)
}

/** Podlove Simple Chapters (legacy apps) — Podcasting 2.0 apps use podcast:chapters JSON. */
export function chaptersToRss(chapters: { start_ms: number; title: string; url?: string | null }[] | null | undefined) {
  const list = sortedChapters(chapters)
  if (!list.length) return ''
  const nodes = list
    .map((ch) => {
      const href = isSafeHttpUrl(ch.url) ? ` href="${escapeXml(ch.url)}"` : ''
      return `        <psc:chapter start="${formatChapterStart(ch.start_ms)}" title="${escapeXml(ch.title)}"${href} />`
    })
    .join('\n')
  return `      <psc:chapters version="1.2">\n${nodes}\n      </psc:chapters>`
}

/** Podcasting 2.0 JSON chapters document (application/json+chapters, version 1.2.0). */
export function chaptersJson(ep: Pick<PodcastEpisode, 'title' | 'chapters'>, showTitle: string) {
  return {
    version: '1.2.0',
    title: ep.title,
    podcastName: showTitle,
    chapters: sortedChapters(ep.chapters).map((ch) => {
      const out: Record<string, unknown> = {
        startTime: Math.round(ch.start_ms) / 1000,
        title: ch.title,
      }
      if (isSafeHttpUrl(ch.url)) out.url = ch.url
      if (isSafeHttpUrl(ch.img)) out.img = ch.img
      return out
    }),
  }
}
