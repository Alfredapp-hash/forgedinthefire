import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guessApp } from '@/lib/podcast'

const EVENT_TYPES = new Set(['play', 'embed_play'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Public play beacon for first-party podcast analytics (web player + embed). */
export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const episodeId = String(body.episode_id || '')
    if (!UUID.test(episodeId)) {
      return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    }
    const showId = body.show_id && UUID.test(String(body.show_id)) ? String(body.show_id) : null
    const eventType = EVENT_TYPES.has(String(body.event_type)) ? String(body.event_type) : 'play'

    // Trust the request's own UA, not a client-supplied one.
    const ua = request.headers.get('user-agent') || ''
    const country = request.headers.get('x-country') || request.headers.get('x-nf-geo-country') || null
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await supabase.from('podcast_analytics_events').insert({
      episode_id: episodeId,
      show_id: showId,
      event_type: eventType,
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
