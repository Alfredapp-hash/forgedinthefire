import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET() {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { data, error } = await admin.from('safecase_grants').select('*').order('period_end', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    const name = String(body.name || '').trim()
    const funder = String(body.funder || '').trim()
    const period_start = String(body.period_start || '')
    const period_end = String(body.period_end || '')
    if (!name || !funder || !period_start || !period_end) {
      return NextResponse.json({ error: 'Name, funder, and reporting period are required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_grants')
      .insert({
        name,
        funder,
        award_amount: body.award_amount === '' || body.award_amount == null ? null : Number(body.award_amount),
        period_start,
        period_end,
        report_due_on: body.report_due_on || null,
        status: body.status || 'active',
        program_ids: Array.isArray(body.program_ids) ? body.program_ids : [],
        targets: typeof body.targets === 'object' && body.targets ? body.targets : {},
        notes: String(body.notes || '').trim() || null,
        created_by: user.email,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
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

export async function DELETE(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await admin.from('safecase_grants').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
