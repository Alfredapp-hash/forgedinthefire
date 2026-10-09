/**
 * Multi-guest rooms (panel shows).
 *
 * One remote guest stays on the free peer-to-peer path (lib/podcast/webrtc.ts).
 * From the second live invite on an episode, the host and every guest join a
 * room on an SFU (LiveKit today) instead. This module holds the shared shapes;
 * nothing here touches a provider or the network.
 *
 * Identities inside a room are stable and derived from our own ids, so the
 * host tab can map a participant back to its invite (lane, tally, mute…)
 * without trusting anything the guest sends.
 */

export const ROOM_PROVIDERS = ['livekit'] as const
export type RoomProviderKind = (typeof ROOM_PROVIDERS)[number]

export type RoomRole = 'host' | 'guest'

/** Hard cap on guests in one room (grid layouts are drawn for up to 3 guests + host). */
export const MAX_ROOM_GUESTS = 6

/** Topic for control messages on the room data channel (same wire shape as the P2P data channel). */
export const ROOM_CONTROL_TOPIC = 'fitf-ctl'

/** Host-published audio track names: the guest booth routes them to its headphone mix by name. */
export const ROOM_TRACK_TALKBACK = 'talkback'
export const ROOM_TRACK_CUE = 'cue'

export type RoomRow = {
  id: string
  episode_id: string
  provider: RoomProviderKind
  room_name: string
  created_at: string
  ended_at: string | null
}

/** What clients get to know about a room. Never carries API keys. */
export type RoomInfo = {
  id: string
  provider: RoomProviderKind
  name: string
  /** Signalling URL for the client SDK (wss://…). */
  url: string
}

export type RoomGrant = {
  room: string
  identity: string
  /** Display name inside the room (guest name or "Host"). */
  name: string
  role: RoomRole
  canPublish: boolean
  canSubscribe: boolean
  canPublishData: boolean
  /** Unix seconds. */
  exp: number
  /** Unix seconds. */
  nbf: number
  /** JSON metadata visible to other participants (invite id for a guest). */
  metadata?: string
}

export type MintTokenInput = {
  room: string
  identity: string
  role: RoomRole
  name?: string
  /** The invite this identity belongs to (guests only). */
  invite?: { id: string; expiresAt: string } | null
  /** Override lifetime (seconds). Default ROOM_TOKEN_TTL_SEC, capped to the invite expiry. */
  ttlSec?: number
  now?: number
}

export type RoomToken = {
  token: string
  identity: string
  /** Unix seconds. */
  expiresAt: number
}

/** Why an episode can (or cannot) take another guest. */
export type InviteCapacity = {
  /** SFU configured on the server. */
  available: boolean
  /** Live (not revoked, not expired) invites on the episode right now. */
  live: number
  /** How many more invites may be created. */
  remaining: number
  /** Plain-language reason when `remaining` is 0. */
  reason: string | null
  /** Provider name when available. */
  provider: RoomProviderKind | null
  maxGuests: number
}

/** Default token lifetime: long enough for a show, short enough that a leaked link dies with the invite. */
export const ROOM_TOKEN_TTL_SEC = 6 * 60 * 60

export const HOST_IDENTITY = 'host'
const GUEST_IDENTITY_PREFIX = 'guest:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function guestIdentity(inviteId: string) {
  return `${GUEST_IDENTITY_PREFIX}${inviteId.toLowerCase()}`
}

/** `guest:<inviteId>` → inviteId; anything else (including the host) → null. */
export function inviteIdFromIdentity(identity: string | null | undefined) {
  if (!identity || !identity.startsWith(GUEST_IDENTITY_PREFIX)) return null
  const id = identity.slice(GUEST_IDENTITY_PREFIX.length)
  return UUID.test(id) ? id.toLowerCase() : null
}

export function isHostIdentity(identity: string | null | undefined) {
  return identity === HOST_IDENTITY
}

/**
 * Room name: one per episode, prefixed so a shared LiveKit project can hold
 * other apps' rooms. Rooms are tied to the DB row, not just the name, so a
 * second room for the same episode (after the first ended) gets a suffix.
 */
export function roomNameFor(episodeId: string, generation = 0) {
  const base = `fitf-ep-${episodeId.toLowerCase()}`
  return generation > 0 ? `${base}-${generation}` : base
}

export const ROOM_NAME_PATTERN = /^fitf-ep-[0-9a-f-]{36}(-\d+)?$/
