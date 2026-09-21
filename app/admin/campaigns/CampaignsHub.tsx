'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartHandshake, Plus } from 'lucide-react'
import { formatCents } from '@/lib/fundraising/progress'
import { STATUS_LABELS, TYPE_LABELS, type CampaignProgress, type FundraisingCampaign } from '@/lib/fundraising/types'

type Row = FundraisingCampaign & { progress: CampaignProgress }

export function CampaignsHub() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/fundraising/campaigns')
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Could not load campaigns')
        setRows(Array.isArray(data) ? data : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
  }, [])

  const live = rows.filter((r) => r.status === 'live')
  const drafts = rows.filter((r) => r.status === 'draft').length
  const raised = live.reduce((s, r) => s + r.progress.combined_cents, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#F6FAFC]">Campaigns</h1>
          <p className="text-[#A9B8C6] mt-1">
            Build branded fundraising campaigns — goal, matching, donor wall, advocate pages — then checkout on Zeffy at 0% fees.
          </p>
        </div>
        <Link href="/admin/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold">
          <Plus size={16} /> New campaign
        </Link>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Campaigns" value={String(rows.length)} />
        <Stat label="Live" value={String(live.length)} />
        <Stat label="Raised on live" value={formatCents(raised)} />
        <Stat label="Drafts" value={String(drafts)} />
      </div>

      {rows.length === 0 && !error ? (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-16 text-center">
          <HeartHandshake className="mx-auto mb-4 text-[#A9B8C6]" />
          <p className="font-semibold text-[#F6FAFC]">No campaigns yet</p>
          <p className="text-sm text-[#A9B8C6] mb-4">Start from a template — emergency housing, Giving Tuesday, match, or advocate pages.</p>
          <Link href="/admin/campaigns/new" className="text-[#53D6FF] text-sm font-semibold">Create first campaign</Link>
        </div>
      ) : (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#05070A] text-xs uppercase tracking-wider text-[#A9B8C6]">
              <tr>
                <th className="text-left px-5 py-3">Campaign</th>
                <th className="text-left px-5 py-3">Type</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Progress</th>
                <th className="text-right px-5 py-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#27313B]">
                  <td className="px-5 py-4">
                    <Link href={`/admin/campaigns/${row.id}`} className="font-medium text-[#F6FAFC] hover:text-[#53D6FF]">{row.title}</Link>
                    <p className="text-xs text-[#A9B8C6]">/{row.slug}</p>
                  </td>
                  <td className="px-5 py-4 text-[#A9B8C6]">{TYPE_LABELS[row.campaign_type]}</td>
                  <td className="px-5 py-4 text-[#8DEBFF]">{STATUS_LABELS[row.status]}</td>
                  <td className="px-5 py-4 text-[#F6FAFC]">
                    {formatCents(row.progress.combined_cents)} / {formatCents(row.goal_cents)}
                    <span className="text-[#A9B8C6]"> · {row.progress.pct}%</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/admin/campaigns/${row.id}`} className="text-[#53D6FF]">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
      <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">{label}</p>
      <p className="text-3xl font-bold text-[#F6FAFC]">{value}</p>
    </div>
  )
}
