import { NextResponse, type NextRequest } from 'next/server'
import { liveError, livePatchFromBody, withLiveAdmin } from '@/lib/podcast/live/admin'
import type { LiveSessionRow } from '@/lib/podcast/live/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const ACTIONS = ['start', 'end', 'heartbeat', 'reschedule'] as const
type LiveAction = (typeof ACTIONS)[number]

export async function GET(_request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const { data, error } = await admin.supabase.from('podcast_live_sessions').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
    return NextResponse.json({ session: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return liveError(err)
  }
}

/**
 * Edit fields and/or run a status transition:
 *   action=start      scheduled → live   (409 if another session is already live)
 *   action=end        scheduled|live → ended
 *   action=heartbeat  live only; bumps last_heartbeat_at so viewers know the host tab is alive
 *   action=reschedule ended → scheduled  (re-use a cancelled slot)
 */
export async function PATCH(request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    const action = body.action ? String(body.action) : null
    if (action && !ACTIONS.includes(action as LiveAction)) {
      return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })
    }
    const { data: current, error: readErr } = await admin.supabase
      .from('podcast_live_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (readErr) throw readErr
    if (!current) return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
    const row = current as LiveSessionRow

    const { patch, errors } = livePatchFromBody(body)
    if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    const now = new Date().toISOString()
    const update: Record<string, unknown> = { ...patch, updated_at: now }

    if (action === 'start') {
      if (row.status === 'ended') {
        return NextResponse.json({ error: 'This show already ended. Schedule a new one.' }, { status: 409 })
      }
      const { data: others, error: liveErr } = await admin.supabase
        .from('podcast_live_sessions')
        .select('id, title')
        .eq('status', 'live')
        .neq('id', id)
        .limit(1)
      if (liveErr) throw liveErr
      if (others?.length) {
        return NextResponse.json(
          { error: `“${others[0].title}” is still marked live. End it first.` },
          { status: 409 },
        )
      }
      update.status = 'live'
      update.started_at = row.started_at || now
      update.last_heartbeat_at = now
      update.ended_at = null
    } else if (action === 'end') {
      if (row.status !== 'ended') {
        update.status = 'ended'
        update.ended_at = now
      }
    } else if (action === 'heartbeat') {
      if (row.status !== 'live') return NextResponse.json({ error: 'Session is not live' }, { status: 409 })
      update.last_heartbeat_at = now
    } else if (action === 'reschedule') {
      update.status = 'scheduled'
      update.started_at = null
      update.ended_at = null
    }

    const { data, error } = await admin.supabase
      .from('podcast_live_sessions')
      .update(update)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ session: data })
  } catch (err) {
    return liveError(err)
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const { data: row } = await admin.supabase.from('podcast_live_sessions').select('status').eq('id', id).maybeSingle()
    if (row?.status === 'live') {
      return NextResponse.json({ error: 'End the show before deleting it' }, { status: 409 })
    }
    const { error } = await admin.supabase.from('podcast_live_sessions').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return liveError(err)
  }
}
