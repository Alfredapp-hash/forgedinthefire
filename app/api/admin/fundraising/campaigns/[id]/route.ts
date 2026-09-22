import { NextResponse } from 'next/server'
import { fundraisingError, withFundraisingAdmin } from '@/lib/fundraising/access'
import { CAMPAIGN_PATCH_FIELDS } from '@/lib/fundraising/fields'
import { slugify } from '@/lib/fundraising/slug'
import { publishIssues } from '@/lib/fundraising/progress'
import { campaignProgress } from '@/lib/fundraising/progress'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { id } = await params
    const { data, error } = await supabase.from('fundraising_campaigns').select('*').eq('id', id).single()
    if (error || !data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    const [{ data: gifts }, { data: fundraisers }] = await Promise.all([
      supabase.from('fundraising_gifts').select('*').eq('campaign_id', id).order('received_at', { ascending: false }),
      supabase.from('fundraising_fundraisers').select('*').eq('campaign_id', id).order('created_at'),
    ])
    return NextResponse.json({
      campaign: data,
      gifts: gifts ?? [],
      fundraisers: fundraisers ?? [],
      progress: campaignProgress(data, gifts ?? []),
    })
  } catch (err) {
    return fundraisingError(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of CAMPAIGN_PATCH_FIELDS) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (typeof patch.slug === 'string') patch.slug = slugify(patch.slug)
    if (typeof patch.title === 'string') patch.title = patch.title.trim()
    for (const n of ['goal_cents', 'stretch_goal_cents', 'matching_cap_cents', 'matching_ratio'] as const) {
      if (patch[n] != null) patch[n] = Number(patch[n])
    }
    for (const b of ['matching_enabled', 'honor_gifts_enabled', 'show_donor_wall', 'show_thermometer', 'show_live_feed', 'consent_confirmed', 'show_public_advisory', 'graphic_detail_reviewed', 'identifying_info_reviewed'] as const) {
      if (patch[b] != null) patch[b] = Boolean(patch[b])
    }

    const { data: current, error: currentError } = await supabase
      .from('fundraising_campaigns')
      .select('*')
      .eq('id', id)
      .single()
    if (currentError || !current) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const merged = { ...current, ...patch }
    const nextStatus = String(patch.status ?? current.status)
    if (nextStatus === 'live') {
      const issues = publishIssues(merged)
      if (issues.length) {
        return NextResponse.json({ error: issues.join('; '), issues }, { status: 400 })
      }
      if (!patch.published_at) patch.published_at = current.published_at || new Date().toISOString()
    }

    const { data, error } = await supabase.from('fundraising_campaigns').update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return fundraisingError(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { id } = await params
    const { error } = await supabase.from('fundraising_campaigns').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return fundraisingError(err)
  }
}
