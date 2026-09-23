import { notFound } from 'next/navigation'
import { StudioHarness } from './StudioHarness'

export const dynamic = 'force-dynamic'

/** Dev-only harness: the production-room editor with a fake episode and no Supabase. */
export default async function DevStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  const episodeId = typeof sp.episode === 'string' && sp.episode ? sp.episode : 'e2e'
  return <StudioHarness episodeId={episodeId} />
}
