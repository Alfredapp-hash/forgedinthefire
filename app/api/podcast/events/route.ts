import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/** Public play/download beacon for first-party podcast analytics */
export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const episodeId = body.episode_id ? String(body.episode_id) : null
    if (!episodeId) {
      return NextResponse.json({ error: 'episode_id required' }, { status: 400 })
    }

    const ua = String(body.user_agent || request.headers.get('user-agent') || '')
    const supabase = createClient(url, key)
    const { error } = await supabase.from('podcast_analytics_events').insert({
      episode_id: episodeId,
      show_id: body.show_id ? String(body.show_id) : null,
      event_type: String(body.event_type || 'play'),
      user_agent: ua.slice(0, 500) || null,
      app_name: guessApp(ua),
      country: body.country ? String(body.country) : null,
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

function guessApp(ua: string) {
  const s = ua.toLowerCase()
  if (s.includes('spotify')) return 'Spotify'
  if (s.includes('applecoremedia') || s.includes('podcasts')) return 'Apple Podcasts'
  if (s.includes('overcast')) return 'Overcast'
  if (s.includes('pocket casts') || s.includes('pocketcasts')) return 'Pocket Casts'
  if (s.includes('amazon') || s.includes('alexa')) return 'Amazon Music'
  if (s.includes('youtube')) return 'YouTube'
  if (s.includes('chrome') || s.includes('firefox') || s.includes('safari')) return 'Web player'
  return 'Other'
}
