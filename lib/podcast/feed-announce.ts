import { PODCAST } from '@/lib/podcast-meta'

/** Fields that decide whether a public directory should be told the feed changed. */
export type FeedSnapshot = {
  status?: string | null
  visibility?: string | null
  audio_url?: string | null
  video_url?: string | null
}

/**
 * Public feeds to ping after a save. A private or unlisted episode stays off the
 * public RSS, so it does not announce. A title-only edit of an already public
 * episode does not either. A new public release, or a replaced enclosure, does.
 */
export function feedsToAnnounce(before: FeedSnapshot | null, after: FeedSnapshot): string[] {
  if (after.status !== 'published' || after.visibility !== 'public') return []
  const wasPublic = before?.status === 'published' && before.visibility === 'public'
  const feeds: string[] = []
  const audio = after.audio_url || null
  const video = after.video_url || null
  if (audio && (!wasPublic || audio !== (before?.audio_url || null))) feeds.push(PODCAST.feed)
  if (video && (!wasPublic || video !== (before?.video_url || null))) {
    feeds.push(`${PODCAST.site}/podcast/video.xml`)
  }
  return feeds
}
