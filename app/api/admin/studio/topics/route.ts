import { NextResponse } from 'next/server'
import { createDefaultClips, studioError, withStudioAdmin } from '@/lib/studio/api'
import { slugify, uniqueSlug } from '@/lib/studio/slug'

const ALLOWED = [
  'title', 'slug', 'summary', 'talking_points', 'scheduled_on', 'status', 'blog_post_id', 'cover_url',
] as const

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const status = new URL(request.url).searchParams.get('status')
    let query = supabase.from('content_topics').select('*').order('scheduled_on', { ascending: true, nullsFirst: false })
    if (status && status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const bulk = typeof body.bulk === 'string' ? body.bulk : ''

    if (bulk.trim()) {
      const { data: existing } = await supabase.from('content_topics').select('slug')
      const taken = new Set((existing ?? []).map((row) => row.slug))
      const created = []
      for (const line of bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
        const slug = uniqueSlug(line, taken)
        taken.add(slug)
        const { data, error } = await supabase
          .from('content_topics')
          .insert({
            title: line,
            slug,
            scheduled_on: body.scheduled_on || null,
            status: body.status || 'idea',
            created_by: user.email,
          })
          .select()
          .single()
        if (error) throw error
        await createDefaultClips(supabase, data.id)
        created.push(data)
      }
      return NextResponse.json(created, { status: 201 })
    }

    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    const slug = slugify(String(body.slug || title))
    const { data, error } = await supabase
      .from('content_topics')
      .insert({
        title,
        slug,
        summary: String(body.summary || '').trim() || null,
        talking_points: Array.isArray(body.talking_points) ? body.talking_points : [],
        scheduled_on: body.scheduled_on || null,
        status: body.status || 'idea',
        created_by: user.email,
      })
      .select()
      .single()
    if (error) throw error
    await createDefaultClips(supabase, data.id)
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
    if (typeof patch.title === 'string') patch.title = patch.title.trim()
    if (typeof patch.slug === 'string') patch.slug = slugify(patch.slug)
    const { data, error } = await supabase.from('content_topics').update(patch).eq('id', id).select().single()
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
    const { error } = await supabase.from('content_topics').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return studioError(err)
  }
}
