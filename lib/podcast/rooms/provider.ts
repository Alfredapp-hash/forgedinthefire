/**
 * Room provider abstraction. A provider knows how to make a room and how to
 * mint a join token. Both are server-side only; the browser never sees keys.
 * Pure helpers (invite cap, capacity reasons) live here so they can be tested
 * without a provider.
 */

import {
  MAX_ROOM_GUESTS,
  type InviteCapacity,
  type MintTokenInput,
  type RoomProviderKind,
  type RoomToken,
} from '@/lib/podcast/rooms/types'

export type RoomProvider = {
  readonly kind: RoomProviderKind
  /** Public signalling URL handed to clients. */
  readonly clientUrl: string
  /**
   * Create (or confirm) a room on the provider. Idempotent: calling it for a
   * name that already exists is not an error.
   */
  createRoom(roomName: string, opts?: { maxParticipants?: number; emptyTimeoutSec?: number }): Promise<void>
  /** Best effort: close the room on the provider (participants are disconnected). */
  endRoom(roomName: string): Promise<void>
  mintToken(input: MintTokenInput): RoomToken
}

export type ProviderEnv = {
  LIVEKIT_URL?: string
  LIVEKIT_API_KEY?: string
  LIVEKIT_API_SECRET?: string
}

/** Server env present and sane? (The URL must be a LiveKit signalling URL.) */
export function providerConfigured(env: ProviderEnv): { ok: true; url: string } | { ok: false; reason: string } {
  const url = (env.LIVEKIT_URL || '').trim()
  const key = (env.LIVEKIT_API_KEY || '').trim()
  const secret = (env.LIVEKIT_API_SECRET || '').trim()
  if (!url && !key && !secret) return { ok: false, reason: 'not configured' }
  if (!url || !key || !secret) {
    return { ok: false, reason: 'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must all be set' }
  }
  if (!/^wss?:\/\/[^\s/]+/i.test(url) && !/^https?:\/\/[^\s/]+/i.test(url)) {
    return { ok: false, reason: 'LIVEKIT_URL must be a ws(s):// or http(s):// URL' }
  }
  if (secret.length < 16) return { ok: false, reason: 'LIVEKIT_API_SECRET looks too short' }
  return { ok: true, url }
}

export const PANEL_NEEDS_ROOM_SERVICE =
  'Panels with 2+ guests need the room service configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET). One guest at a time still works on the free peer-to-peer link.'

/**
 * How many more invites an episode can take. One live invite is always fine
 * (P2P). A second needs the SFU; the room caps the total.
 */
export function inviteCapacity(opts: {
  liveInvites: number
  available: boolean
  provider: RoomProviderKind | null
  /** Why the provider is unavailable (from providerConfigured). */
  unavailableReason?: string | null
  maxGuests?: number
}): InviteCapacity {
  const maxGuests = Math.max(1, opts.maxGuests ?? MAX_ROOM_GUESTS)
  const live = Math.max(0, Math.floor(opts.liveInvites))
  if (!opts.available) {
    const remaining = live >= 1 ? 0 : 1
    const configProblem = opts.unavailableReason && opts.unavailableReason !== 'not configured'
    return {
      available: false,
      live,
      remaining,
      reason:
        remaining === 0
          ? configProblem
            ? `${PANEL_NEEDS_ROOM_SERVICE} (${opts.unavailableReason})`
            : PANEL_NEEDS_ROOM_SERVICE
          : null,
      provider: null,
      maxGuests: 1,
    }
  }
  const remaining = Math.max(0, maxGuests - live)
  return {
    available: true,
    live,
    remaining,
    reason: remaining === 0 ? `This room holds ${maxGuests} guests. Revoke a link to invite someone else.` : null,
    provider: opts.provider,
    maxGuests,
  }
}

/** True when the episode's guests should go through the room rather than P2P. */
export function needsRoom(liveInvites: number) {
  return liveInvites >= 2
}
