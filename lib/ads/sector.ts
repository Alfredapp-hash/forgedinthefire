import type { AdPlatform } from './types'

/** M+R Benchmarks 2026 nonprofit fundraising advertising (sector-wide, not trafficking-specific). */
export type SectorChannel = {
  platform: AdPlatform
  label: string
  roas: number
  cpa_cents: number
  note: string
}

export const SECTOR_CHANNELS: SectorChannel[] = [
  {
    platform: 'google_search',
    label: 'Paid search',
    roas: 2.48,
    cpa_cents: 7000,
    note: 'Highest return. People already searching to give — brand + donate keywords.',
  },
  {
    platform: 'pmax',
    label: 'Multi-channel (PMax)',
    roas: 1.82,
    cpa_cents: 6700,
    note: 'Google Performance Max / Demand Gen. Strong when creative and conversion tracking are tight.',
  },
  {
    platform: 'display',
    label: 'Display',
    roas: 1.11,
    cpa_cents: 11300,
    note: 'Retargeting outperforms cold display. Use for people who already visited donate.',
  },
  {
    platform: 'meta',
    label: 'Meta',
    roas: 0.76,
    cpa_cents: 7400,
    note: 'First-gift ROAS is usually underwater. Treat as donor acquisition; watch 12-month LTV.',
  },
  {
    platform: 'google_grants',
    label: 'Google Ad Grants',
    roas: 0.17,
    cpa_cents: 79300,
    note: 'Credits, not cash. Weak ROAS but the only always-on search channel for $0 media.',
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    roas: 0.04,
    cpa_cents: 59000,
    note: 'Awareness and culture, not direct donate. Average $590 per gift.',
  },
]

export const SECTOR_SOURCE = {
  title: 'M+R Benchmarks 2026 — Advertising',
  url: 'https://mrbenchmarks.com/advertising/',
  extra: [
    { title: 'Nonprofit Tech for Good social stats', url: 'https://www.nptechforgood.com/101-best-practices/social-media-statistics-for-nonprofits/' },
  ],
}

export const SECTOR_NOTES = [
  '58% of nonprofit digital ad spend goes to direct fundraising.',
  'Search + social still take more than two-thirds of fundraising media.',
  'Meta cost per lead ~$3.64 vs TikTok ~$10.69.',
  'Facebook Fundraisers (organic P2P) are not the same as Meta ads — 97% of Facebook fundraising revenue is fundraisers, not ads.',
  'A Meta first-gift ROAS under 1.0 is normal. Failure is not logging LTV.',
]

export function sectorFor(platform: AdPlatform): SectorChannel {
  return SECTOR_CHANNELS.find((c) => c.platform === platform) || {
    platform,
    label: platform,
    roas: 1,
    cpa_cents: 10000,
    note: 'No published sector benchmark for this channel.',
  }
}
