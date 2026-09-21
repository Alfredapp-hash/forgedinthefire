import { NextResponse } from 'next/server'
import { requireSafeCaseAccess } from '@/lib/safecase/access'
import { createAdminClient } from '@/lib/supabase/server'

export async function withSafeCaseAdmin() {
  const user = await requireSafeCaseAccess()
  const admin = await createAdminClient()
  return { user, admin }
}

export function safecaseError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'SafeCase request failed'
  if (raw.toLowerCase().includes('admin') || raw.toLowerCase().includes('forbidden')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  console.error('[safecase]', err)
  const message = raw.replace(/^.*error:\s*/i, '').slice(0, 220)
  return NextResponse.json({ error: message || 'SafeCase request failed' }, { status: 500 })
}
