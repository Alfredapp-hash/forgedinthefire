import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { PodcastEpisode } from '@/lib/studio/types'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function listenerHash(request: Request, episodeId: string) {
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ip}|${episodeId}|${day}`).digest('hex').slice(0, 32)
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

/**
 * Tracking download redirect for podcast enclosures.
 * Public/unlisted episodes redirect freely; private requires ?token= subscriber token.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const supabase = adminClient()
  if (!supabase || !id) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data, error } = await supabase
    .from('podcast_episodes')
    .select('id, show_id, audio_url, status, visibility, title')
    .eq('id', id)
    .maybeSingle()

  if (error || !data?.audio_url || data.status !== 'published') {
    return new NextResponse('Not found', { status: 404 })
  }

  const episode = data as Pick<
    PodcastEpisode,
    'id' | 'show_id' | 'audio_url' | 'status' | 'visibility' | 'title'
  >

  const token = new URL(request.url).searchParams.get('token')
  if (episode.visibility === 'private') {
    if (!token) return new NextResponse('Unauthorized', { status: 401 })
    const { data: sub } = await supabase
      .from('podcast_subscribers')
      .select('id, status')
      .eq('token', token)
      .eq('status', 'active')
      .maybeSingle()
    if (!sub) return new NextResponse('Unauthorized', { status: 401 })
  }

  const ua = request.headers.get('user-agent') || ''
  const country =
    request.headers.get('x-country') ||
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    null

  // Fire-and-forget analytics (IAB-shaped daily listener hash)
  void supabase.from('podcast_analytics_events').insert({
    episode_id: episode.id,
    show_id: episode.show_id,
    event_type: 'download',
    listener_hash: listenerHash(request, episode.id),
    user_agent: ua.slice(0, 500) || null,
    app_name: guessApp(ua),
    country,
  })

  const audioUrl = episode.audio_url
  if (!audioUrl) {
    return new NextResponse('Not found', { status: 404 })
  }

  return NextResponse.redirect(audioUrl, 302)
}
