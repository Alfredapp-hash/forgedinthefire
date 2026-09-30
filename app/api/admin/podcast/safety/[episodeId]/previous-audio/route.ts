import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { isProjectStorageUrl, parseStorageObject } from '@/lib/podcast/safety/audio-hash'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ episodeId: string }> }

const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * Delete the audio file that "Replace episode audio" superseded (audio_url_previous) — the
 * original upload that may still contain unbleeped names — and drop the one-click revert.
 *
 * Refuses when the file is still the current audio of this or any other episode, or is not
 * an object in this project's storage. Deletion is permanent; the client confirms first.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { episodeId } = await params
    const { supabase } = await withStudioAdmin()
    const { data: ep, error } = await supabase
      .from('podcast_episodes')
      .select('*')
      .eq('id', episodeId)
      .single()
    if (error) throw error
    if (!('audio_url_previous' in ep)) {
      return NextResponse.json({ error: 'The database needs the 20260924000002_podcast_ai_safety.sql update first.' }, { status: 400, headers: noStore })
    }
    const previous = (ep.audio_url_previous as string | null) || null
    if (!previous) return NextResponse.json({ deleted: false, reason: 'nothing_to_delete' }, { headers: noStore })
    if (previous === ep.audio_url) {
      return NextResponse.json({ error: 'That file is still the episode audio.' }, { status: 409, headers: noStore })
    }

    // Still referenced elsewhere (another episode, or a snapshot)? Then only forget the revert.
    const { data: others } = await supabase
      .from('podcast_episodes')
      .select('id')
      .neq('id', episodeId)
      .or(`audio_url.eq.${JSON.stringify(previous)},audio_url_previous.eq.${JSON.stringify(previous)}`)
      .limit(1)
    const shared = Boolean(others?.length)

    let removed = false
    const obj = isProjectStorageUrl(previous) ? parseStorageObject(previous) : null
    if (!shared && obj && obj.bucket === 'media') {
      const { error: rmError } = await supabase.storage.from(obj.bucket).remove([obj.path])
      if (rmError && !/not found/i.test(rmError.message)) throw rmError
      removed = true
      await supabase.from('media_assets').delete().eq('url', previous)
    }

    const { data: updated, error: upError } = await supabase
      .from('podcast_episodes')
      .update({ audio_url_previous: null, post_edit_snapshot: null, updated_at: new Date().toISOString() })
      .eq('id', episodeId)
      .select('*')
      .single()
    if (upError) throw upError

    return NextResponse.json(
      { deleted: removed, reason: removed ? undefined : shared ? 'still_in_use' : 'not_project_storage', episode: updated },
      { headers: noStore },
    )
  } catch (err) {
    return studioError(err)
  }
}
