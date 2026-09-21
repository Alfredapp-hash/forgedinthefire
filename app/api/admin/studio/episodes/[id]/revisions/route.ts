import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase
      .from('podcast_episode_revisions')
      .select('id, created_at, created_by')
      .eq('episode_id', id)
      .order('created_at', { ascending: false })
      .limit(25)
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as { revisionId?: string }
    if (!body.revisionId) return NextResponse.json({ error: 'revisionId required' }, { status: 400 })
    const { data: rev, error } = await supabase
      .from('podcast_episode_revisions')
      .select('snapshot')
      .eq('id', body.revisionId)
      .eq('episode_id', id)
      .single()
    if (error) throw error
    const snap = (rev.snapshot || {}) as Record<string, unknown>
    delete snap.id
    delete snap.guid
    delete snap.preview_token
    const { data, error: updateError } = await supabase
      .from('podcast_episodes')
      .update({ ...snap, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
