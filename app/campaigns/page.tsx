import { Metadata } from 'next'
import Link from 'next/link'
import { getLiveCampaigns } from '@/lib/fundraising/public-data'
import { generateMetaTags } from '@/lib/utils'
import { formatCents } from '@/lib/fundraising/progress'
import { FUND_LABELS } from '@/lib/fundraising/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = generateMetaTags({
  title: 'Fundraising Campaigns',
  description: 'Support live fundraising campaigns for survivor housing, advocacy, and workforce in Lorain County, Ohio. 501(c)(3) · tax-deductible.',
})

export default async function CampaignsIndexPage() {
  const campaigns = await getLiveCampaigns()
  return (
    <div className="min-h-screen">
      <section className="pt-32 pb-16">
        <div className="container-wide section-padding max-w-5xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8DEBFF]">Give locally</p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-[#F6FAFC] mt-3">Campaigns</h1>
          <p className="mt-4 text-lg text-[#B8C4CF] max-w-2xl">
            Branded campaigns for survivors in Lorain County. Every page shows the 501(c)(3) EIN and checks out at 0% platform fees.
          </p>
          {!campaigns.length && (
            <p className="mt-10 text-[#A9B8C6]">
              No live campaigns yet.{' '}
              <Link href="/donate" className="text-[#53D6FF]">Give on the general donate page</Link>.
            </p>
          )}
          <ul className="mt-10 grid md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.slug}`} className="block rounded-2xl border border-[#27313B] bg-[#151B22] p-6 hover:border-[#53D6FF]">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8DEBFF]">{FUND_LABELS[c.restricted_fund]}</p>
                  <h2 className="font-serif text-2xl text-[#F6FAFC] mt-2">{c.title}</h2>
                  {c.tagline && <p className="text-sm text-[#A9B8C6] mt-2">{c.tagline}</p>}
                  <p className="text-sm text-[#53D6FF] mt-4">
                    {formatCents(c.progress.combined_cents)} of {formatCents(c.goal_cents)} · {c.progress.pct}%
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
