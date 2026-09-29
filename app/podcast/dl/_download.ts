import { createHash } from 'crypto'
import { guessApp, isReleased, podcastReadClient, verifySubscriberToken } from '@/lib/podcast'
import type { PodcastEpisode } from '@/lib/studio/types'

function listenerHash(request: Request, episodeId: string) {
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const ua = request.headers.get('user-agent') || ''
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ip}|${ua}|${episodeId}|${day}`).digest('hex').slice(0, 32)
}

/** Count only whole-file or first-chunk requests (skip HEAD, probes, and resumed ranges). */
function countable(request: Request, app: string) {
  if (request.method !== 'GET' || app === 'Bot') return false
  const range = request.headers.get('range')
  if (!range) return true
  const m = range.match(/^bytes=(\d+)-(\d*)$/)
  if (!m) return false
  if (m[1] !== '0') return false
  // bytes=0-1 is Apple's byte-range probe, not a listen
  return !m[2] || Number(m[2]) > 1024
}

/**
 * Tracking redirect for RSS enclosures. Public / unlisted released episodes redirect
 * freely; private episodes need a valid ?token= subscriber token.
 */
export async function handleDownload(request: Request, id: string) {
  const supabase = podcastReadClient()
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response('Not found', { status: 404 })
  }

  const { data, error } = await supabase
    .from('podcast_episodes')
    .select('id, show_id, audio_url, status, visibility, published_at')
    .eq('id', id)
    .maybeSingle()

  const episode = data as Pick<PodcastEpisode, 'id' | 'show_id' | 'audio_url' | 'status' | 'visibility' | 'published_at'> | null
  if (error || !episode?.audio_url || !isReleased(episode)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  if (episode.visibility === 'private') {
    const sub = await verifySubscriberToken(new URL(request.url).searchParams.get('token'))
    if (!sub) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const ua = request.headers.get('user-agent') || ''
  const app = guessApp(ua)
  if (countable(request, app)) {
    const country =
      request.headers.get('x-country') ||
      request.headers.get('x-nf-geo-country') ||
      request.headers.get('cf-ipcountry') ||
      null
    // Awaited with a short cap: serverless may freeze fire-and-forget work after the redirect.
    await Promise.race([
      supabase.from('podcast_analytics_events').insert({
        episode_id: episode.id,
        show_id: episode.show_id,
        event_type: 'download',
        listener_hash: listenerHash(request, episode.id),
        user_agent: ua.slice(0, 500) || null,
        app_name: app,
        country,
      }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => {})
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: episode.audio_url,
      'Cache-Control': 'private, max-age=0, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
