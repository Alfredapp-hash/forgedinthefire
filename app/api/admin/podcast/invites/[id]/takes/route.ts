import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/supabase/service'
import { isMissingTable } from '@/lib/podcast/guest-consent'
import { buildTakeManifest, type GuestTakeRow } from '@/lib/podcast/upload/guest-take-server'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Guest backup takes for one invite, newest first, each with a fresh manifest
 * (10-minute signed chunk URLs) the editor concatenates in index order.
 * Includes takes still "recording" (guest tab crashed / never finished) so the
 * host can recover whatever chunks landed.
 *
 * GET ?take=<takeId> (optional) -> { takes: GuestTakeManifest[] }
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const takeId = new URL(request.url).searchParams.get('take')
    if (takeId && !UUID.test(takeId)) return NextResponse.json({ error: 'Take not found' }, { status: 404 })
    const supabase = createServiceClient()
    let query = supabase
      .from('podcast_guest_takes')
      .select('*')
      .eq('invite_id', id)
      .neq('status', 'abandoned')
      .order('created_at', { ascending: false })
      .limit(takeId ? 1 : 20)
    if (takeId) query = query.eq('id', takeId)
    const { data, error } = await query
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ takes: [] }, { headers: { 'Cache-Control': 'no-store' } })
      throw error
    }
    const takes = []
    for (const row of (data || []) as GuestTakeRow[]) takes.push(await buildTakeManifest(supabase, row))
    if (takeId && !takes.length) return NextResponse.json({ error: 'Take not found' }, { status: 404 })
    return NextResponse.json({ takes }, { headers: { 'Cache-Control': 'no-store, private, max-age=0' } })
  } catch (err) {
    return studioError(err)
  }
}
