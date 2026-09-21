import { NextResponse } from 'next/server'
import { createDefaultClips, studioError, withStudioAdmin } from '@/lib/studio/api'
import { slugify } from '@/lib/studio/slug'
import type { ContentTopic, PodcastEpisode, StudioClip } from '@/lib/studio/types'

const ALLOWED = [
  'title', 'slug', 'summary', 'talking_points', 'scheduled_on', 'status', 'blog_post_id',
] as const

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const { data: topic, error } = await supabase.from('content_topics').select('*').eq('id', id).single()
    if (error) throw error
    await createDefaultClips(supabase, id)

    const [{ data: episode }, { data: clips }, blog] = await Promise.all([
      supabase.from('podcast_episodes').select('*').eq('topic_id', id).order('created_at').limit(1).maybeSingle(),
      supabase.from('studio_clips').select('*').eq('topic_id', id).order('platform'),
      topic.blog_post_id
        ? supabase.from('content').select('id, title, slug, status').eq('id', topic.blog_post_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return NextResponse.json({
      topic: topic as ContentTopic,
      episode: (episode ?? null) as PodcastEpisode | null,
      clips: (clips ?? []) as StudioClip[],
      blog: blog.data ?? null,
    })
  } catch (err) {
    return studioError(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (typeof patch.title === 'string') patch.title = patch.title.trim()
    if (typeof patch.slug === 'string') patch.slug = slugify(patch.slug)
    const { data, error } = await supabase.from('content_topics').update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
