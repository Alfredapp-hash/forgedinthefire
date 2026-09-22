import { NextResponse } from 'next/server'
import { denyGuest, loadInviteByToken, sessionPayload, touchInvite } from '@/lib/podcast/guest-access'
import { GUEST_SIGNAL_KIND_SET, type GuestSignal } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

const ROLES = new Set(['admin', 'guest'])

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const url = new URL(request.url)
    const after = Number(url.searchParams.get('after') || 0)
    const role = url.searchParams.get('role') || ''
    if (!ROLES.has(role)) return NextResponse.json({ error: 'role required' }, { status: 400 })
    const { supabase, row, episodeTitle, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })

    if (role === 'guest') {
      await touchInvite(supabase, row.id, { last_seen_at: new Date().toISOString() })
    }

    const { data, error } = await supabase
      .from('podcast_guest_signals')
      .select('id, from_role, kind, payload, created_at')
      .eq('invite_id', row.id)
      .gt('id', Number.isFinite(after) ? after : 0)
      .neq('from_role', role)
      .order('id', { ascending: true })
      .limit(40)
    if (error) throw error
    return NextResponse.json({
      signals: (data || []) as GuestSignal[],
      session: sessionPayload(row, episodeTitle),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signal poll failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { supabase, row, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    const body = (await request.json()) as {
      role?: string
      kind?: string
      payload?: Record<string, unknown>
    }
    if (!ROLES.has(String(body.role))) return NextResponse.json({ error: 'role required' }, { status: 400 })
    if (!GUEST_SIGNAL_KIND_SET.has(String(body.kind))) return NextResponse.json({ error: 'Unknown signal' }, { status: 400 })
    const { error } = await supabase.from('podcast_guest_signals').insert({
      invite_id: row.id,
      from_role: body.role,
      kind: body.kind,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    })
    if (error) throw error

    if (body.kind === 'record' && body.role === 'admin') {
      const on = Boolean(body.payload?.on)
      await touchInvite(supabase, row.id, { connection_state: on ? 'recording' : 'connected' })
    }
    if (body.kind === 'hangup') {
      await touchInvite(supabase, row.id, { connection_state: 'left' })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signal failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}
