import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

const ALLOWED = [
  'topic_id', 'platform', 'format', 'hook', 'script', 'caption', 'cta',
  'media_url', 'duration_seconds', 'canvas', 'status',
] as const

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const topicId = new URL(request.url).searchParams.get('topic_id')
    let query = supabase.from('studio_clips').select('*').order('created_at')
    if (topicId) query = query.eq('topic_id', topicId)
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
    const topic_id = String(body.topic_id || '')
    const platform = String(body.platform || '')
    if (!topic_id || !platform) {
      return NextResponse.json({ error: 'topic_id and platform are required' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('studio_clips')
      .insert({
        topic_id,
        platform,
        format: body.format || '9:16',
        hook: body.hook || null,
        script: body.script || null,
        caption: body.caption || null,
        cta: body.cta || null,
        canvas: body.canvas && typeof body.canvas === 'object' ? body.canvas : {},
        status: body.status || 'draft',
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
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (patch.duration_seconds != null) patch.duration_seconds = Number(patch.duration_seconds)
    const { data, error } = await supabase.from('studio_clips').update(patch).eq('id', id).select().single()
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
    const { error } = await supabase.from('studio_clips').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return studioError(err)
  }
}
