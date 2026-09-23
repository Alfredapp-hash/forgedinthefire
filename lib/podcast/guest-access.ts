import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { clientIp, hashedKey, rateLimitHit } from '@/lib/security/rate-limit'
import {
  hashGuestToken,
  hashesMatch,
  inviteIsLive,
  isGuestTokenShape,
  mintGuestSession,
  publicInvite,
  type GuestInviteRow,
} from '@/lib/podcast/guest-invite'
import type { GuestConnectionState } from '@/lib/podcast/guest-types'

/** Header the booth sends after Join so only one device drives an invite. */
export const GUEST_SESSION_HEADER = 'x-guest-session'
/** A device that has not polled for this long can be replaced by a new Join. */
const SESSION_STALE_MS = 45_000
/** Skip last_seen writes on polls that land sooner than this. */
const TOUCH_EVERY_MS = 10_000

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
}

/** JSON response for public guest routes: never cached, never indexed, no Referer. */
export function guestJson(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers || {}) },
  })
}

/** Generic failure: log the cause server-side (never the token), send a plain message. */
export function guestFail(where: string, err: unknown, message = 'Something went wrong. Please try again.') {
  console.error(`[guest:${where}]`, err instanceof Error ? err.message : err)
  return guestJson({ error: message }, { status: 500 })
}

export async function guestAdminDb(): Promise<SupabaseClient> {
  return createServiceClient()
}

export async function loadInviteByToken(token: string) {
  const supabase = await guestAdminDb()
  const raw = String(token || '').trim()
  if (!isGuestTokenShape(raw)) return { supabase, row: null, episodeTitle: '', live: false }
  const hash = hashGuestToken(raw)
  const { data: row, error } = await supabase
    .from('podcast_guest_invites')
    .select('*')
    .eq('token_hash', hash)
    .maybeSingle()
  if (error) throw error
  if (!row || !hashesMatch((row as GuestInviteRow).token_hash, hash)) {
    return { supabase, row: null, episodeTitle: '', live: false }
  }
  const invite = row as GuestInviteRow
  const { data: episode } = await supabase
    .from('podcast_episodes')
    .select('title')
    .eq('id', invite.episode_id)
    .maybeSingle()
  return {
    supabase,
    row: invite,
    episodeTitle: episode?.title || 'Forged in the Fire',
    live: inviteIsLive(invite),
  }
}

export function denyGuest(row: GuestInviteRow | null, live: boolean) {
  if (!row) return 'This link is not valid. Please ask the host for a new one.'
  if (row.revoked_at) return 'This invite was revoked'
  if (!live) return 'This invite has expired'
  return null
}

export function sessionPayload(row: GuestInviteRow, episodeTitle: string) {
  return publicInvite(row, episodeTitle)
}

export async function touchInvite(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<GuestInviteRow> & { connection_state?: GuestConnectionState },
) {
  const { data, error } = await supabase
    .from('podcast_guest_invites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GuestInviteRow
}

/** Heartbeat write that skips the UPDATE when last_seen_at is fresh. */
export async function touchSeen(supabase: SupabaseClient, row: GuestInviteRow) {
  const last = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0
  if (Date.now() - last < TOUCH_EVERY_MS) return row
  return touchInvite(supabase, row.id, { last_seen_at: new Date().toISOString() })
}

function sessionColumnPresent(row: GuestInviteRow) {
  return Object.prototype.hasOwnProperty.call(row, 'guest_session_hash')
}

/**
 * Every call after Join must carry the device session minted at Join.
 * Returns an error message, or null when the caller owns the invite.
 * Skipped (fails open) only while the 20260923 migration is not applied.
 */
export function checkGuestSession(row: GuestInviteRow, request: Request) {
  if (!sessionColumnPresent(row)) return null
  if (!row.guest_session_hash) return 'Join the booth first'
  const presented = (request.headers.get(GUEST_SESSION_HEADER) || '').trim()
  if (!isGuestTokenShape(presented)) return 'This invite is open on another device'
  return hashesMatch(row.guest_session_hash, hashGuestToken(presented))
    ? null
    : 'This invite is open on another device'
}

/**
 * Join: bind the invite to this device. A different device may take over only
 * after the first one has gone quiet or left.
 */
export function claimGuestSession(row: GuestInviteRow, request: Request) {
  if (!sessionColumnPresent(row)) return { ok: true as const, raw: null, hash: undefined }
  const presented = (request.headers.get(GUEST_SESSION_HEADER) || '').trim()
  const same =
    Boolean(row.guest_session_hash) &&
    isGuestTokenShape(presented) &&
    hashesMatch(row.guest_session_hash, hashGuestToken(presented))
  if (same) return { ok: true as const, raw: presented, hash: row.guest_session_hash as string }
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0
  const active =
    Boolean(row.guest_session_hash) &&
    row.connection_state !== 'left' &&
    Date.now() - lastSeen < SESSION_STALE_MS
  if (active) {
    return {
      ok: false as const,
      error:
        'This invite is already open on another device or tab. Close it there, wait a minute, then try again.',
    }
  }
  const minted = mintGuestSession()
  return { ok: true as const, raw: minted.raw, hash: minted.hash }
}

export type GuestLimit = 'request' | 'signal' | 'join' | 'take'

const LIMITS: Record<GuestLimit, { window: number; max: number }> = {
  request: { window: 60, max: 300 },
  signal: { window: 60, max: 240 },
  join: { window: 600, max: 20 },
  take: { window: 3600, max: 12 },
}

/**
 * Abuse limits for public token routes. `request` is per client IP (hashed);
 * the rest are per invite. Returns a 429 response when over the limit.
 */
export async function limitGuest(
  supabase: SupabaseClient,
  request: Request,
  kind: GuestLimit,
  inviteId?: string,
) {
  const rule = LIMITS[kind]
  const subject = kind === 'request' ? `ip:${clientIp(request)}` : `invite:${inviteId || 'none'}`
  const ok = await rateLimitHit(supabase, hashedKey(`guest-${kind}`, subject), rule.window, rule.max)
  if (ok) return null
  return guestJson(
    { error: 'Too many requests. Wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(Math.min(rule.window, 60)) } },
  )
}

/**
 * Common entry for public token routes: per-IP limit first (before any token
 * lookup), then load the invite and refuse revoked/expired/unknown tokens.
 */
export async function openGuestRoute(request: Request, token: string) {
  const db = await guestAdminDb()
  const limited = await limitGuest(db, request, 'request')
  if (limited) return { response: limited } as const
  const { supabase, row, episodeTitle, live } = await loadInviteByToken(token)
  const deny = denyGuest(row, live)
  if (deny || !row) return { response: guestJson({ error: deny }, { status: 404 }) } as const
  return { response: null, supabase, row, episodeTitle } as const
}

/** Read a JSON body with a hard byte cap (signals, joins, take metadata). */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new BodyTooLarge()
  const text = await request.text()
  if (text.length > maxBytes) throw new BodyTooLarge()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new BadJson()
  }
}

export class BodyTooLarge extends Error {
  constructor() {
    super('Request is too large')
  }
}

export class BadJson extends Error {
  constructor() {
    super('Invalid request')
  }
}

export function bodyErrorResponse(err: unknown) {
  if (err instanceof BodyTooLarge) return guestJson({ error: err.message }, { status: 413 })
  if (err instanceof BadJson) return guestJson({ error: err.message }, { status: 400 })
  return null
}
