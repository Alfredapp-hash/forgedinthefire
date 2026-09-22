import { Metadata } from 'next'
import Link from 'next/link'
import { generateMetaTags } from '@/lib/utils'
import DonatePageContent from './page-content'
import { getLiveCampaigns } from '@/lib/fundraising/public-data'
import { formatCents } from '@/lib/fundraising/progress'

export const metadata: Metadata = generateMetaTags({
  title: 'Support Human Trafficking Survivors in Lorain County Ohio',
  description:
    'Support Forged in the Fire and help provide survivor centered advocacy, resources, and support for human trafficking survivors in Lorain County and Northeast Ohio.',
})

export const dynamic = 'force-dynamic'

export default async function DonatePage() {
  const campaigns = await getLiveCampaigns()
  return (
    <>
      <DonatePageContent />
      {campaigns.length > 0 && (
        <section className="pb-24">
          <div className="container-wide section-padding max-w-5xl mx-auto">
            <h2 className="font-serif text-3xl font-bold text-[#F6FAFC] mb-4">Live campaigns</h2>
            <p className="text-[#A9B8C6] mb-6">Give to a specific goal — thermometer, matching, and donor wall included.</p>
            <ul className="grid md:grid-cols-2 gap-4">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.slug}`} className="block rounded-2xl border border-[#27313B] bg-[#151B22] p-5 hover:border-[#53D6FF]">
                    <p className="font-serif text-xl text-[#F6FAFC]">{c.title}</p>
                    <p className="text-sm text-[#53D6FF] mt-2">
                      {formatCents(c.progress.combined_cents)} of {formatCents(c.goal_cents)} · {c.progress.pct}%
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}
