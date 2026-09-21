import { NextResponse } from 'next/server'
import { SAFECASE_2FA_LIVE, disabledResponse } from '@/lib/safecase/auth-2fa'

/**
 * POST /api/auth/safecase-2fa/verify
 * Step 2: SMS OTP → session (when live). Scaffold never creates a session.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { challenge_token?: string; code?: string }

  if (!SAFECASE_2FA_LIVE) {
    return NextResponse.json({
      ...disabledResponse('challenge_verify'),
      preview: {
        challenge_token: body.challenge_token || null,
        code_received: Boolean(body.code && /^\d{6}$/.test(String(body.code))),
        message: 'OTP verify is scaffolded only — no session is created.',
      },
    }, { status: 503 })
  }

  return NextResponse.json({
    error: 'Live SafeCase 2FA verify not wired yet',
    code: 'SAFECASE_2FA_NOT_WIRED',
  }, { status: 501 })
}
