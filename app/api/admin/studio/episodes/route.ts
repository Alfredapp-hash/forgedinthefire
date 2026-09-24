import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { slugify, uniqueSlug } from '@/lib/studio/slug'
import { checkCoverArt, checkFeedCompliance } from '@/lib/podcast/compliance'
import type { PodcastChapter } from '@/lib/studio/types'

const ALLOWED = [
  'topic_id', 'show_id', 'title', 'slug', 'summary', 'show_notes', 'guest_name', 'guest_bio',
  'audio_url', 'audio_mime', 'duration_seconds', 'file_size', 'cover_url', 'transcript',
  'season', 'episode_number', 'episode_type', 'visibility', 'explicit', 'status',
  'scheduled_for', 'published_at', 'chapters', 'keywords', 'ad_markers',
] as const

export async function GET(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const topicId = new URL(request.url).searchParams.get('topic_id')
    let query = supabase.from('podcast_episodes').select('*').order('episode_number', { ascending: false, nullsFirst: false })
    if (topicId) query = query.eq('topic_id', topicId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return studioError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    const status = String(body.status || 'draft')
    const season = Number(body.season) || 1
    const episodeType = String(body.episode_type || 'full')
    const visibility = String(body.visibility || 'public')
    const { data: existing } = await supabase.from('podcast_episodes').select('slug, episode_number, season')
    const taken = new Set((existing ?? []).map((row) => row.slug))
    let episodeNumber =
      body.episode_number == null || body.episode_number === '' ? null : Number(body.episode_number)
    if (episodeNumber == null) {
      const max = (existing ?? [])
        .filter((row) => (row.season || 1) === season)
        .reduce((acc, row) => Math.max(acc, Number(row.episode_number) || 0), 0)
      episodeNumber = max + 1
    }
    const { data: defaultShow } = await supabase
      .from('podcast_shows')
      .select('id')
      .eq('is_default', true)
      .maybeSingle()
    const { data, error } = await supabase
      .from('podcast_episodes')
      .insert({
        title,
        slug: uniqueSlug(String(body.slug || title), taken),
        topic_id: body.topic_id || null,
        show_id: body.show_id || defaultShow?.id || null,
        summary: String(body.summary || '').trim() || null,
        show_notes: body.show_notes ? String(body.show_notes) : null,
        guest_name: body.guest_name ? String(body.guest_name).trim() : null,
        guest_bio: body.guest_bio ? String(body.guest_bio).trim() : null,
        season,
        episode_number: episodeNumber,
        episode_type: episodeType,
        visibility,
        explicit: Boolean(body.explicit),
        status,
        scheduled_for: body.scheduled_for || null,
        published_at: status === 'published' ? new Date().toISOString() : null,
        chapters: Array.isArray(body.chapters) ? body.chapters : [],
        keywords: Array.isArray(body.keywords) ? body.keywords : [],
        ad_markers: Array.isArray(body.ad_markers) ? body.ad_markers : [],
        created_by: user.email,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return studioError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (typeof patch.slug === 'string') patch.slug = slugify(patch.slug)
    if (typeof patch.title === 'string') patch.title = patch.title.trim()
    if (patch.season != null) patch.season = Number(patch.season)
    if (patch.episode_number != null) patch.episode_number = Number(patch.episode_number)
    if (patch.duration_seconds != null) patch.duration_seconds = Number(patch.duration_seconds)
    if (patch.file_size != null) patch.file_size = Number(patch.file_size)
    if (typeof patch.explicit === 'string') patch.explicit = patch.explicit === 'true'
    if (!Array.isArray(patch.chapters) && patch.chapters != null) delete patch.chapters
    if (!Array.isArray(patch.keywords) && patch.keywords != null) {
      patch.keywords = String(patch.keywords).split(',').map((k) => k.trim()).filter(Boolean)
    }
    if (!Array.isArray(patch.ad_markers) && patch.ad_markers != null) delete patch.ad_markers
    const { data: current, error: currentError } = await supabase
      .from('podcast_episodes')
      .select(
        'title, audio_url, audio_mime, duration_seconds, file_size, cover_url, chapters, summary, published_at, status, scheduled_for',
      )
      .eq('id', id)
      .single()
    if (currentError) throw currentError
    const nextStatus = String(patch.status ?? current.status)
    const nextScheduled = (patch.scheduled_for ?? current.scheduled_for) as string | null
    if (nextStatus === 'scheduled' && !nextScheduled) {
      return NextResponse.json({ error: 'Set scheduled_for before scheduling' }, { status: 400 })
    }

    // Feed-compliance gate: block publish (and scheduling a publish) on a
    // broken enclosure so Apple/Spotify never reject it after the fact.
    if (nextStatus === 'published' || nextStatus === 'scheduled') {
      const merged = {
        title: (patch.title ?? current.title) as string,
        audio_url: (patch.audio_url ?? current.audio_url) as string | null,
        audio_mime: (patch.audio_mime ?? current.audio_mime) as string | null,
        duration_seconds: (patch.duration_seconds ?? current.duration_seconds) as number | null,
        file_size: (patch.file_size ?? current.file_size) as number | null,
        cover_url: (patch.cover_url ?? current.cover_url) as string | null,
        chapters: (Array.isArray(patch.chapters) ? patch.chapters : current.chapters) as PodcastChapter[] | null,
        summary: (patch.summary ?? current.summary) as string | null,
      }
      const compliance = checkFeedCompliance(merged)
      if (!compliance.ok) {
        return NextResponse.json(
          {
            error: `Cannot publish — ${compliance.blockers.map((b) => b.detail || b.label).join('; ')}`,
            compliance,
          },
          { status: 422 },
        )
      }
      // Cover dimensions require fetching the image; only enforce when we can measure.
      if (merged.cover_url) {
        const art = await checkCoverArt(merged.cover_url)
        if (!art.ok) {
          return NextResponse.json(
            { error: `Cannot publish — ${art.detail || 'cover art does not meet Apple/Spotify requirements'}` },
            { status: 422 },
          )
        }
      }
    }

    if (nextStatus === 'published' && !patch.published_at) {
      patch.published_at = current.published_at || new Date().toISOString()
    }
    const { data, error } = await supabase.from('podcast_episodes').update(patch).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase } = await withStudioAdmin()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabase.from('podcast_episodes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return studioError(err)
  }
}
