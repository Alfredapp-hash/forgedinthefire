/** Server-side ICE list. TURN credentials stay in env — never hardcode them. */

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

/** Build ICE servers from TURN_URL / TURN_USERNAME / TURN_CREDENTIAL (and NETLIFY_* aliases). */
export function studioIceFromEnv(): StudioIceConfig {
  const url =
    readEnv('TURN_URL') ||
    readEnv('NETLIFY_TURN_URL') ||
    readEnv('NEXT_PUBLIC_TURN_URL')
  const username =
    readEnv('TURN_USERNAME') ||
    readEnv('NETLIFY_TURN_USERNAME') ||
    readEnv('NEXT_PUBLIC_TURN_USERNAME')
  const credential =
    readEnv('TURN_CREDENTIAL') ||
    readEnv('TURN_PASSWORD') ||
    readEnv('NETLIFY_TURN_CREDENTIAL') ||
    readEnv('NEXT_PUBLIC_TURN_CREDENTIAL')
  const iceServers: RTCIceServer[] = [...STUN_SERVERS]
  const turnConfigured = Boolean(url && username && credential)
  if (turnConfigured && url && username && credential) {
    iceServers.push({
      urls: turnUrls(url),
      username,
      credential,
    })
  }
  return { iceServers, turnConfigured }
}
