/**
 * Simulcast control for one show. Fail closed: nothing here can stop the main stream;
 * every destination reports its own state and the host sees a non-blocking warning.
 *
 *   GET  → poll provider state → { destinations, capability }
 *   POST { action: 'start' | 'stop' } → create / remove provider outputs
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withLiveAdmin } from '@/lib/podcast/live/admin'
import { createServiceClient } from '@/lib/supabase/service'
import {
  capabilityPublic,
  destinationError,
  pollSimulcast,
  startSimulcast,
  stopSimulcast,
} from '@/lib/podcast/live/simulcast-server'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
type Ctx = { params: Promise<{ id: string }> }

async function sessionRow(id: string) {
  const { data, error } = await createServiceClient().from('podcast_live_sessions').select('id, status, started_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data as { id: string; status: string; started_at: string | null } | null
}

export async function GET(_request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const session = await sessionRow(id)
    if (!session) return NextResponse.json({ error: 'Live session not found' }, { status: 404, headers: NO_STORE })
    const destinations = await pollSimulcast(createServiceClient(), session.started_at)
    return NextResponse.json({ destinations, capability: capabilityPublic() }, { headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const session = await sessionRow(id)
    if (!session) return NextResponse.json({ error: 'Live session not found' }, { status: 404, headers: NO_STORE })
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    const action = String(body.action ?? '')
    const db = createServiceClient()
    if (action === 'start') {
      if (session.status !== 'live') return NextResponse.json({ error: 'Go live first' }, { status: 409, headers: NO_STORE })
      const result = await startSimulcast(db)
      return NextResponse.json({ ...result, capability: capabilityPublic() }, { headers: NO_STORE })
    }
    if (action === 'stop') {
      const destinations = await stopSimulcast(db)
      return NextResponse.json({ destinations, warning: null, capability: capabilityPublic() }, { headers: NO_STORE })
    }
    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400, headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}
