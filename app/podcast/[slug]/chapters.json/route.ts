import { chaptersFile } from '../_episode-files'

export const dynamic = 'force-dynamic'

/** Podcasting 2.0 JSON chapters (podcast:chapters type="application/json+chapters"). */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return chaptersFile(request, context)
}
