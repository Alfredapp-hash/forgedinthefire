import { getDefaultShow, getPublishedEpisodes, showToMeta } from '@/lib/podcast'
import { buildFeedXml, feedLastModified, feedResponse } from '@/lib/podcast-rss'

export const dynamic = 'force-dynamic'

/** Video version of the show feed — only episodes that have a video file. */
export async function GET(request: Request) {
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const episodes = (await getPublishedEpisodes()).filter((ep) => ep.video_url)
  const xml = buildFeedXml({ meta, episodes, media: 'video', webSubHub: process.env.WEBSUB_HUB || null })
  return feedResponse(
    request,
    xml,
    feedLastModified(meta, episodes),
    'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
  )
}
