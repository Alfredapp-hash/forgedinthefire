import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { campaignProgress } from '@/lib/fundraising/progress'
import { publicGift } from '@/lib/fundraising/public'
import type { FundraisingCampaign, FundraisingFundraiser, FundraisingGift } from '@/lib/fundraising/types'

export type PublicCampaignBundle = {
  campaign: FundraisingCampaign
  gifts: ReturnType<typeof publicGift>[]
  fundraisers: FundraisingFundraiser[]
  progress: ReturnType<typeof campaignProgress>
}

export async function getLiveCampaigns(): Promise<(FundraisingCampaign & { progress: ReturnType<typeof campaignProgress> })[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data: campaigns, error } = await supabase
    .from('fundraising_campaigns')
    .select('*')
    .eq('status', 'live')
    .order('published_at', { ascending: false })
  if (error || !campaigns?.length) return []
  const { data: gifts } = await supabase
    .from('fundraising_gifts')
    .select('campaign_id, amount_cents, status, is_anonymous, donor_display_name')
    .eq('status', 'completed')
    .in('campaign_id', campaigns.map((c) => c.id))
  return (campaigns as FundraisingCampaign[]).map((c) => ({
    ...c,
    progress: campaignProgress(c, (gifts as FundraisingGift[] ?? []).filter((g) => g.campaign_id === c.id)),
  }))
}

export async function getLiveCampaignBySlug(slug: string): Promise<PublicCampaignBundle | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: campaign } = await supabase
    .from('fundraising_campaigns')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'live')
    .maybeSingle()
  if (!campaign) return null
  return assembleBundle(supabase, campaign as FundraisingCampaign)
}

export async function getCampaignByPreviewToken(token: string): Promise<PublicCampaignBundle | null> {
  try {
    const supabase = await createAdminClient()
    const { data: campaign } = await supabase
      .from('fundraising_campaigns')
      .select('*')
      .eq('preview_token', token)
      .maybeSingle()
    if (!campaign) return null
    return assembleBundle(supabase, campaign as FundraisingCampaign)
  } catch {
    return null
  }
}

async function assembleBundle(
  supabase: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createAdminClient>>,
  campaign: FundraisingCampaign,
): Promise<PublicCampaignBundle> {
  if (!supabase) {
    return { campaign, gifts: [], fundraisers: [], progress: campaignProgress(campaign, []) }
  }
  const [{ data: gifts }, { data: fundraisers }] = await Promise.all([
    supabase
      .from('fundraising_gifts')
      .select('id, campaign_id, fundraiser_id, amount_cents, status, donor_display_name, is_anonymous, is_recurring, honor_of, memory_of, message, received_at')
      .eq('campaign_id', campaign.id)
      .eq('status', 'completed')
      .order('received_at', { ascending: false })
      .limit(50),
    supabase
      .from('fundraising_fundraisers')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'active'),
  ])
  const giftRows = (gifts ?? []) as FundraisingGift[]
  return {
    campaign,
    gifts: giftRows.map(publicGift),
    fundraisers: (fundraisers ?? []) as FundraisingFundraiser[],
    progress: campaignProgress(campaign, giftRows),
  }
}
