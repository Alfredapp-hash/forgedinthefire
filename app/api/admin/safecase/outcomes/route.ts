import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const enrollmentId = new URL(request.url).searchParams.get('enrollment_id')
    let query = admin
      .from('safecase_program_outcomes')
      .select('*')
      .order('created_at', { ascending: false })
    if (enrollmentId) query = query.eq('enrollment_id', enrollmentId)
    const { data, error } = await query.limit(200)
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as {
      enrollment_id?: string
      outcome_type?: string
      outcome_value?: string
      measurement_date?: string
      achieved?: boolean
      notes?: string
    }
    if (!body.enrollment_id) {
      return NextResponse.json({ error: 'enrollment_id required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_program_outcomes')
      .insert({
        enrollment_id: body.enrollment_id,
        outcome_type: body.outcome_type || 'other',
        outcome_value: body.outcome_value?.trim() || null,
        measurement_date: body.measurement_date || new Date().toISOString().slice(0, 10),
        achieved: Boolean(body.achieved),
        notes: body.notes?.trim() || null,
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
    const body = await request.json() as {
      id?: string
      achieved?: boolean
      outcome_value?: string
      notes?: string
    }
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (body.achieved !== undefined) patch.achieved = body.achieved
    if (body.outcome_value !== undefined) patch.outcome_value = body.outcome_value
    if (body.notes !== undefined) patch.notes = body.notes
    const { data, error } = await admin
      .from('safecase_program_outcomes')
      .update(patch)
      .eq('id', body.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}
