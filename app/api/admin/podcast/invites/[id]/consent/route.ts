import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/supabase/service'
import { getInviteConsents, guestReferenceCode } from '@/lib/podcast/guest-consent'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET -> { available, referenceCode, consents: ConsentRecord[] }  (newest first)
 * `available: false` means the 20260924000001 migration is not applied yet.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const supabase = createServiceClient()
    const { data: invite } = await supabase.from('podcast_guest_invites').select('id').eq('id', id).maybeSingle()
    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const result = await getInviteConsents(id, supabase)
    return NextResponse.json(
      { ...result, referenceCode: guestReferenceCode(id) },
      { headers: { 'Cache-Control': 'no-store, private, max-age=0' } },
    )
  } catch (err) {
    return studioError(err)
  }
}
