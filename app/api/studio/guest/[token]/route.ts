import { NextResponse } from 'next/server'
import { denyGuest, loadInviteByToken, sessionPayload, touchInvite } from '@/lib/podcast/guest-access'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { row, episodeTitle, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    return NextResponse.json(sessionPayload(row, episodeTitle))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invite lookup failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { supabase, row, episodeTitle, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    const body = (await request.json()) as { action?: string; name?: string }
    const now = new Date().toISOString()
    if (body.action === 'join') {
      const name = String(body.name || '').trim().slice(0, 40)
      if (name.length < 2) return NextResponse.json({ error: 'Enter your name (at least 2 characters)' }, { status: 400 })
      const next = await touchInvite(supabase, row.id, {
        guest_name: name,
        guest_joined_at: row.guest_joined_at || now,
        last_seen_at: now,
        connection_state: row.connection_state === 'recording' ? 'recording' : 'joined',
      })
      return NextResponse.json(sessionPayload(next, episodeTitle))
    }
    if (body.action === 'heartbeat') {
      const next = await touchInvite(supabase, row.id, { last_seen_at: now })
      return NextResponse.json(sessionPayload(next, episodeTitle))
    }
    if (body.action === 'connected') {
      const next = await touchInvite(supabase, row.id, {
        last_seen_at: now,
        connection_state: row.connection_state === 'recording' ? 'recording' : 'connected',
      })
      return NextResponse.json(sessionPayload(next, episodeTitle))
    }
    if (body.action === 'leave') {
      const next = await touchInvite(supabase, row.id, {
        last_seen_at: now,
        connection_state: 'left',
      })
      return NextResponse.json(sessionPayload(next, episodeTitle))
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Guest session failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}
