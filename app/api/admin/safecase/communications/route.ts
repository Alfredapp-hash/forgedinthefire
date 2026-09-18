import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const clientId = new URL(request.url).searchParams.get('client_id')
    let query = admin
      .from('safecase_communications')
      .select('*')
      .order('created_at', { ascending: false })
    if (clientId) query = query.eq('client_id', clientId)
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
      client_id?: string
      communication_type?: string
      direction?: string
      subject?: string
      content?: string
      duration_minutes?: number
      outcome?: string
      safe_contact_respected?: boolean
    }
    if (!body.client_id || !body.content?.trim()) {
      return NextResponse.json({ error: 'Client and content are required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_communications')
      .insert({
        client_id: body.client_id,
        communication_type: body.communication_type || 'call',
        direction: body.direction || 'outbound',
        subject: body.subject?.trim() || null,
        content: body.content.trim(),
        duration_minutes: body.duration_minutes ?? 0,
        outcome: body.outcome?.trim() || null,
        safe_contact_respected: body.safe_contact_respected !== false,
        created_by: user.email,
      })
      .select()
      .single()
    if (error) throw error
    await admin.from('safecase_clients').update({
      last_contact_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', body.client_id)
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
    const { error } = await admin.from('safecase_communications').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
