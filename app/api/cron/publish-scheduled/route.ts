import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkCoverArt, checkFeedCompliance } from '@/lib/podcast/compliance'
import type { PodcastEpisode } from '@/lib/studio/types'

/** Cron: publish scheduled blog posts + podcast episodes whose scheduled_for has passed */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  // Always require a shared secret — never allow anonymous publish of embargoed content
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = await createAdminClient()
    const now = new Date().toISOString()

    const { data: duePosts, error: postsError } = await admin
      .from('content')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)

    if (postsError) throw postsError

    let postsPublished = 0
    const postIds = (duePosts ?? []).map((r) => r.id)
    if (postIds.length) {
      const { error: updateError } = await admin
        .from('content')
        .update({ status: 'published', published_at: now })
        .in('id', postIds)
      if (updateError) throw updateError
      postsPublished = postIds.length
    }

    const { data: dueEps, error: epsError } = await admin
      .from('podcast_episodes')
      .select(
        'id, title, audio_url, audio_mime, duration_seconds, file_size, cover_url, chapters, summary, published_at',
      )
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .not('audio_url', 'is', null)

    if (epsError) {
      // Table / column may not exist until migrations applied
      console.warn('Podcast scheduled publish skipped:', epsError.message)
      return NextResponse.json({
        published: postsPublished,
        posts: postIds,
        podcast_published: 0,
        podcast_note: epsError.message,
      })
    }

    // Re-validate each due episode at publish time: never auto-publish a broken
    // enclosure. Non-compliant episodes stay 'scheduled' and are reported.
    let podcastPublished = 0
    const publishedIds: string[] = []
    const skipped: { id: string; reason: string }[] = []
    for (const ep of (dueEps ?? []) as Array<Partial<PodcastEpisode> & { id: string }>) {
      const compliance = checkFeedCompliance({
        title: ep.title ?? '',
        audio_url: ep.audio_url ?? null,
        audio_mime: ep.audio_mime ?? null,
        duration_seconds: ep.duration_seconds ?? null,
        file_size: ep.file_size ?? null,
        cover_url: ep.cover_url ?? null,
        chapters: ep.chapters ?? [],
        summary: ep.summary ?? null,
      })
      if (!compliance.ok) {
        skipped.push({ id: ep.id, reason: compliance.blockers.map((b) => b.detail || b.label).join('; ') })
        continue
      }
      if (ep.cover_url) {
        const art = await checkCoverArt(ep.cover_url)
        if (!art.ok) {
          skipped.push({ id: ep.id, reason: art.detail || 'cover art non-compliant' })
          continue
        }
      }
      const { error: epUpdateError } = await admin
        .from('podcast_episodes')
        .update({ status: 'published', published_at: ep.published_at || now, updated_at: now })
        .eq('id', ep.id)
      if (epUpdateError) {
        skipped.push({ id: ep.id, reason: epUpdateError.message })
        continue
      }
      publishedIds.push(ep.id)
      podcastPublished++
    }
    if (skipped.length) {
      console.warn('Scheduled episodes held (non-compliant):', JSON.stringify(skipped))
    }

    return NextResponse.json({
      published: postsPublished,
      posts: postIds,
      podcast_published: podcastPublished,
      podcast_ids: publishedIds,
      podcast_skipped: skipped,
    })
  } catch (err) {
    console.error('Scheduled publish cron error:', err)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
