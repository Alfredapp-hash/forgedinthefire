import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function withAdsAdmin() {
  const user = await requireAdmin()
  const supabase = await createAdminClient()
  if (!supabase) throw new Error('Database not configured')
  return { user, supabase: supabase as SupabaseClient }
}

export function adsError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Ads request failed'
  if (raw.toLowerCase().includes('admin') || raw.toLowerCase().includes('forbidden')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (raw.toLowerCase().includes('not configured')) {
    return NextResponse.json({ error: raw }, { status: 503 })
  }
  if (raw.toLowerCase().includes('does not exist') || raw.toLowerCase().includes('schema cache')) {
    return NextResponse.json({
      error: 'Ad campaign tables are not applied yet. Run supabase/migrations/20260921_ad_campaigns.sql',
      tablesMissing: true,
    }, { status: 503 })
  }
  console.error('[ads]', err)
  return NextResponse.json({ error: raw.slice(0, 220) }, { status: 500 })
}

export function isMissingTable(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.toLowerCase().includes('does not exist') || raw.toLowerCase().includes('schema cache')
}
