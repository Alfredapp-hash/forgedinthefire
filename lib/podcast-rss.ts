/**
 * RSS 2.0 + iTunes + Podcasting 2.0 feed builder (public and private token feeds).
 * Server-only (node:crypto). Pure over its inputs so scripts can render sample feeds.
 */
import { createHash } from 'node:crypto'
import {
  chaptersToRss,
  escapeXml,
  isSafeHttpUrl,
  itunesDuration,
  sortedChapters,
  type ShowMeta,
} from '@/lib/podcast'
import { PODCAST_GUID_NAMESPACE } from '@/lib/podcast-meta'
import { audioExtension, normalizeAudioMime } from '@/lib/studio/release'
import { episodeHasTimedTranscript } from '@/lib/studio/transcript'
import type { PodcastEpisode } from '@/lib/studio/types'

/** RFC 4122 UUIDv5 (SHA-1). */
export function uuidv5(name: string, namespace = PODCAST_GUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** podcast:guid per spec: UUIDv5 of the feed URL with scheme and trailing slashes removed. */
export function podcastGuid(feedUrl: string) {
  const name = feedUrl.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '')
  return uuidv5(name)
}

/** CDATA-safe wrapper (splits any "]]>" inside the content). */
export function cdata(value: string) {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Show notes → podcast-app-safe HTML (<p>, <br>, <a>). Existing HTML passes through. */
export function showNotesHtml(text: string) {
  const src = text.trim()
  if (!src) return ''
  if (/<(p|a|ul|ol|li|br|strong|em|h[1-6])\b[^>]*>/i.test(src)) return src
  return src
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para).replace(URL_RE, (url) => {
        const clean = url.replace(/&amp;/g, '&')
        return `<a href="${escapeHtml(clean)}">${url}</a>`
      })
      return `<p>${html.replace(/\n/g, '<br />')}</p>`
    })
    .join('\n')
}

export type FeedOptions = {
  meta: ShowMeta
  episodes: PodcastEpisode[]
  /** Private subscriber feed: token goes on enclosure / transcript / chapter URLs. */
  privateToken?: string | null
  privateLabel?: string | null
}

export function feedSelfUrl(meta: ShowMeta, privateToken?: string | null) {
  return privateToken ? `${meta.site}/podcast/private/${privateToken}/rss.xml` : meta.feed
}

/** Newest meaningful change across the show + items → Last-Modified and lastBuildDate. */
export function feedLastModified(meta: ShowMeta, episodes: PodcastEpisode[]) {
  let latest = meta.updated_at ? Date.parse(meta.updated_at) : 0
  for (const ep of episodes) {
    for (const v of [ep.updated_at, ep.published_at]) {
      const t = v ? Date.parse(v) : NaN
      if (Number.isFinite(t) && t > latest && t <= Date.now()) latest = t
    }
  }
  // Second precision (HTTP dates drop milliseconds)
  return new Date(Math.floor((latest || Date.parse('2026-01-01T00:00:00Z')) / 1000) * 1000)
}

function withToken(url: string, token?: string | null) {
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url
}

export function enclosureUrl(site: string, ep: Pick<PodcastEpisode, 'id' | 'audio_mime' | 'audio_url'>, token?: string | null) {
  const ext = audioExtension(normalizeAudioMime(ep.audio_mime, ep.audio_url))
  return withToken(`${site}/podcast/dl/${ep.id}/episode.${ext}`, token)
}

export function buildItem(ep: PodcastEpisode, opts: FeedOptions) {
  const { meta, privateToken } = opts
  const token = privateToken && ep.visibility === 'private' ? privateToken : null
  const link = ep.visibility === 'private' ? meta.page : `${meta.site}/podcast/${ep.slug}`
  const guid = ep.guid || ep.id
  const pub = new Date(ep.published_at || ep.created_at).toUTCString()
  const duration = itunesDuration(ep.duration_seconds)
  const mime = normalizeAudioMime(ep.audio_mime, ep.audio_url)
  const summary = (ep.summary || '').trim()
  const notesHtml = showNotesHtml(ep.show_notes || '') || (summary ? `<p>${escapeHtml(summary)}</p>` : '')
  const guestHtml = ep.guest_name
    ? `\n<p><strong>Guest:</strong> ${escapeHtml(ep.guest_name)}${ep.guest_bio ? ` — ${escapeHtml(ep.guest_bio)}` : ''}</p>`
    : ''
  const html = `${notesHtml}${guestHtml}` || `<p>${escapeHtml(meta.description)}</p>`
  const episodeType = ep.episode_type || 'full'
  const lines: string[] = [
    `      <title>${escapeXml(ep.title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(String(guid))}</guid>`,
    `      <pubDate>${pub}</pubDate>`,
    `      <description>${cdata(html)}</description>`,
    `      <content:encoded>${cdata(html)}</content:encoded>`,
    `      <enclosure url="${escapeXml(enclosureUrl(meta.site, ep, token))}" length="${Math.max(0, Math.round(ep.file_size || 0))}" type="${escapeXml(mime)}" />`,
    `      <itunes:title>${escapeXml(ep.title)}</itunes:title>`,
    `      <itunes:author>${escapeXml(meta.author)}</itunes:author>`,
  ]
  if (summary) lines.push(`      <itunes:subtitle>${escapeXml(summary.slice(0, 255))}</itunes:subtitle>`)
  if (summary) lines.push(`      <itunes:summary>${escapeXml(summary)}</itunes:summary>`)
  lines.push(`      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>`)
  if (duration) lines.push(`      <itunes:duration>${duration}</itunes:duration>`)
  lines.push(`      <itunes:episodeType>${escapeXml(episodeType)}</itunes:episodeType>`)
  lines.push(`      <itunes:season>${Math.max(1, Number(ep.season) || 1)}</itunes:season>`)
  lines.push(`      <podcast:season>${Math.max(1, Number(ep.season) || 1)}</podcast:season>`)
  if (ep.episode_number != null && Number(ep.episode_number) > 0) {
    lines.push(`      <itunes:episode>${Number(ep.episode_number)}</itunes:episode>`)
    lines.push(`      <podcast:episode>${Number(ep.episode_number)}</podcast:episode>`)
  }
  if (isSafeHttpUrl(ep.cover_url)) lines.push(`      <itunes:image href="${escapeXml(ep.cover_url)}" />`)
  if ((ep.keywords || []).length) lines.push(`      <itunes:keywords>${escapeXml(ep.keywords.join(','))}</itunes:keywords>`)

  const transcript = (ep.transcript || '').trim()
  if (transcript) {
    const base = `${meta.site}/podcast/${ep.slug}`
    if (episodeHasTimedTranscript(ep)) {
      lines.push(`      <podcast:transcript url="${escapeXml(withToken(`${base}/transcript.vtt`, token))}" type="text/vtt" rel="captions" />`)
      lines.push(`      <podcast:transcript url="${escapeXml(withToken(`${base}/transcript.srt`, token))}" type="application/x-subrip" rel="captions" />`)
    } else {
      lines.push(`      <podcast:transcript url="${escapeXml(withToken(`${base}/transcript.txt`, token))}" type="text/plain" />`)
    }
  }
  if (sortedChapters(ep.chapters).length) {
    const url = withToken(`${meta.site}/podcast/${ep.slug}/chapters.json`, token)
    lines.push(`      <podcast:chapters url="${escapeXml(url)}" type="application/json+chapters" />`)
    lines.push(chaptersToRss(ep.chapters))
  }
  if (ep.guest_name) {
    lines.push(`      <podcast:person role="guest">${escapeXml(ep.guest_name)}</podcast:person>`)
  }
  return `    <item>\n${lines.join('\n')}\n    </item>`
}

export function buildFeedXml(opts: FeedOptions) {
  const { meta, episodes, privateToken } = opts
  const self = feedSelfUrl(meta, privateToken)
  const lastModified = feedLastModified(meta, episodes)
  const categoryXml = meta.subcategory
    ? `    <itunes:category text="${escapeXml(meta.category)}">\n      <itunes:category text="${escapeXml(meta.subcategory)}" />\n    </itunes:category>`
    : `    <itunes:category text="${escapeXml(meta.category)}" />`
  const title = privateToken ? `${meta.title} (Private)` : meta.title
  const description = privateToken
    ? `${meta.description}\n\nPrivate feed${opts.privateLabel ? ` for ${opts.privateLabel}` : ''}. Please do not share this link.`
    : meta.description
  // Private feeds get their own GUID so indexes never merge them with the public show.
  const guid = privateToken ? podcastGuid(self) : meta.podcast_guid || podcastGuid(meta.feed)

  const channel: string[] = [
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(meta.page)}</link>`,
    `    <description>${cdata(description)}</description>`,
    `    <language>${escapeXml(meta.language || 'en-us')}</language>`,
    `    <copyright>${escapeXml(meta.copyright)}</copyright>`,
    `    <generator>Forged in the Fire Studio</generator>`,
    `    <lastBuildDate>${lastModified.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />`,
    `    <itunes:author>${escapeXml(meta.author)}</itunes:author>`,
    `    <itunes:summary>${escapeXml(description)}</itunes:summary>`,
    `    <itunes:owner>\n      <itunes:name>${escapeXml(meta.owner_name)}</itunes:name>\n      <itunes:email>${escapeXml(meta.email)}</itunes:email>\n    </itunes:owner>`,
    `    <itunes:explicit>${meta.explicit ? 'true' : 'false'}</itunes:explicit>`,
    `    <itunes:type>${meta.itunes_type === 'serial' ? 'serial' : 'episodic'}</itunes:type>`,
    categoryXml,
    `    <itunes:image href="${escapeXml(meta.image)}" />`,
    `    <image>\n      <url>${escapeXml(meta.image)}</url>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(meta.page)}</link>\n    </image>`,
    `    <podcast:guid>${guid}</podcast:guid>`,
    `    <podcast:locked owner="${escapeXml(meta.email)}">${privateToken || meta.locked ? 'yes' : 'no'}</podcast:locked>`,
    `    <podcast:medium>podcast</podcast:medium>`,
    `    <podcast:person role="host">${escapeXml(meta.author)}</podcast:person>`,
  ]
  if (isSafeHttpUrl(meta.funding)) {
    channel.push(`    <podcast:funding url="${escapeXml(meta.funding)}">${escapeXml(meta.funding_label.slice(0, 128))}</podcast:funding>`)
  }
  if (privateToken) channel.push('    <itunes:block>Yes</itunes:block>')

  const items = episodes.map((ep) => buildItem(ep, opts)).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:psc="http://podlove.org/simple-chapters">
  <channel>
${channel.join('\n')}
${items}
  </channel>
</rss>
`
}

/** Conditional-GET aware XML response (ETag + Last-Modified → 304). */
export function feedResponse(
  request: Request,
  xml: string,
  lastModified: Date,
  cacheControl: string,
  contentType = 'application/rss+xml; charset=utf-8',
) {
  const etag = `W/"${createHash('sha1').update(xml).digest('base64url').slice(0, 27)}"`
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ETag: etag,
    'Last-Modified': lastModified.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  }
  const inm = request.headers.get('if-none-match')
  const ims = request.headers.get('if-modified-since')
  const notModified = inm
    ? inm.split(',').map((t) => t.trim().replace(/^W\//, '')).includes(etag.replace(/^W\//, '')) || inm.trim() === '*'
    : ims
      ? Date.parse(ims) >= lastModified.getTime()
      : false
  if (notModified) return new Response(null, { status: 304, headers })
  return new Response(xml, { status: 200, headers })
}
