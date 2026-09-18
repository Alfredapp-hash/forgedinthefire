import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Hashing helpers for SafeCase 2FA scaffold.
 * Uses HMAC-SHA256 with a server pepper. Swap to argon2/bcrypt before SAFECASE_2FA_LIVE.
 */

function pepper(): string {
  return (
    process.env.SAFECASE_2FA_PEPPER ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'dev-only-safecase-2fa-pepper-change-me'
  )
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(`${pepper()}:${value}`).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

export function newChallengeToken(): string {
  return randomBytes(24).toString('hex')
}

export function newOtpCode(length = 6): string {
  const max = 10 ** length
  const n = randomBytes(4).readUInt32BE(0) % max
  return String(n).padStart(length, '0')
}

/** Stub SMS — never sends until live. */
export async function sendSmsStub(toE164: string, body: string): Promise<{ sent: false; stub: true }> {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[SafeCase 2FA stub SMS]', {
      to: toE164.replace(/\d(?=\d{4})/g, '•'),
      bodyLength: body.length,
    })
  }
  return { sent: false, stub: true }
}
