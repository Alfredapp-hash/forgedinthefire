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
    const cents = Number(body.attributed_cents ?? (Number(body.attributed_dollars) * 100))
    if (!Number.isFinite(cents) || cents < 0) {
      return NextResponse.json({ error: 'Attributed return is required' }, { status: 400 })
    }
    const period_start = String(body.period_start || '').slice(0, 10)
    if (!period_start) return NextResponse.json({ error: 'Period start is required' }, { status: 400 })
    const method = ['manual', 'utm', 'platform'].includes(String(body.method)) ? String(body.method) : 'manual'
    const { data, error } = await supabase.from('ad_return_entries').insert({
      campaign_id: id,
      period_start,
      period_end: String(body.period_end || period_start).slice(0, 10),
      attributed_cents: Math.round(cents),
      gift_count: Math.max(0, Number(body.gift_count || 0)),
      method,
      gift_id: body.gift_id || null,
      notes: body.notes || null,
      created_by: user.email,
    }).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return adsError(err)
  }
}
