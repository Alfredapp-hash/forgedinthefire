import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { campaignProgress } from '@/lib/fundraising/progress'
import type { FundraisingCampaign, FundraisingGift } from '@/lib/fundraising/types'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const { data: campaigns, error } = await supabase
    .from('fundraising_campaigns')
    .select('*')
    .eq('status', 'live')
    .order('published_at', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const ids = (campaigns ?? []).map((c) => c.id)
  const { data: gifts } = ids.length
    ? await supabase
        .from('fundraising_gifts')
        .select('campaign_id, amount_cents, status, is_anonymous, donor_display_name')
        .eq('status', 'completed')
        .in('campaign_id', ids)
    : { data: [] }
  return NextResponse.json(
    ((campaigns ?? []) as FundraisingCampaign[]).map((c) => ({
      ...c,
      progress: campaignProgress(c, ((gifts ?? []) as FundraisingGift[]).filter((g) => g.campaign_id === c.id)),
    })),
  )
}
