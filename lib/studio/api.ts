import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function withStudioAdmin() {
  const user = await requireAdmin()
  const supabase = await createClient()
  if (!supabase) {
    throw new Error('Database not configured')
  }
  return { user, supabase }
}

export function studioError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Studio request failed'
  if (raw.toLowerCase().includes('admin') || raw.toLowerCase().includes('forbidden')) {
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
