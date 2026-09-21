import type { Metadata } from 'next'
import { AdsResearchView } from '@/components/ads/AdsResearchView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ad research — Forged in the Fire',
  robots: { index: false, follow: false },
}

export default function AdResearchPreviewPage() {
  return (
    <div className="min-h-screen bg-[#05070A] text-[#F6FAFC] p-6 md:p-10">
      <p className="text-xs uppercase tracking-widest text-[#8DEBFF] mb-3">Internal research preview · not indexed</p>
      <AdsResearchView />
    </div>
  )
}
