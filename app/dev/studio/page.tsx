import { devOnly } from '../dev-only'
import { StudioHarness } from './StudioHarness'

export const dynamic = 'force-dynamic'

/**
 * Dev-only harness: the production room with a fake episode and no Supabase.
 *   ?episode=<id>   session/autosave key (defaults to "e2e")
 *   ?mode=editor    bare PodcastAudioEditor instead of the staged RecordingStudio
 */
export default async function DevStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  devOnly()
  const sp = await searchParams
  const episodeId = typeof sp.episode === 'string' && sp.episode ? sp.episode : 'e2e'
  const mode = sp.mode === 'editor' ? 'editor' : 'studio'
  return <StudioHarness episodeId={episodeId} mode={mode} />
}
