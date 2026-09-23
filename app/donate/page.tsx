import { Metadata } from 'next'
import { generateMetaTags } from '@/lib/utils'
import DonatePageContent from './page-content'
import { getLiveCampaigns } from '@/lib/fundraising/public-data'
import { CampaignCard } from '@/components/fundraising/campaign-card'

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
            <h2 className="font-serif text-3xl font-bold text-[#F6FAFC] mb-2">Live campaigns</h2>
            <p className="text-[#A9B8C6] mb-6">Give to a named goal — thermometer, matching, and donor wall included.</p>
            <ul className="grid md:grid-cols-2 gap-4">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <CampaignCard campaign={c} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}
