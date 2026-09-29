import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { LiveProviderKind, LiveProviderStatus } from '@/lib/podcast/live/types'

/** Read env from Netlify Functions (Netlify.env) first, then process.env. */
export function readLiveEnv(name: string): string | undefined {
  try {
    const fromNetlify = (
      globalThis as { Netlify?: { env?: { get?: (key: string) => string | undefined } } }
    ).Netlify?.env?.get?.(name)
    if (fromNetlify) return fromNetlify
  } catch {
    /* Netlify.env only exists inside Functions */
  }
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

export function whipEndpoint(): URL | null {
  const raw = readLiveEnv('LIVE_WHIP_URL')
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url
  } catch {
    return null
  }
}

export function whipBearer() {
  return readLiveEnv('LIVE_WHIP_BEARER') || null
}

function guessProvider(url: URL): LiveProviderKind {
  const host = url.hostname
  if (host.endsWith('cloudflarestream.com') || host.endsWith('cloudflare.com')) return 'cloudflare'
  if (host.includes('livekit')) return 'livekit'
  if (url.pathname.endsWith('/whip') || url.port === '8889') return 'mediamtx'
  return 'other'
}

export function liveProviderStatus(): LiveProviderStatus {
  const url = whipEndpoint()
  return {
    configured: Boolean(url),
    provider: url ? guessProvider(url) : null,
    host: url ? url.host : null,
    bearer: Boolean(whipBearer()),
    defaultHlsUrl: readLiveEnv('LIVE_PLAYBACK_HLS_URL') || null,
    defaultWhepUrl: readLiveEnv('LIVE_PLAYBACK_WHEP_URL') || null,
  }
}

/**
 * The WHIP resource URL (RFC 9725 Location) can itself carry the provider secret
 * (Cloudflare puts the live-input key in the path). We hand the browser an
 * AES-GCM sealed token instead, and only unseal it server-side for PATCH/DELETE.
 */
function sealKey() {
  const material =
    readLiveEnv('LIVE_WHIP_SEAL_SECRET') ||
    readLiveEnv('SUPABASE_SERVICE_ROLE_KEY') ||
    `${readLiveEnv('LIVE_WHIP_URL') || ''}|${readLiveEnv('LIVE_WHIP_BEARER') || ''}`
  return createHash('sha256').update(`fitf-live-whip:${material}`).digest()
}

export function sealResource(resourceUrl: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv)
  const body = Buffer.concat([cipher.update(resourceUrl, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function unsealResource(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Resolve a Location header against the WHIP endpoint and refuse anything off-origin (SSRF guard). */
export function resolveResource(location: string, endpoint: URL): string | null {
  try {
    const url = new URL(location, endpoint)
    if (url.origin !== endpoint.origin) return null
    return url.toString()
  } catch {
    return null
  }
}

export function whipHeaders(contentType?: string): HeadersInit {
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType
  const bearer = whipBearer()
  // A full scheme ("Basic …" for MediaMTX internal users) is passed through as-is.
  if (bearer) headers.Authorization = /^(bearer|basic)\s/i.test(bearer) ? bearer : `Bearer ${bearer}`
  return headers
}
