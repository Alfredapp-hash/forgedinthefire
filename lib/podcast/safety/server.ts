/** Server-only helpers shared by the /api/admin/podcast/safety routes. */

export const SAFETY_TABLE = 'podcast_episode_safety'
export const SAFETY_MIGRATION = '20260924000002_podcast_ai_safety.sql'

/** True when the safety table is missing (migration not applied): routes degrade instead of 500ing. */
export function missingSafetyTable(err: unknown) {
  const e = err as { code?: string; message?: string } | null
  return Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /podcast_episode_safety/.test(e.message || '')))
}
