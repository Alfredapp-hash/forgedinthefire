import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const showId = new URL(request.url).searchParams.get('show_id')
    let query = supabase
      .from('podcast_subscribers')
      .select('*')
      .order('invited_at', { ascending: false })
    if (showId) query = query.eq('show_id', showId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const email = String(body.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
    let showId = body.show_id ? String(body.show_id) : ''
    if (!showId) {
      const { data: show } = await supabase
        .from('podcast_shows')
        .select('id')
        .eq('is_default', true)
        .maybeSingle()
      showId = show?.id || ''
    }
    if (!showId) return NextResponse.json({ error: 'No show configured' }, { status: 400 })
    const { data, error } = await supabase
      .from('podcast_subscribers')
      .insert({
        show_id: showId,
        email,
        name: body.name ? String(body.name).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        status: 'active',
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    for (const key of ['status', 'name', 'notes', 'email'] as const) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    const { data, error } = await supabase
      .from('podcast_subscribers')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabase.from('podcast_subscribers').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return studioError(err)
  }
}
