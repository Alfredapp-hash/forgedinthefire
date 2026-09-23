import type { CampaignProgress, FundraisingCampaign, FundraisingGift } from '@/lib/fundraising/types'

export function dollarsToCents(amount: number) {
  return Math.round(amount * 100)
}

export function centsToDollars(cents: number) {
  return cents / 100
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function campaignProgress(
  campaign: Pick<FundraisingCampaign, 'goal_cents' | 'stretch_goal_cents' | 'matching_enabled' | 'matching_ratio' | 'matching_cap_cents'>,
  gifts: Pick<FundraisingGift, 'amount_cents' | 'status' | 'is_anonymous' | 'donor_display_name'>[],
): CampaignProgress {
  const completed = gifts.filter((g) => g.status === 'completed')
  const raised_cents = completed.reduce((sum, g) => sum + Number(g.amount_cents || 0), 0)
  const ratio = Number(campaign.matching_ratio) || 1
  let matched_cents = 0
  if (campaign.matching_enabled) {
    matched_cents = Math.round(raised_cents * ratio)
    if (campaign.matching_cap_cents != null) {
      matched_cents = Math.min(matched_cents, Number(campaign.matching_cap_cents))
    }
  }
  const combined_cents = raised_cents + matched_cents
  const gift_count = completed.length
  const names = new Set(
    completed.map((g) => (g.is_anonymous ? `anon-${g.amount_cents}` : (g.donor_display_name || 'Anonymous').toLowerCase())),
  )
  const goal = Number(campaign.goal_cents) || 0
  const stretch = campaign.stretch_goal_cents ? Number(campaign.stretch_goal_cents) : null
  return {
    raised_cents,
    matched_cents,
    combined_cents,
    gift_count,
    donor_count: names.size,
    avg_gift_cents: gift_count ? Math.round(raised_cents / gift_count) : 0,
    pct: goal > 0 ? Math.min(100, Math.round((combined_cents / goal) * 1000) / 10) : 0,
    stretch_pct: stretch && stretch > 0 ? Math.min(100, Math.round((combined_cents / stretch) * 1000) / 10) : null,
  }
}

export function daysLeft(endsAt: string | null) {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / 86400000)
}

export function matchingCopy(
  campaign: Pick<FundraisingCampaign, 'matching_enabled' | 'matching_ratio' | 'matching_cap_cents' | 'matching_sponsor'>,
) {
  if (!campaign.matching_enabled) return null
  const ratio = Number(campaign.matching_ratio) || 1
  const cap = campaign.matching_cap_cents ? ` up to ${formatCents(campaign.matching_cap_cents)}` : ''
  return `${campaign.matching_sponsor || 'A sponsor'} matches ${ratio}:1${cap}`
}

export function publishIssues(campaign: Partial<FundraisingCampaign>) {
  const issues: string[] = []
  if (!String(campaign.title || '').trim()) issues.push('Title is required')
  if (!String(campaign.slug || '').trim()) issues.push('URL slug is required')
  if (!Number(campaign.goal_cents)) issues.push('Set a dollar goal')
  if (!String(campaign.story || '').trim()) issues.push('Write the campaign story')
  if (!campaign.graphic_detail_reviewed) issues.push('Review graphic / trauma detail')
  if (!campaign.identifying_info_reviewed) issues.push('Confirm no identifying survivor details without consent')
  if (!campaign.consent_confirmed) issues.push('Confirm dignity / consent gate')
  if (campaign.show_public_advisory && !String(campaign.content_warning || '').trim()) {
    issues.push('Write the public advisory, or turn it off')
  }
  if (campaign.status === 'scheduled' && !campaign.starts_at) issues.push('Set a start date to schedule')
  return issues
}
