import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/supabase/service'
import { adminInvite, inviteIsLive } from '@/lib/podcast/guest-invite'
import { parseSignal, SIGNAL_BODY_MAX } from '@/lib/podcast/guest-signal-schema'
import type { GuestInviteRow, GuestSignal } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store, private, max-age=0' }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const rawAfter = Number(new URL(request.url).searchParams.get('after') || 0)
    const after = Number.isSafeInteger(rawAfter) && rawAfter > 0 ? rawAfter : 0
    const { data: row, error } = await supabase.from('podcast_guest_invites').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!row) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = row as GuestInviteRow
    const { data: episode } = await supabase.from('podcast_episodes').select('title').eq('id', invite.episode_id).maybeSingle()
    const { data: signals, error: sigErr } = await supabase
      .from('podcast_guest_signals')
      .select('id, from_role, kind, payload, created_at')
      .eq('invite_id', id)
      .gt('id', after)
      .eq('from_role', 'guest')
      .order('id', { ascending: true })
      .limit(40)
    if (sigErr) throw sigErr
    return NextResponse.json(
      {
        invite: adminInvite(invite, episode?.title || 'Episode'),
        live: inviteIsLive(invite),
        signals: (signals || []) as GuestSignal[],
      },
      { headers: NO_STORE },
    )
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const text = await request.text()
    if (text.length > SIGNAL_BODY_MAX) return NextResponse.json({ error: 'Signal too large' }, { status: 413 })
    let body: { kind?: unknown; payload?: unknown }
    try {
      body = JSON.parse(text || '{}')
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const signal = parseSignal('admin', body.kind, body.payload)
    if (!signal) return NextResponse.json({ error: 'Unknown signal' }, { status: 400 })
    const { data: row } = await supabase.from('podcast_guest_invites').select('id, revoked_at, expires_at').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    if (!inviteIsLive(row as GuestInviteRow)) return NextResponse.json({ error: 'Invite is not live' }, { status: 410 })
    const { error } = await supabase.from('podcast_guest_signals').insert({
      invite_id: id,
      from_role: 'admin',
      kind: signal.kind,
      payload: signal.payload,
    })
    if (error) throw error
    if (signal.kind === 'record') {
      await supabase
        .from('podcast_guest_invites')
        .update({
          connection_state: signal.payload.on ? 'recording' : 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (err) {
    return studioError(err)
  }
}
