import 'server-only'

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyAdminAccess } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { isHttpsUrl, type LiveSessionRow } from '@/lib/podcast/live/types'

type LiveAdmin =
  | { ok: true; user: { id: string; email: string }; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

/** verifyAdminAccess, then the service-role client (RLS gives anon only public columns). */
export async function withLiveAdmin(): Promise<LiveAdmin> {
  const { isAdmin, user, error } = await verifyAdminAccess()
  if (!isAdmin || !user) {
    const status = error === 'Not authenticated' ? 401 : error === 'Database not configured' ? 503 : 403
    return { ok: false, response: NextResponse.json({ error: error || 'Forbidden' }, { status }) }
  }
  try {
    const supabase = (await createAdminClient()) as unknown as SupabaseClient
    return { ok: true, user, supabase }
  } catch (err) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: err instanceof Error ? err.message : 'Database not configured' },
        { status: 503 },
      ),
    }
  }
}

export function liveError(err: unknown) {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Live request failed'
  console.error('[podcast-live]', err)
  const missingTable = /podcast_live_sessions/.test(raw) && /does not exist|schema cache/.test(raw)
  return NextResponse.json(
    {
      error: missingTable
        ? 'podcast_live_sessions is missing — apply supabase/migrations/20260923_podcast_live.sql'
        : raw.slice(0, 240),
    },
    { status: missingTable ? 503 : 500 },
  )
}

const TEXT_FIELDS = ['title', 'description'] as const
const URL_FIELDS = ['playback_hls_url', 'playback_whep_url'] as const

/** Whitelist + normalise editable fields. Status changes go through `action`, not raw writes. */
export function livePatchFromBody(body: Record<string, unknown>) {
  const patch: Partial<LiveSessionRow> = {}
  const errors: string[] = []
  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined) continue
    const value = String(body[key] ?? '').trim()
    if (key === 'title') {
      if (!value) errors.push('Title is required')
      else patch.title = value.slice(0, 200)
    } else {
      patch.description = value ? value.slice(0, 2000) : null
    }
  }
  for (const key of URL_FIELDS) {
    if (body[key] === undefined) continue
    const value = String(body[key] ?? '').trim()
    if (!value) patch[key] = null
    else if (isHttpsUrl(value)) patch[key] = value
    else errors.push(`${key} must be an http(s) URL`)
  }
  if (body.scheduled_for !== undefined) {
    const raw = String(body.scheduled_for ?? '').trim()
    if (!raw) patch.scheduled_for = null
    else {
      const at = new Date(raw)
      if (Number.isNaN(at.getTime())) errors.push('scheduled_for is not a date')
      else patch.scheduled_for = at.toISOString()
    }
  }
  if (body.episode_id !== undefined) {
    const raw = String(body.episode_id ?? '').trim()
    patch.episode_id = raw || null
  }
  return { patch, errors }
}
