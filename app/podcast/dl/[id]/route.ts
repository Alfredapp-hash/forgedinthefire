import { handleDownload } from '../_download'

export const dynamic = 'force-dynamic'

/** Legacy enclosure URL (no file extension). Feeds now use /podcast/dl/[id]/episode.mp3. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return handleDownload(request, id)
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return handleDownload(request, id)
}
