import { hasConsentFor } from './consent'
export * from './consent'
export * from './types'

export function trackGA4Event(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!hasConsentFor('analytics')) return
  const win = window as Window & { gtag?: (cmd: string, name: string, params?: unknown) => void }
  win.gtag?.('event', name, params)
}
