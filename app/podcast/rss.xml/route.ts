import { getDefaultShow, getPublishedEpisodes, showToMeta } from '@/lib/podcast'
import { buildFeedXml, feedLastModified, feedResponse } from '@/lib/podcast-rss'

export const dynamic = 'force-dynamic'

/** Public show feed: published + public episodes whose release time has passed. */
export async function GET(request: Request) {
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const episodes = await getPublishedEpisodes()
  const xml = buildFeedXml({ meta, episodes })
  return feedResponse(
    request,
    xml,
    feedLastModified(meta, episodes),
    'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
  )
}
