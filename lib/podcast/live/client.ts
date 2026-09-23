/** Browser fetch helpers for the live control room and the public player. */

import type {
  LiveProviderStatus,
  LivePublicPayload,
  LiveSessionRow,
} from '@/lib/podcast/live/types'
import { uploadPodcastMedia } from '@/lib/podcast/media-upload'
import { extensionFor } from '@/lib/podcast/live/recorder'

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const BASE = '/api/admin/podcast/live'

export async function fetchLiveProvider() {
  return readJson<LiveProviderStatus>(await fetch(`${BASE}/whip`, { cache: 'no-store' }))
}

export async function listLiveSessions() {
  return readJson<{ sessions: LiveSessionRow[] }>(await fetch(BASE, { cache: 'no-store' }))
}

export type LiveSessionInput = Partial<
  Pick<
    LiveSessionRow,
    'title' | 'description' | 'scheduled_for' | 'episode_id' | 'playback_hls_url' | 'playback_whep_url'
  >
>

export async function createLiveSession(input: LiveSessionInput) {
  return readJson<{ session: LiveSessionRow }>(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function patchLiveSession(
  id: string,
  input: LiveSessionInput & { action?: 'start' | 'end' | 'heartbeat' | 'reschedule' },
) {
  return readJson<{ session: LiveSessionRow }>(
    await fetch(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function deleteLiveSession(id: string) {
  return readJson<{ success: true }>(await fetch(`${BASE}/${id}`, { method: 'DELETE' }))
}

export async function fetchPublicLive() {
  return readJson<LivePublicPayload>(await fetch('/api/podcast/live', { cache: 'no-store' }))
}

type EpisodeLite = { id: string; title: string }

/** Create a draft episode through the normal studio API (same pipeline as pre-records). */
export async function createDraftEpisode(title: string, summary?: string | null) {
  return readJson<EpisodeLite>(
    await fetch('/api/admin/studio/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary: summary || undefined, status: 'draft' }),
    }),
  )
}

/**
 * Live → on-demand: upload the Program audio and attach it to a draft episode
 * (creating one if the session has none), then link the session to it.
 */
export async function saveLiveAsEpisodeDraft(opts: {
  session: LiveSessionRow
  audio: Blob
  durationSec: number
}) {
  const { session, audio, durationSec } = opts
  const stamp = new Date(session.started_at || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const file = new File([audio], `live-${stamp}.${extensionFor(audio)}`, { type: audio.type || 'audio/webm' })
  const asset = await uploadPodcastMedia(file, `${session.title} (live recording)`)
  let episodeId = session.episode_id
  if (!episodeId) {
    const created = await createDraftEpisode(session.title, session.description)
    episodeId = created.id
  }
  await readJson<EpisodeLite>(
    await fetch('/api/admin/studio/episodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: episodeId,
        audio_url: asset.url,
        audio_mime: asset.mime_type || file.type,
        file_size: asset.size_bytes || file.size,
        duration_seconds: durationSec || null,
      }),
    }),
  )
  const { session: updated } = await patchLiveSession(session.id, { episode_id: episodeId })
  return { episodeId, session: updated, audioUrl: asset.url }
}
