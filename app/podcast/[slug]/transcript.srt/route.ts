import { transcriptFile } from '../_episode-files'

export const dynamic = 'force-dynamic'

/** SRT transcript (Apple Podcasts accepts VTT or SRT). */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return transcriptFile(request, context, 'srt')
}
