'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CAMPAIGN_TEMPLATES } from '@/lib/fundraising/templates'
import { formatCents } from '@/lib/fundraising/progress'
import { FUND_LABELS, TYPE_LABELS } from '@/lib/fundraising/types'

export default function NewCampaignPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  async function create(template?: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/fundraising/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || undefined, template }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create')
      router.push(`/admin/campaigns/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/admin/campaigns" className="text-sm text-[#A9B8C6]">← Campaigns</Link>
      <h1 className="text-3xl font-bold text-[#F6FAFC]">New campaign</h1>
      <p className="text-[#A9B8C6]">Start from a template that already beats a blank Givebutter page — story, goal, milestones, and share copy included.</p>
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-5 space-y-3">
        <label className="block text-sm text-[#A9B8C6]">
          Custom title (optional)
          <input className="mt-1 w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Winter emergency housing" />
        </label>
        <button
          type="button"
          disabled={saving || !title.trim()}
          onClick={() => void create()}
          className="px-4 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-semibold disabled:opacity-40"
        >
          Create blank campaign
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {CAMPAIGN_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={saving}
            onClick={() => void create(t.id)}
            className="text-left rounded-2xl border border-[#27313B] bg-[#151B22] p-5 hover:border-[#53D6FF] disabled:opacity-40"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[#8DEBFF]">{TYPE_LABELS[t.campaign_type]} · {FUND_LABELS[t.restricted_fund]}</p>
            <p className="font-serif text-xl text-[#F6FAFC] mt-1">{t.title}</p>
            <p className="text-sm text-[#A9B8C6] mt-2">{t.tagline}</p>
            <p className="text-sm text-[#53D6FF] mt-3">Goal {formatCents(t.goal_cents)}{t.matching_enabled ? ' · matching' : ''}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
