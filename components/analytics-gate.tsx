'use client'

import { usePathname } from 'next/navigation'
import GA4Script from '@/src/components/analytics/GA4Script'
import CookieConsentBanner from '@/src/components/analytics/CookieConsentBanner'

type Props = { measurementId?: string }

export default function AnalyticsGate({ measurementId }: Props) {
  const pathname = usePathname()
  if (pathname.startsWith('/admin') || pathname.startsWith('/login')) return null
  if (!measurementId) return null
  return (
    <>
      <GA4Script measurementId={measurementId} />
      <CookieConsentBanner />
    </>
  )
}
