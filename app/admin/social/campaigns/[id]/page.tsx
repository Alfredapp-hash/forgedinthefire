'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { SocialAccount, SocialCampaign } from '@/src/features/social/types'

type PubResult = { postId: string; platform: string; ok: boolean; status: string; error?: string | null }

function statusTone(s: string) {
  if (s === 'posted') return 'bg-[#123524] text-[#7CFFB2]'
  if (s === 'mock_posted') return 'bg-[#15222b] text-[#8DEBFF]'
  if (s === 'scheduled') return 'bg-[#1b2430] text-[#A9B8C6]'
  if (s === 'failed') return 'bg-[#3a1620] text-[#FF8FA3]'
  return 'bg-[#1b2430] text-[#7C8B97]'
}

export default function SocialCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [campaign, setCampaign] = useState<SocialCampaign | null>(null)
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<PubResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((cid: string) => {
    fetch('/api/admin/social/campaigns')
      .then((r) => r.json())
      .then((list: SocialCampaign[]) => setCampaign(Array.isArray(list) ? list.find((c) => c.id === cid) ?? null : null))
  }, [])

  useEffect(() => {
    params.then(({ id }) => {
      setId(id)
      load(id)
      fetch('/api/admin/social/accounts')
        .then((r) => r.json())
        .then((a: SocialAccount[]) => {
          const list = Array.isArray(a) ? a : []
          setAccounts(list)
          const sel: Record<string, boolean> = {}
          list.forEach((acc) => {
            sel[acc.id] = acc.enabled !== false && acc.connection_status === 'connected'
          })
          setSelected(sel)
        })
    })
  }, [params, load])

  const campaignPlatforms = new Set((campaign?.posts ?? []).map((p) => p.platform))
  const relevantAccounts = accounts.filter((a) => campaignPlatforms.has(a.platform))
  const anySelected = Object.values(selected).some(Boolean)

  async function publish() {
    setBusy(true)
    setError(null)
    setResults(null)
    const accountIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k)
    try {
      const res = await fetch(`/api/admin/social/campaigns/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds }),
      })
      const j = await res.json()
      if (!res.ok) setError(j.error || 'Publish failed')
      else {
        setResults((j.results as PubResult[]) || [])
        load(id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  if (!campaign) return <div className="p-8 text-[#A9B8C6]">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/social/campaigns" className="text-sm text-[#A9B8C6]">
        ← Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{campaign.title}</h1>
        <p className="text-sm text-[#A9B8C6]">
          Status: {campaign.campaign_status}
          {campaign.scheduled_at ? ` · scheduled ${new Date(campaign.scheduled_at).toLocaleString()}` : ''}
        </p>
      </div>

      <div className="space-y-3">
        {(campaign.posts ?? []).map((p) => (
          <div key={p.id} className="bg-[#151B22] rounded-xl border border-[#27313B] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase text-[#A9B8C6]">{p.platform}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(p.status)}`}>{p.status}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{p.caption}</p>
            {p.link_url && <p className="mt-2 break-all text-xs text-[#53D6FF]">{p.link_url}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-[#27313B] bg-[#0B0F14] p-4">
        <p className="text-sm font-semibold">Post now</p>
        <p className="text-xs text-[#A9B8C6]">Pick which connected accounts to post to, then publish with one click.</p>
        <div className="flex flex-wrap gap-2">
          {relevantAccounts.length === 0 ? (
            <p className="text-xs text-[#7C8B97]">No connected accounts match this campaign&apos;s platforms.</p>
          ) : (
            relevantAccounts.map((a) => (
              <label
                key={a.id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  selected[a.id] ? 'border-[#53D6FF] bg-[#0f2630]' : 'border-[#27313B]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!selected[a.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [a.id]: e.target.checked }))}
                />
                <span>{a.account_name || a.platform}</span>
                <span className="text-[10px] text-[#7C8B97]">{a.connection_status}</span>
              </label>
            ))
          )}
        </div>
        <button
          type="button"
          disabled={busy || !anySelected}
          onClick={publish}
          className="rounded-lg bg-[#53D6FF] px-4 py-2 text-sm font-semibold text-[#061016] disabled:opacity-50"
        >
          {busy ? 'Posting…' : 'Post now to selected'}
        </button>
        {error && <p className="text-sm text-[#FF8FA3]">{error}</p>}
        {results && (
          <div className="space-y-1 pt-1">
            {results.map((r) => (
              <p key={r.postId} className={`text-xs ${r.ok ? 'text-[#7CFFB2]' : 'text-[#FF8FA3]'}`}>
                {r.platform}: {r.ok ? (r.status === 'mock_posted' ? 'mock posted' : 'posted ✓') : `failed — ${r.error}`}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
