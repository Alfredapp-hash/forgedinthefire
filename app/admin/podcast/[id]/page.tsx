import { EpisodeEditor } from './EpisodeEditor'

export const dynamic = 'force-dynamic'

export default async function AdminEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EpisodeEditor episodeId={id} />
}
