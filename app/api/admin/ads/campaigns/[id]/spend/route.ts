import { NextResponse } from 'next/server'
import { adsError, withAdsAdmin } from '@/lib/ads/access'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase } = await withAdsAdmin()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const spend = Number(body.spend_cents ?? (Number(body.spend_dollars) * 100))
    if (!Number.isFinite(spend) || spend < 0) {
      return NextResponse.json({ error: 'Spend is required' }, { status: 400 })
    }
    const period_start = String(body.period_start || '').slice(0, 10)
    if (!period_start) return NextResponse.json({ error: 'Period start is required' }, { status: 400 })
    const { data, error } = await supabase.from('ad_spend_entries').insert({
      campaign_id: id,
      period_start,
      period_end: String(body.period_end || period_start).slice(0, 10),
      spend_cents: Math.round(spend),
      impressions: body.impressions != null ? Number(body.impressions) : null,
      clicks: body.clicks != null ? Number(body.clicks) : null,
      reach: body.reach != null ? Number(body.reach) : null,
      platform_results: body.platform_results != null ? Number(body.platform_results) : null,
      notes: body.notes || null,
      created_by: user.email,
    }).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return adsError(err)
  }
}
