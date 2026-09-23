import Link from 'next/link'
import { ContentAdvisory } from '@/components/content-advisory'
import { CampaignDonatePanel } from '@/components/fundraising/donate-panel'
import { DonorWall } from '@/components/fundraising/donor-wall'
import { CampaignShareBar } from '@/components/fundraising/share-bar'
import { CampaignThermometer } from '@/components/fundraising/thermometer'
import { daysLeft, formatCents, matchingCopy } from '@/lib/fundraising/progress'
import { FUND_LABELS } from '@/lib/fundraising/types'
import { ORG } from '@/lib/constants'
import { campaignPagePath } from '@/lib/fundraising/templates'
import type { PublicCampaignBundle } from '@/lib/fundraising/public-data'
import type { FundraisingFundraiser } from '@/lib/fundraising/types'

export function CampaignPublicView({
  bundle,
  fundraiser,
  preview,
}: {
  bundle: PublicCampaignBundle
  fundraiser?: FundraisingFundraiser
  preview?: boolean
}) {
  const { campaign, gifts, fundraisers, progress } = bundle
  const remaining = daysLeft(campaign.ends_at)
  const matchingLabel = matchingCopy(campaign)
  const wall = campaign.show_donor_wall
    ? (fundraiser ? gifts.filter((g) => g.fundraiser_id === fundraiser.id) : gifts)
    : []

  return (
    <div className="min-h-screen">
      {preview && (
        <div className="bg-[#53D6FF] text-[#061016] text-center text-sm font-semibold py-2">Preview — not live</div>
      )}
      <section className="pt-28 pb-12 bg-gradient-to-b from-[#000000] to-[#05070A]">
        <div className="container-wide section-padding max-w-5xl mx-auto">
          <Link href="/campaigns" className="text-sm text-[#8DEBFF]">← All campaigns</Link>
          <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[#8DEBFF]">
            {FUND_LABELS[campaign.restricted_fund]}
            {remaining != null ? ` · ${remaining > 0 ? `${remaining} days left` : 'Ended'}` : ''}
          </p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-[#F6FAFC] mt-3">
            {fundraiser ? `${fundraiser.display_name} is raising for ${campaign.title}` : campaign.title}
          </h1>
          {(fundraiser?.story || campaign.tagline) && (
            <p className="mt-4 text-xl text-[#B8C4CF] max-w-3xl">{fundraiser?.story || campaign.tagline}</p>
          )}
        </div>
      </section>

      <section className="py-12">
        <div className="container-wide section-padding max-w-5xl mx-auto grid lg:grid-cols-[1fr_22rem] gap-8">
          <div>
            {campaign.show_public_advisory && <ContentAdvisory warning={campaign.content_warning} />}
            {campaign.show_thermometer && (
              <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-6 mb-8">
                <CampaignThermometer
                  progress={progress}
                  goalCents={fundraiser?.goal_cents || campaign.goal_cents}
                  stretchGoalCents={campaign.stretch_goal_cents}
                  matchingLabel={matchingLabel}
                />
              </div>
            )}
            {campaign.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={campaign.cover_url} alt="" className="w-full max-h-80 object-cover rounded-2xl mb-8" />
            )}
            {campaign.story && (
              <div className="prose prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-[#B8C4CF] leading-relaxed text-lg">{campaign.story}</p>
              </div>
            )}
            {!!campaign.milestones?.length && (
              <div className="mt-10">
                <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4">Milestones</h2>
                <ul className="space-y-2">
                  {campaign.milestones.map((m) => (
                    <li key={m.label} className="flex justify-between text-sm text-[#B8C4CF] border-b border-[#27313B] py-2">
                      <span>{m.label}</span>
                      <span className={progress.combined_cents >= m.amount_cents ? 'text-[#53D6FF]' : ''}>
                        {formatCents(m.amount_cents)}
                        {progress.combined_cents >= m.amount_cents ? ' · reached' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {campaign.show_donor_wall && (
              <div className="mt-10">
                <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4">Donor wall</h2>
                <DonorWall gifts={wall} />
              </div>
            )}
            {!fundraiser && fundraisers.length > 0 && (
              <div className="mt-10">
                <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4">Advocate pages</h2>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {fundraisers.map((f) => (
                    <li key={f.id}>
                      <Link href={`/campaigns/${campaign.slug}/f/${f.slug}`} className="block rounded-xl border border-[#27313B] p-4 hover:border-[#53D6FF]">
                        <p className="text-[#F6FAFC] font-medium">{f.display_name}</p>
                        {f.goal_cents ? <p className="text-xs text-[#A9B8C6]">Goal {formatCents(f.goal_cents)}</p> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <aside className="lg:sticky lg:top-24 h-fit space-y-4">
            <CampaignDonatePanel campaign={campaign} fundraiserId={fundraiser?.id} />
            <CampaignShareBar
              path={campaignPagePath(campaign.slug, fundraiser?.slug)}
              title={fundraiser ? `${fundraiser.display_name} is raising for ${campaign.title}` : campaign.title}
              caption={campaign.share_caption}
            />
            <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-4 text-sm text-[#A9B8C6]">
              <p className="text-[#F6FAFC] font-medium">501(c)(3) · EIN {ORG.ein}</p>
              <p className="mt-1">Donations are tax-deductible. 100% of platform-fee-free gifts support survivor services in Lorain County.</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
