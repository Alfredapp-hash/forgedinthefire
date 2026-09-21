export type AdPlatform =
  | 'meta'
  | 'google_search'
  | 'google_grants'
  | 'pmax'
  | 'youtube'
  | 'display'
  | 'tiktok'
  | 'other'

export type AdObjective = 'fundraising' | 'awareness' | 'lead_gen'
export type AdStatus = 'draft' | 'active' | 'paused' | 'ended'
export type AttributionMethod = 'manual' | 'utm' | 'platform'

export type AdCampaign = {
  id: string
  name: string
  platform: AdPlatform
  objective: AdObjective
  status: AdStatus
  fundraising_campaign_id: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  starts_on: string | null
  ends_on: string | null
  audience: string | null
  creative_notes: string | null
  landing_url: string | null
  dignity_reviewed: boolean
  graphic_detail_reviewed: boolean
  identifying_info_reviewed: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AdSpendEntry = {
  id: string
  campaign_id: string
  period_start: string
  period_end: string
  spend_cents: number
  impressions: number | null
  clicks: number | null
  reach: number | null
  platform_results: number | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type AdReturnEntry = {
  id: string
  campaign_id: string
  period_start: string
  period_end: string
  attributed_cents: number
  gift_count: number
  method: AttributionMethod
  gift_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type CampaignRollup = {
  campaign: AdCampaign
  spend_cents: number
  return_cents: number
  gift_count: number
  impressions: number
  clicks: number
  roas: number | null
  cpa_cents: number | null
  ctr: number | null
  vs_sector_roas: number | null
}

export type ChannelPoint = {
  platform: AdPlatform
  label: string
  spend_cents: number
  return_cents: number
  gift_count: number
  roas: number | null
  cpa_cents: number | null
  sector_roas: number
  sector_cpa_cents: number
}

export type WeekPoint = {
  week: string
  spend_cents: number
  return_cents: number
}

export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: 'Meta (Facebook / Instagram)',
  google_search: 'Paid search',
  google_grants: 'Google Ad Grants',
  pmax: 'Performance Max / multi-channel',
  youtube: 'YouTube',
  display: 'Display',
  tiktok: 'TikTok',
  other: 'Other',
}

export const OBJECTIVE_LABELS: Record<AdObjective, string> = {
  fundraising: 'Direct fundraising',
  awareness: 'Awareness',
  lead_gen: 'Lead / advocate',
}

export const STATUS_LABELS: Record<AdStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended',
}

export const METHOD_LABELS: Record<AttributionMethod, string> = {
  manual: 'Logged return',
  utm: 'UTM match',
  platform: 'Platform reported',
}
