'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BarChart3, Plus, Printer, FileDown, Target } from 'lucide-react'
import { DualLineChart, GroupedBarChart, HorizontalBars } from '@/components/ads/charts'
import { formatCents } from '@/lib/fundraising/progress'
import { campaignLandingWithUtm } from '@/lib/ads/utm'
import { formatPct, formatRoas } from '@/lib/ads/metrics'
import { OBJECTIVE_LABELS, PLATFORM_LABELS, STATUS_LABELS, type AdObjective, type AdPlatform, type AdStatus, type CampaignRollup } from '@/lib/ads/types'
import type { CompetitorCampaign } from '@/lib/ads/competitors'
import type { AdsReport } from '@/lib/ads/report'
import type { SectorChannel } from '@/lib/ads/sector'
import type { ChannelPoint, WeekPoint } from '@/lib/ads/types'

type Desk = {
  tablesMissing?: boolean
  dbWarning?: string | null
  totals: { spend_cents: number; return_cents: number; gift_count: number; roas: number | null; cpa_cents: number | null }
  campaigns: CampaignRollup[]
  channels: ChannelPoint[]
  weeks: WeekPoint[]
  fundraisingCampaigns?: { id: string; title: string; slug: string; utm_campaign: string | null; status: string }[]
  sector: { channels: SectorChannel[]; notes: string[]; source: { title: string; url: string } }
  competitors: CompetitorCampaign[]
  playbook: { title: string; body: string }[]
  report: AdsReport
}

type Tab = 'overview' | 'ours' | 'peers' | 'report'

const input = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'

export function AdsDesk() {
  const search = useSearchParams()
  const attach = search.get('attach')
  const [data, setData] = useState<Desk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(attach ? 'ours' : 'overview')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/ads')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not load ads')
    setData(json)
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
  }, [])

  if (!data && !error) return <div className="p-8 text-[#A9B8C6]">Loading ad analytics…</div>
  if (error && !data) return <p className="text-sm text-red-300">{error}</p>
  if (!data) return null

  const t = data.totals

  return (
    <div className="max-w-6xl mx-auto space-y-8 print:max-w-none">
      <div className="flex items-start justify-between gap-4 print:block">
        <div>
          <h1 className="text-3xl font-bold text-[#F6FAFC]">Ad analytics</h1>
          <p className="text-[#A9B8C6] mt-1">
            Track FITF paid media and return, then compare against {data.competitors.length} related nonprofit campaigns and sector ROAS.
            {' '}<Link href="/admin/campaigns" className="text-[#53D6FF] underline">Fundraising campaigns</Link>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={() => { setTab('report'); window.print() }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#27313B] text-sm text-[#F6FAFC]">
            <Printer size={14} /> Print report
          </button>
          <button type="button" onClick={() => downloadMarkdown(data.report)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold">
            <FileDown size={14} /> Download
          </button>
          <a href="/preview/ad-research" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#27313B] text-sm text-[#F6FAFC]">
            Research preview
          </a>
        </div>
      </div>

      {data.tablesMissing && (
        <p className="text-sm text-[#8DEBFF] bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-xl p-4">
          Ad tables are not applied yet{data.dbWarning ? ` (${data.dbWarning})` : ''}. Peer graphs still work. Run <code>supabase/migrations/20260921_ad_campaigns.sql</code> to log FITF spend and return.
        </p>
      )}

      <div className="flex gap-2 print:hidden">
        {(['overview', 'ours', 'peers', 'report'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${tab === id ? 'bg-[#1A232C] text-[#8DEBFF]' : 'text-[#A9B8C6]'}`}
          >
            {id === 'ours' ? 'Our ads' : id}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Spend" value={formatCents(t.spend_cents)} />
        <Stat label="Attributed return" value={formatCents(t.return_cents)} />
        <Stat label="ROAS" value={formatRoas(t.roas)} sub="return ÷ spend" />
        <Stat label="Cost per gift" value={t.cpa_cents == null ? '—' : formatCents(t.cpa_cents)} sub={`${t.gift_count} gifts`} />
      </div>

      {(tab === 'overview' || tab === 'report') && (
        <Overview data={data} />
      )}
      {tab === 'ours' && (
        <Ours
          data={data}
          busy={busy}
          setBusy={setBusy}
          attachId={attach}
          onSaved={() => { void load().catch(() => undefined) }}
        />
      )}
      {(tab === 'peers' || tab === 'report') && <Peers data={data} />}
      {tab === 'report' && <ReportBlock report={data.report} />}
      {tab === 'overview' && (
        <p className="text-xs text-[#A9B8C6]">
          Sector ROAS from <a className="text-[#53D6FF] underline" href={data.sector.source.url} target="_blank" rel="noreferrer">{data.sector.source.title}</a>.
          Peer figures are public campaign results, not FITF ad-account data.
        </p>
      )}
    </div>
  )
}

function Overview({ data }: { data: Desk }) {
  const grouped = data.channels.map((c) => ({
    label: shortPlatform(c.platform),
    values: [
      { value: c.roas ?? 0, color: '#53D6FF', label: 'FITF' },
      { value: c.sector_roas, color: '#8DEBFF', label: 'Sector' },
    ],
  }))
  const weeks = data.weeks.map((w) => ({
    label: w.week.slice(5),
    a: w.spend_cents,
    b: w.return_cents,
  }))
  const dollarPeers = data.competitors
    .filter((c) => c.outcome_kind === 'dollars' && c.outcome_value)
    .map((c) => ({
      label: c.org,
      sub: c.campaign,
      value: (c.outcome_value || 0) / 100,
      color: '#53D6FF',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="ROAS by channel — FITF vs sector" icon={BarChart3}>
          <GroupedBarChart items={grouped} />
          <p className="text-[11px] text-[#A9B8C6] mt-2">Cyan = FITF (0 until spend is logged). Gold = M+R 2026 nonprofit average.</p>
        </Card>
        <Card title="Spend vs attributed return" icon={Target}>
          <DualLineChart points={weeks} aLabel="Spend" bLabel="Return" />
        </Card>
      </div>
      <Card title="Public fundraising outcomes at related nonprofits">
        <HorizontalBars items={dollarPeers} format={(n) => formatCents(Math.round(n * 100))} />
        <p className="text-[11px] text-[#A9B8C6] mt-3">These are campaign or org totals from public sources — not comparable ROAS. Use them for creative and channel clues, then judge FITF on the graph above.</p>
      </Card>
    </div>
  )
}

function Ours({
  data, busy, setBusy, onSaved, attachId,
}: {
  data: Desk
  busy: boolean
  setBusy: (v: boolean) => void
  onSaved: () => void
  attachId?: string | null
}) {
  const funds = data.fundraisingCampaigns || []
  const attached = funds.find((f) => f.id === attachId)
  const [open, setOpen] = useState(Boolean(attachId))
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: attached ? `${attached.title} — Meta` : '',
    platform: 'meta' as AdPlatform,
    objective: 'fundraising' as AdObjective,
    status: 'active' as AdStatus,
    fundraising_campaign_id: attachId || '',
    utm_campaign: attached?.utm_campaign || attached?.slug || '',
    landing_url: attached ? `/campaigns/${attached.slug}` : '/donate',
    dignity_reviewed: false,
    graphic_detail_reviewed: false,
    identifying_info_reviewed: false,
  })

  function applyFund(id: string) {
    const fund = funds.find((f) => f.id === id)
    setForm((prev) => ({
      ...prev,
      fundraising_campaign_id: id,
      name: fund ? `${fund.title} — ${PLATFORM_LABELS[prev.platform]}` : prev.name,
      utm_campaign: fund?.utm_campaign || fund?.slug || prev.utm_campaign,
      landing_url: fund ? `/campaigns/${fund.slug}` : prev.landing_url,
    }))
  }

  async function createCampaign() {
    setBusy(true)
    setFormError(null)
    const res = await fetch('/api/admin/ads/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        fundraising_campaign_id: form.fundraising_campaign_id || null,
      }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) {
      setFormError(json.error || 'Could not save')
      return
    }
    setOpen(false)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold">
          <Plus size={16} /> Log campaign
        </button>
      </div>
      {open && (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-5 grid md:grid-cols-2 gap-3">
          {formError && <p className="text-sm text-red-300 md:col-span-2">{formError}</p>}
          <Field label="Name"><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Attach fundraising campaign">
            <select className={input} value={form.fundraising_campaign_id} onChange={(e) => applyFund(e.target.value)}>
              <option value="">None — land on /donate</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.title} ({f.status})</option>
              ))}
            </select>
          </Field>
          <Field label="Platform">
            <select className={input} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as AdPlatform })}>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Objective">
            <select className={input} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value as AdObjective })}>
              {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="UTM campaign"><input className={input} value={form.utm_campaign} placeholder="auto from name" onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} /></Field>
          <Field label="Landing path"><input className={input} value={form.landing_url} onChange={(e) => setForm({ ...form, landing_url: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={form.dignity_reviewed} onChange={(e) => setForm({ ...form, dignity_reviewed: e.target.checked })} />
            Dignity reviewed
          </label>
          <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
            <input type="checkbox" checked={form.graphic_detail_reviewed} onChange={(e) => setForm({ ...form, graphic_detail_reviewed: e.target.checked })} />
            No graphic / raid creative
          </label>
          <label className="flex items-center gap-2 text-sm text-[#B8C4CF] md:col-span-2">
            <input type="checkbox" checked={form.identifying_info_reviewed} onChange={(e) => setForm({ ...form, identifying_info_reviewed: e.target.checked })} />
            No identifying survivor details
          </label>
          <div className="flex items-end">
            <button type="button" disabled={busy || !form.name.trim()} onClick={() => void createCampaign()} className="px-4 py-2 rounded-xl bg-[#53D6FF] text-[#061016] text-sm font-semibold disabled:opacity-40">Save campaign</button>
          </div>
          <p className="text-xs text-[#A9B8C6] md:col-span-2">Landing URLs pick up UTMs automatically so Zeffy gifts can match this campaign. Do not run raid, shock, or identifying survivor creative.</p>
        </div>
      )}

      {data.campaigns.length === 0 ? (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-12 text-center">
          <p className="font-semibold text-[#F6FAFC]">No FITF ad campaigns logged</p>
          <p className="text-sm text-[#A9B8C6] mt-1">Add Meta, Google, or Grants campaigns, attach a fundraising page, then log weekly spend. UTM gifts match automatically. Peer graphs are already on Overview.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.campaigns.map((row) => (
            <CampaignCard key={row.campaign.id} row={row} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignCard({ row, onSaved }: { row: CampaignRollup; onSaved: () => void }) {
  const c = row.campaign
  const [spend, setSpend] = useState({ dollars: '', start: new Date().toISOString().slice(0, 10), clicks: '', impressions: '' })
  const [ret, setRet] = useState({ dollars: '', start: new Date().toISOString().slice(0, 10), gifts: '' })
  const [localError, setLocalError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const landing = campaignLandingWithUtm({
    path: c.landing_url || '/donate',
    utm_source: c.utm_source || c.platform,
    utm_medium: c.utm_medium || 'paid',
    utm_campaign: c.utm_campaign,
    utm_content: c.utm_content,
  })

  async function post(path: string, body: Record<string, unknown>) {
    setLocalError(null)
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Save failed')
    onSaved()
  }

  return (
    <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#F6FAFC]">{c.name}</p>
          <p className="text-xs text-[#A9B8C6]">{PLATFORM_LABELS[c.platform]} · {OBJECTIVE_LABELS[c.objective]} · {STATUS_LABELS[c.status]} · utm={c.utm_campaign}</p>
          <button
            type="button"
            className="text-[11px] text-[#53D6FF] mt-1"
            onClick={() => {
              void navigator.clipboard.writeText(landing).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              })
            }}
          >
            {copied ? 'Copied landing URL' : 'Copy UTM landing URL'}
          </button>
        </div>
        <div className="text-right text-sm">
          <p className="text-[#F6FAFC]">{formatCents(row.spend_cents)} in → {formatCents(row.return_cents)} back</p>
          <p className="text-[#8DEBFF]">{formatRoas(row.roas)} ROAS · CPA {row.cpa_cents == null ? '—' : formatCents(row.cpa_cents)} · CTR {formatPct(row.ctr)}</p>
        </div>
      </div>
      {localError && <p className="text-sm text-red-300">{localError}</p>}
      <div className="grid md:grid-cols-2 gap-3 print:hidden">
        <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); void post(`/api/admin/ads/campaigns/${c.id}/spend`, { spend_dollars: Number(spend.dollars), period_start: spend.start, period_end: spend.start, clicks: spend.clicks || null, impressions: spend.impressions || null }).then(() => setSpend({ dollars: '', start: spend.start, clicks: '', impressions: '' })).catch((err) => setLocalError(err.message)) }}>
          <p className="col-span-2 text-xs uppercase tracking-wider text-[#A9B8C6]">Log spend</p>
          <input className={input} type="number" min="0" step="0.01" placeholder="$ spent" value={spend.dollars} onChange={(e) => setSpend({ ...spend, dollars: e.target.value })} />
          <input className={input} type="date" value={spend.start} onChange={(e) => setSpend({ ...spend, start: e.target.value })} />
          <input className={input} type="number" min="0" placeholder="Impressions" value={spend.impressions} onChange={(e) => setSpend({ ...spend, impressions: e.target.value })} />
          <input className={input} type="number" min="0" placeholder="Clicks" value={spend.clicks} onChange={(e) => setSpend({ ...spend, clicks: e.target.value })} />
          <button className="col-span-2 text-sm text-[#53D6FF] text-left">Save spend</button>
        </form>
        <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); void post(`/api/admin/ads/campaigns/${c.id}/returns`, { attributed_dollars: Number(ret.dollars), period_start: ret.start, period_end: ret.start, gift_count: Number(ret.gifts || 0), method: 'manual' }).then(() => setRet({ dollars: '', start: ret.start, gifts: '' })).catch((err) => setLocalError(err.message)) }}>
          <p className="col-span-2 text-xs uppercase tracking-wider text-[#A9B8C6]">Log return</p>
          <input className={input} type="number" min="0" step="0.01" placeholder="$ attributed" value={ret.dollars} onChange={(e) => setRet({ ...ret, dollars: e.target.value })} />
          <input className={input} type="date" value={ret.start} onChange={(e) => setRet({ ...ret, start: e.target.value })} />
          <input className={input} type="number" min="0" placeholder="Gift count" value={ret.gifts} onChange={(e) => setRet({ ...ret, gifts: e.target.value })} />
          <button className="text-sm text-[#53D6FF] text-left">Save return</button>
        </form>
      </div>
    </div>
  )
}

function Peers({ data }: { data: Desk }) {
  const reach = data.competitors.filter((c) => c.outcome_kind === 'reach' && c.outcome_value)
  const leads = data.competitors.filter((c) => c.outcome_kind === 'leads' && c.outcome_value)
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Awareness reach (public)">
          <HorizontalBars
            items={reach.map((c) => ({ label: c.org, sub: c.campaign, value: c.outcome_value || 0 }))}
            format={(n) => `${(n / 1_000_000).toFixed(1)}M people`}
          />
        </Card>
        <Card title="Lead-gen from ads (public)">
          <HorizontalBars
            items={leads.map((c) => ({ label: c.org, sub: c.campaign, value: c.outcome_value || 0, color: '#8DEBFF' }))}
            format={(n) => `${n.toLocaleString()} advocates`}
          />
        </Card>
      </div>
      <div className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#05070A] text-xs uppercase tracking-wider text-[#A9B8C6]">
            <tr>
              <th className="text-left px-4 py-3">Org</th>
              <th className="text-left px-4 py-3">Campaign</th>
              <th className="text-left px-4 py-3">What worked</th>
              <th className="text-left px-4 py-3">FITF copy</th>
            </tr>
          </thead>
          <tbody>
            {data.competitors.map((c) => (
              <tr key={`${c.org}-${c.campaign}`} className="border-t border-[#27313B] align-top">
                <td className="px-4 py-3">
                  <p className="text-[#F6FAFC] font-medium">{c.org}</p>
                  <p className="text-[11px] text-[#A9B8C6]">{c.category}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-[#F6FAFC]">{c.campaign}</p>
                  <p className="text-[11px] text-[#8DEBFF]">{c.outcome_label}</p>
                </td>
                <td className="px-4 py-3 text-[#B8C4CF]">{c.what_worked}</td>
                <td className="px-4 py-3 text-[#B8C4CF]">{c.copy_for_fitf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReportBlock({ report }: { report: AdsReport }) {
  return (
    <article id="ads-report" className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-5">
      <h2 className="text-2xl font-bold text-[#F6FAFC]">{report.headline}</h2>
      <p className="text-[#B8C4CF]">{report.summary}</p>
      <div className="grid md:grid-cols-5 gap-3">
        <Mini label="Spend" value={report.fitf.spend} />
        <Mini label="Return" value={report.fitf.returned} />
        <Mini label="ROAS" value={report.fitf.roas} />
        <Mini label="CPA" value={report.fitf.cpa} />
        <Mini label="Gifts" value={String(report.fitf.gifts)} />
      </div>
      <section>
        <h3 className="font-semibold text-[#8DEBFF] mb-2">What is working</h3>
        <ul className="space-y-3">
          {report.working.map((w) => (
            <li key={w.title}>
              <p className="text-[#F6FAFC] font-medium">{w.title}</p>
              <p className="text-sm text-[#A9B8C6]">{w.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-[#8DEBFF] mb-2">Peer takeaways</h3>
        <ul className="space-y-2">
          {report.peers.map((p) => (
            <li key={p.org} className="text-sm text-[#B8C4CF]">
              <span className="text-[#F6FAFC] font-medium">{p.org}</span> — {p.takeaway}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-[#8DEBFF] mb-2">Next for FITF</h3>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-[#B8C4CF]">
          {report.next.map((n) => <li key={n}>{n}</li>)}
        </ol>
      </section>
      <p className="text-[11px] text-[#A9B8C6]">
        Generated {new Date(report.generated_at).toLocaleString()} · {report.source} · <a className="text-[#53D6FF] underline" href={report.source_url} target="_blank" rel="noreferrer">{report.source_url}</a>
      </p>
    </article>
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#05070A] border border-[#27313B] p-3">
      <p className="text-[11px] uppercase tracking-wider text-[#A9B8C6]">{label}</p>
      <p className="text-lg font-semibold text-[#F6FAFC]">{value}</p>
    </div>
  )
}

function Card({ title, icon: Icon, children }: { title: string; icon?: typeof BarChart3; children: ReactNode }) {
  return (
    <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} className="text-[#53D6FF]" />}
        <h2 className="font-semibold text-[#F6FAFC]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-[#A9B8C6] space-y-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function shortPlatform(p: AdPlatform) {
  return {
    meta: 'Meta',
    google_search: 'Search',
    google_grants: 'Grants',
    pmax: 'PMax',
    youtube: 'YouTube',
    display: 'Display',
    tiktok: 'TikTok',
    other: 'Other',
  }[p]
}

function downloadMarkdown(report: AdsReport) {
  const md = [
    `# ${report.headline}`,
    '',
    report.summary,
    '',
    `Spend: ${report.fitf.spend} · Return: ${report.fitf.returned} · ROAS: ${report.fitf.roas} · CPA: ${report.fitf.cpa} · Gifts: ${report.fitf.gifts}`,
    '',
    '## What is working',
    ...report.working.flatMap((w) => [`### ${w.title}`, w.body, '']),
    '## Peer takeaways',
    ...report.peers.map((p) => `- **${p.org}** (${p.campaign}): ${p.takeaway}`),
    '',
    '## Next for FITF',
    ...report.next.map((n, i) => `${i + 1}. ${n}`),
    '',
    `_Source: [${report.source}](${report.source_url}) · ${report.generated_at}_`,
  ].join('\n')
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fitf-ad-report-${report.generated_at.slice(0, 10)}.md`
  a.click()
}
