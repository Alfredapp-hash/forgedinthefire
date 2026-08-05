'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { updateGoogleConsent } from '@/src/lib/analytics/consent'

type Props = { measurementId?: string }

export default function GA4Script({ measurementId }: Props) {
  const gaId = measurementId || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID

  useEffect(() => {
    const handler = () => updateGoogleConsent()
    window.addEventListener('consent-updated', handler)
    return () => window.removeEventListener('consent-updated', handler)
  }, [])

  if (!gaId) return null

  const initScript = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted'
    });
    gtag('config', '${gaId}');
  `.trim()

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: initScript }} />
    </>
  )
}
