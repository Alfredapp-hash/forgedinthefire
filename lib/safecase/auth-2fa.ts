/**
 * SafeCase phone 2FA — scaffold only.
 * Live gate stays OFF until client approves SafeCase build
 * and SAFECASE_2FA_LIVE is flipped (server + client).
 */

export const SAFECASE_2FA_LIVE = false

export const SAFECASE_2FA = {
  pinLength: 6,
  otpLength: 6,
  otpTtlSeconds: 5 * 60,
  maxOtpAttempts: 5,
  /** Human-facing product copy */
  productName: 'SafeCase 2FA',
} as const

export type SafeCase2faEnrollment = {
  email: string
  phone_e164: string | null
  phone_verified_at: string | null
  has_dob: boolean
  has_pin: boolean
  enrolled_at: string | null
  live: boolean
}

export type SafeCase2faChallengeStartBody = {
  /** ISO date YYYY-MM-DD */
  dob: string
  /** Exactly 6 digits */
  pin: string
}

export type SafeCase2faChallengeVerifyBody = {
  challenge_token: string
  /** SMS code */
  code: string
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

export function isValidDob(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false
  const d = new Date(`${dob}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  const year = d.getUTCFullYear()
  return year >= 1920 && year <= new Date().getUTCFullYear() - 16
}

/** Normalize US-ish input to E.164 when possible; otherwise require +prefix. */
export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164 || e164.length < 4) return '—'
  return `••• ••• ${e164.slice(-4)}`
}

export function disabledResponse(action: string) {
  return {
    error: 'SafeCase 2FA is scaffolded but not live yet',
    code: 'SAFECASE_2FA_DISABLED',
    live: false,
    action,
    detail:
      'Enrollment UI and APIs exist for client review. SMS OTP and login gate stay off until SafeCase is approved and SAFECASE_2FA_LIVE is enabled.',
  }
}
