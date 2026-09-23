#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script */
/**
 * Renders the podcast RSS builder with sample data and checks it against Apple /
 * Podcasting 2.0 requirements. No network, no database.
 *   node scripts/check-podcast-rss.cjs
 */
const path = require('path')
const root = path.resolve(__dirname, '..')
const jiti = require('jiti')(__filename, { alias: { '@': root }, interopDefault: true })
const { JSDOM } = require('jsdom')

const { buildFeedXml, podcastGuid, uuidv5, showNotesHtml, cdata } = jiti(path.join(root, 'lib/podcast-rss.ts'))
const { showToMeta, chaptersJson } = jiti(path.join(root, 'lib/podcast.ts'))
const { releaseChecks, releaseBlockers } = jiti(path.join(root, 'lib/studio/release.ts'))
const { parseCues, cuesToSrt } = jiti(path.join(root, 'lib/studio/transcript.ts'))

let failures = 0
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures += 1
}

const now = Date.now()
const base = {
  topic_id: null,
  show_id: 's1',
  guest_bio: null,
  cover_url: 'https://cdn.example.org/ep1.jpg',
  season: 1,
  episode_type: 'full',
  visibility: 'public',
  explicit: false,
  status: 'published',
  scheduled_for: null,
  keywords: ['healing', 'housing'],
  ad_markers: [],
  created_by: null,
  created_at: new Date(now - 86400000 * 3).toISOString(),
  updated_at: new Date(now - 3600000).toISOString(),
}
const episodes = [
  {
    ...base,
    id: '11111111-1111-4111-8111-111111111111',
    guid: 'aaaaaaaa-1111-4111-8111-111111111111',
    title: 'Episode 1: Safety & "Home" <first steps>',
    slug: 'safety-home',
    summary: 'What safe housing means — in survivors’ words.',
    show_notes: 'Resources:\nhttps://forgedinthefireohio.org/get-help\n\nA note with ]]> inside CDATA.',
    guest_name: 'Jordan',
    audio_url: 'https://cdn.example.org/ep1.mp3',
    audio_mime: 'audio/mp3',
    duration_seconds: 1834,
    file_size: 29344000,
    transcript: 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n<v Tracy>Welcome.\n\n00:00:04.000 --> 00:00:09.500\nToday we talk about home.',
    episode_number: 1,
    published_at: new Date(now - 86400000).toISOString(),
    chapters: [
      { start_ms: 0, title: 'Welcome' },
      { start_ms: 95000, title: 'Finding "safe"', url: 'https://forgedinthefireohio.org/get-help' },
    ],
  },
  {
    ...base,
    id: '22222222-2222-4222-8222-222222222222',
    guid: 'bbbbbbbb-2222-4222-8222-222222222222',
    title: 'Trailer',
    slug: 'trailer',
    summary: 'Coming soon.',
    show_notes: null,
    guest_name: null,
    audio_url: 'https://cdn.example.org/trailer.m4a',
    audio_mime: 'audio/x-m4a',
    duration_seconds: 62,
    file_size: 1000000,
    transcript: 'Plain prose transcript.',
    episode_number: null,
    episode_type: 'trailer',
    published_at: new Date(now - 86400000 * 2).toISOString(),
    chapters: [],
  },
]

const meta = showToMeta({
  id: 's1', slug: 'main', title: 'Forged in the Fire', author: 'Tracy / Forged in the Fire',
  email: 'tracys@forgedinthefireohio.org', description: 'Survivor-centered conversations & hope.',
  category: 'Society & Culture', subcategory: 'Relationships', language: 'en-us', explicit: false,
  cover_url: 'https://forgedinthefireohio.org/brand/fitf-lockup.png', website_url: 'https://forgedinthefireohio.org',
  copyright: '© Forged in the Fire', itunes_type: 'episodic', owner_name: 'Forged in the Fire', is_default: true,
  created_at: '', updated_at: new Date(now - 7200000).toISOString(),
})

function parse(xml) {
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  const err = doc.getElementsByTagName('parsererror')[0]
  return { doc, err }
}

// UUIDv5 known vector from the Podcasting 2.0 spec
check(uuidv5('podnews.net/rss') === '9b024349-ccf0-5f69-a609-6b82873eab3c', 'UUIDv5 matches spec test vector (podnews.net/rss)')
check(podcastGuid('https://podnews.net/rss/') === '9b024349-ccf0-5f69-a609-6b82873eab3c', 'podcast:guid strips scheme + trailing slash')

for (const [label, opts] of [
  ['public', { meta, episodes }],
  ['private', { meta, episodes: [{ ...episodes[0], visibility: 'private' }, episodes[1]], privateToken: 'abcdef0123456789abcdef0123456789abcdef0123456789', privateLabel: 'a@b.org' }],
]) {
  const xml = buildFeedXml(opts)
  const { doc, err } = parse(xml)
  check(!err, `[${label}] parses as well-formed XML${err ? `: ${err.textContent}` : ''}`)
  if (err) continue
  const ch = doc.getElementsByTagName('channel')[0]
  const one = (name, scope = ch) => Array.from(scope.children).find((n) => n.tagName === name)
  const img = one('itunes:image')
  check(img && img.getAttribute('href') === 'https://forgedinthefireohio.org/podcast/cover-3000.jpg', `[${label}] channel itunes:image → 3000px JPEG (legacy 1024 art replaced)`)
  check(one('itunes:category')?.getAttribute('text') === 'Society & Culture' && !!one('itunes:category').children.length, `[${label}] itunes:category + subcategory`)
  check(['true', 'false'].includes(one('itunes:explicit')?.textContent), `[${label}] itunes:explicit true/false`)
  check(!!one('itunes:owner')?.getElementsByTagName('itunes:email')[0]?.textContent, `[${label}] itunes:owner/email`)
  check(one('itunes:type')?.textContent === 'episodic', `[${label}] itunes:type`)
  check(one('language')?.textContent === 'en-us', `[${label}] language`)
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(one('podcast:guid')?.textContent || ''), `[${label}] podcast:guid is UUIDv5`)
  check(one('podcast:locked')?.textContent === 'yes' && !!one('podcast:locked').getAttribute('owner'), `[${label}] podcast:locked yes + owner`)
  check(label === 'private' || one('podcast:funding')?.getAttribute('url') === 'https://forgedinthefireohio.org/donate', `[${label}] podcast:funding → /donate`)
  const self = one('atom:link')
  check(self?.getAttribute('rel') === 'self' && self.getAttribute('type') === 'application/rss+xml', `[${label}] atom:link rel=self`)
  check(label === 'public' || one('itunes:block')?.textContent === 'Yes', `[${label}] itunes:block on private feed`)
  check(!!one('lastBuildDate') && !Number.isNaN(Date.parse(one('lastBuildDate').textContent)), `[${label}] lastBuildDate`)

  const items = Array.from(ch.getElementsByTagName('item'))
  check(items.length === 2, `[${label}] 2 items`)
  items.forEach((item, i) => {
    const get = (name) => Array.from(item.children).find((n) => n.tagName === name)
    const guid = get('guid')
    check(guid?.getAttribute('isPermaLink') === 'false' && guid.textContent.length > 10, `[${label}#${i}] guid isPermaLink=false`)
    const enc = get('enclosure')
    check(enc && Number(enc.getAttribute('length')) > 0 && /^audio\/(mpeg|x-m4a)$/.test(enc.getAttribute('type')), `[${label}#${i}] enclosure length + type (${enc?.getAttribute('type')})`)
    check(/\/podcast\/dl\/[0-9a-f-]{36}\/episode\.(mp3|m4a)/.test(enc?.getAttribute('url') || ''), `[${label}#${i}] enclosure URL ends in audio extension`)
    check(/^\d+$/.test(get('itunes:duration')?.textContent || ''), `[${label}#${i}] itunes:duration (seconds)`)
    check(!!get('itunes:episodeType') && !!get('itunes:season'), `[${label}#${i}] itunes:episodeType + season`)
    const pub = get('pubDate')?.textContent || ''
    check(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(pub), `[${label}#${i}] pubDate RFC 2822 (${pub})`)
    check(!!get('description')?.textContent && !!get('content:encoded')?.textContent, `[${label}#${i}] description + content:encoded`)
    check(['true', 'false'].includes(get('itunes:explicit')?.textContent), `[${label}#${i}] item itunes:explicit`)
    if (i === 0) {
      check(get('itunes:episode')?.textContent === '1', `[${label}#0] itunes:episode`)
      const tr = Array.from(item.children).filter((n) => n.tagName === 'podcast:transcript')
      check(tr.some((t) => t.getAttribute('type') === 'text/vtt') && tr.some((t) => t.getAttribute('type') === 'application/x-subrip'), `[${label}#0] podcast:transcript VTT + SRT`)
      check(get('podcast:chapters')?.getAttribute('type') === 'application/json+chapters', `[${label}#0] podcast:chapters JSON`)
      check(get('content:encoded').textContent.includes('<a href="https://forgedinthefireohio.org/get-help">'), `[${label}#0] show notes linkified in CDATA`)
      check(get('title').textContent.includes('"Home" <first steps>'), `[${label}#0] title escaping round-trips`)
      if (label === 'private') check(enc.getAttribute('url').includes('?token='), '[private#0] private enclosure carries token')
    } else {
      check(!get('itunes:episode'), `[${label}#1] trailer has no itunes:episode`)
      check(Array.from(item.children).some((n) => n.tagName === 'podcast:transcript' && n.getAttribute('type') === 'text/plain'), `[${label}#1] plain transcript → text/plain`)
    }
  })
  if (label === 'public') require('fs').writeFileSync(path.join(require('os').tmpdir(), 'fitf-sample-feed.xml'), xml)
}

{
  const { doc, err } = parse(`<x>${cdata('<p>raw ]]> html</p>')}</x>`)
  check(!err && doc.documentElement.textContent === '<p>raw ]]> html</p>', 'CDATA wrapper survives "]]>" in HTML show notes')
}
const cj = chaptersJson(episodes[0], meta.title)
check(cj.version === '1.2.0' && cj.chapters[1].startTime === 95 && cj.chapters[1].url, 'chapters.json follows JSON chapters 1.2.0')
check(parseCues(episodes[0].transcript).length === 2 && /00:00:04,000 --> 00:00:09,500/.test(cuesToSrt(parseCues(episodes[0].transcript))), 'VTT → SRT conversion')
check(showNotesHtml('a & b').startsWith('<p>a &amp; b'), 'show notes HTML escaping')

const blocked = releaseBlockers(releaseChecks({ ...episodes[0], file_size: null, audio_mime: 'audio/webm', episode_number: null }, { server: true, show: { cover_url: 'x.jpg' } }))
check(['audio_format', 'file_size', 'numbering'].every((id) => blocked.some((b) => b.id === id)), 'release gate blocks webm / missing size / missing episode number')
check(releaseBlockers(releaseChecks(episodes[0], { server: true, show: { cover_url: 'x.jpg' } })).length === 0, 'release gate passes a complete episode')
const loud = releaseChecks(episodes[0], { loudness: { lufs: -23, peakDb: -3, channels: 2 }, cover: { width: 3000, height: 3000 } })
check(loud.find((c) => c.id === 'loudness').level === 'block', 'loudness −23 LUFS stereo blocks (target −16)')
const mono = releaseChecks(episodes[0], { loudness: { lufs: -19.4, peakDb: -3, channels: 1 }, cover: { width: 1400, height: 1400 } })
check(mono.find((c) => c.id === 'loudness').level === 'ok' && mono.find((c) => c.id === 'cover').level === 'warn', 'mono −19 LUFS ok; 1400px art warns (3000 recommended)')

// Route handler smoke test (no Supabase env → defaults + empty feed) incl. conditional GET
;(async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  const { GET } = jiti(path.join(root, 'app/podcast/rss.xml/route.ts'))
  const res = await GET(new Request('https://forgedinthefireohio.org/podcast/rss.xml'))
  const body = await res.text()
  check(res.status === 200 && /application\/rss\+xml/.test(res.headers.get('content-type')), 'route: 200 application/rss+xml')
  check(!parse(body).err, 'route: empty-show feed is well-formed')
  const etag = res.headers.get('etag')
  check(!!etag && !!res.headers.get('last-modified') && /max-age=300/.test(res.headers.get('cache-control')), 'route: ETag + Last-Modified + Cache-Control')
  const again = await GET(new Request('https://forgedinthefireohio.org/podcast/rss.xml', { headers: { 'If-None-Match': etag } }))
  check(again.status === 304, 'route: If-None-Match → 304')
  const ims = await GET(new Request('https://forgedinthefireohio.org/podcast/rss.xml', { headers: { 'If-Modified-Since': res.headers.get('last-modified') } }))
  check(ims.status === 304, 'route: If-Modified-Since → 304')
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll RSS checks passed')
  process.exit(failures ? 1 : 0)
})()
