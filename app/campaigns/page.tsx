import { Metadata } from 'next'
import Link from 'next/link'
import { CampaignCard } from '@/components/fundraising/campaign-card'
import { getLiveCampaigns } from '@/lib/fundraising/public-data'
import { generateMetaTags } from '@/lib/utils'
import { ORG } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = generateMetaTags({
  title: 'Fundraising Campaigns',
  description: 'Support live fundraising campaigns for survivor housing, advocacy, and workforce in Lorain County, Ohio. 501(c)(3) · tax-deductible.',
})

export default async function CampaignsIndexPage() {
  const campaigns = await getLiveCampaigns()
  return (
    <div className="min-h-screen">
      <section className="pt-32 pb-20">
        <div className="container-wide section-padding max-w-5xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#8DEBFF]">Give locally</p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-[#F6FAFC] mt-3">Campaigns</h1>
          <p className="mt-4 text-lg text-[#B8C4CF] max-w-2xl">
            Named goals for survivor housing, advocacy, and workforce in Lorain County. Every page shows EIN {ORG.ein} and checks out on Zeffy at 0% platform fees.
          </p>
          {!campaigns.length ? (
            <div className="mt-12 rounded-2xl border border-[#27313B] bg-[#151B22] p-8 max-w-xl">
              <p className="font-serif text-2xl text-[#F6FAFC]">No live campaign right now</p>
              <p className="text-sm text-[#A9B8C6] mt-2">
                Unrestricted gifts still fund the next safe night, advocate hour, and workforce week. When a named campaign is live, it will appear here with a thermometer and donor wall.
              </p>
              <Link
                href="/donate"
                className="inline-flex mt-6 px-4 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold"
              >
                Give on the general donate page
              </Link>
            </div>
          ) : (
            <ul className="mt-10 grid md:grid-cols-2 gap-4">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <CampaignCard campaign={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
