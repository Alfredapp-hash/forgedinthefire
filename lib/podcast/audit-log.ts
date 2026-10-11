import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

export type PodcastAuditEntry = {
  actorEmail?: string | null
  action: string
  episodeId?: string | null
  summary: string
  detail?: Record<string, unknown>
}

/** Append-only. A failed write is logged and does not block the studio action. */
export async function recordPodcastAudit(entry: PodcastAuditEntry) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('podcast_audit_log').insert({
      actor_email: entry.actorEmail || null,
      action: entry.action.slice(0, 80),
      episode_id: entry.episodeId || null,
      summary: entry.summary.slice(0, 500),
      detail: entry.detail || {},
    })
    if (error) console.error('[podcast-audit]', error.message)
  } catch (err) {
    console.error('[podcast-audit]', err instanceof Error ? err.message : err)
  }
}
