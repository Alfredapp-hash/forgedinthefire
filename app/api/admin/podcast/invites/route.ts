import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { adminInvite, inviteExpiry, mintGuestToken } from '@/lib/podcast/guest-invite'
import type { GuestInviteRow } from '@/lib/podcast/guest-types'
import { PODCAST } from '@/lib/podcast-meta'

function originFrom(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  return PODCAST.site
}

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const episodeId = new URL(request.url).searchParams.get('episode_id')
    if (!episodeId) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const { data, error } = await supabase
      .from('podcast_guest_invites')
      .select('*')
      .eq('episode_id', episodeId)
      .order('created_at', { ascending: false })
      .limit(12)
    if (error) throw error
    const { data: episode } = await supabase.from('podcast_episodes').select('title').eq('id', episodeId).maybeSingle()
    const title = episode?.title || 'Episode'
    return NextResponse.json({
      invites: ((data || []) as GuestInviteRow[]).map((row) => adminInvite(row, title)),
    })
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await withStudioAdmin()
    const body = (await request.json()) as { episode_id?: string; hours?: number; label?: string }
    const episodeId = String(body.episode_id || '').trim()
    if (!episodeId) return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    const { data: episode } = await supabase.from('podcast_episodes').select('id, title').eq('id', episodeId).maybeSingle()
    if (!episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })

    await supabase
      .from('podcast_guest_invites')
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('episode_id', episodeId)
      .is('revoked_at', null)

    const { raw, hash } = mintGuestToken()
    const { data, error } = await supabase
      .from('podcast_guest_invites')
      .insert({
        episode_id: episodeId,
        token_hash: hash,
        label: String(body.label || '').trim() || null,
        expires_at: inviteExpiry(Number(body.hours) || 24),
        created_by: user.email,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({
      invite: adminInvite(data as GuestInviteRow, episode.title, originFrom(request), raw),
    }, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}
