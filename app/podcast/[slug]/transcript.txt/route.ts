import { transcriptFile } from '../_episode-files'

export const dynamic = 'force-dynamic'

/** Plain-text transcript (podcast:transcript type="text/plain"). */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return transcriptFile(request, context, 'txt')
}
