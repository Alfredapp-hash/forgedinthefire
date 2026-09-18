'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Plus, ArrowRight } from 'lucide-react'
import type { SocialAccount, SocialCampaign } from '@/src/features/social/types'
import { PLATFORM_COLORS, PLATFORM_LABELS } from '@/src/features/social/types'

export default function SocialDashboard() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/social/accounts').then((r) => r.json()),
      fetch('/api/admin/social/campaigns').then((r) => r.json()),
    ]).then(([a, c]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setCampaigns(Array.isArray(c) ? c : [])
    })
  }, [])

  const connected = accounts.filter((a) => a.connection_status === 'connected').length
  const drafts = campaigns.filter((c) => c.campaign_status === 'draft').length

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Social Publisher</h1>
          <p className="text-sm text-[#A9B8C6]">Promote blog posts and updates across social channels</p>
        </div>
        <Link href="/admin/social/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 bg-[#53D6FF] text-[#061016] rounded-xl text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#151B22] rounded-xl border p-5"><p className="text-xs text-[#A9B8C6] uppercase">Connected</p><p className="text-3xl font-bold">{connected}</p></div>
        <div className="bg-[#151B22] rounded-xl border p-5"><p className="text-xs text-[#A9B8C6] uppercase">Draft Campaigns</p><p className="text-3xl font-bold">{drafts}</p></div>
        <div className="bg-[#151B22] rounded-xl border p-5"><p className="text-xs text-[#A9B8C6] uppercase">Total Campaigns</p><p className="text-3xl font-bold">{campaigns.length}</p></div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link href="/admin/social/accounts" className="bg-[#151B22] rounded-xl border p-5 hover:shadow-forge-sm transition-shadow flex items-center gap-4">
          <Megaphone className="w-8 h-8 text-[#53D6FF]" />
          <div className="flex-1"><p className="font-semibold">Manage Accounts</p><p className="text-xs text-[#A9B8C6]">Facebook, Instagram, LinkedIn, TikTok, YouTube</p></div>
          <ArrowRight className="w-4 h-4 text-[#A9B8C6]" />
        </Link>
        <Link href="/admin/social/campaigns" className="bg-[#151B22] rounded-xl border p-5 hover:shadow-forge-sm transition-shadow flex items-center gap-4">
          <Megaphone className="w-8 h-8 text-[#8DEBFF]" />
          <div className="flex-1"><p className="font-semibold">All Campaigns</p><p className="text-xs text-[#A9B8C6]">{campaigns.length} campaigns</p></div>
          <ArrowRight className="w-4 h-4 text-[#A9B8C6]" />
        </Link>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Accounts</h2>
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="bg-[#151B22] rounded-xl border p-4 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[a.platform] }} />
              <span className="font-medium flex-1">{PLATFORM_LABELS[a.platform]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{a.connection_status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
