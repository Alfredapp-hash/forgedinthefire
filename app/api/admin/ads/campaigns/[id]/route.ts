import { NextResponse } from 'next/server'
import { adsError, withAdsAdmin } from '@/lib/ads/access'

const PATCH_FIELDS = [
  'name', 'platform', 'objective', 'status', 'fundraising_campaign_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'starts_on', 'ends_on', 'audience', 'creative_notes', 'landing_url',
  'dignity_reviewed', 'graphic_detail_reviewed', 'identifying_info_reviewed',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withAdsAdmin()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of PATCH_FIELDS) {
      if (body[key] !== undefined) patch[key] = body[key]
    }
    const { data, error } = await supabase.from('ad_campaigns').update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return adsError(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withAdsAdmin()
    const { id } = await params
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return adsError(err)
  }
}
