'use client'

import { useState, useEffect } from 'react'
import { acceptAllConsent, rejectAllConsent, getConsent } from '@/src/lib/analytics/consent'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = getConsent()
    if (!consent.timestamp) setVisible(true)
    const hide = () => setVisible(false)
    window.addEventListener('consent-updated', hide)
    return () => window.removeEventListener('consent-updated', hide)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-charcoal border-t border-charcoal-600 shadow-lg">
      <div className="container mx-auto flex flex-col md:flex-row md:items-center gap-4">
        <p className="text-sm text-cream-100/90 flex-1">
          We use cookies to analyze site traffic and improve your experience. See our{' '}
          <Link href="/privacy" className="text-gold underline">Privacy Policy</Link>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => { rejectAllConsent(); setVisible(false) }}>
            Decline
          </Button>
          <Button size="sm" onClick={() => { acceptAllConsent(); setVisible(false) }}>
            Accept Analytics
          </Button>
        </div>
      </div>
    </div>
  )
}
