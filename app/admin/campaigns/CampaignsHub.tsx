'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HeartHandshake, Plus } from 'lucide-react'
import { formatCents, matchingCopy, publishIssues } from '@/lib/fundraising/progress'
import { STATUS_LABELS, TYPE_LABELS, type CampaignProgress, type CampaignStatus, type FundraisingCampaign } from '@/lib/fundraising/types'

type Row = FundraisingCampaign & { progress: CampaignProgress }

const FILTERS: { id: 'all' | CampaignStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'draft', label: 'Drafts' },
  { id: 'paused', label: 'Paused' },
  { id: 'ended', label: 'Ended' },
]

export function CampaignsHub() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')

  useEffect(() => {
    fetch('/api/admin/fundraising/campaigns')
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Could not load campaigns')
        setRows(Array.isArray(data) ? data : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [])

  const live = rows.filter((r) => r.status === 'live')
  const drafts = rows.filter((r) => r.status === 'draft')
  const pendingSafety = rows.filter((r) => r.status !== 'live' && r.status !== 'archived' && publishIssues({ ...r, status: 'live' }).length > 0)
  const raised = live.reduce((s, r) => s + r.progress.combined_cents, 0)
  const gifts = live.reduce((s, r) => s + r.progress.gift_count, 0)

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [filter, rows],
  )

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#F6FAFC]">Campaigns</h1>
          <p className="text-[#A9B8C6] mt-1">
            Named fundraising pages with a thermometer, matching, donor wall, and Zeffy checkout at 0% fees.
          </p>
        </div>
        <Link href="/admin/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold shrink-0">
          <Plus size={16} /> New campaign
        </Link>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Live" value={String(live.length)} />
        <Stat label="Raised on live" value={formatCents(raised)} sub={`${gifts} gifts`} />
        <Stat label="Drafts" value={String(drafts.length)} />
        <Stat label="Need safety review" value={String(pendingSafety.length)} />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f.id ? 'bg-[#53D6FF] text-[#061016]' : 'text-[#A9B8C6] border border-[#27313B]'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#A9B8C6]">Loading campaigns…</p>
      ) : rows.length === 0 && !error ? (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-16 text-center">
          <HeartHandshake className="mx-auto mb-4 text-[#A9B8C6]" />
          <p className="font-semibold text-[#F6FAFC]">No campaigns yet</p>
          <p className="text-sm text-[#A9B8C6] mb-4 max-w-md mx-auto">
            Start from emergency housing, Giving Tuesday, a match, or advocate pages. Dignity gates must pass before a page can go live.
          </p>
          <Link href="/admin/campaigns/new" className="text-[#53D6FF] text-sm font-semibold">Create first campaign</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const issues = row.status === 'live' ? [] : publishIssues({ ...row, status: 'live' })
            const match = matchingCopy(row)
            return (
              <li key={row.id} className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/campaigns/${row.id}`} className="font-semibold text-[#F6FAFC] hover:text-[#53D6FF]">
                        {row.title}
                      </Link>
                      <StatusPill status={row.status} />
                    </div>
                    <p className="text-xs text-[#A9B8C6] mt-1">
                      {TYPE_LABELS[row.campaign_type]} · /campaigns/{row.slug}
                      {match ? ` · ${match}` : ''}
                    </p>
                    <div className="mt-3 h-2 max-w-md rounded-full bg-[#1A232C] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#53D6FF] to-[#8DEBFF]"
                        style={{ width: `${Math.max(Math.min(row.progress.pct, 100), row.progress.combined_cents > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <p className="text-sm text-[#F6FAFC] mt-2">
                      {formatCents(row.progress.combined_cents)} / {formatCents(row.goal_cents)}
                      <span className="text-[#A9B8C6]"> · {row.progress.pct}% · {row.progress.gift_count} gifts</span>
                    </p>
                    {issues.length > 0 && (
                      <p className="text-xs text-[#8DEBFF] mt-2">{issues.length} item{issues.length === 1 ? '' : 's'} before go-live</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Link href={`/admin/campaigns/${row.id}`} className="px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium">
                      Edit
                    </Link>
                    {row.status === 'live' && (
                      <Link href={`/campaigns/${row.slug}`} target="_blank" className="px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
                        View live
                      </Link>
                    )}
                    <Link href={`/admin/ads?attach=${row.id}`} className="px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">
                      Log ads
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
          {visible.length === 0 && <p className="text-sm text-[#A9B8C6]">Nothing in this filter.</p>}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#151B22] rounded-2xl p-5 border border-[#27313B]">
      <p className="text-xs font-bold uppercase tracking-widest text-[#A9B8C6] mb-2">{label}</p>
      <p className="text-3xl font-bold text-[#F6FAFC]">{value}</p>
      {sub && <p className="text-xs text-[#A9B8C6] mt-1">{sub}</p>}
    </div>
  )
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const live = status === 'live'
  return (
    <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${live ? 'bg-[#53D6FF]/15 text-[#53D6FF]' : 'bg-[#1A232C] text-[#A9B8C6]'}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
