import { DONATION_TIERS } from '@/lib/constants'
import { ZEFFY_DONATE_URL } from '@/lib/fundraising/types'
import type { CampaignType, RestrictedFund, SuggestedAmount } from '@/lib/fundraising/types'

export const DEFAULT_AMOUNTS: SuggestedAmount[] = DONATION_TIERS.map((tier) => ({
  amount: tier.amount,
  label: tier.label,
  impact: tier.impact,
}))

export type CampaignTemplate = {
  id: string
  title: string
  campaign_type: CampaignType
  restricted_fund: RestrictedFund
  goal_cents: number
  tagline: string
  story: string
  matching_enabled: boolean
  matching_ratio: number
  matching_cap_cents: number | null
  matching_sponsor: string | null
  honor_gifts_enabled: boolean
  share_caption: string
  milestones: { amount_cents: number; label: string }[]
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'emergency-housing',
    title: 'Emergency housing for survivors',
    campaign_type: 'emergency',
    restricted_fund: 'housing',
    goal_cents: 2500000,
    tagline: 'Safe beds in Lorain County — this week, not someday.',
    story:
      'When a survivor reaches us in crisis, the first need is a door that locks and a night that is theirs. This campaign funds emergency and transitional housing in Lorain County so no one is asked to wait on a waitlist while they are still in danger.\n\nYour gift stays on our site, tagged to housing, and is processed at 0% platform fees. Survivors are never required to share identifying details to receive help.',
    matching_enabled: false,
    matching_ratio: 1,
    matching_cap_cents: null,
    matching_sponsor: null,
    honor_gifts_enabled: true,
    share_caption:
      'Help Forged in the Fire fund emergency housing for survivors in Lorain County. 501(c)(3) · 0% platform fees.',
    milestones: [
      { amount_cents: 500000, label: 'Two weeks of safe housing' },
      { amount_cents: 1250000, label: 'A month of wraparound beds' },
      { amount_cents: 2500000, label: 'Campaign goal' },
    ],
  },
  {
    id: 'giving-tuesday',
    title: 'Giving Tuesday — Forged Light',
    campaign_type: 'giving_day',
    restricted_fund: 'general',
    goal_cents: 1000000,
    tagline: 'One day. Local dollars. Survivors in Northeast Ohio.',
    story:
      'Giving Tuesday is our annual sprint for unrestricted support — advocacy, housing pathways, workforce, and whatever a survivor names as the next step. We do not buy lists or rent drama. We ask neighbors in Lorain County to fund the work they can see.',
    matching_enabled: false,
    matching_ratio: 1,
    matching_cap_cents: null,
    matching_sponsor: null,
    honor_gifts_enabled: true,
    share_caption: 'It is Giving Tuesday. Stand with survivors in Lorain County — Forged in the Fire.',
    milestones: [
      { amount_cents: 250000, label: 'First wave' },
      { amount_cents: 500000, label: 'Halfway' },
      { amount_cents: 1000000, label: 'Day goal' },
    ],
  },
  {
    id: 'matching-challenge',
    title: 'Double-the-gift matching challenge',
    campaign_type: 'matching',
    restricted_fund: 'general',
    goal_cents: 2000000,
    tagline: 'A sponsor matches every dollar, up to the cap.',
    story:
      'A community sponsor will match gifts 1:1 during this window. The thermometer counts both your gift and the match so you can see the doubled impact. Matching is never a reason to rush a survivor’s story onto a page — this campaign uses program impact, not identifying details.',
    matching_enabled: true,
    matching_ratio: 1,
    matching_cap_cents: 1000000,
    matching_sponsor: 'Community matching sponsor',
    honor_gifts_enabled: true,
    share_caption: 'Gifts to Forged in the Fire are matched 1:1 right now. Double your impact for survivors.',
    milestones: [
      { amount_cents: 500000, label: 'Match starts compounding' },
      { amount_cents: 1000000, label: 'Match cap reached' },
      { amount_cents: 2000000, label: 'Combined goal' },
    ],
  },
  {
    id: 'workforce',
    title: 'Workforce & independence fund',
    campaign_type: 'program',
    restricted_fund: 'workforce',
    goal_cents: 1500000,
    tagline: 'Training, clothes, and first-month stability — on the survivor’s timeline.',
    story:
      'Independence is a program, not a slogan. This fund covers job-readiness, interview clothing, certifications, and the first month of stability so survivors in Lorain County can say yes to work without losing housing.',
    matching_enabled: false,
    matching_ratio: 1,
    matching_cap_cents: null,
    matching_sponsor: null,
    honor_gifts_enabled: true,
    share_caption: 'Fund workforce pathways for survivors in Lorain County with Forged in the Fire.',
    milestones: [
      { amount_cents: 300000, label: 'Ten job-readiness kits' },
      { amount_cents: 750000, label: 'A cohort through training' },
      { amount_cents: 1500000, label: 'Program goal' },
    ],
  },
  {
    id: 'advocate-p2p',
    title: 'Advocate pages — raise with us',
    campaign_type: 'p2p',
    restricted_fund: 'general',
    goal_cents: 5000000,
    tagline: 'Friends, churches, and teams each get a page. Totals roll up here.',
    story:
      'Create an advocate page for your congregation, workplace, or family. Personal goals feed this parent campaign. Share your own link — we still process gifts at 0% platform fees and never require survivors to be named.',
    matching_enabled: false,
    matching_ratio: 1,
    matching_cap_cents: null,
    matching_sponsor: null,
    honor_gifts_enabled: true,
    share_caption: 'I am raising money for Forged in the Fire. Join me — every dollar stays with survivors.',
    milestones: [
      { amount_cents: 1000000, label: 'First ten advocates' },
      { amount_cents: 2500000, label: 'Halfway' },
      { amount_cents: 5000000, label: 'Network goal' },
    ],
  },
]

export function zeffyCheckoutUrl(amount?: number | null, extra?: Record<string, string>, baseUrl?: string | null) {
  const url = new URL(baseUrl || ZEFFY_DONATE_URL)
  if (amount && amount > 0) url.searchParams.set('amount', String(Math.round(amount)))
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

export function campaignPagePath(slug: string, fundraiserSlug?: string) {
  return fundraiserSlug ? `/campaigns/${slug}/f/${fundraiserSlug}` : `/campaigns/${slug}`
}
