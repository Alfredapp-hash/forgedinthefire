import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Admin-gated studio access — uses service role after requireAdmin so RLS cannot leak tokens to any authenticated user. */
export async function withStudioAdmin() {
  const user = await requireAdmin()
  const supabase = await createAdminClient()
  if (!supabase) {
    throw new Error('Database not configured')
  }
  return { user, supabase: supabase as SupabaseClient }
}

export function studioError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Studio request failed'
  // requireAdmin() throws 'Not authenticated' / 'Insufficient privileges' / 'Not authorized as admin'.
  if (raw === 'Not authenticated') {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (/admin|forbidden|privileges/i.test(raw)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (raw.toLowerCase().includes('not configured')) {
    return NextResponse.json({ error: raw }, { status: 503 })
  }
  console.error('[studio]', err)
  return NextResponse.json({ error: raw.slice(0, 220) }, { status: 500 })
}

export async function createDefaultClips(supabase: SupabaseClient, topicId: string) {
  const { data: existing } = await supabase
    .from('studio_clips')
    .select('platform')
    .eq('topic_id', topicId)
  const have = new Set((existing ?? []).map((row) => row.platform))
  const rows = [
    { topic_id: topicId, platform: 'tiktok', format: '9:16', status: 'draft', canvas: {} },
    { topic_id: topicId, platform: 'instagram', format: '9:16', status: 'draft', canvas: {} },
  ].filter((row) => !have.has(row.platform))
  if (!rows.length) return
  const { error } = await supabase.from('studio_clips').insert(rows)
  if (error) throw error
}
