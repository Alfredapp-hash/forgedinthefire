import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { campaignProgress } from '@/lib/fundraising/progress'
import { publicGift } from '@/lib/fundraising/public'
import type { FundraisingCampaign, FundraisingFundraiser, FundraisingGift } from '@/lib/fundraising/types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const { slug } = await params
  const { data: campaign, error } = await supabase
    .from('fundraising_campaigns')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'live')
    .single()
  if (error || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

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

  return NextResponse.json({
    campaign: campaign as FundraisingCampaign,
    gifts: ((gifts ?? []) as FundraisingGift[]).map(publicGift),
    fundraisers: (fundraisers ?? []) as FundraisingFundraiser[],
    progress: campaignProgress(campaign as FundraisingCampaign, (gifts ?? []) as FundraisingGift[]),
  })
}
