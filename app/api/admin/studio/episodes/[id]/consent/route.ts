import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { releaseConsentStatus } from '@/lib/podcast/guest-consent'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET -> GuestConsentStatus (lib/studio/release.ts) for the episode's release checklist and the
 * live room's safety defaults. `available: false` until the guest consent migration is applied.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    if (!UUID.test(id)) return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    const status = await releaseConsentStatus(id, supabase)
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store, private, max-age=0' } })
  } catch (err) {
    return studioError(err)
  }
}
