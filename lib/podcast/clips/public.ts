/**
 * Public read of saved share clips for a released episode. Goes through the
 * `podcast_public_clips` view (20260925000002_podcast_clips.sql), which only exposes clips of
 * published public/unlisted episodes — the underlying table stays admin-only.
 */
import { podcastReadClient } from '@/lib/podcast'
import { isSafeHttpUrl } from '@/lib/podcast'
import type { ClipAspect, EpisodeClip } from './types'

export async function getPublicEpisodeClips(episodeId: string): Promise<EpisodeClip[]> {
  const supabase = podcastReadClient()
  if (!supabase || !episodeId) return []
  const { data, error } = await supabase
    .from('podcast_public_clips')
    .select('id, episode_id, title, start_sec, end_sec, aspect, url, poster_url, created_at')
    .eq('episode_id', episodeId)
    .order('created_at', { ascending: false })
    .limit(12)
  // A database that predates the migration simply has no clips.
  if (error || !data) return []
  return (data as Record<string, unknown>[])
    .filter((row) => isSafeHttpUrl(row.url))
    .map((row) => ({
      id: String(row.id),
      episode_id: String(row.episode_id),
      title: String(row.title ?? ''),
      start_sec: Number(row.start_sec),
      end_sec: Number(row.end_sec),
      aspect: row.aspect as ClipAspect,
      url: String(row.url),
      poster_url: isSafeHttpUrl(row.poster_url) ? String(row.poster_url) : null,
      created_at: String(row.created_at),
    }))
}
