import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  chaptersToRss,
  escapeXml,
  getDefaultShow,
  itunesDuration,
  showToMeta,
} from '@/lib/podcast'
import type { PodcastEpisode } from '@/lib/studio/types'

export const dynamic = 'force-dynamic'

function serviceOrAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) return null
  if (service) return createClient(url, service)
  if (anon) return createClient(url, anon)
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const supabase = serviceOrAnon()
  if (!supabase || !token) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: sub } = await supabase
    .from('podcast_subscribers')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .maybeSingle()

  if (!sub) return new NextResponse('Not found', { status: 404 })

  await supabase
    .from('podcast_subscribers')
    .update({ last_access_at: new Date().toISOString() })
    .eq('id', sub.id)

  const show = await getDefaultShow()
  const meta = showToMeta(show)

  const { data: episodes } = await supabase
    .from('podcast_episodes')
    .select('*')
    .eq('status', 'published')
    .not('audio_url', 'is', null)
    .in('visibility', ['public', 'private', 'unlisted'])
    .order('published_at', { ascending: false })

  const items = ((episodes ?? []) as PodcastEpisode[]).map((ep) => {
    const link = `${meta.site}/podcast/${ep.slug}`
    const guid = ep.guid || ep.id
    const pub = ep.published_at ? new Date(ep.published_at).toUTCString() : new Date(ep.created_at).toUTCString()
    const duration = itunesDuration(ep.duration_seconds)
    const dl = `${meta.site}/podcast/dl/${ep.id}?token=${encodeURIComponent(token)}`
    const enclosure = ep.audio_url
      ? `<enclosure url="${escapeXml(dl)}" length="${ep.file_size || 0}" type="${escapeXml(ep.audio_mime || 'audio/mpeg')}" />`
      : ''
    return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <description>${escapeXml(ep.summary || meta.description)}</description>
      <pubDate>${pub}</pubDate>
      ${enclosure}
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>
      <itunes:episodeType>${escapeXml(ep.episode_type || 'full')}</itunes:episodeType>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
${chaptersToRss(ep.chapters)}
    </item>`
  }).join('\n')

  const privateFeed = `${meta.site}/podcast/private/${token}/rss.xml`
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:psc="http://podlove.org/simple-chapters">
  <channel>
    <title>${escapeXml(`${meta.title} (Private)`)}</title>
    <link>${meta.page}</link>
    <description>${escapeXml(`Private feed for ${sub.email}`)}</description>
    <language>${escapeXml(meta.language || 'en-us')}</language>
    <atom:link href="${privateFeed}" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeXml(meta.author)}</itunes:author>
    <itunes:block>Yes</itunes:block>
    <itunes:image href="${meta.image}" />
${items}
  </channel>
</rss>`

  // Track access for analytics
  await supabase.from('podcast_analytics_events').insert({
    show_id: sub.show_id,
    event_type: 'private_access',
    listener_hash: token.slice(0, 16),
    app_name: 'Private RSS',
  })

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
