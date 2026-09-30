/**
 * Simulcast destinations (admin). Secrets are sealed before they reach the database and
 * only ever leave the server masked.
 *
 *   GET  → { destinations: DestinationPublic[], capability }
 *   POST → { label, kind, url?, streamKey?, enabled? } → 201 { destination }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withLiveAdmin } from '@/lib/podcast/live/admin'
import { createServiceClient } from '@/lib/supabase/service'
import { parseDestinationInput } from '@/lib/podcast/live/simulcast'
import {
  capabilityPublic,
  destinationError,
  listDestinationRows,
  rowFromInput,
  toPublicDestination,
  type DestinationRow,
} from '@/lib/podcast/live/simulcast-server'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const rows = await listDestinationRows(createServiceClient())
    return NextResponse.json({ destinations: rows.map(toPublicDestination), capability: capabilityPublic() }, { headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}

export async function POST(request: NextRequest) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    const parsed = parseDestinationInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })
    const { data, error } = await createServiceClient()
      .from('podcast_live_destinations')
      .insert(rowFromInput(parsed.value, admin.user.email))
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ destination: toPublicDestination(data as DestinationRow) }, { status: 201, headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}
