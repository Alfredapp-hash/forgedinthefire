export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences'

export type ConsentState = {
  necessary: boolean
  analytics: boolean
  marketing: boolean
  preferences: boolean
  timestamp: number
  version: string
}
