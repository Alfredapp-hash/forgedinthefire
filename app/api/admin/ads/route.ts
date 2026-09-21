import { NextResponse } from 'next/server'
import { adsError, isMissingTable, withAdsAdmin } from '@/lib/ads/access'
import { COMPETITOR_CAMPAIGNS, COMPETITOR_PLAYBOOK } from '@/lib/ads/competitors'
import { channelPoints, rollupCampaign, totals, weekPoints } from '@/lib/ads/metrics'
import { buildAdsReport } from '@/lib/ads/report'
import { SECTOR_CHANNELS, SECTOR_NOTES, SECTOR_SOURCE } from '@/lib/ads/sector'
import type { AdCampaign, AdReturnEntry, AdSpendEntry } from '@/lib/ads/types'

async function loadDesk() {
  const { supabase } = await withAdsAdmin()
  let campaigns: AdCampaign[] = []
  let spend: AdSpendEntry[] = []
  let returns: AdReturnEntry[] = []
  let tablesMissing = false
  let utmGifts: { utm_campaign: string | null; amount_cents: number; status: string }[] = []

  try {
    const { data, error } = await supabase.from('ad_campaigns').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    campaigns = (data ?? []) as AdCampaign[]
    const ids = campaigns.map((c) => c.id)
    if (ids.length) {
      const [spendRes, returnRes] = await Promise.all([
        supabase.from('ad_spend_entries').select('*').in('campaign_id', ids).order('period_start', { ascending: true }),
        supabase.from('ad_return_entries').select('*').in('campaign_id', ids).order('period_start', { ascending: true }),
      ])
      if (spendRes.error) throw spendRes.error
      if (returnRes.error) throw returnRes.error
      spend = (spendRes.data ?? []) as AdSpendEntry[]
      returns = (returnRes.data ?? []) as AdReturnEntry[]
    }
  } catch (err) {
    if (!isMissingTable(err)) throw err
    tablesMissing = true
  }

  if (!tablesMissing) {
    try {
      const utms = [...new Set(campaigns.map((c) => c.utm_campaign).filter(Boolean))] as string[]
      if (utms.length) {
        const { data } = await supabase
          .from('fundraising_gifts')
          .select('utm_campaign, amount_cents, status')
          .in('utm_campaign', utms)
          .eq('status', 'completed')
        utmGifts = data ?? []
      }
    } catch {
      utmGifts = []
    }
  }

  const extraReturns: AdReturnEntry[] = []
  for (const campaign of campaigns) {
    if (!campaign.utm_campaign) continue
    const already = returns
      .filter((r) => r.campaign_id === campaign.id && r.method === 'utm')
      .reduce((n, r) => n + Number(r.attributed_cents || 0), 0)
    const matched = utmGifts.filter((g) => g.utm_campaign === campaign.utm_campaign)
    const cents = matched.reduce((n, g) => n + Number(g.amount_cents || 0), 0)
    if (cents > already) {
      extraReturns.push({
        id: `utm-${campaign.id}`,
        campaign_id: campaign.id,
        period_start: campaign.starts_on || new Date().toISOString().slice(0, 10),
        period_end: campaign.ends_on || new Date().toISOString().slice(0, 10),
        attributed_cents: cents - already,
        gift_count: matched.length,
        method: 'utm',
        gift_id: null,
        notes: 'Auto-matched completed gifts by utm_campaign',
        created_by: null,
        created_at: new Date().toISOString(),
      })
    }
  }

  const allReturns = [...returns, ...extraReturns]
  const rollups = campaigns.map((c) => rollupCampaign(c, spend, allReturns))
  const channels = channelPoints(rollups)
  const weeks = weekPoints(spend, allReturns)
  const report = buildAdsReport(rollups, channels)

  return {
    tablesMissing,
    totals: totals(rollups),
    campaigns: rollups,
    spend,
    returns: allReturns,
    channels,
    weeks,
    sector: { channels: SECTOR_CHANNELS, notes: SECTOR_NOTES, source: SECTOR_SOURCE },
    competitors: COMPETITOR_CAMPAIGNS,
    playbook: COMPETITOR_PLAYBOOK,
    report,
  }
}

export async function GET() {
  try {
    return NextResponse.json(await loadDesk())
  } catch (err) {
    return adsError(err)
  }
}
