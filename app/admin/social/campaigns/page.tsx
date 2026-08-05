'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SocialCampaign } from '@/src/features/social/types'

export default function SocialCampaignsPage() {
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([])

  useEffect(() => {
    fetch('/api/admin/social/campaigns').then((r) => r.json()).then((d) => setCampaigns(Array.isArray(d) ? d : []))
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link href="/admin/social" className="text-sm text-[#A9B8C6]">← Back</Link>
          <h1 className="text-2xl font-bold mt-1">Campaigns</h1>
        </div>
        <Link href="/admin/social/campaigns/new" className="px-4 py-2 bg-[#53D6FF] text-[#061016] rounded-xl text-sm font-semibold">New Campaign</Link>
      </div>
      {campaigns.length === 0 ? (
        <p className="text-[#A9B8C6]">No campaigns yet.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/admin/social/campaigns/${c.id}`} className="block bg-[#151B22] rounded-xl border p-4 hover:shadow-forge-sm">
              <p className="font-semibold">{c.title}</p>
              <p className="text-xs text-[#A9B8C6]">{c.campaign_status} · {new Date(c.updated_at).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
