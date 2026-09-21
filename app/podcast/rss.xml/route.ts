import { NextResponse } from 'next/server'
import {
  chaptersToRss,
  escapeXml,
  getDefaultShow,
  getPublishedEpisodes,
  itunesDuration,
  showToMeta,
} from '@/lib/podcast'

export const dynamic = 'force-dynamic'

export async function GET() {
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const episodes = (await getPublishedEpisodes()).filter((ep) => ep.audio_url)
  const items = episodes.map((ep) => {
    const link = `${meta.site}/podcast/${ep.slug}`
    const pub = ep.published_at ? new Date(ep.published_at).toUTCString() : new Date(ep.created_at).toUTCString()
    const duration = itunesDuration(ep.duration_seconds)
    const enclosure = ep.audio_url
      ? `<enclosure url="${escapeXml(ep.audio_url)}" length="${ep.file_size || 0}" type="${escapeXml(ep.audio_mime || 'audio/mpeg')}" />`
      : ''
    const description = ep.show_notes || ep.summary || meta.description
    const episodeType = ep.episode_type || 'full'
    return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(ep.summary || meta.description)}</description>
      <pubDate>${pub}</pubDate>
      ${enclosure}
      ${description ? `<content:encoded><![CDATA[${description}${ep.transcript ? `\n\n---\nTranscript\n${ep.transcript}` : ''}]]></content:encoded>` : ''}
      <itunes:title>${escapeXml(ep.title)}</itunes:title>
      <itunes:author>${escapeXml(ep.guest_name ? `${ep.guest_name}; ${meta.author}` : meta.author)}</itunes:author>
      <itunes:summary>${escapeXml(ep.summary || meta.description)}</itunes:summary>
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>
      ${ep.episode_number != null ? `<itunes:episode>${ep.episode_number}</itunes:episode>` : ''}
      <itunes:season>${ep.season || 1}</itunes:season>
      <itunes:episodeType>${escapeXml(episodeType)}</itunes:episodeType>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
      ${ep.cover_url ? `<itunes:image href="${escapeXml(ep.cover_url)}" />` : ''}
      ${(ep.keywords || []).length ? `<itunes:keywords>${escapeXml(ep.keywords.join(','))}</itunes:keywords>` : ''}
${chaptersToRss(ep.chapters)}
      ${ep.transcript ? `<podcast:transcript url="${escapeXml(`${meta.site}/podcast/${ep.slug}/transcript.vtt`)}" type="text/vtt" rel="captions" />` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:psc="http://podlove.org/simple-chapters">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${meta.page}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${escapeXml(meta.language || 'en-us')}</language>
    <copyright>${escapeXml(meta.copyright || `© ${new Date().getFullYear()} Forged in the Fire`)}</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${meta.feed}" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeXml(meta.author)}</itunes:author>
    <itunes:summary>${escapeXml(meta.description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(meta.owner_name || meta.title)}</itunes:name>
      <itunes:email>${meta.email}</itunes:email>
    </itunes:owner>
    <itunes:explicit>${meta.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:type>${meta.itunes_type || 'episodic'}</itunes:type>
    <itunes:category text="${escapeXml(meta.category)}" />
    <itunes:image href="${meta.image}" />
    <image>
      <url>${meta.image}</url>
      <title>${escapeXml(meta.title)}</title>
      <link>${meta.page}</link>
    </image>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
