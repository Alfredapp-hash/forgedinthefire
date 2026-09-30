import { NextResponse } from 'next/server'
import {
  getDefaultShow,
  getPublishedEpisodes,
  podcastServiceClient,
  showToMeta,
  verifySubscriberToken,
} from '@/lib/podcast'
import { buildFeedXml, feedLastModified, feedResponse } from '@/lib/podcast-rss'

export const dynamic = 'force-dynamic'

/** Per-subscriber private feed: public + unlisted + private released episodes. */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const sub = await verifySubscriberToken(token)
  const supabase = podcastServiceClient()
  if (!sub || !supabase) {
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const episodes = await getPublishedEpisodes({ includePrivate: true, includeUnlisted: true })
  const xml = buildFeedXml({ meta, episodes, privateToken: token, privateLabel: sub.email })

  // Access tracking must never break feed delivery.
  const now = new Date().toISOString()
  await Promise.allSettled([
    supabase.from('podcast_subscribers').update({ last_access_at: now }).eq('id', sub.id),
    supabase.from('podcast_analytics_events').insert({
      show_id: sub.show_id,
      event_type: 'private_access',
      listener_hash: sub.id.replace(/-/g, '').slice(0, 16),
      user_agent: (request.headers.get('user-agent') || '').slice(0, 500) || null,
      app_name: 'Private RSS',
    }),
  ])

  const res = feedResponse(request, xml, feedLastModified(meta, episodes), 'private, max-age=0, must-revalidate')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}
