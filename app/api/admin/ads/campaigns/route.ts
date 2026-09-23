import { NextResponse } from 'next/server'
import { adsError, withAdsAdmin } from '@/lib/ads/access'
import type { AdObjective, AdPlatform, AdStatus } from '@/lib/ads/types'

const PLATFORMS: AdPlatform[] = ['meta', 'google_search', 'google_grants', 'pmax', 'youtube', 'display', 'tiktok', 'other']
const OBJECTIVES: AdObjective[] = ['fundraising', 'awareness', 'lead_gen']
const STATUSES: AdStatus[] = ['draft', 'active', 'paused', 'ended']

function slugUtm(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await withAdsAdmin()
    const body = await request.json() as Record<string, unknown>
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const platform = PLATFORMS.includes(body.platform as AdPlatform) ? body.platform as AdPlatform : 'meta'
    const objective = OBJECTIVES.includes(body.objective as AdObjective) ? body.objective as AdObjective : 'fundraising'
    const status = STATUSES.includes(body.status as AdStatus) ? body.status as AdStatus : 'draft'
    const utm_campaign = String(body.utm_campaign || slugUtm(name))
    const insert = {
      name,
      platform,
      objective,
      status,
      fundraising_campaign_id: body.fundraising_campaign_id || null,
      utm_source: body.utm_source || platform,
      utm_medium: body.utm_medium || 'paid',
      utm_campaign,
      utm_content: body.utm_content || null,
      starts_on: body.starts_on || null,
      ends_on: body.ends_on || null,
      audience: body.audience || null,
      creative_notes: body.creative_notes || null,
      landing_url: body.landing_url || null,
      dignity_reviewed: Boolean(body.dignity_reviewed),
      graphic_detail_reviewed: Boolean(body.graphic_detail_reviewed),
      identifying_info_reviewed: Boolean(body.identifying_info_reviewed),
      created_by: user.email,
    }
    const { data, error } = await supabase.from('ad_campaigns').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return adsError(err)
  }
}
