import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { buildGrantPacket, grantNarrativeFromPacket } from '@/lib/safecase/grants'
import type { SafeCaseGrant } from '@/lib/safecase/types'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const { data, error } = await admin.from('safecase_grants').select('*').eq('id', id).single()
    if (error) throw error
    const grant = data as SafeCaseGrant
    const includePacket = new URL(request.url).searchParams.get('packet') === '1'
    if (!includePacket) return NextResponse.json(grant)

    const from = new URL(request.url).searchParams.get('from') || grant.period_start
    const to = new URL(request.url).searchParams.get('to') || grant.period_end
    const packet = await buildGrantPacket(admin, from, to, grant)
    return NextResponse.json({
      grant,
      packet,
      narrative: grant.narrative || grantNarrativeFromPacket(packet),
    })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    const allowed = [
      'name', 'funder', 'award_amount', 'period_start', 'period_end', 'report_due_on',
      'status', 'program_ids', 'targets', 'narrative', 'notes', 'snapshot', 'snapshot_at',
    ]
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) {
        patch[key] = body[key] === '' ? null : body[key]
      }
    }
    if (patch.award_amount != null) patch.award_amount = Number(patch.award_amount)
    const { data, error } = await admin.from('safecase_grants').update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { admin } = await withSafeCaseAdmin()
    const { error } = await admin.from('safecase_grants').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
