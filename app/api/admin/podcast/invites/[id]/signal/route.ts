import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { adminInvite, inviteIsLive } from '@/lib/podcast/guest-invite'
import { GUEST_SIGNAL_KIND_SET, type GuestInviteRow, type GuestSignal } from '@/lib/podcast/guest-types'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withStudioAdmin()
    const { id } = await context.params
    const after = Number(new URL(request.url).searchParams.get('after') || 0)
    const { data: row, error } = await supabase.from('podcast_guest_invites').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!row) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = row as GuestInviteRow
    const { data: episode } = await supabase.from('podcast_episodes').select('title').eq('id', invite.episode_id).maybeSingle()
    const { data: signals, error: sigErr } = await supabase
      .from('podcast_guest_signals')
      .select('id, from_role, kind, payload, created_at')
      .eq('invite_id', id)
      .gt('id', Number.isFinite(after) ? after : 0)
      .eq('from_role', 'guest')
      .order('id', { ascending: true })
      .limit(40)
    if (sigErr) throw sigErr
    return NextResponse.json({
      invite: adminInvite(invite, episode?.title || 'Episode'),
      live: inviteIsLive(invite),
      signals: (signals || []) as GuestSignal[],
    })
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withStudioAdmin()
    const { id } = await context.params
    const body = (await request.json()) as { kind?: string; payload?: Record<string, unknown> }
    if (!GUEST_SIGNAL_KIND_SET.has(String(body.kind))) return NextResponse.json({ error: 'Unknown signal' }, { status: 400 })
    const { data: row } = await supabase.from('podcast_guest_invites').select('id, revoked_at, expires_at').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    if (!inviteIsLive(row as GuestInviteRow)) return NextResponse.json({ error: 'Invite is not live' }, { status: 410 })
    const { error } = await supabase.from('podcast_guest_signals').insert({
      invite_id: id,
      from_role: 'admin',
      kind: body.kind,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    })
    if (error) throw error
    if (body.kind === 'record') {
      await supabase
        .from('podcast_guest_invites')
        .update({
          connection_state: body.payload?.on ? 'recording' : 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return studioError(err)
  }
}
