import { NextResponse } from 'next/server'
import { normalizeAdminEmail, verifyAdminAccess } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

/**
 * Self-check only: tells the signed-in user whether THEIR account is an admin.
 * It never lists other admin accounts (that used to leak every admin email to
 * any signed-in user).
 */
export async function GET() {
  try {
    const { isAdmin, user, error } = await verifyAdminAccess()
    if (!user) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false, error: error || 'Not authenticated' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json(
      {
        authenticated: true,
        isAdmin,
        user: normalizeAdminEmail(user.email),
        ...(isAdmin ? {} : { hint: 'This account is not in admin_users. Ask an owner to add it.' }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Check failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
