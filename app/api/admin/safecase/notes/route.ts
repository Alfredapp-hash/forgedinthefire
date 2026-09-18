import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const clientId = new URL(request.url).searchParams.get('client_id')
    let query = admin.from('safecase_notes').select('*').order('created_at', { ascending: false })
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
      note_type?: string
      narrative?: string
      visibility_level?: string
      follow_up_date?: string
      supervisor_review?: boolean
    }
    if (!body.client_id || !body.narrative?.trim()) {
      return NextResponse.json({ error: 'Client and note text are required' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('safecase_notes')
      .insert({
        client_id: body.client_id,
        note_type: body.note_type || 'progress',
        narrative: body.narrative.trim(),
        visibility_level: body.visibility_level === 'confidential' ? 'confidential' : 'standard',
        follow_up_date: body.follow_up_date || null,
        supervisor_review: Boolean(body.supervisor_review),
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

export async function PATCH(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const body = await request.json() as {
      id?: string
      narrative?: string
      note_type?: string
      visibility_level?: string
      follow_up_date?: string | null
      supervisor_review?: boolean
      mark_reviewed?: boolean
    }
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (body.narrative !== undefined) {
      const narrative = body.narrative.trim()
      if (!narrative) return NextResponse.json({ error: 'Note text is required' }, { status: 400 })
      patch.narrative = narrative
    }
    if (body.note_type) patch.note_type = body.note_type
    if (body.visibility_level) patch.visibility_level = body.visibility_level
    if (body.follow_up_date !== undefined) patch.follow_up_date = body.follow_up_date || null
    if (body.supervisor_review !== undefined) patch.supervisor_review = body.supervisor_review
    if (body.mark_reviewed) {
      patch.supervisor_review = false
      patch.reviewed_at = new Date().toISOString()
      patch.reviewed_by = user.email
    }
    const { data, error } = await admin.from('safecase_notes').update(patch).eq('id', body.id).select().single()
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
    const { error } = await admin.from('safecase_notes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
