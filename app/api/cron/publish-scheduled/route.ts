import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
      .select('id')
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

    let podcastPublished = 0
    const epIds = (dueEps ?? []).map((r) => r.id)
    if (epIds.length) {
      const { error: epUpdateError } = await admin
        .from('podcast_episodes')
        .update({ status: 'published', published_at: now, updated_at: now })
        .in('id', epIds)
      if (epUpdateError) throw epUpdateError
      podcastPublished = epIds.length
    }

    return NextResponse.json({
      published: postsPublished,
      posts: postIds,
      podcast_published: podcastPublished,
      podcast_ids: epIds,
    })
  } catch (err) {
    console.error('Scheduled publish cron error:', err)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
