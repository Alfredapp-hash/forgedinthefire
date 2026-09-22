import { createHash, randomBytes } from 'crypto'
import type { GuestInviteAdmin, GuestInvitePublic, GuestInviteRow } from '@/lib/podcast/guest-types'

export type {
  GuestConnectionState,
  GuestInviteAdmin,
  GuestInvitePublic,
  GuestInviteRow,
  GuestSignal,
} from '@/lib/podcast/guest-types'

export function hashGuestToken(raw: string) {
  return createHash('sha256').update(raw.trim(), 'utf8').digest('hex')
}

export function mintGuestToken() {
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

export function publicInvite(row: GuestInviteRow, episodeTitle: string): GuestInvitePublic {
  return {
    id: row.id,
    episodeTitle,
    label: row.label,
    guestName: row.guest_name,
    expiresAt: row.expires_at,
    state: row.connection_state,
    recording: row.connection_state === 'recording',
    takeReady: Boolean(row.take_url),
    takeUrl: row.take_url,
    cameraReady: Boolean(row.camera_url),
    cameraUrl: row.camera_url,
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
    lastSeenAt: row.last_seen_at,
    revoked,
    expired,
    rawToken,
    url: rawToken && origin ? `${origin.replace(/\/$/, '')}/studio/join/${rawToken}` : undefined,
  }
}
