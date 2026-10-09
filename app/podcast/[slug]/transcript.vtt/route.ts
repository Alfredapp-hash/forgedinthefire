import { transcriptFile } from '../_episode-files'

export const dynamic = 'force-dynamic'

/** WebVTT transcript (from stored VTT or SRT) for podcast:transcript rel="captions". */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return transcriptFile(request, context, 'vtt')
}
