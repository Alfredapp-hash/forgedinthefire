/**
 * Public: the live show on air right now and the next scheduled one.
 * Uses the anon key with no cookies so the CDN may cache it for a few seconds;
 * RLS + column grants limit anon to non-sensitive columns of scheduled/live rows.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readLiveEnv } from '@/lib/podcast/live/server'
import {
  LIVE_PUBLIC_COLUMNS,
  type LivePublicPayload,
  type LiveSessionPublic,
} from '@/lib/podcast/live/types'

export const dynamic = 'force-dynamic'

const CACHE = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10'

/** Scheduled shows stay "next" for this long past their start time before we drop them. */
const SCHEDULE_GRACE_MS = 2 * 60 * 60 * 1000

function withDefaults(row: LiveSessionPublic | null): LiveSessionPublic | null {
  if (!row) return null
  return {
    ...row,
    playback_hls_url: row.playback_hls_url || readLiveEnv('LIVE_PLAYBACK_HLS_URL') || null,
    playback_whep_url: row.playback_whep_url || readLiveEnv('LIVE_PLAYBACK_WHEP_URL') || null,
  }
}

export async function GET() {
  const now = new Date()
  const empty: LivePublicPayload = { live: null, next: null, now: now.toISOString() }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json(empty, { headers: { 'Cache-Control': CACHE } })

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const [liveRes, nextRes] = await Promise.all([
      supabase
        .from('podcast_live_sessions')
        .select(LIVE_PUBLIC_COLUMNS)
        .eq('status', 'live')
        .order('started_at', { ascending: false })
        .limit(1),
      supabase
        .from('podcast_live_sessions')
        .select(LIVE_PUBLIC_COLUMNS)
        .eq('status', 'scheduled')
        .gte('scheduled_for', new Date(now.getTime() - SCHEDULE_GRACE_MS).toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(1),
    ])
    if (liveRes.error) throw liveRes.error
    if (nextRes.error) throw nextRes.error
    const payload: LivePublicPayload = {
      live: withDefaults((liveRes.data?.[0] as LiveSessionPublic | undefined) || null),
      next: withDefaults((nextRes.data?.[0] as LiveSessionPublic | undefined) || null),
      now: now.toISOString(),
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': CACHE } })
  } catch (err) {
    console.error('[podcast-live public]', err)
    // Degrade to "nothing live" rather than breaking the /podcast page banner.
    return NextResponse.json(empty, { headers: { 'Cache-Control': CACHE } })
  }
}
