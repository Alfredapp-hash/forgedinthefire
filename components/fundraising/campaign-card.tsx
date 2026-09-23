import Link from 'next/link'
import { daysLeft, formatCents, matchingCopy } from '@/lib/fundraising/progress'
import { FUND_LABELS, type CampaignProgress, type FundraisingCampaign } from '@/lib/fundraising/types'

export type PublicCampaignCardData = FundraisingCampaign & { progress: CampaignProgress }

export function CampaignCard({
  campaign,
  href,
}: {
  campaign: PublicCampaignCardData
  href?: string
}) {
  const remaining = daysLeft(campaign.ends_at)
  const match = matchingCopy(campaign)
  const to = href || `/campaigns/${campaign.slug}`
  const pct = Math.min(100, campaign.progress.pct)

  return (
    <Link
      href={to}
      className="group block overflow-hidden rounded-2xl border border-[#27313B] bg-[#151B22] hover:border-[#53D6FF] transition-colors"
    >
      {campaign.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={campaign.cover_url} alt="" className="h-40 w-full object-cover" />
      ) : null}
      <div className="p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">
          {FUND_LABELS[campaign.restricted_fund]}
          {remaining != null ? ` · ${remaining > 0 ? `${remaining} days left` : 'Ended'}` : ''}
        </p>
        <h2 className="font-serif text-2xl text-[#F6FAFC] mt-2 group-hover:text-[#8DEBFF]">{campaign.title}</h2>
        {campaign.tagline && <p className="text-sm text-[#A9B8C6] mt-2 line-clamp-2">{campaign.tagline}</p>}
        <div className="mt-4 h-2 rounded-full bg-[#1A232C] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#53D6FF] to-[#8DEBFF]"
            style={{ width: `${Math.max(pct, campaign.progress.combined_cents > 0 ? 2 : 0)}%` }}
          />
        </div>
        <p className="text-sm text-[#53D6FF] mt-3">
          {formatCents(campaign.progress.combined_cents)} of {formatCents(campaign.goal_cents)} · {campaign.progress.pct}%
        </p>
        {match && <p className="text-xs text-[#8DEBFF] mt-1">{match}</p>}
      </div>
    </Link>
  )
}
