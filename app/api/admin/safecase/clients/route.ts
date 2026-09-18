import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'
import { nextCaseNumber } from '@/lib/safecase/sync'

export async function GET(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().replace(/[,()%]/g, '')
    const status = searchParams.get('status')
    const risk = searchParams.get('risk')
    const assigned = searchParams.get('assigned')

    let query = admin.from('safecase_clients').select('*').order('last_name', { ascending: true })
    if (status && status !== 'all') query = query.eq('status', status)
    if (risk && risk !== 'all') query = query.eq('risk_level', risk)
    if (assigned === 'me' && user.email) query = query.eq('assigned_to', user.email)
    else if (assigned) query = query.eq('assigned_to', assigned)
    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,preferred_name.ilike.%${q}%,contact_email.ilike.%${q}%,contact_phone.ilike.%${q}%,case_number.ilike.%${q}%`,
      )
    }

    const { data, error } = await query
    if (error) throw error
    const clients = data ?? []
    const ids = clients.map((c) => c.id)
    if (ids.length === 0) return NextResponse.json([])
    const [{ data: flags }, { data: tasks }] = await Promise.all([
      admin.from('safecase_safety_flags').select('client_id').eq('is_active', true).in('client_id', ids),
      admin.from('safecase_tasks').select('client_id').in('status', ['pending', 'in_progress']).in('client_id', ids),
    ])
    const flagCount = new Map<string, number>()
    const taskCount = new Map<string, number>()
    for (const row of flags ?? []) flagCount.set(row.client_id, (flagCount.get(row.client_id) ?? 0) + 1)
    for (const row of tasks ?? []) {
      if (row.client_id) taskCount.set(row.client_id, (taskCount.get(row.client_id) ?? 0) + 1)
    }
    return NextResponse.json(clients.map((c) => ({
      ...c,
      active_flags: flagCount.get(c.id) ?? 0,
      open_tasks: taskCount.get(c.id) ?? 0,
    })))
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as Record<string, unknown>
    const first_name = String(body.first_name || '').trim()
    const last_name = String(body.last_name || '').trim()
    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })
    }

    const { data: matches } = await admin
      .from('safecase_clients')
      .select('id, first_name, last_name, preferred_name, case_number, status')
      .ilike('first_name', first_name)
      .ilike('last_name', last_name)
    if ((matches?.length ?? 0) > 0 && !body.confirm_duplicate) {
      return NextResponse.json({
        error: `A file named ${first_name} ${last_name} already exists. Open it, or create anyway.`,
        duplicate: true,
        matches,
      }, { status: 409 })
    }

    const { data, error } = await admin
      .from('safecase_clients')
      .insert({
        first_name,
        last_name,
        preferred_name: String(body.preferred_name || '').trim() || null,
        contact_email: String(body.contact_email || '').trim() || null,
        contact_phone: String(body.contact_phone || '').trim() || null,
        status: body.status || 'active',
        risk_level: body.risk_level || 'low',
        veteran_status: Boolean(body.veteran_status),
        confidential_address: Boolean(body.confidential_address),
        date_of_birth: body.date_of_birth || null,
        pronouns: String(body.pronouns || '').trim() || null,
        assigned_to: String(body.assigned_to || '').trim() || user.email,
        emergency_contact_name: String(body.emergency_contact_name || '').trim() || null,
        emergency_contact_phone: String(body.emergency_contact_phone || '').trim() || null,
        intake_date: body.intake_date || new Date().toISOString().slice(0, 10),
        case_number: String(body.case_number || '').trim() || nextCaseNumber(last_name),
        last_contact_at: new Date().toISOString(),
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
