import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignPublicView } from '@/components/fundraising/campaign-view'
import { getLiveCampaignBySlug } from '@/lib/fundraising/public-data'
import { generateMetaTags } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; fundraiserSlug: string }> }): Promise<Metadata> {
  const { slug, fundraiserSlug } = await params
  const bundle = await getLiveCampaignBySlug(slug)
  const fundraiser = bundle?.fundraisers.find((f) => f.slug === fundraiserSlug)
  if (!bundle || !fundraiser) return { title: 'Advocate page not found' }
  return generateMetaTags({
    title: `${fundraiser.display_name} for ${bundle.campaign.title}`,
    description: fundraiser.story || bundle.campaign.tagline || 'Raise with Forged in the Fire.',
  })
}

export default async function FundraiserPage({ params }: { params: Promise<{ slug: string; fundraiserSlug: string }> }) {
  const { slug, fundraiserSlug } = await params
  const bundle = await getLiveCampaignBySlug(slug)
  const fundraiser = bundle?.fundraisers.find((f) => f.slug === fundraiserSlug)
  if (!bundle || !fundraiser) notFound()
  return <CampaignPublicView bundle={bundle} fundraiser={fundraiser} />
}
