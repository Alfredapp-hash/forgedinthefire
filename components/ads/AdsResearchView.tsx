'use client'

import { BarChart3 } from 'lucide-react'
import { DualLineChart, GroupedBarChart, HorizontalBars } from '@/components/ads/charts'
import { COMPETITOR_CAMPAIGNS, COMPETITOR_PLAYBOOK } from '@/lib/ads/competitors'
import { channelPoints } from '@/lib/ads/metrics'
import { buildAdsReport } from '@/lib/ads/report'
import { SECTOR_CHANNELS, SECTOR_SOURCE } from '@/lib/ads/sector'
import { formatCents } from '@/lib/fundraising/progress'
import { PLATFORM_LABELS } from '@/lib/ads/types'

export function AdsResearchView() {
  const channels = channelPoints([])
  const report = buildAdsReport([], channels)
  const grouped = channels.map((c) => ({
    label: PLATFORM_LABELS[c.platform].split(' ')[0],
    values: [
      { value: c.roas ?? 0, color: '#53D6FF', label: 'FITF' },
      { value: c.sector_roas, color: '#8DEBFF', label: 'Sector' },
    ],
  }))
  const dollarPeers = COMPETITOR_CAMPAIGNS
    .filter((c) => c.outcome_kind === 'dollars' && c.outcome_value)
    .map((c) => ({
      label: c.org,
      sub: c.campaign,
      value: (c.outcome_value || 0) / 100,
    }))
    .sort((a, b) => b.value - a.value)
  const reach = COMPETITOR_CAMPAIGNS.filter((c) => c.outcome_kind === 'reach' && c.outcome_value)
  const leads = COMPETITOR_CAMPAIGNS.filter((c) => c.outcome_kind === 'leads' && c.outcome_value)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{report.headline}</h1>
        <p className="text-[#A9B8C6] mt-2">{report.summary}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-[#53D6FF]" />
            <h2 className="font-semibold">Sector ROAS by channel</h2>
          </div>
          <GroupedBarChart items={grouped} />
          <p className="text-[11px] text-[#A9B8C6] mt-2">Gold bars are M+R 2026 nonprofit averages. Cyan is FITF (zero until spend is logged in Admin → Ad analytics).</p>
        </section>
        <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
          <h2 className="font-semibold mb-4">Spend vs return (FITF)</h2>
          <DualLineChart points={[]} aLabel="Spend" bLabel="Return" />
        </section>
      </div>

      <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
        <h2 className="font-semibold mb-4">Public fundraising outcomes — {COMPETITOR_CAMPAIGNS.length} related nonprofits</h2>
        <HorizontalBars items={dollarPeers} format={(n) => formatCents(Math.round(n * 100))} />
        <p className="text-[11px] text-[#A9B8C6] mt-3">Campaign or org totals from public sources, not ROAS. Not comparable to FITF ad-account data.</p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
          <h2 className="font-semibold mb-4">Awareness reach</h2>
          <HorizontalBars
            items={reach.map((c) => ({ label: c.org, sub: c.campaign, value: c.outcome_value || 0 }))}
            format={(n) => `${(n / 1_000_000).toFixed(1)}M people`}
          />
        </section>
        <section className="bg-[#151B22] rounded-xl border border-[#27313B] p-5">
          <h2 className="font-semibold mb-4">Lead-gen from ads</h2>
          <HorizontalBars
            items={leads.map((c) => ({ label: c.org, sub: c.campaign, value: c.outcome_value || 0, color: '#8DEBFF' }))}
            format={(n) => `${n.toLocaleString()} advocates`}
          />
        </section>
      </div>

      <section className="bg-[#151B22] rounded-xl border border-[#27313B] overflow-hidden">
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
            {COMPETITOR_CAMPAIGNS.map((c) => (
              <tr key={`${c.org}-${c.campaign}`} className="border-t border-[#27313B] align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.org}</p>
                  <p className="text-[11px] text-[#A9B8C6]">{c.category}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{c.campaign}</p>
                  <p className="text-[11px] text-[#8DEBFF]">{c.outcome_label}</p>
                </td>
                <td className="px-4 py-3 text-[#B8C4CF]">{c.what_worked}</td>
                <td className="px-4 py-3 text-[#B8C4CF]">{c.copy_for_fitf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <article className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
        <h2 className="text-2xl font-bold">{report.headline}</h2>
        <p className="text-[#B8C4CF]">{report.summary}</p>
        <h3 className="font-semibold text-[#8DEBFF]">What is working</h3>
        <ul className="space-y-3">
          {COMPETITOR_PLAYBOOK.map((w) => (
            <li key={w.title}>
              <p className="font-medium">{w.title}</p>
              <p className="text-sm text-[#A9B8C6]">{w.body}</p>
            </li>
          ))}
        </ul>
        <h3 className="font-semibold text-[#8DEBFF]">Next for FITF</h3>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-[#B8C4CF]">
          {report.next.map((n) => <li key={n}>{n}</li>)}
        </ol>
        <p className="text-[11px] text-[#A9B8C6]">
          Source: <a className="text-[#53D6FF] underline" href={SECTOR_SOURCE.url}>{SECTOR_SOURCE.title}</a>
          {' · '}{SECTOR_CHANNELS.length} sector channels · {COMPETITOR_CAMPAIGNS.length} peer campaigns
        </p>
      </article>
    </div>
  )
}
