import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const { slug } = await params
  const body = await request.json() as Record<string, unknown>
  if (body.company) {
    return NextResponse.json({ ok: true })
  }
  const amountDollars = Number(body.amount_dollars)
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return NextResponse.json({ error: 'Enter the amount you gave' }, { status: 400 })
  }
  const { data: campaign } = await supabase
    .from('fundraising_campaigns')
    .select('id, status, honor_gifts_enabled')
    .eq('slug', slug)
    .eq('status', 'live')
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { error } = await supabase.from('fundraising_gifts').insert({
    campaign_id: campaign.id,
    fundraiser_id: body.fundraiser_id || null,
    amount_cents: Math.round(amountDollars * 100),
    source: 'zeffy',
    status: 'pending',
    donor_display_name: body.is_anonymous ? null : String(body.donor_display_name || '').trim() || null,
    donor_email: String(body.donor_email || '').trim() || null,
    is_anonymous: Boolean(body.is_anonymous),
    is_recurring: Boolean(body.is_recurring),
    honor_of: campaign.honor_gifts_enabled ? (body.honor_of || null) : null,
    memory_of: campaign.honor_gifts_enabled ? (body.memory_of || null) : null,
    message: String(body.message || '').slice(0, 280) || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    message: 'Thank you. We will confirm this gift and the thermometer will update.',
  }, { status: 201 })
}
