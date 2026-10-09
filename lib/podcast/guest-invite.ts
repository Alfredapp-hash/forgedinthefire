import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { GuestInviteAdmin, GuestInvitePublic, GuestInviteRow } from '@/lib/podcast/guest-types'
import { guestReferenceCode } from '@/lib/podcast/guest/consent-text'
export { chunkedTakeRef, parseChunkedTakeRef } from '@/lib/podcast/upload/guest-take-manifest'

export type {
  GuestConnectionState,
  GuestInviteAdmin,
  GuestInvitePublic,
  GuestInviteRow,
  GuestSignal,
} from '@/lib/podcast/guest-types'

/** Raw tokens are 24 random bytes as hex (192 bits). Anything else is rejected before a DB hit. */
export const GUEST_TOKEN_PATTERN = /^[a-f0-9]{48}$/

/** Private bucket for guest backup takes (created in 20260923000003_podcast_security.sql). */
export const GUEST_TAKE_BUCKET = 'podcast-guest-takes'
const TAKE_REF_PREFIX = `private://${GUEST_TAKE_BUCKET}/`

export function isGuestTokenShape(raw: string) {
  return GUEST_TOKEN_PATTERN.test(String(raw || '').trim())
}

export function hashGuestToken(raw: string) {
  return createHash('sha256').update(raw.trim(), 'utf8').digest('hex')
}

/** Constant-time compare of two hex digests of the same length. */
const SHA256_HEX = /^[0-9a-f]{64}$/i

export function hashesMatch(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b || a.length !== b.length) return false
  // Buffer.from(x, 'hex') silently drops non-hex input, so junk of equal length would compare as
  // two empty buffers. Accept only full SHA-256 hex digests.
  if (!SHA256_HEX.test(a) || !SHA256_HEX.test(b)) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export function mintGuestToken() {
  const raw = randomBytes(24).toString('hex')
  return { raw, hash: hashGuestToken(raw) }
}

/** One device per invite: the booth gets this after Join and sends it on every call. */
export function mintGuestSession() {
  const raw = randomBytes(24).toString('hex')
  return { raw, hash: hashGuestToken(raw) }
}

export function inviteExpiry(hours: number) {
  const h = Number.isFinite(hours) ? Math.min(168, Math.max(1, hours)) : 24
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
}

export function inviteIsLive(row: Pick<GuestInviteRow, 'expires_at' | 'revoked_at'>) {
  if (row.revoked_at) return false
  return new Date(row.expires_at).getTime() > Date.now()
}

/** Stored in take_url / camera_url for private-bucket objects. Not a fetchable URL. */
export function guestTakeRef(path: string) {
  return `${TAKE_REF_PREFIX}${path}`
}

/** Returns the object path for a private guest take ref, or null for anything else. */
export function parseGuestTakeRef(ref: string | null | undefined) {
  if (!ref || !ref.startsWith(TAKE_REF_PREFIX)) return null
  const path = ref.slice(TAKE_REF_PREFIX.length)
  if (!/^guest-takes\/[0-9a-f-]{36}\/(camera-)?\d{10,16}\.(webm|m4a|mp4|ogg|wav)$/.test(path)) return null
  return path
}

/**
 * What the guest booth sees. No host label, no take URLs, no admin metadata:
 * the booth only needs the episode title, its own name, expiry and state.
 */
export function publicInvite(row: GuestInviteRow, episodeTitle: string): GuestInvitePublic {
  return {
    id: row.id,
    episodeTitle,
    label: null,
    guestName: row.guest_name,
    expiresAt: row.expires_at,
    state: row.connection_state,
    recording: row.connection_state === 'recording',
    takeReady: Boolean(row.take_url),
    takeUrl: null,
    cameraReady: Boolean(row.camera_url),
    cameraUrl: null,
  }
}

export function adminInvite(
  row: GuestInviteRow,
  episodeTitle: string,
  origin?: string,
  rawToken?: string,
): GuestInviteAdmin {
  const expired = new Date(row.expires_at).getTime() <= Date.now()
  const revoked = Boolean(row.revoked_at)
  return {
    ...publicInvite(row, episodeTitle),
    label: row.label,
    // Private refs are resolved by the admin-only /api/admin/media/file proxy.
    takeUrl: row.take_url,
    cameraUrl: row.camera_url,
    lastSeenAt: row.last_seen_at,
    revoked,
    expired,
    referenceCode: guestReferenceCode(row.id),
    consentAt: row.consent_at ?? null,
    rawToken,
    url: rawToken && origin ? `${origin.replace(/\/$/, '')}/studio/join/${rawToken}` : undefined,
  }
}
