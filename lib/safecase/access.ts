import { requireAdmin } from '@/lib/admin/auth'

/**
 * Gate for SafeCase. Today this is the same as admin login.
 * Later version: require a second factor (SMS/call to admin_users.mfa_phone)
 * before issuing a short-lived SafeCase session cookie.
 */
export async function requireSafeCaseAccess() {
  return requireAdmin()
}

export const SAFECASE_MFA_PLANNED = true
