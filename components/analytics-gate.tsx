'use client'

import { usePathname } from 'next/navigation'
import GA4Script from '@/src/components/analytics/GA4Script'
import CookieConsentBanner from '@/src/components/analytics/CookieConsentBanner'

type Props = { measurementId?: string }

export default function AnalyticsGate({ measurementId }: Props) {
  const pathname = usePathname()
  // No GA or cookie banner in the admin or in the guest booth (/studio/join/<token>):
  // the invite token is in the URL and guests may be survivors.
  if (pathname.startsWith('/admin') || pathname.startsWith('/login') || pathname.startsWith('/studio')) return null
  if (!measurementId) return null
  return (
    <>
      <GA4Script measurementId={measurementId} />
      <CookieConsentBanner />
    </>
  )
}
