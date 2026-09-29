import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/podcast/guest/service-db'
import { adminInvite, inviteExpiry, mintGuestToken } from '@/lib/podcast/guest-invite'
import type { GuestInviteRow, GuestRoomPublic } from '@/lib/podcast/guest-types'
import {
  capacityForEpisode,
  endRoomIfEmpty,
  ensureRoomForEpisode,
  liveInvitesForEpisode,
  openRoomForEpisode,
  roomAvailability,
} from '@/lib/podcast/rooms/server'
import type { InviteCapacity } from '@/lib/podcast/rooms/types'
import { PODCAST } from '@/lib/podcast-meta'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Origin for the guest link. The Host header is only trusted when it is this
 * site, a Netlify preview, or localhost — otherwise a spoofed Host could make
 * the admin copy a link that points somewhere else.
 */
function originFrom(request: Request) {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL || PODCAST.site
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase()
  const proto = request.headers.get('x-forwarded-proto') === 'http' ? 'http' : 'https'
  if (!host) return fallback
  const allowed = new Set<string>()
  for (const site of [PODCAST.site, process.env.NEXT_PUBLIC_SITE_URL]) {
    try {
      if (site) allowed.add(new URL(site).host.toLowerCase())
    } catch {
      /* ignore bad env */
    }
  }
  if (allowed.has(host) || host.endsWith('.netlify.app')) return `https://${host}`
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${proto}://${host}`
  return fallback
}

export type InvitesListResponse = {
  invites: ReturnType<typeof adminInvite>[]
  /** Panel-show capacity: whether more guests can be invited and why not. */
  capacity: InviteCapacity
  /** The episode's open room, when the invites go through the SFU. */
  room: GuestRoomPublic | null
}

async function roomPublic(supabase: ReturnType<typeof createServiceClient>, episodeId: string) {
  const availability = roomAvailability()
  if (!availability.available) return null
  const room = await openRoomForEpisode(supabase, episodeId)
  return room ? ({ name: room.room_name, url: availability.provider.clientUrl, provider: room.provider } as GuestRoomPublic) : null
}

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const episodeId = new URL(request.url).searchParams.get('episode_id') || ''
    if (!UUID.test(episodeId)) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const { data, error } = await supabase
      .from('podcast_guest_invites')
      .select('*')
      .eq('episode_id', episodeId)
      .order('created_at', { ascending: false })
      .limit(12)
    if (error) throw error
    const { data: episode } = await supabase.from('podcast_episodes').select('title').eq('id', episodeId).maybeSingle()
    const title = episode?.title || 'Episode'
    const rows = (data || []) as GuestInviteRow[]
    const now = Date.now()
    const live = rows.filter((r) => !r.revoked_at && new Date(r.expires_at).getTime() > now).length
    const body: InvitesListResponse = {
      invites: rows.map((row) => adminInvite(row, title)),
      capacity: capacityForEpisode(live),
      room: await roomPublic(supabase, episodeId).catch(() => null),
    }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const supabase = createServiceClient()
    const body = (await request.json().catch(() => ({}))) as {
      episode_id?: string
      hours?: number
      label?: string
      /** true: keep the current live link(s) and add a guest to the episode room (panel show). */
      add?: boolean
    }
    const episodeId = String(body.episode_id || '').trim()
    if (!UUID.test(episodeId)) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const { data: episode } = await supabase.from('podcast_episodes').select('id, title').eq('id', episodeId).maybeSingle()
    if (!episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })

    const now = new Date().toISOString()
    const live = await liveInvitesForEpisode(supabase, episodeId)
    const availability = roomAvailability()
    let roomId: string | null = null

    if (body.add && live.length >= 1) {
      // Panel show: a second (third…) guest. Needs the SFU; never silently drop to P2P.
      const capacity = capacityForEpisode(live.length, availability)
      if (capacity.remaining <= 0 || !availability.available) {
        return NextResponse.json(
          { error: capacity.reason || 'No more guests can be invited', capacity },
          { status: 409, headers: NO_STORE },
        )
      }
      const room = await ensureRoomForEpisode(supabase, episodeId, availability.provider)
      roomId = room.id
      // The existing live invite(s) move into the room too (their booth switches on its next poll).
      const orphan = live.filter((r) => r.room_id !== room.id).map((r) => r.id)
      if (orphan.length) {
        await supabase.from('podcast_guest_invites').update({ room_id: room.id, updated_at: now }).in('id', orphan)
      }
    } else {
      // One live link per episode: a new link revokes the old one(s) and drops their signaling rows.
      const { data: revoked } = await supabase
        .from('podcast_guest_invites')
        .update({ revoked_at: now, updated_at: now, connection_state: 'left' })
        .eq('episode_id', episodeId)
        .is('revoked_at', null)
        .select('id, room_id')
      const revokedRows = (revoked || []) as { id: string; room_id: string | null }[]
      const revokedIds = revokedRows.map((r) => r.id)
      if (revokedIds.length) {
        await supabase.from('podcast_guest_signals').delete().in('invite_id', revokedIds)
      }
      for (const rid of new Set(revokedRows.map((r) => r.room_id).filter((x): x is string => Boolean(x)))) {
        await endRoomIfEmpty(supabase, rid, availability.provider).catch(() => false)
      }
    }
    // Opportunistic TTL sweep (also scheduled by pg_cron when available).
    void supabase.rpc('podcast_guest_cleanup').then(
      () => undefined,
      () => undefined,
    )

    const { raw, hash } = mintGuestToken()
    const insert: Record<string, unknown> = {
      episode_id: episodeId,
      token_hash: hash,
      label: String(body.label || '').trim().slice(0, 80) || null,
      expires_at: inviteExpiry(Number(body.hours) || 24),
      created_by: user.email,
    }
    if (roomId) insert.room_id = roomId
    const { data, error } = await supabase.from('podcast_guest_invites').insert(insert).select('*').single()
    if (error) throw error
    const liveNow = roomId ? live.length + 1 : 1
    return NextResponse.json(
      {
        invite: adminInvite(data as GuestInviteRow, episode.title, originFrom(request), raw),
        capacity: capacityForEpisode(liveNow, availability),
        room: await roomPublic(supabase, episodeId).catch(() => null),
      },
      { status: 201, headers: NO_STORE },
    )
  } catch (err) {
    return studioError(err)
  }
}
