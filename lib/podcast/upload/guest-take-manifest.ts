/**
 * Chunked guest backups: shared constants, path/ref helpers and the manifest
 * shape the host editor uses to reassemble a take. Client-safe.
 *
 * Storage layout (private bucket podcast-guest-takes):
 *   guest-takes/<inviteId>/t-<takeId>/<000000>.<ext>   one object per chunk, 0-based, contiguous
 *
 * Chunks from ONE MediaRecorder concatenate into a valid file (WebM: EBML header
 * + clusters; MP4: init segment + fragments). WAV fallback chunks are plain byte
 * slices of one WAV file. So reassembly is: sort by index, concatenate bytes.
 *
 * The invite's take_url / camera_url point at a take with this ref:
 *   private://podcast-guest-takes/take/<inviteId>/<takeId>
 */

export const GUEST_TAKE_BUCKET_NAME = 'podcast-guest-takes'
/** Per slice object the booth produces (policy; the bucket itself allows 2 GB objects since 20260924000010). */
export const CHUNK_MAX_BYTES = 50 * 1024 * 1024
/** Per take (all chunks). */
export const TAKE_MAX_BYTES = 2 * 1024 * 1024 * 1024
/** MediaRecorder timeslice. */
export const CHUNK_TIMESLICE_MS = 10_000
/** Byte slice size for blob (WAV fallback / re-upload) chunking. */
export const BLOB_SLICE_BYTES = 8 * 1024 * 1024
/** 20 000 x 10 s = 55 h: far past any session, bounds signing abuse. */
export const MAX_CHUNK_INDEX = 20_000
/** Signed upload URLs minted per sign request. */
export const SIGN_BATCH_MAX = 12

export type GuestTakeKind = 'audio' | 'camera'

/** Base MIME (no codecs) -> extension. */
export const TAKE_AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}
export const TAKE_VIDEO_TYPES: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
}

export function baseMime(value: unknown) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
}

export function takeExt(kind: GuestTakeKind, mime: string) {
  return (kind === 'camera' ? TAKE_VIDEO_TYPES : TAKE_AUDIO_TYPES)[baseMime(mime)] || null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CHUNKED_REF = new RegExp(`^private://${GUEST_TAKE_BUCKET_NAME}/take/(${UUID})/(${UUID})$`)

export function chunkedTakeRef(inviteId: string, takeId: string) {
  return `private://${GUEST_TAKE_BUCKET_NAME}/take/${inviteId}/${takeId}`
}

export function parseChunkedTakeRef(ref: string | null | undefined) {
  const m = CHUNKED_REF.exec(String(ref || ''))
  return m ? { inviteId: m[1], takeId: m[2] } : null
}

export function takeFolder(inviteId: string, takeId: string) {
  return `guest-takes/${inviteId}/t-${takeId}`
}

export function chunkPath(inviteId: string, takeId: string, index: number, ext: string) {
  return `${takeFolder(inviteId, takeId)}/${String(index).padStart(6, '0')}.${ext}`
}

/** Parse "000123.webm" -> 123 (null for anything else). */
export function chunkIndexFromName(name: string, ext: string) {
  const m = /^(\d{6})\.([a-z0-9]{3,4})$/.exec(name)
  if (!m || m[2] !== ext) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n <= MAX_CHUNK_INDEX ? n : null
}

/** Indices below `expected` (or below the highest present index) that are absent. */
export function missingIndices(chunks: { index: number }[], expected?: number) {
  const have = new Set(chunks.map((c) => c.index))
  const top = expected ?? (chunks.length ? Math.max(...chunks.map((c) => c.index)) + 1 : 0)
  const missing: number[] = []
  for (let i = 0; i < top; i++) if (!have.has(i)) missing.push(i)
  return missing
}

export type Container = 'webm' | 'mp4' | 'ogg' | 'wav'

/** Check a container's magic bytes so a renamed HTML/SVG/script cannot pose as a take. */
export function sniffContainer(bytes: Uint8Array): Container | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm'
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'mp4'
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) {
    return 'wav'
  }
  return null
}

/** Container a file extension must sniff as. */
export function containerForExt(ext: string): Container {
  if (ext === 'webm') return 'webm'
  if (ext === 'ogg') return 'ogg'
  if (ext === 'wav') return 'wav'
  return 'mp4'
}

/** Slices at least this large go through TUS (resumable, 6 MB parts); smaller ones are one PUT each. */
export const TUS_MIN_BYTES = 6 * 1024 * 1024

export type GuestTakeChunk = { index: number; bytes: number; url: string }

/**
 * What GET /api/admin/podcast/invites/[id]/takes returns per take.
 * `chunks[].url` are 10-minute signed download URLs (Storage serves CORS).
 */
export type GuestTakeManifest = {
  takeId: string
  inviteId: string
  kind: GuestTakeKind
  mime: string
  ext: string
  status: 'recording' | 'complete' | 'abandoned'
  /** Place the first sample of the reassembled file at this host session time (s). Null if the host sent no clock. */
  startedAtSessionSec: number | null
  /** Raw alignment inputs (for re-deriving or debugging). */
  sessionSec: number | null
  hostAtMs: number | null
  guestStartHostMs: number | null
  clockRttMs: number | null
  durationSec: number | null
  chunkCount: number
  bytes: number
  /** Indices below the highest uploaded index that are absent (gaps). */
  missing: number[]
  createdAt: string
  completedAt: string | null
  ref: string
  chunks: GuestTakeChunk[]
}
