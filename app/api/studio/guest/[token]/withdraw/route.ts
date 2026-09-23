import {
  bodyErrorResponse,
  guestAdminDb,
  guestFail,
  guestJson,
  limitGuest,
  loadInviteByToken,
  readJsonBody,
} from '@/lib/podcast/guest-access'
import { withdrawGuestConsent } from '@/lib/podcast/guest-consent'

export const dynamic = 'force-dynamic'

/**
 * Guest asks for their recording to be withdrawn.
 * Works after the link expired or was revoked (the guest may change their mind
 * days later) — only an unknown token is refused. Rate limited per IP and per
 * invite. Marks consent withdrawn and flags the episode `guest_review_required`.
 *
 * POST { reason?: string } -> { ok: true, referenceCode, withdrawnAt }
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const db = await guestAdminDb()
    const ipLimited = await limitGuest(db, request, 'request')
    if (ipLimited) return ipLimited
    const { supabase, row } = await loadInviteByToken(token)
    if (!row) return guestJson({ error: 'This link is not valid.' }, { status: 404 })
    const limited = await limitGuest(supabase, request, 'withdraw', row.id)
    if (limited) return limited

    let body: { reason?: unknown }
    try {
      body = (await readJsonBody(request, 4096)) as typeof body
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('withdraw', err)
    }
    const reason =
      String(body.reason || '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 1000) || null

    const result = await withdrawGuestConsent(supabase, {
      inviteId: row.id,
      episodeId: row.episode_id,
      reason,
    })
    // The host sees it in the booth panel if they are still connected.
    await supabase
      .from('podcast_guest_signals')
      .insert({ invite_id: row.id, from_role: 'guest', kind: 'pause', payload: { on: true, withdrawn: true } })
      .then(
        () => undefined,
        () => undefined,
      )
    return guestJson({ ok: true, referenceCode: result.referenceCode, withdrawnAt: result.withdrawnAt })
  } catch (err) {
    return guestFail('withdraw', err, 'We could not send your request. Please email us instead.')
  }
}
