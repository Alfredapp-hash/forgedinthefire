import { CampaignDesk } from './CampaignDesk'

export const dynamic = 'force-dynamic'

export default async function AdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CampaignDesk campaignId={id} />
}
