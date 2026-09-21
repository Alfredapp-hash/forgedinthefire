import { notFound } from 'next/navigation'
import { CampaignPublicView } from '@/components/fundraising/campaign-view'
import { getCampaignByPreviewToken } from '@/lib/fundraising/public-data'

export const dynamic = 'force-dynamic'

export default async function CampaignPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const bundle = await getCampaignByPreviewToken(token)
  if (!bundle) notFound()
  return <CampaignPublicView bundle={bundle} preview />
}
