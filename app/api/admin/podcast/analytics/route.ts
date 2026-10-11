import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin, withStudioStaff } from '@/lib/studio/api'
import { guessApp } from '@/lib/podcast'
import { recordPodcastAudit } from '@/lib/podcast/audit-log'
import { createServiceClient } from '@/lib/supabase/service'
import type { SupabaseClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_TYPES = new Set(['download', 'play', 'embed_play'])

function missingSummary(err: { code?: string; message?: string }) {
  const code = err.code || ''
  const message = err.message || ''
  return code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(message)
}

async function aggregateFallback(supabase: SupabaseClient, since: string, showId: string | null, days: number) {
  let eventsQuery = supabase
    .from('podcast_analytics_events')
    .select('id, episode_id, event_type, listener_hash, app_name, country, occurred_at')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(5000)
  if (showId) eventsQuery = eventsQuery.eq('show_id', showId)
  const { data: events, error } = await eventsQuery
  if (error) throw error

  const rows = events ?? []
  const byDay = new Map<string, number>()
  const byApp = new Map<string, number>()
  const byCountry = new Map<string, number>()
  const byEpisode = new Map<string, Set<string>>()
  const playsByEpisode = new Map<string, number>()
  let downloads = 0
  let plays = 0

  for (const row of rows) {
    const day = String(row.occurred_at).slice(0, 10)
    byDay.set(day, (byDay.get(day) || 0) + 1)
    byApp.set(row.app_name || 'Unknown', (byApp.get(row.app_name || 'Unknown') || 0) + 1)
    byCountry.set(row.country || 'Unknown', (byCountry.get(row.country || 'Unknown') || 0) + 1)
    if (!row.episode_id) continue
    if (row.event_type === 'download') {
      const set = byEpisode.get(row.episode_id) ?? new Set<string>()
      const before = set.size
      set.add(row.listener_hash || row.id)
      byEpisode.set(row.episode_id, set)
      if (set.size > before) downloads += 1
    } else if (row.event_type === 'play' || row.event_type === 'embed_play') {
      playsByEpisode.set(row.episode_id, (playsByEpisode.get(row.episode_id) || 0) + 1)
      plays += 1
    }
  }

  const { data: episodes } = await supabase
    .from('podcast_episodes')
    .select('id, title, episode_number, season, published_at')
    .order('published_at', { ascending: false })
    .limit(50)

  const episodeCompare = (episodes ?? []).map((ep) => ({
    id: ep.id,
    title: ep.title,
    season: ep.season,
    episode_number: ep.episode_number,
    published_at: ep.published_at,
    downloads: byEpisode.get(ep.id)?.size || 0,
    plays: playsByEpisode.get(ep.id) || 0,
  }))

  return {
    days,
    total: rows.length,
    downloads,
    plays,
    capped: true,
    by_day: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    by_app: [...byApp.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    by_country: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    episode_compare: episodeCompare.sort((a, b) => b.downloads - a.downloads),
  }
}

export async function GET(request: Request) {
  try {
    await withStudioStaff()
    const supabase = createServiceClient()
    const url = new URL(request.url)
    const showParam = url.searchParams.get('show_id')
    const showId = showParam && UUID.test(showParam) ? showParam : null
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || 30)))
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const { data, error } = await supabase.rpc('podcast_analytics_summary', {
      p_since: since,
      p_show: showId,
    })
    if (error) {
      if (missingSummary(error)) return NextResponse.json(await aggregateFallback(supabase, since, showId, days))
      throw error
    }
    return NextResponse.json({ days, ...(data as Record<string, unknown>) })
  } catch (err) {
    return studioError(err)
  }
}

/** Producer-only manual event (for example importing counts). Public players use /api/podcast/events. */
export async function POST(request: Request) {
  try {
    const { user } = await withStudioAdmin()
    const supabase = createServiceClient()
    const body = await request.json() as Record<string, unknown>
    const eventType = EVENT_TYPES.has(String(body.event_type)) ? String(body.event_type) : 'download'
    const episodeId = body.episode_id && UUID.test(String(body.episode_id)) ? String(body.episode_id) : null
    const showId = body.show_id && UUID.test(String(body.show_id)) ? String(body.show_id) : null

    const ua = String(body.user_agent || request.headers.get('user-agent') || '')
    const { data, error } = await supabase
      .from('podcast_analytics_events')
      .insert({
        episode_id: episodeId,
        show_id: showId,
        event_type: eventType,
        listener_hash: body.listener_hash ? String(body.listener_hash).slice(0, 64) : null,
        user_agent: ua.slice(0, 500) || null,
        app_name: guessApp(ua),
        country: body.country ? String(body.country).slice(0, 80) : null,
        region: body.region ? String(body.region).slice(0, 80) : null,
        city: body.city ? String(body.city).slice(0, 80) : null,
      })
      .select('id')
      .single()
    if (error) throw error
    await recordPodcastAudit({
      actorEmail: user.email,
      action: 'analytics.import',
      episodeId,
      summary: `Recorded a manual ${eventType} event`,
    })
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}
