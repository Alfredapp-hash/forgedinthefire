import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const active = searchParams.get('active')
    let query = admin
      .from('safecase_safety_flags')
      .select('*, client:safecase_clients(first_name, last_name)')
      .order('created_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
    if (active === '1') query = query.eq('is_active', true)
    const { data, error } = await query.limit(300)
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
    if (!body.client_id || !String(body.flag_type || '').trim() || !String(body.description_text || '').trim()) {
      return NextResponse.json({ error: 'Client, flag type, and description are required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_safety_flags')
      .insert({
        client_id: body.client_id,
        flag_type: String(body.flag_type).trim(),
        description_text: String(body.description_text).trim(),
        severity: body.severity || 'medium',
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
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as { id?: string; is_active?: boolean }
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { is_active: body.is_active }
    if (body.is_active === false) {
      patch.resolved_by = user.email
      patch.resolved_at = new Date().toISOString()
    } else if (body.is_active === true) {
      patch.resolved_by = null
      patch.resolved_at = null
    }
    const { data, error } = await admin.from('safecase_safety_flags').update(patch).eq('id', body.id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return safecaseError(err)
  }
}
