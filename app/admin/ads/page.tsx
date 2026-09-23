import { Suspense } from 'react'
import { AdsDesk } from '@/components/ads/AdsDesk'

export const dynamic = 'force-dynamic'

export default function AdminAdsPage() {
  return (
    <Suspense fallback={<p className="text-[#A9B8C6]">Loading ad analytics…</p>}>
      <AdsDesk />
    </Suspense>
  )
}
