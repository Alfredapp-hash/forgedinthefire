import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { guessApp } from '@/lib/podcast'

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const url = new URL(request.url)
    const showId = url.searchParams.get('show_id')
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || 30)))
    const since = new Date(Date.now() - days * 86400000).toISOString()

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
    // IAB-style: a download is one unique listener per episode per day (the hash already
    // folds in the day). Plays from the web player are counted separately.
    const byEpisode = new Map<string, Set<string>>()
    const playsByEpisode = new Map<string, number>()
    let downloads = 0
    let plays = 0

    for (const row of rows) {
      const day = row.occurred_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) || 0) + 1)
      const app = row.app_name || 'Unknown'
      byApp.set(app, (byApp.get(app) || 0) + 1)
      const country = row.country || 'Unknown'
      byCountry.set(country, (byCountry.get(country) || 0) + 1)
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

    return NextResponse.json({
      days,
      total: rows.length,
      downloads,
      plays,
      by_day: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      by_app: [...byApp.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      by_country: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      episode_compare: episodeCompare.sort((a, b) => b.downloads - a.downloads),
    })
  } catch (err) {
    return studioError(err)
  }
}

/** Admin-only manual event (e.g. importing counts). Public players use /api/podcast/events. */
export async function POST(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>

    const ua = String(body.user_agent || request.headers.get('user-agent') || '')
    const appName = guessApp(ua)
    const { data, error } = await supabase
      .from('podcast_analytics_events')
      .insert({
        episode_id: body.episode_id || null,
        show_id: body.show_id || null,
        event_type: String(body.event_type || 'download'),
        listener_hash: body.listener_hash ? String(body.listener_hash) : null,
        user_agent: ua.slice(0, 500) || null,
        app_name: appName,
        country: body.country ? String(body.country) : null,
        region: body.region ? String(body.region) : null,
        city: body.city ? String(body.city) : null,
      })
      .select('id')
      .single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}

