import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const openOnly = searchParams.get('open') === '1'
    let query = admin
      .from('safecase_tasks')
      .select('*, client:safecase_clients(first_name, last_name)')
      .order('due_date', { ascending: true, nullsFirst: false })
    if (clientId) query = query.eq('client_id', clientId)
    if (openOnly) query = query.in('status', ['pending', 'in_progress'])
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
    const task_name = String(body.task_name || '').trim()
    if (!task_name) return NextResponse.json({ error: 'Task name is required' }, { status: 400 })
    const { data, error } = await admin
      .from('safecase_tasks')
      .insert({
        task_name,
        details: String(body.details || '').trim() || null,
        client_id: body.client_id || null,
        priority: body.priority || 'medium',
        status: body.status || 'pending',
        due_date: body.due_date || null,
        assigned_to: String(body.assigned_to || '').trim() || user.email,
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
      status?: string
      priority?: string
      due_date?: string | null
      assigned_to?: string | null
      details?: string | null
      task_name?: string
    }
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (body.status) {
      patch.status = body.status
      patch.completed_at = body.status === 'completed' ? new Date().toISOString() : null
    }
    if (body.priority) patch.priority = body.priority
    if (body.due_date !== undefined) patch.due_date = body.due_date
    if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to
    if (body.details !== undefined) patch.details = body.details
    if (body.task_name) patch.task_name = body.task_name
    const { data, error } = await admin.from('safecase_tasks').update(patch).eq('id', body.id).select().single()
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
    const { error } = await admin.from('safecase_tasks').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
