import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { episodePublishIssues, formatPublishIssues } from '@/lib/studio/publish-gate'
import { propagatePublicSurfaces } from '@/lib/studio/propagate'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const { data: topic, error } = await supabase.from('content_topics').select('*').eq('id', id).single()
    if (error) throw error

    const [{ data: episode }, blog] = await Promise.all([
      supabase.from('podcast_episodes').select('*').eq('topic_id', id).order('created_at').limit(1).maybeSingle(),
      topic.blog_post_id
        ? supabase.from('content').select('*').eq('id', topic.blog_post_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const now = new Date().toISOString()
    const results: Record<string, unknown> = { topic: topic.title }

    if (episode) {
      const issues = episodePublishIssues(episode)
      if (issues.length) {
        results.episode = { ok: false, error: formatPublishIssues(issues) }
      } else {
        const { error: epErr } = await supabase
          .from('podcast_episodes')
          .update({ status: 'published', published_at: episode.published_at || now, updated_at: now })
          .eq('id', episode.id)
        if (epErr) results.episode = { ok: false, error: epErr.message }
        else {
          results.episode = { ok: true, id: episode.id }
          propagatePublicSurfaces({ episodeSlug: episode.slug })
        }
      }
    } else {
      results.episode = { ok: false, error: 'Create an episode from this topic first' }
    }

    if (blog.data) {
      if (blog.data.template === 'impact-story' && !blog.data.consent_confirmed) {
        results.blog = { ok: false, error: 'Confirm survivor consent on the impact story' }
      } else {
        const { error: bErr } = await supabase
          .from('content')
          .update({ status: 'published', published_at: blog.data.published_at || now })
          .eq('id', blog.data.id)
        if (bErr) results.blog = { ok: false, error: bErr.message }
        else {
          results.blog = { ok: true, id: blog.data.id }
          propagatePublicSurfaces({ blogSlug: blog.data.slug })
        }
      }
    } else {
      results.blog = { ok: false, error: 'Create a blog draft from this topic first' }
    }

    const clipsReady = await supabase
      .from('studio_clips')
      .select('id, platform, hook, caption')
      .eq('topic_id', id)
    results.clips = clipsReady.data ?? []

    const allOk = Boolean((results.episode as { ok?: boolean })?.ok && (results.blog as { ok?: boolean })?.ok)
    if (allOk) {
      await supabase.from('content_topics').update({ status: 'published', updated_at: now }).eq('id', id)
    }

    return NextResponse.json(results, { status: allOk ? 200 : 400 })
  } catch (err) {
    return studioError(err)
  }
}
