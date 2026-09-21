import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { episodePublishIssues, formatPublishIssues } from '@/lib/studio/publish-gate'
import { snapshotEpisode } from '@/lib/studio/revisions'
import { propagatePublicSurfaces } from '@/lib/studio/propagate'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, supabase } = await withStudioAdmin()
    const { data: current, error } = await supabase.from('podcast_episodes').select('*').eq('id', id).single()
    if (error) throw error
    const issues = episodePublishIssues({ ...current, status: 'draft' })
    if (issues.length) {
      return NextResponse.json({ error: formatPublishIssues(issues), issues }, { status: 400 })
    }
    await snapshotEpisode(supabase, id, current, user.email)
    const { data, error: updateError } = await supabase
      .from('podcast_episodes')
      .update({
        status: 'draft',
        published_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError
    propagatePublicSurfaces({ episodeSlug: data.slug })
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
