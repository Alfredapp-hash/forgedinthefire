import type { ConsentCategory, ConsentState } from './types'

const CONSENT_KEY = 'fit_consent_v1'
const CONSENT_VERSION = '1.0'

export function getDefaultConsent(): ConsentState {
  return {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
    timestamp: 0,
    version: CONSENT_VERSION,
  }
}

export function getConsent(): ConsentState {
  if (typeof window === 'undefined') return getDefaultConsent()
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (!stored) return getDefaultConsent()
    const parsed = JSON.parse(stored) as ConsentState
    if (parsed.version !== CONSENT_VERSION) return getDefaultConsent()
    return parsed
  } catch {
    return getDefaultConsent()
  }
}

export function setConsent(consent: Omit<ConsentState, 'timestamp'>): void {
  if (typeof window === 'undefined') return
  const full: ConsentState = { ...consent, timestamp: Date.now() }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(full))
  window.dispatchEvent(new CustomEvent('consent-updated', { detail: full }))
}

export function hasConsentFor(category: ConsentCategory): boolean {
  return getConsent()[category] === true
}

export function shouldShowConsentBanner(): boolean {
  const consent = getConsent()
  return !consent.timestamp
}

export function acceptAllConsent(): void {
  setConsent({ necessary: true, analytics: true, marketing: false, preferences: true, version: CONSENT_VERSION })
  updateGoogleConsent()
}

export function rejectAllConsent(): void {
  setConsent({ necessary: true, analytics: false, marketing: false, preferences: false, version: CONSENT_VERSION })
  updateGoogleConsent()
}

export function updateGoogleConsent(): void {
  if (typeof window === 'undefined') return
  const win = window as Window & { gtag?: (cmd: string, action: string, params?: unknown) => void }
  if (typeof win.gtag !== 'function') return
  const consent = getConsent()
  win.gtag('consent', 'update', {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: 'denied',
    functionality_storage: consent.preferences ? 'granted' : 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
  })
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
