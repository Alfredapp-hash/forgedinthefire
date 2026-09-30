/**
 * Browser helpers for saving a rendered share clip: upload the video + poster to site media,
 * then record the clip on the episode via /api/admin/podcast/clips.
 */
import type { UploadedAsset } from '@/lib/podcast/media-upload'
import type { ClipAspect, ClipRange, EpisodeClip } from './types'

/** Multipart route body limit; larger files go straight to storage with a signed PUT. */
const DIRECT_MAX = 4 * 1024 * 1024

async function readJson(res: Response) {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

/** Same signed-PUT flow the audio uploader uses, but for any media type (video/PNG). */
export async function uploadClipFile(file: File, alt: string): Promise<UploadedAsset> {
  if (file.size <= DIRECT_MAX) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('alt', alt)
    return (await readJson(await fetch('/api/admin/media', { method: 'POST', body: fd }))) as unknown as UploadedAsset
  }
  const signed = await readJson(
    await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, mime_type: file.type, size_bytes: file.size }),
    }),
  )
  const put = await fetch(String(signed.signedUrl), { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!put.ok) throw new Error('Direct storage upload failed')
  return (await readJson(
    await fetch('/api/admin/media/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: signed.path,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        alt,
        publicUrl: signed.publicUrl,
      }),
    }),
  )) as unknown as UploadedAsset
}

export type ClipsResponse = { available: boolean; clips: EpisodeClip[]; migration?: string }

export async function listEpisodeClips(episodeId: string): Promise<ClipsResponse> {
  const res = await fetch(`/api/admin/podcast/clips?episode=${encodeURIComponent(episodeId)}`, { cache: 'no-store' })
  return (await readJson(res)) as unknown as ClipsResponse
}

export async function saveEpisodeClip(input: {
  episodeId: string
  title: string
  range: ClipRange
  aspect: ClipAspect
  video: Blob
  ext: 'mp4' | 'webm'
  poster: Blob
  onStage?: (label: string) => void
}): Promise<EpisodeClip> {
  const base = `${input.title || 'clip'}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'clip'
  const stamp = `${Math.round(input.range.startSec)}-${Math.round(input.range.endSec)}`
  input.onStage?.('Uploading clip video…')
  const video = await uploadClipFile(
    new File([input.video], `${base}-${stamp}.${input.ext}`, { type: input.video.type || (input.ext === 'mp4' ? 'video/mp4' : 'video/webm') }),
    `${input.title} — share clip`,
  )
  input.onStage?.('Uploading poster…')
  let poster: UploadedAsset | null = null
  try {
    poster = await uploadClipFile(new File([input.poster], `${base}-${stamp}.png`, { type: 'image/png' }), `${input.title} — clip poster`)
  } catch {
    poster = null
  }
  input.onStage?.('Saving to episode…')
  const res = await fetch('/api/admin/podcast/clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episode_id: input.episodeId,
      title: input.title,
      start_sec: input.range.startSec,
      end_sec: input.range.endSec,
      aspect: input.aspect,
      url: video.url,
      poster_url: poster?.url ?? null,
    }),
  })
  return (await readJson(res)) as unknown as EpisodeClip
}

export async function deleteEpisodeClip(id: string) {
  await readJson(await fetch(`/api/admin/podcast/clips?id=${encodeURIComponent(id)}`, { method: 'DELETE' }))
}
