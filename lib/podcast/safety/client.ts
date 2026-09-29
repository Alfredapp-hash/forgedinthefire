/** Browser side of /api/admin/podcast/safety/[episodeId]. */
import type { PodcastEpisode } from '@/lib/studio/types'
import { cleanSafetyRecord, type ApprovalMethod, type SafetyRecord } from './record'

export type SafetyResponse = { available: boolean; record: SafetyRecord | null; episode?: PodcastEpisode }

export type SafetyPatch = Partial<Pick<SafetyRecord, 'protected_terms' | 'term_decisions' | 'filler_decisions' | 'plan'>> & {
  guest_final_cut?: { approved: true; on: string; method: ApprovalMethod; note?: string } | { approved: false }
  transcript_reviewed?: boolean
  protected_words_reviewed?: boolean
}

async function parse(res: Response, episodeId: string): Promise<SafetyResponse> {
  const data = (await res.json().catch(() => null)) as (Partial<SafetyResponse> & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error || `Safety request failed (${res.status})`)
  return {
    available: Boolean(data?.available),
    record: data?.record ? cleanSafetyRecord(episodeId, data.record) : null,
    episode: data?.episode,
  }
}

export async function loadSafetyRecord(episodeId: string): Promise<SafetyResponse> {
  const res = await fetch(`/api/admin/podcast/safety/${episodeId}`, { cache: 'no-store' })
  return parse(res, episodeId)
}

export async function patchSafety(episodeId: string, patch: SafetyPatch): Promise<SafetyResponse> {
  const res = await fetch(`/api/admin/podcast/safety/${episodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return parse(res, episodeId)
}

export type DeletePreviousResult = { deleted: boolean; reason?: 'nothing_to_delete' | 'still_in_use' | 'not_project_storage'; episode?: PodcastEpisode }

/** Permanently delete the replaced original upload (audio_url_previous) and forget the revert. */
export async function deletePreviousAudio(episodeId: string): Promise<DeletePreviousResult> {
  const res = await fetch(`/api/admin/podcast/safety/${episodeId}/previous-audio`, { method: 'DELETE' })
  const data = (await res.json().catch(() => null)) as (DeletePreviousResult & { error?: string }) | null
  if (!res.ok) throw new Error(data?.error || `Could not delete the previous audio (${res.status})`)
  return data ?? { deleted: false }
}
