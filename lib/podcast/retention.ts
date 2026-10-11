import 'server-only'

import { parseStorageObject } from '@/lib/podcast/safety/audio-hash'
import { createServiceClient } from '@/lib/supabase/service'
import { PRIVATE_MEDIA_BUCKET, parsePrivateMediaRef } from '@/lib/podcast/enterprise'

type Target = {
  kind: string
  object_bucket: string | null
  object_name: string | null
  episode_id: string | null
  media_url: string | null
}

/**
 * Delete guest backup objects 14 days after the invite expired or was revoked,
 * and delete the previous (possibly unredacted) mix 14 days after publish.
 * Bounded so the hourly cron stays short.
 */
export async function runPodcastRetention() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('podcast_retention_targets')
  if (error) {
    console.error('[podcast-retention]', error.message)
    return { guestTakes: 0, previousAudio: 0, note: error.message }
  }
  const targets = (data || []) as Target[]
  const guestPaths = targets
    .filter((row) => row.kind === 'guest_take' && row.object_name)
    .map((row) => row.object_name as string)
  let guestTakes = 0
  if (guestPaths.length) {
    const { data: removed, error: removeError } = await supabase.storage.from('podcast-guest-takes').remove(guestPaths)
    if (removeError) console.error('[podcast-retention] guest takes', removeError.message)
    else {
      guestTakes = removed?.length || guestPaths.length
      const inviteIds = [...new Set(guestPaths.map((path) => path.split('/')[1]).filter(Boolean))]
      if (inviteIds.length) {
        await supabase.from('podcast_guest_takes').delete().in('invite_id', inviteIds)
      }
    }
  }

  let previousAudio = 0
  for (const row of targets.filter((item) => item.kind === 'previous_audio' && item.episode_id && item.media_url)) {
    const url = row.media_url as string
    const stored = parseStorageObject(url)
    const privatePath = parsePrivateMediaRef(url)
    const bucket = stored?.bucket || (privatePath ? PRIVATE_MEDIA_BUCKET : null)
    const path = stored?.path || privatePath
    if (bucket && path) {
      const { error: removeError } = await supabase.storage.from(bucket).remove([path])
      if (removeError) {
        console.error('[podcast-retention] previous audio', removeError.message)
        continue
      }
    }
    const { error: clearError } = await supabase
      .from('podcast_episodes')
      .update({ audio_url_previous: null })
      .eq('id', row.episode_id)
      .eq('audio_url_previous', url)
    if (!clearError) previousAudio += 1
  }
  return { guestTakes, previousAudio, note: null as string | null }
}
