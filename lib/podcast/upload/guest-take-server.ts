import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TusConfig } from '@/lib/podcast/media-upload'
import {
  GUEST_TAKE_BUCKET_NAME,
  chunkIndexFromName,
  chunkedTakeRef,
  containerForExt,
  missingIndices,
  sniffContainer,
  takeFolder,
  type GuestTakeKind,
  type GuestTakeManifest,
} from '@/lib/podcast/upload/guest-take-manifest'

export { containerForExt, missingIndices, sniffContainer }

export type GuestTakeRow = {
  id: string
  invite_id: string
  episode_id: string
  kind: GuestTakeKind
  mime: string
  ext: string
  status: 'recording' | 'complete' | 'abandoned'
  session_sec: number | null
  host_at_ms: number | null
  started_at_session_sec: number | null
  guest_start_host_ms: number | null
  clock_rtt_ms: number | null
  duration_sec: number | null
  chunk_count: number
  bytes: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type StoredChunk = { index: number; bytes: number; mime: string; name: string }

/** tus-js-client chunk size: Supabase's resumable endpoint requires exactly 6 MB parts. */
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024

/**
 * Where the booth sends resumable (TUS) uploads. Only the anon key travels to
 * the browser (it is public); authorization is the per-object signed token
 * minted by createSignedUploadUrl and sent as `x-signature`.
 */
export function tusConfig(): TusConfig {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const override = process.env.SUPABASE_STORAGE_TUS_URL
  return {
    endpoint: override || `${base}/storage/v1/upload/resumable`,
    bucket: GUEST_TAKE_BUCKET_NAME,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    chunkSize: TUS_CHUNK_SIZE,
  }
}

/** List the chunk objects of a take (paged; storage.list caps at 1000 per call). */
export async function listTakeChunks(supabase: SupabaseClient, take: Pick<GuestTakeRow, 'invite_id' | 'id' | 'ext'>) {
  const dir = takeFolder(take.invite_id, take.id)
  const out: StoredChunk[] = []
  for (let offset = 0; offset < 25_000; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(GUEST_TAKE_BUCKET_NAME)
      .list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    const page = data || []
    for (const obj of page) {
      const index = chunkIndexFromName(obj.name, take.ext)
      if (index == null) continue
      const meta = (obj.metadata || {}) as { size?: number; mimetype?: string }
      out.push({ index, bytes: Number(meta.size || 0), mime: String(meta.mimetype || ''), name: obj.name })
    }
    if (page.length < 1000) break
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

/** Read the first 16 bytes of an object via a 60 s signed URL. */
export async function sniffObject(supabase: SupabaseClient, path: string) {
  const { data } = await supabase.storage.from(GUEST_TAKE_BUCKET_NAME).createSignedUrl(path, 60)
  if (!data?.signedUrl) return null
  const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-15' }, redirect: 'error', cache: 'no-store' })
  if (!res.ok) return null
  return sniffContainer(new Uint8Array(await res.arrayBuffer()).slice(0, 16))
}

export async function loadTake(supabase: SupabaseClient, takeId: string) {
  const { data, error } = await supabase.from('podcast_guest_takes').select('*').eq('id', takeId).maybeSingle()
  if (error) throw error
  return (data as GuestTakeRow | null) || null
}

/** Build the manifest the editor reassembles from, with fresh signed chunk URLs. */
export async function buildTakeManifest(
  supabase: SupabaseClient,
  take: GuestTakeRow,
  signSeconds = 600,
): Promise<GuestTakeManifest> {
  const chunks = await listTakeChunks(supabase, take)
  const dir = takeFolder(take.invite_id, take.id)
  const paths = chunks.map((c) => `${dir}/${c.name}`)
  const urls = new Map<string, string>()
  for (let i = 0; i < paths.length; i += 500) {
    const slice = paths.slice(i, i + 500)
    const { data, error } = await supabase.storage.from(GUEST_TAKE_BUCKET_NAME).createSignedUrls(slice, signSeconds)
    if (error) throw error
    for (const item of data || []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
    }
  }
  const expected = take.status === 'complete' ? take.chunk_count : undefined
  return {
    takeId: take.id,
    inviteId: take.invite_id,
    kind: take.kind,
    mime: take.mime,
    ext: take.ext,
    status: take.status,
    startedAtSessionSec: take.started_at_session_sec ?? take.session_sec ?? null,
    sessionSec: take.session_sec,
    hostAtMs: take.host_at_ms == null ? null : Number(take.host_at_ms),
    guestStartHostMs: take.guest_start_host_ms == null ? null : Number(take.guest_start_host_ms),
    clockRttMs: take.clock_rtt_ms,
    durationSec: take.duration_sec,
    chunkCount: chunks.length,
    bytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
    missing: missingIndices(chunks, expected),
    createdAt: take.created_at,
    completedAt: take.completed_at,
    ref: chunkedTakeRef(take.invite_id, take.id),
    chunks: chunks
      .map((c) => ({ index: c.index, bytes: c.bytes, url: urls.get(`${dir}/${c.name}`) || '' }))
      .filter((c) => c.url),
  }
}
