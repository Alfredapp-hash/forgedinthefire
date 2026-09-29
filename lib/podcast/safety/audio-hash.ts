/**
 * Server-side SHA-256 of a hosted audio file, so a guest's approval is pinned to the exact
 * bytes they heard — not to whatever the browser claims. Streams (never buffers the file),
 * caps size and time, and returns null rather than failing the sign-off when the host is slow.
 * Node only (node:crypto).
 */
import { createHash } from 'node:crypto'
/** Largest hosted file we will fingerprint (podcast media cap). */
export const MEDIA_MAX_BYTES = 512 * 1024 * 1024

export type HashResult = { sha256: string; bytes: number }

export function isProjectStorageUrl(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || !parsed.pathname.startsWith('/storage/v1/object/')) return false
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (base) {
    try {
      return parsed.hostname === new URL(base).hostname
    } catch {
      return false
    }
  }
  return parsed.hostname.endsWith('.supabase.co')
}

/** /storage/v1/object/{public|authenticated|sign}/<bucket>/<path> → { bucket, path } */
export function parseStorageObject(url: string): { bucket: string; path: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const m = /^\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/.exec(parsed.pathname)
  if (!m) return null
  try {
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) }
  } catch {
    return null
  }
}

export async function hashRemoteAudio(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<HashResult | null> {
  if (!isProjectStorageUrl(url)) return null
  const timeoutMs = opts.timeoutMs ?? 20_000
  const maxBytes = opts.maxBytes ?? MEDIA_MAX_BYTES
  const doFetch = opts.fetchImpl ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await doFetch(url, { cache: 'no-store', redirect: 'follow', signal: ctrl.signal })
    if (!res.ok || !res.body) return null
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > maxBytes) return null
    const hash = createHash('sha256')
    const reader = res.body.getReader()
    let bytes = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      hash.update(value)
    }
    if (!bytes) return null
    return { sha256: hash.digest('hex'), bytes }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
