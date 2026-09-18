import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

const ALLOWED = [
  'title', 'author', 'email', 'description', 'category', 'subcategory',
  'language', 'explicit', 'cover_url', 'website_url', 'copyright',
  'itunes_type', 'owner_name', 'slug',
] as const

export async function GET() {
  try {
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase
      .from('podcast_shows')
      .select('*')
      .order('is_default', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
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
    if (patch.explicit != null) patch.explicit = Boolean(patch.explicit)
    const { data, error } = await supabase
      .from('podcast_shows')
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
