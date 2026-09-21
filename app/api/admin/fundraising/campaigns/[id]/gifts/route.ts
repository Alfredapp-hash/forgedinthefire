import { NextResponse } from 'next/server'
import { fundraisingError, withFundraisingAdmin } from '@/lib/fundraising/access'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase } = await withFundraisingAdmin()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const amount = Number(body.amount_cents ?? (Number(body.amount_dollars) * 100))
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('fundraising_gifts')
      .insert({
        campaign_id: id,
        fundraiser_id: body.fundraiser_id || null,
        amount_cents: Math.round(amount),
        source: body.source || 'zeffy',
        status: body.status || 'completed',
        donor_display_name: body.is_anonymous ? null : (body.donor_display_name || null),
        donor_email: body.donor_email || null,
        is_anonymous: Boolean(body.is_anonymous),
        is_recurring: Boolean(body.is_recurring),
        honor_of: body.honor_of || null,
        memory_of: body.memory_of || null,
        message: body.message || null,
        received_at: body.received_at || new Date().toISOString(),
        external_id: body.external_id || null,
        notes: body.notes || null,
        utm_source: body.utm_source || null,
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
        utm_content: body.utm_content || null,
        created_by: user.email,
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
    const giftId = String(body.id || '')
    if (!giftId) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    for (const key of ['status', 'notes', 'donor_display_name', 'is_anonymous', 'source', 'amount_cents'] as const) {
      if (body[key] !== undefined) patch[key] = body[key]
    }
    if (patch.amount_cents != null) patch.amount_cents = Math.round(Number(patch.amount_cents))
    const { data, error } = await supabase.from('fundraising_gifts').update(patch).eq('id', giftId).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return fundraisingError(err)
  }
}
