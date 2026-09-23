import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/supabase/service'
import { adminInvite, inviteExpiry, mintGuestToken } from '@/lib/podcast/guest-invite'
import type { GuestInviteRow } from '@/lib/podcast/guest-types'
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
    return NextResponse.json(
      { invites: ((data || []) as GuestInviteRow[]).map((row) => adminInvite(row, title)) },
      { headers: NO_STORE },
    )
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const supabase = createServiceClient()
    const body = (await request.json().catch(() => ({}))) as { episode_id?: string; hours?: number; label?: string }
    const episodeId = String(body.episode_id || '').trim()
    if (!UUID.test(episodeId)) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const { data: episode } = await supabase.from('podcast_episodes').select('id, title').eq('id', episodeId).maybeSingle()
    if (!episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })

    const now = new Date().toISOString()
    // One live link per episode: a new link revokes the old one and drops its signaling rows.
    const { data: revoked } = await supabase
      .from('podcast_guest_invites')
      .update({ revoked_at: now, updated_at: now, connection_state: 'left' })
      .eq('episode_id', episodeId)
      .is('revoked_at', null)
      .select('id')
    const revokedIds = (revoked || []).map((r: { id: string }) => r.id)
    if (revokedIds.length) {
      await supabase.from('podcast_guest_signals').delete().in('invite_id', revokedIds)
    }
    // Opportunistic TTL sweep (also scheduled by pg_cron when available).
    void supabase.rpc('podcast_guest_cleanup').then(
      () => undefined,
      () => undefined,
    )

    const { raw, hash } = mintGuestToken()
    const { data, error } = await supabase
      .from('podcast_guest_invites')
      .insert({
        episode_id: episodeId,
        token_hash: hash,
        label: String(body.label || '').trim().slice(0, 80) || null,
        expires_at: inviteExpiry(Number(body.hours) || 24),
        created_by: user.email,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json(
      { invite: adminInvite(data as GuestInviteRow, episode.title, originFrom(request), raw) },
      { status: 201, headers: NO_STORE },
    )
  } catch (err) {
    return studioError(err)
  }
}
