import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function withFundraisingAdmin() {
  const user = await requireAdmin()
  const supabase = await createAdminClient()
  if (!supabase) throw new Error('Database not configured')
  return { user, supabase: supabase as SupabaseClient }
}

export function fundraisingError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Fundraising request failed'
  if (raw.toLowerCase().includes('admin') || raw.toLowerCase().includes('forbidden')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (raw.toLowerCase().includes('not configured')) {
    return NextResponse.json({ error: raw }, { status: 503 })
  }
  if (raw.toLowerCase().includes('does not exist') || raw.toLowerCase().includes('schema cache')) {
    return NextResponse.json({
      error: 'Fundraising tables are not applied yet. Run supabase/migrations/20260921_fundraising_campaigns.sql',
    }, { status: 503 })
  }
  console.error('[fundraising]', err)
  return NextResponse.json({ error: raw.slice(0, 220) }, { status: 500 })
}
