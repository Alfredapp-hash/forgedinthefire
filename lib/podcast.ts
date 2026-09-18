import { createClient } from '@supabase/supabase-js'
import type { PodcastEpisode, PodcastShow } from '@/lib/studio/types'
export { PODCAST } from '@/lib/podcast-meta'
import { PODCAST as META } from '@/lib/podcast-meta'

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
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

export function showToMeta(show: PodcastShow | null) {
  const site = (show?.website_url || META.site).replace(/\/$/, '')
  return {
    title: show?.title || META.title,
    author: show?.author || META.author,
    email: show?.email || META.email,
    site,
    page: `${site}/podcast`,
    feed: `${site}/podcast/rss.xml`,
    category: show?.category || META.category,
    description: show?.description || META.description,
    image: show?.cover_url || META.image,
    language: show?.language || 'en-us',
    explicit: show?.explicit ?? false,
    itunes_type: show?.itunes_type || 'episodic',
    copyright: show?.copyright || `© ${new Date().getFullYear()} ${show?.title || META.title}`,
    owner_name: show?.owner_name || show?.title || META.title,
  }
}

export async function getPublishedEpisodes(opts?: {
  includePrivate?: boolean
  includeUnlisted?: boolean
}): Promise<PodcastEpisode[]> {
  const supabase = publicClient()
  if (!supabase) return []
  let query = supabase
    .from('podcast_episodes')
    .select('*')
    .eq('status', 'published')
    .not('audio_url', 'is', null)
    .order('published_at', { ascending: false })

  // Public feed: only public visibility (RLS also enforces this for anon)
  if (!opts?.includePrivate && !opts?.includeUnlisted) {
    query = query.eq('visibility', 'public')
  } else if (opts?.includePrivate) {
    // private feed: public + private (+ optional unlisted)
    query = query.in('visibility', opts.includeUnlisted ? ['public', 'unlisted', 'private'] : ['public', 'private'])
  }

  const { data, error } = await query
  if (error) {
    // Fallback for pre-migration DBs missing visibility column
    console.error('Podcast list error:', error)
    const fallback = await supabase
      .from('podcast_episodes')
      .select('*')
      .eq('status', 'published')
      .not('audio_url', 'is', null)
      .order('published_at', { ascending: false })
    return (fallback.data ?? []) as PodcastEpisode[]
  }
  return (data ?? []) as PodcastEpisode[]
}

export async function getPublishedEpisode(slug: string): Promise<PodcastEpisode | null> {
  const supabase = publicClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('podcast_episodes')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  if (error || !data) return null
  const ep = data as PodcastEpisode
  // Private episodes stay off the public site (token RSS only)
  if (ep.visibility === 'private') return null
  return ep
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 1) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function itunesDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 1) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function escapeXml(value: string) {
  return value
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
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`
}

export function chaptersToRss(chapters: { start_ms: number; title: string; url?: string | null }[] | null | undefined) {
  if (!chapters?.length) return ''
  const nodes = chapters
    .slice()
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((ch) => {
      const href = ch.url ? ` href="${escapeXml(ch.url)}"` : ''
      return `      <psc:chapter start="${formatChapterStart(ch.start_ms)}" title="${escapeXml(ch.title)}"${href} />`
    })
    .join('\n')
  return `      <psc:chapters version="1.2" xmlns:psc="http://podlove.org/simple-chapters">\n${nodes}\n      </psc:chapters>`
}
