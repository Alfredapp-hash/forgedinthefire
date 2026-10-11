import { handleDownload } from '../../_download'

export const dynamic = 'force-dynamic'

/**
 * Enclosure URL with a real file extension (…/episode.mp3). Some directory validators
 * reject enclosure URLs that do not end in a supported audio extension.
 */
function mediaOf(file: string): 'audio' | 'video' {
  return file.toLowerCase().startsWith('video') ? 'video' : 'audio'
}

export async function GET(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params
  return handleDownload(request, id, mediaOf(file))
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params
  return handleDownload(request, id, mediaOf(file))
}
