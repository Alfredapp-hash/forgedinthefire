/**
 * One simulcast destination (admin).
 *   PATCH  → { enabled?, label?, url?, streamKey?, kind? } (re-enter url/key to change secrets)
 *   DELETE → remove
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withLiveAdmin } from '@/lib/podcast/live/admin'
import { createServiceClient } from '@/lib/podcast/live/service-client'
import { parseDestinationInput } from '@/lib/podcast/live/simulcast'
import {
  destinationError,
  rowFromInput,
  toPublicDestination,
  unsealSecret,
  type DestinationRow,
} from '@/lib/podcast/live/simulcast-server'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
type Ctx = { params: Promise<{ destId: string }> }

export async function PATCH(request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { destId } = await context.params
    const db = createServiceClient()
    const { data: current, error: readErr } = await db.from('podcast_live_destinations').select('*').eq('id', destId).maybeSingle()
    if (readErr) throw readErr
    if (!current) return NextResponse.json({ error: 'Destination not found' }, { status: 404, headers: NO_STORE })
    const row = current as DestinationRow
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.enabled !== undefined) {
      patch.enabled = Boolean(body.enabled)
      if (!patch.enabled) patch.state = 'idle'
    }
    const changesSecrets = body.url !== undefined || body.streamKey !== undefined || body.kind !== undefined || body.label !== undefined
    if (changesSecrets) {
      const parsed = parseDestinationInput({
        label: body.label ?? row.label,
        kind: body.kind ?? row.kind,
        url: body.url ?? (unsealSecret(row.url_enc) || ''),
        streamKey: body.streamKey ?? (row.key_enc ? unsealSecret(row.key_enc) : null),
        enabled: patch.enabled ?? row.enabled,
      })
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })
      const fresh = rowFromInput(parsed.value, row.created_by)
      Object.assign(patch, {
        label: fresh.label,
        kind: fresh.kind,
        protocol: fresh.protocol,
        url_enc: fresh.url_enc,
        key_enc: fresh.key_enc,
        state: 'idle',
        state_detail: null,
      })
    }
    const { data, error } = await db.from('podcast_live_destinations').update(patch).eq('id', destId).select('*').single()
    if (error) throw error
    return NextResponse.json({ destination: toPublicDestination(data as DestinationRow) }, { headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { destId } = await context.params
    const { error } = await createServiceClient().from('podcast_live_destinations').delete().eq('id', destId)
    if (error) throw error
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (err) {
    return destinationError(err)
  }
}
