import type { SupabaseClient } from '@supabase/supabase-js'

const KEEP = 25

export async function snapshotContent(
  supabase: SupabaseClient,
  contentId: string,
  snapshot: Record<string, unknown>,
  createdBy?: string | null,
) {
  const { error } = await supabase.from('content_revisions').insert({
    content_id: contentId,
    snapshot,
    created_by: createdBy || null,
  })
  if (error) {
    console.warn('content revision snapshot skipped:', error.message)
    return
  }
  await trim(supabase, 'content_revisions', 'content_id', contentId)
}

export async function snapshotEpisode(
  supabase: SupabaseClient,
  episodeId: string,
  snapshot: Record<string, unknown>,
  createdBy?: string | null,
) {
  const { error } = await supabase.from('podcast_episode_revisions').insert({
    episode_id: episodeId,
    snapshot,
    created_by: createdBy || null,
  })
  if (error) {
    console.warn('episode revision snapshot skipped:', error.message)
    return
  }
  await trim(supabase, 'podcast_episode_revisions', 'episode_id', episodeId)
}

async function trim(
  supabase: SupabaseClient,
  table: 'content_revisions' | 'podcast_episode_revisions',
  fk: string,
  id: string,
) {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq(fk, id)
    .order('created_at', { ascending: false })
    .range(KEEP, KEEP + 50)
  const extra = (data ?? []).map((r) => r.id)
  if (extra.length) await supabase.from(table).delete().in('id', extra)
}
