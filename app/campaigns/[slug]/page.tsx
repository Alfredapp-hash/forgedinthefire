import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignPublicView } from '@/components/fundraising/campaign-view'
import { getLiveCampaignBySlug } from '@/lib/fundraising/public-data'
import { generateMetaTags } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const bundle = await getLiveCampaignBySlug(slug)
  if (!bundle) return { title: 'Campaign not found | Forged in the Fire' }
  return generateMetaTags({
    title: bundle.campaign.title,
    description: bundle.campaign.tagline || bundle.campaign.story?.slice(0, 150) || 'Support this campaign.',
  })
}

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const bundle = await getLiveCampaignBySlug(slug)
  if (!bundle) notFound()
  return <CampaignPublicView bundle={bundle} />
}
