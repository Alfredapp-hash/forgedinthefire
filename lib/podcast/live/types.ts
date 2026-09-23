/** Live show session model shared by admin routes, the public route and the control room. */

export const LIVE_STATUSES = ['scheduled', 'live', 'ended'] as const
export type LiveStatus = (typeof LIVE_STATUSES)[number]

export type LiveSessionRow = {
  id: string
  episode_id: string | null
  title: string
  description: string | null
  status: LiveStatus
  scheduled_for: string | null
  started_at: string | null
  ended_at: string | null
  playback_hls_url: string | null
  playback_whep_url: string | null
  last_heartbeat_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Columns the public (anon) role may read. Mirrors the column GRANT in the migration. */
export const LIVE_PUBLIC_COLUMNS =
  'id, title, description, status, scheduled_for, started_at, playback_hls_url, playback_whep_url, last_heartbeat_at'

export type LiveSessionPublic = Pick<
  LiveSessionRow,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'scheduled_for'
  | 'started_at'
  | 'playback_hls_url'
  | 'playback_whep_url'
  | 'last_heartbeat_at'
>

export type LivePublicPayload = {
  /** The session that is live right now, if any. */
  live: LiveSessionPublic | null
  /** The next scheduled session, if any. */
  next: LiveSessionPublic | null
  /** Server time so the countdown does not trust a skewed viewer clock. */
  now: string
}

/** Program scenes the host can put on air. `slate` is the survivor-safety kill switch. */
export type LiveScene = 'host' | 'guest' | 'pip' | 'starting' | 'slate' | 'ended'

export type LiveProviderKind = 'cloudflare' | 'mediamtx' | 'livekit' | 'other'

export type LiveProviderStatus = {
  configured: boolean
  provider: LiveProviderKind | null
  host: string | null
  bearer: boolean
  defaultHlsUrl: string | null
  defaultWhepUrl: string | null
}

export type LiveHealth = {
  state: RTCPeerConnectionState | 'idle' | 'connecting' | 'reconnecting'
  bitrateKbps: number
  packetLossPct: number
  rttMs: number | null
  fps: number | null
  frameWidth: number | null
  reconnects: number
  lastError: string | null
}

export const EMPTY_HEALTH: LiveHealth = {
  state: 'idle',
  bitrateKbps: 0,
  packetLossPct: 0,
  rttMs: null,
  fps: null,
  frameWidth: null,
  reconnects: 0,
  lastError: null,
}

/** A heartbeat older than this means the host tab likely died; viewers see "reconnecting". */
export const LIVE_HEARTBEAT_STALE_MS = 3 * 60 * 1000

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
