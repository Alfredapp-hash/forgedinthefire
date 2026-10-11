import { NextResponse } from 'next/server'
import { guessApp, isReleased } from '@/lib/podcast'
import { listenerHash, requestIp } from '@/lib/podcast/listener'
import { hashedKey, rateLimitHit } from '@/lib/security/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'

const EVENT_TYPES = new Set(['play', 'embed_play'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Public play beacon. Inserts run as the service role; the browser cannot write the table. */
export async function POST(request: Request) {
  try {
    let supabase
    try {
      supabase = createServiceClient()
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
    }

    const allowed = await rateLimitHit(supabase, hashedKey('podcast-play', requestIp(request)), 60, 30)
    if (!allowed) return NextResponse.json({ ok: false }, { status: 429 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const episodeId = String(body.episode_id || '')
    if (!UUID.test(episodeId)) {
      return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    }
    const eventType = EVENT_TYPES.has(String(body.event_type)) ? String(body.event_type) : 'play'

    const { data: episode, error: readError } = await supabase
      .from('podcast_episodes')
      .select('id, show_id, status, visibility, published_at, audio_url')
      .eq('id', episodeId)
      .maybeSingle()
    if (readError || !episode || episode.visibility === 'private' || !isReleased(episode)) {
      return NextResponse.json({ ok: false }, { status: 404 })
    }

    const ua = request.headers.get('user-agent') || ''
    const country =
      request.headers.get('x-country') ||
      request.headers.get('x-nf-geo-country') ||
      request.headers.get('cf-ipcountry') ||
      null
    const { error } = await supabase.from('podcast_analytics_events').insert({
      episode_id: episode.id,
      show_id: episode.show_id,
      event_type: eventType,
      listener_hash: listenerHash(requestIp(request), ua, episode.id),
      user_agent: ua.slice(0, 500) || null,
      app_name: eventType === 'embed_play' ? 'Embed player' : guessApp(ua),
      country,
    })

    if (error) {
      console.error('Podcast event insert failed:', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('Podcast event error:', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
