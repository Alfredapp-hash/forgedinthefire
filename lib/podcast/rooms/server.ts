import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLiveKitProvider } from '@/lib/podcast/rooms/livekit'
import { inviteCapacity, providerConfigured, type RoomProvider } from '@/lib/podcast/rooms/provider'
import {
  HOST_IDENTITY,
  MAX_ROOM_GUESTS,
  guestIdentity,
  roomNameFor,
  type InviteCapacity,
  type RoomInfo,
  type RoomRow,
  type RoomToken,
} from '@/lib/podcast/rooms/types'
import type { GuestInviteRow } from '@/lib/podcast/guest-types'

/**
 * Server side of multi-guest rooms: env → provider, DB rows, token minting.
 * Every function here runs with the service role; routes must have already
 * authenticated the caller (admin session or guest invite token).
 */

export type RoomAvailability =
  | { available: true; provider: RoomProvider; reason: null }
  | { available: false; provider: null; reason: string }

let cached: { key: string; provider: RoomProvider } | null = null

export function roomAvailability(env: Record<string, string | undefined> = process.env): RoomAvailability {
  const cfg = providerConfigured({
    LIVEKIT_URL: env.LIVEKIT_URL,
    LIVEKIT_API_KEY: env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: env.LIVEKIT_API_SECRET,
  })
  if (!cfg.ok) return { available: false, provider: null, reason: cfg.reason }
  const key = `${cfg.url}|${env.LIVEKIT_API_KEY}|${(env.LIVEKIT_API_SECRET || '').length}`
  if (!cached || cached.key !== key) {
    cached = {
      key,
      provider: createLiveKitProvider({
        url: cfg.url,
        apiKey: env.LIVEKIT_API_KEY as string,
        apiSecret: env.LIVEKIT_API_SECRET as string,
      }),
    }
  }
  return { available: true, provider: cached.provider, reason: null }
}

export function roomInfo(row: RoomRow, provider: RoomProvider): RoomInfo {
  return { id: row.id, provider: row.provider, name: row.room_name, url: provider.clientUrl }
}

export function isInviteLive(row: Pick<GuestInviteRow, 'revoked_at' | 'expires_at'>, now = Date.now()) {
  return !row.revoked_at && new Date(row.expires_at).getTime() > now
}

export async function liveInvitesForEpisode(supabase: SupabaseClient, episodeId: string) {
  const { data, error } = await supabase
    .from('podcast_guest_invites')
    .select('*')
    .eq('episode_id', episodeId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as GuestInviteRow[]
}

export function capacityForEpisode(liveInvites: number, availability = roomAvailability()): InviteCapacity {
  return inviteCapacity({
    liveInvites,
    available: availability.available,
    provider: availability.provider?.kind ?? null,
    unavailableReason: availability.reason,
    maxGuests: MAX_ROOM_GUESTS,
  })
}

/** The open room for an episode (ended_at null), or null. */
export async function openRoomForEpisode(supabase: SupabaseClient, episodeId: string) {
  const { data, error } = await supabase
    .from('podcast_rooms')
    .select('*')
    .eq('episode_id', episodeId)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as RoomRow | null) || null
}

export async function roomById(supabase: SupabaseClient, roomId: string) {
  const { data, error } = await supabase.from('podcast_rooms').select('*').eq('id', roomId).maybeSingle()
  if (error) throw error
  return (data as RoomRow | null) || null
}

/**
 * Create the episode's room if none is open: DB row first (so a name is
 * reserved), then the provider. A provider failure rolls the row back and
 * throws with a plain message the admin can act on.
 */
export async function ensureRoomForEpisode(supabase: SupabaseClient, episodeId: string, provider: RoomProvider) {
  const existing = await openRoomForEpisode(supabase, episodeId)
  if (existing) return existing
  const { count } = await supabase
    .from('podcast_rooms')
    .select('id', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
  const roomName = roomNameFor(episodeId, count || 0)
  const { data, error } = await supabase
    .from('podcast_rooms')
    .insert({ episode_id: episodeId, provider: provider.kind, room_name: roomName })
    .select('*')
    .single()
  if (error) throw error
  const row = data as RoomRow
  try {
    await provider.createRoom(roomName, { maxParticipants: MAX_ROOM_GUESTS + 2 })
  } catch (err) {
    await supabase.from('podcast_rooms').delete().eq('id', row.id)
    throw new Error(
      `The room service did not accept the room: ${err instanceof Error ? err.message : 'unknown error'}. Check LIVEKIT_URL and the API key.`,
    )
  }
  return row
}

/** Mark the room ended when no live invite points at it any more (and tell the provider). */
export async function endRoomIfEmpty(supabase: SupabaseClient, roomId: string, provider: RoomProvider | null) {
  const { count } = await supabase
    .from('podcast_guest_invites')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
  if ((count || 0) > 0) return false
  const { data } = await supabase
    .from('podcast_rooms')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', roomId)
    .is('ended_at', null)
    .select('room_name')
    .maybeSingle()
  if (data?.room_name && provider) void provider.endRoom(data.room_name)
  return true
}

export function mintGuestRoomToken(provider: RoomProvider, room: RoomRow, invite: GuestInviteRow): RoomToken {
  return provider.mintToken({
    room: room.room_name,
    identity: guestIdentity(invite.id),
    role: 'guest',
    name: invite.guest_name || invite.label || 'Guest',
    invite: { id: invite.id, expiresAt: invite.expires_at },
  })
}

export function mintHostRoomToken(provider: RoomProvider, room: RoomRow): RoomToken {
  return provider.mintToken({ room: room.room_name, identity: HOST_IDENTITY, role: 'host', name: 'Host' })
}
