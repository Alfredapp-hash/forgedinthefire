import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

export async function GET() {
  try {
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase.from('studio_templates').select('*').order('name')
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
    const name = String(body.name || '').trim()
    const kind = String(body.kind || 'social')
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const { data, error } = await supabase
      .from('studio_templates')
      .insert({
        name,
        kind,
        format: body.format || '1:1',
        canvas: body.canvas && typeof body.canvas === 'object' ? body.canvas : {},
        thumbnail_url: body.thumbnail_url || null,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}
