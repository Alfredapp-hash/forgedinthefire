import { NextResponse } from 'next/server'
import {
  SAFECASE_2FA,
  SAFECASE_2FA_LIVE,
  disabledResponse,
  isValidDob,
  isValidPin,
} from '@/lib/safecase/auth-2fa'
import { newChallengeToken, sendSmsStub } from '@/lib/safecase/auth-2fa-crypto'

/**
 * POST /api/auth/safecase-2fa/challenge
 * Step 1: DOB + PIN → (when live) SMS OTP to registered phone.
 * Scaffold: validates shape, returns 503 stub — never creates a session.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { dob?: string; pin?: string }

  if (!isValidDob(String(body.dob || ''))) {
    return NextResponse.json(
      { ...disabledResponse('challenge_start'), error: 'DOB required (YYYY-MM-DD)' },
      { status: 400 },
    )
  }
  if (!isValidPin(String(body.pin || ''))) {
    return NextResponse.json(
      { ...disabledResponse('challenge_start'), error: 'PIN must be exactly 6 digits' },
      { status: 400 },
    )
  }

  if (!SAFECASE_2FA_LIVE) {
    await sendSmsStub('+10000000000', 'stub')
    return NextResponse.json({
      ...disabledResponse('challenge_start'),
      preview: {
        challenge_token: `preview_${newChallengeToken().slice(0, 12)}`,
        otp_length: SAFECASE_2FA.otpLength,
        expires_in_seconds: SAFECASE_2FA.otpTtlSeconds,
        message:
          'If this were live, a 6-digit code would text the enrolled phone after DOB+PIN matched.',
      },
    }, { status: 503 })
  }

  return NextResponse.json({
    error: 'Live SafeCase 2FA challenge not wired yet',
    code: 'SAFECASE_2FA_NOT_WIRED',
  }, { status: 501 })
}
