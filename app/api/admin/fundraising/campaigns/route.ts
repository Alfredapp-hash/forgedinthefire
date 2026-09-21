import { NextResponse } from 'next/server'
import { fundraisingError, withFundraisingAdmin } from '@/lib/fundraising/access'
import { CAMPAIGN_TEMPLATES, DEFAULT_AMOUNTS } from '@/lib/fundraising/templates'
import { slugify, uniqueSlug } from '@/lib/fundraising/slug'
import { ZEFFY_DONATE_URL } from '@/lib/fundraising/types'
import { campaignProgress } from '@/lib/fundraising/progress'

export async function GET() {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { data: campaigns, error } = await supabase
      .from('fundraising_campaigns')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    const ids = (campaigns ?? []).map((c) => c.id)
    const { data: gifts } = ids.length
      ? await supabase.from('fundraising_gifts').select('campaign_id, amount_cents, status, is_anonymous, donor_display_name').in('campaign_id', ids)
      : { data: [] as { campaign_id: string; amount_cents: number; status: string; is_anonymous: boolean; donor_display_name: string | null }[] }
    const byCampaign = new Map<string, typeof gifts>()
    for (const g of gifts ?? []) {
      const list = byCampaign.get(g.campaign_id) || []
      list.push(g)
      byCampaign.set(g.campaign_id, list)
    }
    return NextResponse.json(
      (campaigns ?? []).map((c) => ({
        ...c,
        progress: campaignProgress(c, byCampaign.get(c.id) || []),
      })),
    )
  } catch (err) {
    return fundraisingError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await withFundraisingAdmin()
    const body = await request.json() as Record<string, unknown>
    const templateId = String(body.template || '')
    const template = CAMPAIGN_TEMPLATES.find((t) => t.id === templateId)
    const title = String(body.title || template?.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const { data: existing } = await supabase.from('fundraising_campaigns').select('slug')
    const taken = new Set((existing ?? []).map((r) => r.slug))
    const slug = uniqueSlug(String(body.slug || title), taken)

    const insert = {
      title,
      slug,
      tagline: body.tagline ?? template?.tagline ?? null,
      story: body.story ?? template?.story ?? null,
      status: 'draft',
      campaign_type: body.campaign_type || template?.campaign_type || 'annual',
      goal_cents: Number(body.goal_cents ?? template?.goal_cents ?? 0),
      stretch_goal_cents: body.stretch_goal_cents != null ? Number(body.stretch_goal_cents) : null,
      restricted_fund: body.restricted_fund || template?.restricted_fund || 'general',
      matching_enabled: Boolean(body.matching_enabled ?? template?.matching_enabled),
      matching_ratio: Number(body.matching_ratio ?? template?.matching_ratio ?? 1),
      matching_cap_cents: (body.matching_cap_cents ?? template?.matching_cap_cents) != null
        ? Number(body.matching_cap_cents ?? template?.matching_cap_cents)
        : null,
      matching_sponsor: (body.matching_sponsor as string) || template?.matching_sponsor || null,
      zeffy_url: body.zeffy_url || ZEFFY_DONATE_URL,
      honor_gifts_enabled: template?.honor_gifts_enabled ?? true,
      suggested_amounts: Array.isArray(body.suggested_amounts) ? body.suggested_amounts : DEFAULT_AMOUNTS,
      milestones: Array.isArray(body.milestones) ? body.milestones : (template?.milestones || []),
      share_caption: (body.share_caption as string) || template?.share_caption || null,
      utm_campaign: slugify(title),
      created_by: user.email,
    }

    const { data, error } = await supabase.from('fundraising_campaigns').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return fundraisingError(err)
  }
}
