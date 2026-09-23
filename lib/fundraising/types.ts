export const ZEFFY_DONATE_URL =
  'https://www.zeffy.com/en-US/donation-form/donate-to-change-lives-13754'

export type CampaignStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'ended' | 'archived'
export type CampaignType = 'annual' | 'emergency' | 'program' | 'matching' | 'giving_day' | 'p2p'
export type RestrictedFund = 'general' | 'housing' | 'advocacy' | 'workforce' | 'emergency'
export type GiftSource = 'zeffy' | 'stripe' | 'check' | 'cash' | 'ach' | 'in_kind' | 'other'
export type GiftStatus = 'pending' | 'completed' | 'refunded' | 'void'
export type FundraiserStatus = 'invited' | 'active' | 'paused'

export type SuggestedAmount = {
  amount: number
  label: string
  impact: string
}

export type CampaignMilestone = {
  amount_cents: number
  label: string
}

export type FundraisingCampaign = {
  id: string
  title: string
  slug: string
  tagline: string | null
  story: string | null
  cover_url: string | null
  status: CampaignStatus
  campaign_type: CampaignType
  goal_cents: number
  stretch_goal_cents: number | null
  currency: string
  starts_at: string | null
  ends_at: string | null
  restricted_fund: RestrictedFund
  matching_enabled: boolean
  matching_cap_cents: number | null
  matching_ratio: number
  matching_sponsor: string | null
  zeffy_url: string | null
  honor_gifts_enabled: boolean
  show_donor_wall: boolean
  show_thermometer: boolean
  show_live_feed: boolean
  suggested_amounts: SuggestedAmount[]
  milestones: CampaignMilestone[]
  share_caption: string | null
  utm_campaign: string | null
  topic_id: string | null
  preview_token: string | null
  consent_confirmed: boolean
  identity_protection: 'anonymous' | 'pseudonym' | 'first_name' | 'real_name'
  content_warning: string | null
  show_public_advisory: boolean
  graphic_detail_reviewed: boolean
  identifying_info_reviewed: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

export type FundraisingGift = {
  id: string
  campaign_id: string
  fundraiser_id: string | null
  amount_cents: number
  currency: string
  source: GiftSource
  status: GiftStatus
  donor_display_name: string | null
  donor_email: string | null
  is_anonymous: boolean
  is_recurring: boolean
  honor_of: string | null
  memory_of: string | null
  message: string | null
  received_at: string
  external_id: string | null
  notes: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  created_by: string | null
  created_at: string
}

export type FundraisingFundraiser = {
  id: string
  campaign_id: string
  display_name: string
  slug: string
  email: string | null
  story: string | null
  goal_cents: number | null
  status: FundraiserStatus
  created_at: string
  updated_at: string
}

export type CampaignProgress = {
  raised_cents: number
  matched_cents: number
  combined_cents: number
  gift_count: number
  donor_count: number
  avg_gift_cents: number
  pct: number
  stretch_pct: number | null
}

export const CAMPAIGN_PIPELINE: CampaignStatus[] = [
  'draft',
  'scheduled',
  'live',
  'paused',
  'ended',
  'archived',
]

export const FUND_LABELS: Record<RestrictedFund, string> = {
  general: 'Unrestricted — greatest need',
  housing: 'Safe housing',
  advocacy: 'Victim advocacy',
  workforce: 'Workforce development',
  emergency: 'Emergency response',
}

export const TYPE_LABELS: Record<CampaignType, string> = {
  annual: 'Annual fund',
  emergency: 'Emergency',
  program: 'Program',
  matching: 'Matching challenge',
  giving_day: 'Giving day',
  p2p: 'Advocate / peer-to-peer',
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  paused: 'Paused',
  ended: 'Ended',
  archived: 'Archived',
}

export const SOURCE_LABELS: Record<GiftSource, string> = {
  zeffy: 'Zeffy',
  stripe: 'Stripe',
  check: 'Check',
  cash: 'Cash',
  ach: 'ACH / bank',
  in_kind: 'In-kind',
  other: 'Other',
}
