import { NextResponse } from 'next/server'
import { getPublishedEpisode } from '@/lib/podcast'

export const dynamic = 'force-dynamic'

/** Serve a minimal WebVTT from stored plain-text transcript for Apple Podcasts. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params
  const episode = await getPublishedEpisode(slug)
  if (!episode?.transcript) {
    return new NextResponse('WEBVTT\n\n', {
      status: 404,
      headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
    })
  }

  const lines = episode.transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // Cue every ~8s as a rough timeline when we lack word timings
  const cues: string[] = ['WEBVTT', '']
  lines.forEach((line, i) => {
    const start = i * 8
    const end = start + 7
    cues.push(formatVttTime(start) + ' --> ' + formatVttTime(end))
    cues.push(line)
    cues.push('')
  })

  return new NextResponse(cues.join('\n'), {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}

function formatVttTime(totalSec: number) {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`
}
