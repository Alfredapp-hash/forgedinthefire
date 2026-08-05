'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SocialCampaign } from '@/src/features/social/types'

export default function SocialCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [campaign, setCampaign] = useState<SocialCampaign | null>(null)

  useEffect(() => {
    params.then(({ id }) => {
      fetch('/api/admin/social/campaigns')
        .then((r) => r.json())
        .then((list: SocialCampaign[]) => setCampaign(list.find((c) => c.id === id) ?? null))
    })
  }, [params])

  if (!campaign) return <div className="p-8 text-[#A9B8C6]">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/social/campaigns" className="text-sm text-[#A9B8C6]">← Back</Link>
      <h1 className="text-2xl font-bold">{campaign.title}</h1>
      <p className="text-sm text-[#A9B8C6]">Status: {campaign.campaign_status}</p>
      <div className="space-y-3">
        {(campaign.posts ?? []).map((p) => (
          <div key={p.id} className="bg-[#151B22] rounded-xl border p-4">
            <p className="text-xs font-bold uppercase text-[#A9B8C6] mb-2">{p.platform}</p>
            <p className="text-sm whitespace-pre-wrap">{p.caption}</p>
            {p.link_url && <p className="text-xs text-[#53D6FF] mt-2">{p.link_url}</p>}
          </div>
        ))}
      </div>
      <button type="button" className="px-4 py-2 bg-[#53D6FF] text-[#061016] rounded-lg text-sm" onClick={() => alert('Mock post published! Configure OAuth for live posting.')}>
        Publish (Mock)
      </button>
    </div>
  )
}
