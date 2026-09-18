import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const clientId = searchParams.get('client_id')
    let query = admin
      .from('safecase_appointments')
      .select('*, client:safecase_clients(first_name, last_name)')
      .order('starts_on', { ascending: true })
    if (from) query = query.gte('starts_on', from)
    if (to) query = query.lte('starts_on', to)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await query.limit(400)
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
    const title = String(body.title || '').trim()
    const starts_on = String(body.starts_on || '')
    if (!title || !starts_on) {
      return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_appointments')
      .insert({
        title,
        starts_on,
        start_time: String(body.start_time || '').trim() || null,
        location: String(body.location || '').trim() || null,
        notes: String(body.notes || '').trim() || null,
        client_id: body.client_id || null,
        created_by: user.email,
      })
      .select('*, client:safecase_clients(first_name, last_name)')
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await admin.from('safecase_appointments').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
