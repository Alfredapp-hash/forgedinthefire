import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/podcast/guest/service-db'
import { mintHostRoomToken, openRoomForEpisode, roomAvailability } from '@/lib/podcast/rooms/server'
import type { GuestRoomPublic } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HostRoomResponse = {
  room: GuestRoomPublic | null
  /** Short-lived join token for the host identity. Absent when there is no open room. */
  token?: string
  identity?: string
  expiresAt?: number
  available: boolean
  reason: string | null
}

/**
 * Host join token for the episode's open room. Rooms are created by the invite
 * route when a second guest is added, never here: this only hands the host a
 * token for a room that already exists.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as { episode_id?: string }
    const episodeId = String(body.episode_id || '').trim()
    if (!UUID.test(episodeId)) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const availability = roomAvailability()
    if (!availability.available) {
      const out: HostRoomResponse = { room: null, available: false, reason: availability.reason }
      return NextResponse.json(out, { headers: NO_STORE })
    }
    const supabase = createServiceClient()
    const room = await openRoomForEpisode(supabase, episodeId)
    if (!room) {
      const out: HostRoomResponse = { room: null, available: true, reason: null }
      return NextResponse.json(out, { headers: NO_STORE })
    }
    const minted = mintHostRoomToken(availability.provider, room)
    const out: HostRoomResponse = {
      room: { name: room.room_name, url: availability.provider.clientUrl, provider: room.provider },
      token: minted.token,
      identity: minted.identity,
      expiresAt: minted.expiresAt,
      available: true,
      reason: null,
    }
    return NextResponse.json(out, { headers: NO_STORE })
  } catch (err) {
    return studioError(err)
  }
}
