import { NextResponse } from 'next/server'
import { fundraisingError, withFundraisingAdmin } from '@/lib/fundraising/access'
import { slugify, uniqueSlug } from '@/lib/studio/slug'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const display_name = String(body.display_name || '').trim()
    if (!display_name) return NextResponse.json({ error: 'Advocate name is required' }, { status: 400 })
    const { data: existing } = await supabase.from('fundraising_fundraisers').select('slug').eq('campaign_id', id)
    const taken = new Set((existing ?? []).map((r) => r.slug))
    const slug = uniqueSlug(String(body.slug || display_name), taken)
    const { data, error } = await supabase
      .from('fundraising_fundraisers')
      .insert({
        campaign_id: id,
        display_name,
        slug,
        email: body.email || null,
        story: body.story || null,
        goal_cents: body.goal_cents != null ? Number(body.goal_cents) : null,
        status: body.status || 'active',
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return fundraisingError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const body = await request.json() as Record<string, unknown>
    const fundraiserId = String(body.id || '')
    if (!fundraiserId) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ['display_name', 'story', 'email', 'goal_cents', 'status'] as const) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (patch.goal_cents != null) patch.goal_cents = Number(patch.goal_cents)
    const { data, error } = await supabase.from('fundraising_fundraisers').update(patch).eq('id', fundraiserId).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return fundraisingError(err)
  }
}
