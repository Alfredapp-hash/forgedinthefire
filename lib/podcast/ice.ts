/** Server-side ICE list. TURN credentials stay in env — never hardcode them. */

import { createHmac } from 'crypto'
import { STUN_SERVERS } from '@/lib/podcast/webrtc'

export type StudioIceConfig = {
  iceServers: RTCIceServer[]
  turnConfigured: boolean
}

function readEnv(name: string) {
  try {
    const fromNetlify = (
      globalThis as { Netlify?: { env?: { get?: (key: string) => string | undefined } } }
    ).Netlify?.env?.get?.(name)
    if (fromNetlify) return fromNetlify
  } catch {
    /* Netlify.env is only in Functions */
  }
  return process.env[name]
}

function turnUrls(raw: string) {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((url) => (url.startsWith('turn:') || url.startsWith('turns:') ? url : `turn:${url}`))
}

/** Short-lived TURN credential lifetime (seconds). Default 2h, clamped 10 min - 12h. */
function turnTtl() {
  const n = Number(readEnv('TURN_TTL_SECONDS') || 7200)
  return Number.isFinite(n) ? Math.min(43_200, Math.max(600, Math.round(n))) : 7200
}

/**
 * TURN REST API credentials (coturn `use-auth-secret` / `static-auth-secret`):
 * username = "<unix-expiry>:<label>", credential = base64(HMAC-SHA1(secret, username)).
 */
export function turnRestCredential(secret: string, label: string, ttlSeconds = turnTtl(), now = Date.now()) {
  const expiry = Math.floor(now / 1000) + ttlSeconds
  const safeLabel = label.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'studio'
  const username = `${expiry}:${safeLabel}`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { username, credential, expiresAt: expiry }
}

/**
 * Build ICE servers from env.
 * Preferred: TURN_URL + TURN_SECRET -> per-request credentials that expire (TURN_TTL_SECONDS).
 * Fallback: TURN_URL + TURN_USERNAME + TURN_CREDENTIAL (static; leaks are long-lived).
 * `label` is a non-identifying tag (e.g. "host" or "guest") baked into the TURN username.
 */
export function studioIceFromEnv(label = 'studio'): StudioIceConfig {
  const url = readEnv('TURN_URL') || readEnv('NETLIFY_TURN_URL') || readEnv('NEXT_PUBLIC_TURN_URL')
  const iceServers: RTCIceServer[] = [...STUN_SERVERS]
  if (!url) return { iceServers, turnConfigured: false }

  const secret = readEnv('TURN_SECRET') || readEnv('TURN_STATIC_AUTH_SECRET')
  if (secret) {
    const { username, credential } = turnRestCredential(secret, label)
    iceServers.push({ urls: turnUrls(url), username, credential })
    return { iceServers, turnConfigured: true }
  }

  const username =
    readEnv('TURN_USERNAME') || readEnv('NETLIFY_TURN_USERNAME') || readEnv('NEXT_PUBLIC_TURN_USERNAME')
  const credential =
    readEnv('TURN_CREDENTIAL') ||
    readEnv('TURN_PASSWORD') ||
    readEnv('NETLIFY_TURN_CREDENTIAL') ||
    readEnv('NEXT_PUBLIC_TURN_CREDENTIAL')
  if (username && credential) {
    iceServers.push({ urls: turnUrls(url), username, credential })
    return { iceServers, turnConfigured: true }
  }
  return { iceServers, turnConfigured: false }
}

/** STUN-only list for callers that are neither an admin nor a live guest. */
export function stunOnlyIce(): StudioIceConfig {
  return { iceServers: [...STUN_SERVERS], turnConfigured: false }
}
