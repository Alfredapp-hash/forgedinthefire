import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { syncProgramEnrollment } from '@/lib/safecase/sync'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const clientId = new URL(request.url).searchParams.get('client_id')
    const programId = new URL(request.url).searchParams.get('program_id')
    let query = admin
      .from('safecase_enrollments')
      .select('*, program:safecase_programs(name, program_type, capacity, current_enrollment), client:safecase_clients(first_name, last_name, preferred_name, status)')
      .order('enrolled_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
    if (programId) query = query.eq('program_id', programId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as { client_id?: string; program_id?: string; waitlist?: boolean }
    if (!body.client_id || !body.program_id) {
      return NextResponse.json({ error: 'Client and program are required' }, { status: 400 })
    }
    const { data: program, error: programError } = await admin
      .from('safecase_programs')
      .select('capacity, current_enrollment, status, name')
      .eq('id', body.program_id)
      .single()
    if (programError) throw programError
    const atCapacity = (program?.current_enrollment ?? 0) >= (program?.capacity ?? 0) && (program?.capacity ?? 0) > 0
    const status = body.waitlist || atCapacity ? 'waitlist' : 'active'
    if (atCapacity && !body.waitlist) {
      return NextResponse.json({
        error: `${program?.name || 'Program'} is full. Add to waitlist?`,
        waitlist: true,
      }, { status: 409 })
    }
    const { data, error } = await admin
      .from('safecase_enrollments')
      .upsert({
        client_id: body.client_id,
        program_id: body.program_id,
        status,
        enrolled_at: new Date().toISOString(),
        completed_at: null,
        created_by: user.email,
      }, { onConflict: 'client_id,program_id' })
      .select('*, program:safecase_programs(name, program_type)')
      .single()
    if (error) throw error
    await syncProgramEnrollment(admin, body.program_id)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const body = await request.json() as { id?: string; status?: 'active' | 'completed' | 'withdrawn' | 'waitlist' }
    if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
    const { data: existing, error: findError } = await admin.from('safecase_enrollments').select('program_id, status').eq('id', body.id).single()
    if (findError) throw findError
    if (body.status === 'active' && existing?.program_id) {
      const { data: program } = await admin
        .from('safecase_programs')
        .select('capacity, current_enrollment, name')
        .eq('id', existing.program_id)
        .single()
      const atCapacity = (program?.current_enrollment ?? 0) >= (program?.capacity ?? 0) && (program?.capacity ?? 0) > 0
      if (atCapacity && existing.status !== 'active') {
        return NextResponse.json({ error: `${program?.name || 'Program'} is full. Keep this person on the waitlist.` }, { status: 409 })
      }
    }
    const patch: Record<string, unknown> = { status: body.status }
    if (body.status === 'waitlist' || body.status === 'active') patch.completed_at = null
    else patch.completed_at = new Date().toISOString()
    const { data, error } = await admin.from('safecase_enrollments').update(patch).eq('id', body.id).select().single()
    if (error) throw error
    if (existing?.program_id) await syncProgramEnrollment(admin, existing.program_id)
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}
