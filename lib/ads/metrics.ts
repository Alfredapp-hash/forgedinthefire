import type { AdCampaign, AdPlatform, AdReturnEntry, AdSpendEntry, CampaignRollup, ChannelPoint, WeekPoint } from './types'
import { PLATFORM_LABELS } from './types'
import { sectorFor } from './sector'

export function moneyRoas(returnCents: number, spendCents: number): number | null {
  if (spendCents <= 0) return null
  return Math.round((returnCents / spendCents) * 100) / 100
}

export function moneyCpa(spendCents: number, gifts: number): number | null {
  if (gifts <= 0) return null
  return Math.round(spendCents / gifts)
}

export function ctr(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null
  return Math.round((clicks / impressions) * 10000) / 100
}

export function mondayOf(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function rollupCampaign(
  campaign: AdCampaign,
  spend: AdSpendEntry[],
  returns: AdReturnEntry[],
): CampaignRollup {
  const mineSpend = spend.filter((s) => s.campaign_id === campaign.id)
  const mineReturn = returns.filter((r) => r.campaign_id === campaign.id)
  const spend_cents = mineSpend.reduce((n, s) => n + Number(s.spend_cents || 0), 0)
  const return_cents = mineReturn.reduce((n, r) => n + Number(r.attributed_cents || 0), 0)
  const gift_count = mineReturn.reduce((n, r) => n + Number(r.gift_count || 0), 0)
  const impressions = mineSpend.reduce((n, s) => n + Number(s.impressions || 0), 0)
  const clicks = mineSpend.reduce((n, s) => n + Number(s.clicks || 0), 0)
  const roas = moneyRoas(return_cents, spend_cents)
  const sector = sectorFor(campaign.platform)
  return {
    campaign,
    spend_cents,
    return_cents,
    gift_count,
    impressions,
    clicks,
    roas,
    cpa_cents: moneyCpa(spend_cents, gift_count),
    ctr: ctr(clicks, impressions),
    vs_sector_roas: roas == null ? null : Math.round((roas - sector.roas) * 100) / 100,
  }
}

export function channelPoints(rows: CampaignRollup[]): ChannelPoint[] {
  const platforms: AdPlatform[] = ['google_search', 'pmax', 'display', 'meta', 'google_grants', 'tiktok', 'youtube', 'other']
  return platforms.map((platform) => {
    const mine = rows.filter((r) => r.campaign.platform === platform)
    const spend_cents = mine.reduce((n, r) => n + r.spend_cents, 0)
    const return_cents = mine.reduce((n, r) => n + r.return_cents, 0)
    const gift_count = mine.reduce((n, r) => n + r.gift_count, 0)
    const sector = sectorFor(platform)
    return {
      platform,
      label: PLATFORM_LABELS[platform],
      spend_cents,
      return_cents,
      gift_count,
      roas: moneyRoas(return_cents, spend_cents),
      cpa_cents: moneyCpa(spend_cents, gift_count),
      sector_roas: sector.roas,
      sector_cpa_cents: sector.cpa_cents,
    }
  }).filter((p) => p.spend_cents > 0 || ['google_search', 'pmax', 'display', 'meta', 'google_grants', 'tiktok'].includes(p.platform))
}

export function weekPoints(spend: AdSpendEntry[], returns: AdReturnEntry[]): WeekPoint[] {
  const map = new Map<string, WeekPoint>()
  const bump = (iso: string) => {
    const week = mondayOf(iso)
    if (!map.has(week)) map.set(week, { week, spend_cents: 0, return_cents: 0 })
    return map.get(week)!
  }
  for (const s of spend) bump(s.period_start).spend_cents += Number(s.spend_cents || 0)
  for (const r of returns) bump(r.period_start).return_cents += Number(r.attributed_cents || 0)
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week))
}

export function totals(rows: CampaignRollup[]) {
  const spend_cents = rows.reduce((n, r) => n + r.spend_cents, 0)
  const return_cents = rows.reduce((n, r) => n + r.return_cents, 0)
  const gift_count = rows.reduce((n, r) => n + r.gift_count, 0)
  return {
    spend_cents,
    return_cents,
    gift_count,
    roas: moneyRoas(return_cents, spend_cents),
    cpa_cents: moneyCpa(spend_cents, gift_count),
  }
}

export function formatRoas(value: number | null) {
  if (value == null) return '—'
  return `${value.toFixed(2)}×`
}

export function formatPct(value: number | null) {
  if (value == null) return '—'
  return `${value.toFixed(2)}%`
}
