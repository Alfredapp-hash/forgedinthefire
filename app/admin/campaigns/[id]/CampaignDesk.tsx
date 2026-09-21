'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CAMPAIGN_PIPELINE,
  FUND_LABELS,
  SOURCE_LABELS,
  TYPE_LABELS,
  type CampaignProgress,
  type CampaignStatus,
  type CampaignType,
  type FundraisingCampaign,
  type FundraisingFundraiser,
  type FundraisingGift,
  type GiftSource,
  type RestrictedFund,
} from '@/lib/fundraising/types'
import { dollarsToCents, formatCents, publishIssues } from '@/lib/fundraising/progress'
import { DEFAULT_AMOUNTS } from '@/lib/fundraising/templates'

const input = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'

export function CampaignDesk({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<FundraisingCampaign | null>(null)
  const [gifts, setGifts] = useState<FundraisingGift[]>([])
  const [fundraisers, setFundraisers] = useState<FundraisingFundraiser[]>([])
  const [progress, setProgress] = useState<CampaignProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'story' | 'give' | 'safety' | 'share' | 'gifts' | 'advocates'>('story')
  const [giftForm, setGiftForm] = useState({ amount: '100', source: 'zeffy' as GiftSource, name: '', email: '', message: '', anonymous: false })
  const [advocateName, setAdvocateName] = useState('')
  const [advocateGoal, setAdvocateGoal] = useState('500')

  async function load() {
    const res = await fetch(`/api/admin/fundraising/campaigns/${campaignId}`)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Not found')
      return
    }
    setCampaign(data.campaign)
    setGifts(data.gifts || [])
    setFundraisers(data.fundraisers || [])
    setProgress(data.progress)
  }

  useEffect(() => { void load() }, [campaignId])

  async function save(patch: Record<string, unknown>, label = 'Saved') {
    if (!campaign) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/fundraising/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setCampaign(data)
      setOk(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function goLive() {
    if (!campaign) return
    const issues = publishIssues({ ...campaign, status: 'live' })
    if (issues.length) {
      setError(issues.join('; '))
      setTab('safety')
      return
    }
    await save({ status: 'live' }, 'Live on /campaigns')
    await load()
  }

  async function addGift() {
    const res = await fetch(`/api/admin/fundraising/campaigns/${campaignId}/gifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_dollars: Number(giftForm.amount),
        source: giftForm.source,
        donor_display_name: giftForm.name,
        donor_email: giftForm.email,
        message: giftForm.message,
        is_anonymous: giftForm.anonymous,
        status: 'completed',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not log gift')
      return
    }
    setGiftForm({ amount: '100', source: 'zeffy', name: '', email: '', message: '', anonymous: false })
    setOk('Gift logged — thermometer updated')
    await load()
  }

  async function setGiftStatus(id: string, status: string) {
    await fetch(`/api/admin/fundraising/campaigns/${campaignId}/gifts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    await load()
  }

  async function addAdvocate() {
    const res = await fetch(`/api/admin/fundraising/campaigns/${campaignId}/fundraisers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: advocateName,
        goal_cents: dollarsToCents(Number(advocateGoal) || 0),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not add advocate')
      return
    }
    setAdvocateName('')
    await load()
  }

  async function preview() {
    const res = await fetch(`/api/admin/fundraising/campaigns/${campaignId}/preview`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) window.open(data.url, '_blank')
  }

  if (!campaign) {
    return <p className="text-[#A9B8C6]">{error || 'Loading…'}</p>
  }

  const site = typeof window !== 'undefined' ? window.location.origin : 'https://forgedinthefireohio.org'
  const publicUrl = `${site}/campaigns/${campaign.slug}`
  const embed = `<iframe src="${publicUrl}" title="${campaign.title}" width="100%" height="640" style="border:0" loading="lazy"></iframe>`
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/admin/campaigns" className="text-sm text-[#8DEBFF]">← Campaigns</Link>
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <input
          defaultValue={campaign.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== campaign.title && void save({ title: e.target.value.trim() })}
          className="flex-1 bg-transparent text-2xl font-bold text-[#F6FAFC] focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={campaign.status}
            onChange={(e) => void save({ status: e.target.value as CampaignStatus })}
            className="rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#F6FAFC]"
          >
            {CAMPAIGN_PIPELINE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => void goLive()} className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium">
            {campaign.status === 'live' ? 'Live' : 'Go live'}
          </button>
          <button type="button" onClick={() => void preview()} className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]">Preview</button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Delete this campaign?')) return
              await fetch(`/api/admin/fundraising/campaigns/${campaign.id}`, { method: 'DELETE' })
              router.push('/admin/campaigns')
            }}
            className="px-3 py-2 rounded-lg border border-[#27313B] text-sm text-red-300"
          >
            Delete
          </button>
        </div>
      </header>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
      {progress && (
        <p className="text-sm text-[#A9B8C6]">
          {formatCents(progress.combined_cents)} of {formatCents(campaign.goal_cents)} · {progress.pct}% · {progress.gift_count} gifts
        </p>
      )}

      <div className="flex flex-wrap gap-1 bg-[#151B22] rounded-xl p-1 border border-[#27313B] w-fit">
        {(['story', 'give', 'safety', 'share', 'gifts', 'advocates'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? 'bg-[#53D6FF] text-[#061016]' : 'text-[#A9B8C6]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'story' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 grid md:grid-cols-2 gap-3">
          <Field label="Slug"><input defaultValue={campaign.slug} onBlur={(e) => void save({ slug: e.target.value })} className={input} /></Field>
          <Field label="Type">
            <select value={campaign.campaign_type} onChange={(e) => void save({ campaign_type: e.target.value as CampaignType })} className={input}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Restricted fund">
            <select value={campaign.restricted_fund} onChange={(e) => void save({ restricted_fund: e.target.value as RestrictedFund })} className={input}>
              {Object.entries(FUND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Cover image URL"><input defaultValue={campaign.cover_url || ''} onBlur={(e) => void save({ cover_url: e.target.value })} className={input} /></Field>
          <div className="md:col-span-2">
            <Field label="Tagline"><input defaultValue={campaign.tagline || ''} onBlur={(e) => void save({ tagline: e.target.value })} className={input} /></Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Story">
              <textarea defaultValue={campaign.story || ''} rows={8} onBlur={(e) => void save({ story: e.target.value })} className={input} />
            </Field>
          </div>
          <Field label="Starts"><input type="datetime-local" defaultValue={toLocal(campaign.starts_at)} onBlur={(e) => void save({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={input} /></Field>
          <Field label="Ends"><input type="datetime-local" defaultValue={toLocal(campaign.ends_at)} onBlur={(e) => void save({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={input} /></Field>
        </section>
      )}

      {tab === 'give' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 grid md:grid-cols-2 gap-3">
          <Field label="Goal ($)"><input type="number" defaultValue={campaign.goal_cents / 100} onBlur={(e) => void save({ goal_cents: dollarsToCents(Number(e.target.value) || 0) })} className={input} /></Field>
          <Field label="Stretch goal ($)"><input type="number" defaultValue={campaign.stretch_goal_cents ? campaign.stretch_goal_cents / 100 : ''} onBlur={(e) => void save({ stretch_goal_cents: e.target.value ? dollarsToCents(Number(e.target.value)) : null })} className={input} /></Field>
          <label className="flex items-center gap-2 text-sm text-[#B8C4CF] md:col-span-2">
            <input type="checkbox" checked={campaign.matching_enabled} onChange={(e) => void save({ matching_enabled: e.target.checked })} />
            Matching challenge
          </label>
          {campaign.matching_enabled && (
            <>
              <Field label="Match ratio"><input type="number" step="0.5" defaultValue={campaign.matching_ratio} onBlur={(e) => void save({ matching_ratio: Number(e.target.value) || 1 })} className={input} /></Field>
              <Field label="Match cap ($)"><input type="number" defaultValue={campaign.matching_cap_cents ? campaign.matching_cap_cents / 100 : ''} onBlur={(e) => void save({ matching_cap_cents: e.target.value ? dollarsToCents(Number(e.target.value)) : null })} className={input} /></Field>
              <div className="md:col-span-2">
                <Field label="Sponsor name"><input defaultValue={campaign.matching_sponsor || ''} onBlur={(e) => void save({ matching_sponsor: e.target.value })} className={input} /></Field>
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Field label="Zeffy URL override"><input defaultValue={campaign.zeffy_url || ''} onBlur={(e) => void save({ zeffy_url: e.target.value })} className={input} /></Field>
          </div>
          {(['show_thermometer', 'show_donor_wall', 'show_live_feed', 'honor_gifts_enabled'] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm text-[#B8C4CF]">
              <input type="checkbox" checked={Boolean(campaign[key])} onChange={(e) => void save({ [key]: e.target.checked })} />
              {key.replace(/_/g, ' ')}
            </label>
          ))}
          <p className="text-xs text-[#A9B8C6] md:col-span-2">Suggested amounts default to FITF impact tiers ({DEFAULT_AMOUNTS.map((a) => `$${a.amount}`).join(', ')}).</p>
        </section>
      )}

      {tab === 'safety' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
          <p className="text-sm text-[#A9B8C6]">Required before Go live — the checklist Classy/Givebutter do not have.</p>
          <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={campaign.graphic_detail_reviewed} onChange={(e) => void save({ graphic_detail_reviewed: e.target.checked })} className="mt-0.5" />
            Graphic / trauma detail reviewed
          </label>
          <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={campaign.identifying_info_reviewed} onChange={(e) => void save({ identifying_info_reviewed: e.target.checked })} className="mt-0.5" />
            No identifying survivor details without consent
          </label>
          <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={campaign.consent_confirmed} onChange={(e) => void save({ consent_confirmed: e.target.checked })} className="mt-0.5" />
            Dignity / consent gate confirmed
          </label>
          <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={campaign.show_public_advisory} onChange={(e) => void save({ show_public_advisory: e.target.checked })} className="mt-0.5" />
            Show public content advisory
          </label>
          {campaign.show_public_advisory && (
            <textarea defaultValue={campaign.content_warning || ''} rows={2} onBlur={(e) => void save({ content_warning: e.target.value })} className={input} />
          )}
        </section>
      )}

      {tab === 'share' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-3">
          <Field label="Public URL"><input readOnly value={publicUrl} className={input} /></Field>
          <Field label="Share caption">
            <textarea defaultValue={campaign.share_caption || ''} rows={3} onBlur={(e) => void save({ share_caption: e.target.value })} className={input} />
          </Field>
          <Field label="Embed">
            <textarea readOnly rows={3} value={embed} className={input} />
          </Field>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Campaign QR" className="h-32 w-32 rounded-lg border border-[#27313B] bg-white p-1" />
          <p className="text-xs text-[#A9B8C6]">UTM campaign: {campaign.utm_campaign || campaign.slug}</p>
        </section>
      )}

      {tab === 'gifts' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
          <p className="text-sm text-[#A9B8C6]">Log Zeffy, checks, cash, and in-kind so the bar is honest — Givebutter cannot mix processors this way.</p>
          <div className="grid md:grid-cols-4 gap-2">
            <input className={input} type="number" min="1" value={giftForm.amount} onChange={(e) => setGiftForm({ ...giftForm, amount: e.target.value })} placeholder="Amount $" />
            <select className={input} value={giftForm.source} onChange={(e) => setGiftForm({ ...giftForm, source: e.target.value as GiftSource })}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={input} value={giftForm.name} onChange={(e) => setGiftForm({ ...giftForm, name: e.target.value })} placeholder="Donor name" />
            <button type="button" onClick={() => void addGift()} className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium">Log gift</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-[#A9B8C6]">
            <input type="checkbox" checked={giftForm.anonymous} onChange={(e) => setGiftForm({ ...giftForm, anonymous: e.target.checked })} />
            Anonymous on the wall
          </label>
          <ul className="divide-y divide-[#27313B]">
            {gifts.map((g) => (
              <li key={g.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-[#F6FAFC]">
                  {formatCents(g.amount_cents)} · {SOURCE_LABELS[g.source]} · {g.is_anonymous ? 'Anonymous' : (g.donor_display_name || '—')}
                  <span className="text-[#A9B8C6]"> · {g.status}</span>
                </span>
                {g.status === 'pending' && (
                  <button type="button" className="text-[#53D6FF]" onClick={() => void setGiftStatus(g.id, 'completed')}>Confirm</button>
                )}
              </li>
            ))}
            {!gifts.length && <p className="text-sm text-[#A9B8C6]">No gifts yet.</p>}
          </ul>
        </section>
      )}

      {tab === 'advocates' && (
        <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
          <p className="text-sm text-[#A9B8C6]">Peer-to-peer pages that roll into this campaign — Funraise/Classy territory, owned here.</p>
          <div className="grid md:grid-cols-[1fr_8rem_auto] gap-2">
            <input className={input} value={advocateName} onChange={(e) => setAdvocateName(e.target.value)} placeholder="Advocate or team name" />
            <input className={input} type="number" value={advocateGoal} onChange={(e) => setAdvocateGoal(e.target.value)} placeholder="Goal $" />
            <button type="button" onClick={() => void addAdvocate()} className="px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium">Add page</button>
          </div>
          <ul className="space-y-2">
            {fundraisers.map((f) => (
              <li key={f.id} className="text-sm text-[#B8C4CF]">
                {f.display_name} · /campaigns/{campaign.slug}/f/{f.slug}
                {f.goal_cents ? ` · ${formatCents(f.goal_cents)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {saving && <p className="text-xs text-[#A9B8C6]">Saving…</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
      {children}
    </label>
  )
}

function toLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
