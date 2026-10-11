import { guessApp, isReleased, podcastReadClient, verifySubscriberToken } from '@/lib/podcast'
import { listenerHash, requestIp } from '@/lib/podcast/listener'
import { parsePrivateMediaRef } from '@/lib/podcast/enterprise'
import { signedPrivateUrl } from '@/lib/podcast/private-media'
import { createServiceClient } from '@/lib/supabase/service'
import type { PodcastEpisode } from '@/lib/studio/types'

function listenerDayHash(request: Request, episodeId: string) {
  return listenerHash(requestIp(request), request.headers.get('user-agent') || '', episodeId)
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
export async function handleDownload(request: Request, id: string, media: 'audio' | 'video' = 'audio') {
  const supabase = podcastReadClient()
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response('Not found', { status: 404 })
  }

  const { data, error } = await supabase
    .from('podcast_episodes')
    .select('id, show_id, audio_url, video_url, status, visibility, published_at')
    .eq('id', id)
    .maybeSingle()

  const episode = data as Pick<PodcastEpisode, 'id' | 'show_id' | 'audio_url' | 'video_url' | 'status' | 'visibility' | 'published_at'> | null
  const fileUrl = media === 'video' ? episode?.video_url : episode?.audio_url
  if (error || !episode?.audio_url || !fileUrl || !isReleased(episode)) {
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
    try {
      const writer = createServiceClient()
      await Promise.race([
        writer.from('podcast_analytics_events').insert({
          episode_id: episode.id,
          show_id: episode.show_id,
          event_type: 'download',
          listener_hash: listenerDayHash(request, episode.id),
          user_agent: ua.slice(0, 500) || null,
          app_name: app,
          country,
        }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ])
    } catch {
      /* a missing service key must not break the download */
    }
  }

  let location = fileUrl
  if (parsePrivateMediaRef(fileUrl)) {
    const signed = await signedPrivateUrl(fileUrl).catch(() => null)
    if (!signed) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    location = signed
  } else if (episode.visibility === 'private') {
    // Never hand a private episode's permanent public object URL to a podcast app.
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'private, max-age=0, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
