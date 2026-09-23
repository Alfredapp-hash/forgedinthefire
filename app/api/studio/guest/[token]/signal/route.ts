import {
  bodyErrorResponse,
  checkGuestSession,
  guestFail,
  guestJson,
  limitGuest,
  openGuestRoute,
  readJsonBody,
  sessionPayload,
  touchInvite,
  touchSeen,
} from '@/lib/podcast/guest-access'
import { parseSignal, SIGNAL_BODY_MAX } from '@/lib/podcast/guest-signal-schema'
import type { GuestSignal } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

/**
 * Guest-side signaling. The token only ever speaks as the guest: it reads host
 * signals for its own invite and writes guest signals. `role` in the query/body
 * is ignored (it used to let a token holder impersonate the host).
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, episodeTitle } = open
    const sessionError = checkGuestSession(open.row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })

    const rawAfter = Number(new URL(request.url).searchParams.get('after') || 0)
    const after = Number.isSafeInteger(rawAfter) && rawAfter > 0 ? rawAfter : 0
    const row = await touchSeen(supabase, open.row)

    const { data, error } = await supabase
      .from('podcast_guest_signals')
      .select('id, from_role, kind, payload, created_at')
      .eq('invite_id', row.id)
      .eq('from_role', 'admin')
      .gt('id', after)
      .order('id', { ascending: true })
      .limit(40)
    if (error) throw error
    return guestJson({
      signals: (data || []) as GuestSignal[],
      session: sessionPayload(row, episodeTitle),
    })
  } catch (err) {
    return guestFail('signal-poll', err, 'Connection check failed')
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, row } = open
    const sessionError = checkGuestSession(row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })
    const limited = await limitGuest(supabase, request, 'signal', row.id)
    if (limited) return limited

    let body: { kind?: unknown; payload?: unknown }
    try {
      body = (await readJsonBody(request, SIGNAL_BODY_MAX)) as typeof body
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('signal', err)
    }
    const signal = parseSignal('guest', body.kind, body.payload)
    if (!signal) return guestJson({ error: 'Unknown signal' }, { status: 400 })

    const { error } = await supabase.from('podcast_guest_signals').insert({
      invite_id: row.id,
      from_role: 'guest',
      kind: signal.kind,
      payload: signal.payload,
    })
    if (error) throw error

    if (signal.kind === 'hangup') {
      await touchInvite(supabase, row.id, { connection_state: 'left' })
    }
    return guestJson({ ok: true })
  } catch (err) {
    return guestFail('signal', err, 'Signal failed')
  }
}
