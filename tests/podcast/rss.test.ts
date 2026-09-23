// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildFeedXml, buildItem, cdata, enclosureUrl, podcastGuid, showNotesHtml, uuidv5 } from '@/lib/podcast-rss'
import { showToMeta } from '@/lib/podcast'
import type { PodcastEpisode } from '@/lib/studio/types'

const meta = { ...showToMeta(null), site: 'https://example.org', page: 'https://example.org/podcast', feed: 'https://example.org/podcast/rss.xml', updated_at: '2026-09-01T00:00:00Z' }

function episode(partial: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    guid: null,
    topic_id: null,
    show_id: null,
    title: 'Episode',
    slug: 'episode',
    summary: 'Summary',
    show_notes: '',
    guest_name: null,
    guest_bio: null,
    audio_url: 'https://cdn.example.org/a.mp3',
    audio_mime: 'audio/mpeg',
    duration_seconds: 1234,
    file_size: 5000,
    cover_url: null,
    transcript: null,
    season: 1,
    episode_number: 3,
    episode_type: 'full',
    visibility: 'public',
    explicit: false,
    status: 'published',
    scheduled_for: null,
    published_at: '2026-09-10T12:00:00Z',
    chapters: [],
    keywords: [],
    ad_markers: [],
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    ...partial,
  }
}

function parse(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  expect(doc.getElementsByTagName('parsererror').length, 'feed must be well-formed XML').toBe(0)
  return doc
}

describe('uuidv5 / podcastGuid', () => {
  it('matches the RFC 4122 DNS-namespace vector', () => {
    // uuid v5("www.example.com", DNS namespace) — widely published test vector.
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })

  it('podcast:guid ignores scheme and trailing slashes (spec)', () => {
    const a = podcastGuid('https://example.org/podcast/rss.xml')
    expect(podcastGuid('http://example.org/podcast/rss.xml/')).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('escaping', () => {
  it('cdata splits "]]>"', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>')
  })

  it('titles, guest names and keywords are XML-escaped; control chars stripped', () => {
    const ep = episode({
      title: 'Tom & Jerry <live> "quotes"\u0007',
      guest_name: 'A&B <C>',
      keywords: ['x&y', '<z>'],
      summary: 'S & <b>',
      show_notes: 'Notes ]]> with https://example.org/?a=1&b=2 link',
    })
    const xml = buildFeedXml({ meta, episodes: [ep] })
    const doc = parse(xml)
    const item = doc.getElementsByTagName('item')[0]
    expect(item.getElementsByTagName('title')[0].textContent).toBe('Tom & Jerry <live> "quotes"')
    expect(item.getElementsByTagName('podcast:person')[0].textContent).toBe('A&B <C>')
    expect(item.getElementsByTagName('itunes:keywords')[0].textContent).toBe('x&y,<z>')
    const desc = item.getElementsByTagName('description')[0].textContent || ''
    expect(desc).toContain('<a href="https://example.org/?a=1&amp;b=2">')
    expect(desc).toContain('Notes ]]&gt; with') // plain-text notes are HTML-escaped, and ]]> cannot break the CDATA
  })

  it('showNotesHtml turns plain text into paragraphs with links', () => {
    expect(showNotesHtml('Hi <there>\nline two\n\nhttps://x.org/a.')).toBe(
      '<p>Hi &lt;there&gt;<br />line two</p>\n<p><a href="https://x.org/a">https://x.org/a</a>.</p>',
    )
  })
})

describe('guid stability', () => {
  it('item guid is the stored guid, else the episode id — not the slug or title', () => {
    const a = buildItem(episode(), { meta, episodes: [] })
    const b = buildItem(episode({ title: 'Renamed', slug: 'renamed' }), { meta, episodes: [] })
    const guid = (x: string) => /<guid isPermaLink="false">([^<]+)<\/guid>/.exec(x)?.[1]
    expect(guid(a)).toBe('11111111-2222-3333-4444-555555555555')
    expect(guid(b)).toBe(guid(a))
    expect(guid(buildItem(episode({ guid: 'legacy-guid-1' }), { meta, episodes: [] }))).toBe('legacy-guid-1')
  })

  it('channel podcast:guid is stable and private feeds get their own', () => {
    const pub1 = buildFeedXml({ meta, episodes: [episode()] })
    const pub2 = buildFeedXml({ meta, episodes: [episode(), episode({ id: 'x2', slug: 'b' })] })
    const priv = buildFeedXml({ meta, episodes: [], privateToken: 'tok123' })
    const g = (x: string) => /<podcast:guid>([^<]+)<\/podcast:guid>/.exec(x)?.[1]
    expect(g(pub1)).toBe(g(pub2))
    expect(g(pub1)).toBe(podcastGuid(meta.feed))
    expect(g(priv)).not.toBe(g(pub1))
    expect(priv).toContain('<itunes:block>Yes</itunes:block>')
  })
})

describe('enclosure + private tokens', () => {
  it('public enclosure goes through /podcast/dl with the right extension', () => {
    expect(enclosureUrl(meta.site, episode())).toBe('https://example.org/podcast/dl/11111111-2222-3333-4444-555555555555/episode.mp3')
  })

  it('token is only added to private episodes in a private feed', () => {
    const xml = buildFeedXml({
      meta,
      episodes: [episode({ id: 'pub', visibility: 'public' }), episode({ id: 'priv', visibility: 'private', slug: 'p' })],
      privateToken: 'a b&c',
    })
    const doc = parse(xml)
    const urls = [...doc.getElementsByTagName('enclosure')].map((e) => e.getAttribute('url'))
    expect(urls[0]).toBe('https://example.org/podcast/dl/pub/episode.mp3')
    expect(urls[1]).toBe('https://example.org/podcast/dl/priv/episode.mp3?token=a%20b%26c')
  })

  it('whole feed is well-formed with chapters + transcript', () => {
    const xml = buildFeedXml({
      meta,
      episodes: [
        episode({
          chapters: [{ start_ms: 0, title: 'Intro & <hello>' } as PodcastEpisode['chapters'][number]],
          transcript: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHi',
        }),
      ],
    })
    const doc = parse(xml)
    expect(doc.getElementsByTagName('psc:chapter')[0].getAttribute('title')).toBe('Intro & <hello>')
    expect(doc.getElementsByTagName('podcast:transcript').length).toBeGreaterThan(0)
  })
})
