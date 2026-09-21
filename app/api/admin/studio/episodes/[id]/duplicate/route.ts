import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { uniqueSlug } from '@/lib/studio/slug'

/** Duplicate episode metadata (no audio) — Transistor-class desk action */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, supabase } = await withStudioAdmin()
    const { id } = await params
    const { data: source, error } = await supabase
      .from('podcast_episodes')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !source) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    const { data: existing } = await supabase.from('podcast_episodes').select('slug')
    const taken = new Set((existing ?? []).map((row) => row.slug))

    const { data, error: insertError } = await supabase
      .from('podcast_episodes')
      .insert({
        topic_id: source.topic_id,
        show_id: source.show_id,
        title: `${source.title} (copy)`,
        slug: uniqueSlug(`${source.slug}-copy`, taken),
        summary: source.summary,
        show_notes: source.show_notes,
        guest_name: source.guest_name,
        guest_bio: source.guest_bio,
        cover_url: source.cover_url,
        transcript: null,
        season: source.season,
        episode_number: null,
        episode_type: source.episode_type || 'full',
        visibility: source.visibility || 'public',
        explicit: source.explicit,
        status: 'draft',
        scheduled_for: null,
        published_at: null,
        chapters: source.chapters || [],
        keywords: source.keywords || [],
        ad_markers: source.ad_markers || [],
        audio_url: null,
        audio_mime: null,
        duration_seconds: null,
        file_size: null,
        created_by: user.email,
      })
      .select()
      .single()

    if (insertError) throw insertError
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}
