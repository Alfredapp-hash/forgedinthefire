import {
  bodyErrorResponse,
  checkGuestSession,
  claimGuestSession,
  guestFail,
  guestJson,
  limitGuest,
  openGuestRoute,
  readJsonBody,
  sessionPayload,
  touchInvite,
} from '@/lib/podcast/guest-access'
import type { GuestInviteRow } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    return guestJson(sessionPayload(open.row, open.episodeTitle))
  } catch (err) {
    return guestFail('session', err, 'Could not open this invite')
  }
}

type SessionBody = { action?: string; name?: string; audioOnly?: boolean; consent?: boolean }

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, row, episodeTitle } = open

    let body: SessionBody
    try {
      body = (await readJsonBody(request, 2048)) as SessionBody
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('session', err)
    }
    const now = new Date().toISOString()

    if (body.action === 'join') {
      const joinLimited = await limitGuest(supabase, request, 'join', row.id)
      if (joinLimited) return joinLimited
      const name = String(body.name || '')
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, 40)
      if (name.length < 2) return guestJson({ error: 'Enter a name (at least 2 characters)' }, { status: 400 })
      if (body.consent !== true) {
        return guestJson({ error: 'Please read and accept the recording notice first' }, { status: 400 })
      }
      const claim = claimGuestSession(row, request)
      if (!claim.ok) return guestJson({ error: claim.error }, { status: 409 })
      const patch: Partial<GuestInviteRow> = {
        guest_name: name,
        guest_joined_at: row.guest_joined_at || now,
        last_seen_at: now,
        connection_state: row.connection_state === 'recording' ? 'recording' : 'joined',
      }
      if (claim.hash !== undefined) {
        patch.guest_session_hash = claim.hash
        patch.consent_at = now
        patch.audio_only = Boolean(body.audioOnly)
      }
      const next = await touchInvite(supabase, row.id, patch)
      // Host signals already queued before this join (old answers/candidates) are history.
      const { data: last } = await supabase
        .from('podcast_guest_signals')
        .select('id')
        .eq('invite_id', row.id)
        .eq('from_role', 'admin')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      return guestJson({
        ...sessionPayload(next, episodeTitle),
        guestSession: claim.raw,
        signalCursor: Number(last?.id || 0),
      })
    }

    const sessionError = checkGuestSession(row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })

    if (body.action === 'heartbeat') {
      const next = await touchInvite(supabase, row.id, { last_seen_at: now })
      return guestJson(sessionPayload(next, episodeTitle))
    }
    if (body.action === 'connected') {
      const next = await touchInvite(supabase, row.id, {
        last_seen_at: now,
        connection_state: row.connection_state === 'recording' ? 'recording' : 'connected',
      })
      return guestJson(sessionPayload(next, episodeTitle))
    }
    if (body.action === 'leave') {
      const patch: Partial<GuestInviteRow> = { last_seen_at: now, connection_state: 'left' }
      if (Object.prototype.hasOwnProperty.call(row, 'guest_session_hash')) patch.guest_session_hash = null
      const next = await touchInvite(supabase, row.id, patch)
      return guestJson(sessionPayload(next, episodeTitle))
    }
    return guestJson({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return guestFail('session', err, 'Guest session failed')
  }
}
