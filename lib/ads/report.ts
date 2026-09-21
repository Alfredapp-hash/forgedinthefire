import { COMPETITOR_CAMPAIGNS, COMPETITOR_PLAYBOOK } from './competitors'
import { SECTOR_CHANNELS, SECTOR_SOURCE } from './sector'
import { formatRoas, totals } from './metrics'
import { formatCents } from '@/lib/fundraising/progress'
import { PLATFORM_LABELS, type CampaignRollup, type ChannelPoint } from './types'

export type AdsReport = {
  generated_at: string
  headline: string
  summary: string
  source: string
  source_url: string
  fitf: {
    spend: string
    returned: string
    roas: string
    gifts: number
    cpa: string
    reading: string
  }
  channels: { label: string; fitf_roas: string; sector_roas: string; note: string }[]
  working: { title: string; body: string }[]
  peers: { org: string; campaign: string; takeaway: string }[]
  next: string[]
}

function fitfReading(roas: number | null, spend: number) {
  if (spend <= 0) {
    return 'No FITF ad spend is logged yet. Sector data below is the starting benchmark: buy search for return, Meta for acquisition, skip TikTok for donate, and keep dignity gates on every creative.'
  }
  if (roas == null) {
    return 'Spend is logged but no return is attributed. Add UTM-matched gifts or a manual return so ROAS is real instead of vanity reach.'
  }
  if (roas >= 2) return 'Return is in paid-search territory. Protect this mix; scale the winning channel in 20% steps, not a full budget swing.'
  if (roas >= 1) return 'First-gift return covers media. That is ahead of typical Meta fundraising. Keep logging 90-day LTV before calling it a win.'
  if (roas >= 0.7) return 'In line with sector Meta fundraising (~0.76×). Treat this as donor acquisition. The test is whether those donors give again in 12 months.'
  return 'First-gift ROAS is below sector Meta. Pause the worst creative, shift budget to search/retargeting, and confirm landing pages name a match or a catalog SKU.'
}

export function buildAdsReport(rows: CampaignRollup[], channels: ChannelPoint[]): AdsReport {
  const t = totals(rows)
  return {
    generated_at: new Date().toISOString(),
    headline: t.spend_cents > 0
      ? `FITF ads returned ${formatRoas(t.roas)} on ${formatCents(t.spend_cents)} spent`
      : `FITF ad tracker is live — sector and ${COMPETITOR_CAMPAIGNS.length} peer campaigns are the first benchmark`,
    summary: fitfReading(t.roas, t.spend_cents),
    source: SECTOR_SOURCE.title,
    source_url: SECTOR_SOURCE.url,
    fitf: {
      spend: formatCents(t.spend_cents),
      returned: formatCents(t.return_cents),
      roas: formatRoas(t.roas),
      gifts: t.gift_count,
      cpa: t.cpa_cents == null ? '—' : formatCents(t.cpa_cents),
      reading: fitfReading(t.roas, t.spend_cents),
    },
    channels: channels.map((c) => {
      const sector = SECTOR_CHANNELS.find((s) => s.platform === c.platform)
      return {
        label: PLATFORM_LABELS[c.platform],
        fitf_roas: formatRoas(c.roas),
        sector_roas: `${sector?.roas.toFixed(2) ?? '—'}×`,
        note: sector?.note || '',
      }
    }),
    working: COMPETITOR_PLAYBOOK.map((p) => ({ title: p.title, body: p.body })),
    peers: COMPETITOR_CAMPAIGNS.map((c) => ({
      org: c.org,
      campaign: c.campaign,
      takeaway: c.copy_for_fitf,
    })),
    next: [
      'Log every Meta / Google invoice as an ad campaign with UTM that already rides on Zeffy checkout.',
      'Stand up Google Ad Grants plus a small paid-search brand campaign before scaling Meta prospecting.',
      'Retarget /donate and live campaign visitors with a match or catalog SKU.',
      'Recruit advocates (Shared Hope / Polaris pattern) instead of trying to close strangers inside an ad.',
      'Refuse shock, raid, or missing-child creative — TAT/NCMEC recovery posts are not fundraising ads.',
    ],
  }
}
