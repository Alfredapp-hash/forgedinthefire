/**
 * Host/editor side: load a guest backup take regardless of how it was uploaded.
 *
 *   const { blob, manifest } = await fetchGuestTakeBlob(invite.takeUrl)
 *   const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
 *   place buffer at manifest?.startedAtSessionSec ?? punchIn
 *
 * - Chunked refs (private://podcast-guest-takes/take/<invite>/<take>) are
 *   reassembled here: GET the manifest, download chunks in parallel, concatenate
 *   in index order (valid for WebM/MP4 fragments from one MediaRecorder and for
 *   WAV byte slices).
 * - Anything else (legacy single-object refs, storage URLs) goes through
 *   /api/admin/media/file, which 302s to a short-lived signed URL.
 */

import {
  parseChunkedTakeRef,
  type GuestTakeManifest,
} from '@/lib/podcast/upload/guest-take-manifest'

export type { GuestTakeManifest }

export async function listGuestTakes(inviteId: string, takeId?: string): Promise<GuestTakeManifest[]> {
  const qs = takeId ? `?take=${encodeURIComponent(takeId)}` : ''
  const res = await fetch(`/api/admin/podcast/invites/${inviteId}/takes${qs}`, { cache: 'no-store' })
  const data = (await res.json().catch(() => ({}))) as { takes?: GuestTakeManifest[]; error?: string }
  if (!res.ok) throw new Error(data.error || 'Could not load guest takes')
  return data.takes || []
}

async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 4) {
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal })
      if (res.ok) return await res.blob()
      lastErr = new Error(`HTTP ${res.status}`)
      if (res.status === 400 || res.status === 403 || res.status === 404) break
    } catch (err) {
      if (signal?.aborted) throw err
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i))
  }
  throw lastErr instanceof Error ? lastErr : new Error('Chunk download failed')
}

/** Download + concatenate a chunked take from its manifest. Missing chunks are skipped (reported in manifest.missing). */
export async function assembleGuestTake(
  manifest: GuestTakeManifest,
  opts: { concurrency?: number; signal?: AbortSignal; onProgress?: (doneBytes: number, totalBytes: number) => void } = {},
) {
  const chunks = [...manifest.chunks].sort((a, b) => a.index - b.index)
  const parts: Blob[] = new Array(chunks.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++
      parts[i] = await fetchWithRetry(chunks[i].url, opts.signal)
      done += parts[i].size
      opts.onProgress?.(done, manifest.bytes)
    }
  }
  const n = Math.max(1, Math.min(opts.concurrency ?? 4, chunks.length))
  await Promise.all(Array.from({ length: n }, worker))
  return new Blob(parts, { type: manifest.mime })
}

export async function fetchGuestTakeBlob(
  ref: string,
  opts: { concurrency?: number; signal?: AbortSignal; onProgress?: (doneBytes: number, totalBytes: number) => void } = {},
): Promise<{ blob: Blob; manifest: GuestTakeManifest | null }> {
  const chunked = parseChunkedTakeRef(ref)
  if (chunked) {
    const [manifest] = await listGuestTakes(chunked.inviteId, chunked.takeId)
    if (!manifest) throw new Error('Guest take not found')
    if (!manifest.chunks.length) throw new Error('The guest take has no data yet')
    const blob = await assembleGuestTake(manifest, opts)
    return { blob, manifest }
  }
  const res = await fetch(`/api/admin/media/file?url=${encodeURIComponent(ref)}`, { cache: 'no-store', signal: opts.signal })
  if (!res.ok) throw new Error('Could not load the guest take')
  return { blob: await res.blob(), manifest: null }
}
