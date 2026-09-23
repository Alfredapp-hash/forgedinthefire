import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { isSafeHttpUrl } from '@/lib/podcast'

const STATUSES = new Set(['not_started', 'submitted', 'in_review', 'live', 'blocked'])

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const showId = new URL(request.url).searchParams.get('show_id')
    let query = supabase.from('podcast_distribution').select('*').order('platform')
    if (showId) query = query.eq('show_id', showId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ['status', 'listing_url', 'notes', 'submitted_at', 'live_at'] as const) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (patch.status != null && !STATUSES.has(String(patch.status))) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    }
    // Listing URLs render as public "Listen on …" buttons — http(s) only.
    if (patch.listing_url != null) {
      const url = String(patch.listing_url).trim()
      if (!isSafeHttpUrl(url)) {
        return NextResponse.json({ error: 'Listing URL must start with https://' }, { status: 400 })
      }
      patch.listing_url = url
    }
    if (patch.status === 'submitted' && !patch.submitted_at) {
      patch.submitted_at = new Date().toISOString()
    }
    if (patch.status === 'live' && !patch.live_at) {
      patch.live_at = new Date().toISOString()
    }
    const { data, error } = await supabase
      .from('podcast_distribution')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
