import { verifyAdminAccess } from '@/lib/admin/auth'
import { guestAdminDb, guestJson, limitGuest, loadInviteByToken, denyGuest } from '@/lib/podcast/guest-access'
import { studioIceFromEnv, stunOnlyIce } from '@/lib/podcast/ice'

export const dynamic = 'force-dynamic'

/** Header the guest booth uses to prove it holds a live invite (kept out of the URL). */
const GUEST_TOKEN_HEADER = 'x-guest-token'

/**
 * ICE for the host (admin session) and the guest (live invite token).
 * TURN relay credentials are only handed to those two; everyone else gets STUN,
 * so the relay cannot be used as a free open proxy.
 */
export async function GET(request: Request) {
  try {
    const db = await guestAdminDb()
    const limited = await limitGuest(db, request, 'request')
    if (limited) return limited

    const token = (request.headers.get(GUEST_TOKEN_HEADER) || '').trim()
    if (token) {
      const { row, live } = await loadInviteByToken(token)
      if (!denyGuest(row, live)) return guestJson(studioIceFromEnv('guest'))
      return guestJson(stunOnlyIce())
    }

    const { isAdmin } = await verifyAdminAccess()
    return guestJson(isAdmin ? studioIceFromEnv('host') : stunOnlyIce())
  } catch (err) {
    console.error('[studio-ice]', err instanceof Error ? err.message : err)
    return guestJson(stunOnlyIce())
  }
}
