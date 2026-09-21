'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/fundraising/progress'
import { zeffyCheckoutUrl } from '@/lib/fundraising/templates'
import { ZEFFY_DONATE_URL, type FundraisingCampaign, type SuggestedAmount } from '@/lib/fundraising/types'
import { Button } from '@/components/ui/button'
import { Heart } from 'lucide-react'

export function CampaignDonatePanel({
  campaign,
  fundraiserId,
}: {
  campaign: Pick<FundraisingCampaign, 'slug' | 'zeffy_url' | 'suggested_amounts' | 'honor_gifts_enabled' | 'utm_campaign'>
  fundraiserId?: string
}) {
  const amounts = (campaign.suggested_amounts || []) as SuggestedAmount[]
  const [selected, setSelected] = useState<number | null>(amounts[1]?.amount ?? amounts[0]?.amount ?? 100)
  const [custom, setCustom] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [reported, setReported] = useState<string | null>(null)
  const [report, setReport] = useState({ name: '', email: '', message: '', honor: '', anonymous: false })
  const [showReport, setShowReport] = useState(false)

  const amount = custom ? Number(custom) : selected

  function checkout() {
    const base = campaign.zeffy_url || ZEFFY_DONATE_URL
    const href = zeffyCheckoutUrl(amount, {
      utm_source: 'campaign',
      utm_medium: 'site',
      utm_campaign: campaign.utm_campaign || campaign.slug,
    }, base)
    window.open(href, '_blank', 'noopener,noreferrer')
    setShowReport(true)
  }

  async function submitReport() {
    const res = await fetch(`/api/campaigns/${campaign.slug}/report-gift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_dollars: amount,
        donor_display_name: report.name,
        donor_email: report.email,
        message: report.message,
        honor_of: report.honor,
        is_anonymous: report.anonymous,
        is_recurring: recurring,
        fundraiser_id: fundraiserId || null,
        company: '',
      }),
    })
    const data = await res.json()
    setReported(data.message || data.error || 'Saved')
  }

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
      <p className="text-sm font-semibold text-[#F6FAFC]">Give on this campaign</p>
      <div className="flex items-center justify-center gap-3 text-sm">
        <span className={!recurring ? 'text-[#F6FAFC]' : 'text-[#A9B8C6]'}>One-time</span>
        <button
          type="button"
          onClick={() => setRecurring(!recurring)}
          className={`relative w-12 h-6 rounded-full ${recurring ? 'bg-[#53D6FF]' : 'bg-[#27313B]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${recurring ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
        <span className={recurring ? 'text-[#F6FAFC]' : 'text-[#A9B8C6]'}>Monthly</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {amounts.map((tier) => (
          <button
            key={tier.amount}
            type="button"
            onClick={() => { setSelected(tier.amount); setCustom('') }}
            className={`rounded-xl border px-3 py-3 text-left ${
              selected === tier.amount && !custom
                ? 'border-[#53D6FF] bg-[#53D6FF]/10'
                : 'border-[#27313B]'
            }`}
          >
            <p className="font-serif text-xl text-[#F6FAFC]">{formatCents(tier.amount * 100)}</p>
            <p className="text-[11px] text-[#8DEBFF]">{tier.impact}</p>
          </button>
        ))}
      </div>
      <label className="block text-xs text-[#A9B8C6]">
        Custom amount
        <input
          type="number"
          min={1}
          value={custom}
          onChange={(e) => { setCustom(e.target.value); setSelected(null) }}
          className="mt-1 w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-[#F6FAFC]"
        />
      </label>
      <Button className="w-full" onClick={checkout} disabled={!amount}>
        {recurring ? 'Give monthly' : 'Give now'} <Heart className="ml-2 h-4 w-4" />
      </Button>
      <p className="text-xs text-[#A9B8C6] text-center">0% platform fees via Zeffy · 501(c)(3) tax-deductible</p>

      {showReport && (
        <div className="border-t border-[#27313B] pt-4 space-y-2">
          <p className="text-sm text-[#F6FAFC]">Already gave? Tell us so the thermometer stays honest.</p>
          <input placeholder="Name for the donor wall" className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]" value={report.name} onChange={(e) => setReport({ ...report, name: e.target.value })} />
          <input placeholder="Email (private, for receipt follow-up)" type="email" className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]" value={report.email} onChange={(e) => setReport({ ...report, email: e.target.value })} />
          {campaign.honor_gifts_enabled && (
            <input placeholder="In honor of (optional)" className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]" value={report.honor} onChange={(e) => setReport({ ...report, honor: e.target.value })} />
          )}
          <textarea placeholder="Note for the wall (optional)" rows={2} className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]" value={report.message} onChange={(e) => setReport({ ...report, message: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-[#A9B8C6]">
            <input type="checkbox" checked={report.anonymous} onChange={(e) => setReport({ ...report, anonymous: e.target.checked })} />
            Give anonymously
          </label>
          <button type="button" onClick={() => void submitReport()} className="text-sm text-[#53D6FF]">Submit gift for confirmation</button>
          {reported && <p className="text-xs text-[#8DEBFF]">{reported}</p>}
        </div>
      )}
    </div>
  )
}
