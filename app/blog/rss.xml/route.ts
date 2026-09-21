import { NextResponse } from 'next/server'
import { getBlogPosts } from '@/src/lib/blog'

export const dynamic = 'force-dynamic'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Public blog RSS — Ghost/Substack parity for readers and newsletter tools. */
export async function GET() {
  const site = 'https://forgedinthefireohio.org'
  const posts = await getBlogPosts({ limit: 50 })
  const items = posts
    .map((post) => {
      const link = `${site}/blog/${post.slug}`
      const pub = post.publishedAt || post.createdAt
      const pubDate = pub ? new Date(pub).toUTCString() : new Date().toUTCString()
      const description = post.excerpt || post.seo?.description || post.title
      const image = post.featuredImage?.url
        ? `<enclosure url="${escapeXml(post.featuredImage.url)}" type="image/jpeg" length="0" />`
        : ''
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      ${image}
      <category>${escapeXml(post.category || 'news')}</category>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Forged in the Fire Blog</title>
    <link>${site}/blog</link>
    <description>Survivor-centered advocacy updates from Forged in the Fire — Lorain County, Ohio. Dignity first.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${site}/blog/rss.xml" rel="self" type="application/rss+xml" />
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
