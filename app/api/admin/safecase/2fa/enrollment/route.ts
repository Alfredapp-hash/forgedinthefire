import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  SAFECASE_2FA_LIVE,
  disabledResponse,
  isValidDob,
  isValidPin,
  maskPhone,
  normalizePhoneE164,
  type SafeCase2faEnrollment,
} from '@/lib/safecase/auth-2fa'
import { hashSecret } from '@/lib/safecase/auth-2fa-crypto'

function normalizeEmail(email: string | undefined | null) {
  return (email || '').trim().toLowerCase()
}

async function requireAdmin() {
  const supabase = await createClient()
  if (!supabase) throw new Error('Auth unavailable')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Unauthorized')
  const email = normalizeEmail(user.email)
  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('id, email, role, phone_e164, phone_verified_at, dob_hash, pin_hash, safecase_2fa_enrolled_at')
    .eq('email', email)
    .single()
  if (error || !admin || (admin.role !== 'admin' && admin.role !== 'owner')) {
    // Soft-fail when columns missing (migration not applied)
    if (error && /column|does not exist/i.test(error.message)) {
      const { data: basic } = await supabase
        .from('admin_users')
        .select('id, email, role')
        .eq('email', email)
        .single()
      if (!basic || (basic.role !== 'admin' && basic.role !== 'owner')) throw new Error('Forbidden')
      return {
        supabase,
        user,
        admin: {
          ...basic,
          phone_e164: null,
          phone_verified_at: null,
          dob_hash: null,
          pin_hash: null,
          safecase_2fa_enrolled_at: null,
        },
        columnsMissing: true as const,
      }
    }
    throw new Error('Forbidden')
  }
  return { supabase, user, admin, columnsMissing: false as const }
}

export async function GET() {
  try {
    const { admin, columnsMissing } = await requireAdmin()
    const payload: SafeCase2faEnrollment = {
      email: admin.email,
      phone_e164: admin.phone_e164 ?? null,
      phone_verified_at: admin.phone_verified_at ?? null,
      has_dob: Boolean(admin.dob_hash),
      has_pin: Boolean(admin.pin_hash),
      enrolled_at: admin.safecase_2fa_enrolled_at ?? null,
      live: SAFECASE_2FA_LIVE,
    }
    return NextResponse.json({
      ...payload,
      phone_masked: maskPhone(admin.phone_e164),
      status: SAFECASE_2FA_LIVE ? 'live' : 'scaffolded',
      migration_pending: columnsMissing,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg, live: SAFECASE_2FA_LIVE }, { status })
  }
}

/**
 * Save enrollment draft (phone + DOB + PIN hashes).
 * When SAFECASE_2FA_LIVE is false: still accepts drafts for UX review;
 * never sends SMS and never gates login.
 */
export async function PUT(request: Request) {
  try {
    const { supabase, admin, columnsMissing } = await requireAdmin()
    const body = await request.json() as {
      phone?: string
      dob?: string
      pin?: string
      confirm_pin?: string
    }

    const phone = body.phone != null ? normalizePhoneE164(String(body.phone)) : undefined
    if (body.phone != null && !phone) {
      return NextResponse.json({ error: 'Phone must be a valid US number or E.164 (+1…)' }, { status: 400 })
    }
    if (body.dob != null && !isValidDob(String(body.dob))) {
      return NextResponse.json({ error: 'DOB must be YYYY-MM-DD and a plausible adult date' }, { status: 400 })
    }
    if (body.pin != null) {
      if (!isValidPin(String(body.pin))) {
        return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
      }
      if (body.confirm_pin != null && String(body.pin) !== String(body.confirm_pin)) {
        return NextResponse.json({ error: 'PIN confirmation does not match' }, { status: 400 })
      }
    }

    if (columnsMissing) {
      return NextResponse.json({
        ...disabledResponse('enroll_save'),
        warning: 'Apply supabase/migrations/20260918_safecase_2fa_scaffold.sql to persist enrollment',
        preview: {
          phone_masked: phone ? maskPhone(phone) : '—',
          has_dob: Boolean(body.dob),
          has_pin: Boolean(body.pin),
        },
      })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (phone) {
      patch.phone_e164 = phone
      if (!SAFECASE_2FA_LIVE) patch.phone_verified_at = null
    }
    if (body.dob) patch.dob_hash = hashSecret(`dob:${String(body.dob)}`)
    if (body.pin) {
      patch.pin_hash = hashSecret(`pin:${String(body.pin)}`)
      patch.pin_updated_at = new Date().toISOString()
    }

    const willEnroll = Boolean(
      (phone || admin.phone_e164) &&
      (body.dob || admin.dob_hash) &&
      (body.pin || admin.pin_hash)
    )
    if (willEnroll) {
      patch.safecase_2fa_enrolled_at = admin.safecase_2fa_enrolled_at || new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('admin_users')
      .update(patch)
      .eq('id', admin.id)
      .select('id, email, phone_e164, phone_verified_at, dob_hash, pin_hash, safecase_2fa_enrolled_at')
      .single()

    if (error) throw error

    try {
      await supabase.from('safecase_2fa_events').insert({
        admin_user_id: admin.id,
        event_type: SAFECASE_2FA_LIVE ? 'enroll_saved' : 'disabled_stub',
        meta: { live: SAFECASE_2FA_LIVE },
      })
    } catch {
      // Events table may be missing until migration — ignore
    }

    return NextResponse.json({
      ok: true,
      live: SAFECASE_2FA_LIVE,
      email: data.email,
      phone_masked: maskPhone(data.phone_e164),
      has_dob: Boolean(data.dob_hash),
      has_pin: Boolean(data.pin_hash),
      enrolled_at: data.safecase_2fa_enrolled_at,
      message: SAFECASE_2FA_LIVE
        ? 'Enrollment saved'
        : 'Enrollment draft saved. Login gate and SMS remain off until client approval.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: msg, live: SAFECASE_2FA_LIVE }, { status })
  }
}
