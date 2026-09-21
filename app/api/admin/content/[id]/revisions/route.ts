import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('content_revisions')
      .select('id, created_at, created_by')
      .eq('content_id', id)
      .order('created_at', { ascending: false })
      .limit(25)
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to list revisions' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createAdminClient()
    const body = await request.json() as { revisionId?: string }
    if (!body.revisionId) return NextResponse.json({ error: 'revisionId required' }, { status: 400 })
    const { data: rev, error } = await supabase
      .from('content_revisions')
      .select('snapshot')
      .eq('id', body.revisionId)
      .eq('content_id', id)
      .single()
    if (error) throw error
    const snap = (rev.snapshot || {}) as Record<string, unknown>
    delete snap.id
    delete snap.preview_token
    const { data, error: updateError } = await supabase
      .from('content')
      .update(snap)
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to restore revision' }, { status: 500 })
  }
}
