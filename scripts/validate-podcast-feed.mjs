#!/usr/bin/env node
/**
 * Validate the live public podcast RSS (Apple-shaped checks).
 * Soft by default: 0 items or fetch errors warn and exit 0.
 * Strict: FEED_VALIDATE_STRICT=1 or --strict fails on warnings.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://forgedinthefireohio.org'
const FEED = `${SITE.replace(/\/$/, '')}/podcast/rss.xml`
const strict = process.argv.includes('--strict') || process.env.FEED_VALIDATE_STRICT === '1'

function fail(msg) {
  console.error(`FEED INVALID: ${msg}`)
  process.exit(1)
}
function warn(msg) {
  console.warn(`FEED WARN: ${msg}`)
  if (strict) fail(msg)
}

async function main() {
  let xml
  try {
    const res = await fetch(FEED, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } })
    if (!res.ok) {
      warn(`${FEED} returned ${res.status}`)
      return
    }
    xml = await res.text()
  } catch (err) {
    warn(`Could not fetch ${FEED}: ${err instanceof Error ? err.message : err}`)
    return
  }

  if (!xml.includes('<rss') || !xml.includes('<channel>')) fail('Not a valid RSS channel')
  if (!xml.includes('xmlns:itunes=')) fail('Missing iTunes namespace')
  if (!xml.includes('<itunes:author>')) fail('Missing itunes:author')
  if (!xml.includes('<itunes:image') && !xml.includes('<image>')) warn('Missing channel artwork')
  if (!xml.includes('<atom:link') || !xml.includes('rel="self"')) warn('Missing atom:link rel=self')

  const items = xml.match(/<item>/g)?.length || 0
  if (items === 0) {
    warn('Feed has zero items — publish a pilot episode before Apple/Spotify submit')
  }

  const enclosures = [...xml.matchAll(/<enclosure url="([^"]+)" length="(\d+)" type="([^"]+)"/g)]
  for (const [, url, length, type] of enclosures) {
    if (!Number(length)) warn(`Enclosure length is 0 for ${url}`)
    if (!type.startsWith('audio/')) warn(`Enclosure type ${type} is not audio/*`)
    try {
      const head = await fetch(url, { method: 'HEAD' })
      const acceptRanges = head.headers.get('accept-ranges') || ''
      if (!head.ok) warn(`HEAD ${url} → ${head.status}`)
      else if (!/bytes/i.test(acceptRanges) && head.status !== 206) {
        const range = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1' } })
        if (range.status !== 206) warn(`Byte-range not supported for ${url} (got ${range.status})`)
      }
    } catch (err) {
      warn(`HEAD/Range check failed for ${url}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (xml.includes('isPermaLink="true"') && xml.includes('<guid isPermaLink="true">')) {
    warn('GUID is permalink=true — Apple prefers a stable non-URL GUID')
  }

  console.log(`Feed OK: ${FEED} (${items} item${items === 1 ? '' : 's'})`)
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
