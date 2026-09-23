import { chaptersJson, getDefaultShow, getPublishedEpisode, showToMeta, sortedChapters } from '@/lib/podcast'
import { cuesToSrt, cuesToVtt, parseCues, transcriptKind, transcriptPlainText } from '@/lib/studio/transcript'

type Params = { params: Promise<{ slug: string }> }

const PUBLIC_CACHE = 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'

function notFound(type: string) {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } })
}

async function load(request: Request, context: Params) {
  const { slug } = await context.params
  const token = new URL(request.url).searchParams.get('token')
  const episode = await getPublishedEpisode(slug, { token })
  return { episode, cache: episode?.visibility === 'private' ? 'private, no-store' : PUBLIC_CACHE }
}

function headers(type: string, cache: string) {
  return { 'Content-Type': type, 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' }
}

/** Transcript in the requested format. Plain-prose transcripts only serve as text/plain —
 *  we never invent cue timings, which would give listeners wrong captions. */
export async function transcriptFile(request: Request, context: Params, format: 'vtt' | 'srt' | 'txt') {
  const type = format === 'vtt' ? 'text/vtt; charset=utf-8' : format === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/plain; charset=utf-8'
  const { episode, cache } = await load(request, context)
  const text = episode?.transcript?.trim()
  if (!text) return notFound(type)
  if (format === 'txt') return new Response(transcriptPlainText(text), { headers: headers(type, cache) })
  if (transcriptKind(text) === 'text') return notFound(type)
  const cues = parseCues(text)
  if (!cues.length) return notFound(type)
  const body = format === 'vtt' ? cuesToVtt(cues) : cuesToSrt(cues)
  return new Response(body, { headers: headers(type, cache) })
}

/** Podcasting 2.0 JSON chapters. */
export async function chaptersFile(request: Request, context: Params) {
  const type = 'application/json+chapters; charset=utf-8'
  const { episode, cache } = await load(request, context)
  if (!episode || !sortedChapters(episode.chapters).length) return notFound(type)
  const meta = showToMeta(await getDefaultShow())
  return new Response(JSON.stringify(chaptersJson(episode, meta.title), null, 2), { headers: headers(type, cache) })
}
