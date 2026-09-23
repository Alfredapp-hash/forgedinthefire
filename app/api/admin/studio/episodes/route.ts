import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { slugify, uniqueSlug } from '@/lib/studio/slug'
import { PODCAST, isSafeHttpUrl, probeRemoteSize } from '@/lib/podcast'
import { normalizeAudioMime, releaseBlockers, releaseChecks } from '@/lib/studio/release'
import type { PodcastChapter, PodcastEpisode } from '@/lib/studio/types'
import { cleanWords } from '@/lib/studio/transcript'

const PRE_RELEASE = new Set(['draft', 'recording', 'editing', 'review'])
const STATUSES = new Set(['draft', 'recording', 'editing', 'review', 'scheduled', 'published', 'archived'])

/** Keep only well-formed chapters: finite start, non-empty title, http(s) links. */
function cleanChapters(value: unknown): PodcastChapter[] | null {
  if (!Array.isArray(value)) return null
  return value
    .map((raw) => {
      const c = (raw ?? {}) as Record<string, unknown>
      const start = Math.max(0, Math.round(Number(c.start_ms)))
      const title = String(c.title ?? '').trim().slice(0, 200)
      if (!Number.isFinite(start) || !title) return null
      const out: PodcastChapter = { start_ms: start, title }
      if (isSafeHttpUrl(c.url)) out.url = c.url
      if (isSafeHttpUrl(c.img)) out.img = c.img
      return out
    })
    .filter((c): c is PodcastChapter => c !== null)
    .sort((a, b) => a.start_ms - b.start_ms)
}

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
    // Word timings and revert snapshots are large; the list view never needs them.
    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      const { transcript_words: _w, post_edit_snapshot: _s, ...rest } = row
      void _w
      void _s
      return rest
    })
    return NextResponse.json(rows)
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
    // New episodes always start pre-release; publishing goes through PATCH + release checks.
    const requested = String(body.status || 'draft')
    const status = PRE_RELEASE.has(requested) ? requested : 'draft'
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
        published_at: null,
        chapters: cleanChapters(body.chapters) ?? [],
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

/** Stream D columns (20260924000002_podcast_ai_safety.sql). */
const SAFETY_MIGRATION = '20260924000002_podcast_ai_safety.sql'

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await withStudioAdmin()
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key] === '' ? null : body[key]
    }
    if (patch.status != null && !STATUSES.has(String(patch.status))) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    }
    if (typeof patch.title === 'string') {
      patch.title = patch.title.trim()
      if (!patch.title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    if (patch.season != null) patch.season = Math.max(1, Math.round(Number(patch.season)) || 1)
    if (patch.episode_number != null) {
      const n = Math.round(Number(patch.episode_number))
      patch.episode_number = Number.isFinite(n) && n > 0 ? n : null
    }
    if (patch.duration_seconds != null) patch.duration_seconds = Math.round(Number(patch.duration_seconds)) || null
    if (patch.file_size != null) patch.file_size = Math.round(Number(patch.file_size)) || null
    if (typeof patch.explicit === 'string') patch.explicit = patch.explicit === 'true'
    if (patch.chapters != null) {
      const chapters = cleanChapters(patch.chapters)
      if (chapters) patch.chapters = chapters
      else delete patch.chapters
    }
    if (!Array.isArray(patch.keywords) && patch.keywords != null) {
      patch.keywords = String(patch.keywords).split(',').map((k) => k.trim()).filter(Boolean)
    }
    if (!Array.isArray(patch.ad_markers) && patch.ad_markers != null) delete patch.ad_markers
    if (patch.audio_url !== undefined && patch.audio_mime === undefined && patch.audio_url) {
      patch.audio_mime = normalizeAudioMime(null, String(patch.audio_url))
    }
    if (typeof patch.audio_mime === 'string') {
      patch.audio_mime = normalizeAudioMime(patch.audio_mime, (patch.audio_url as string | undefined) ?? null)
    }
    for (const key of ['audio_url', 'cover_url'] as const) {
      if (patch[key] != null && !isSafeHttpUrl(patch[key])) {
        return NextResponse.json({ error: `${key} must be an http(s) URL` }, { status: 400 })
      }
    }
    // Loudness columns arrive with 20260923000002_podcast_release.sql; accept them only as numbers.
    for (const key of ['loudness_lufs', 'loudness_peak_db', 'audio_channels'] as const) {
      if (body[key] === undefined) continue
      const n = Number(body[key])
      patch[key] = body[key] === null || !Number.isFinite(n) ? null : n
    }

    const { data: current, error: currentError } = await supabase
      .from('podcast_episodes')
      .select('*')
      .eq('id', id)
      .single()
    if (currentError) throw currentError

    // ── Post-production & survivor-safety fields: shape-checked, stamped server-side ──
    const now = new Date().toISOString()
    const safety: Record<string, unknown> = {}
    if (body.transcript_words !== undefined) {
      safety.transcript_words = body.transcript_words === null ? null : cleanWords(body.transcript_words)
    }
    if (body.audio_url_previous !== undefined) {
      if (body.audio_url_previous !== null && !isSafeHttpUrl(body.audio_url_previous)) {
        return NextResponse.json({ error: 'audio_url_previous must be an http(s) URL' }, { status: 400 })
      }
      safety.audio_url_previous = body.audio_url_previous
    }
    if (body.post_edit_snapshot !== undefined) {
      const snap = body.post_edit_snapshot
      safety.post_edit_snapshot = snap && typeof snap === 'object' && !Array.isArray(snap) ? snap : null
    }
    if (body.protected_words_reviewed !== undefined) {
      const yes = body.protected_words_reviewed === true
      safety.protected_words_reviewed_at = yes ? now : null
      safety.protected_words_reviewed_by = yes ? user.email ?? null : null
    }
    if (body.guest_consent_confirmed !== undefined) {
      const yes = body.guest_consent_confirmed === true
      safety.guest_consent_confirmed = yes
      safety.guest_consent_confirmed_at = yes ? now : null
      safety.guest_consent_confirmed_by = yes ? user.email ?? null : null
    }
    if (body.guest_final_cut_approved !== undefined) {
      const yes = body.guest_final_cut_approved === true
      safety.guest_final_cut_approved = yes
      safety.guest_final_cut_approved_at = yes ? now : null
      safety.guest_final_cut_approved_by = yes ? user.email ?? null : null
      safety.guest_final_cut_audio_url = yes ? (patch.audio_url ?? current.audio_url ?? null) : null
    }
    const missing = Object.keys(safety).filter((key) => !(key in current))
    if (missing.length) {
      return NextResponse.json(
        { error: `The database needs the ${SAFETY_MIGRATION} update before these can be saved (${missing.join(', ')}).` },
        { status: 400 },
      )
    }
    Object.assign(patch, safety)

    // New audio invalidates the stored loudness (only when the column exists — pre-migration safe).
    if (patch.audio_url !== undefined && patch.audio_url !== current.audio_url && 'loudness_lufs' in current) {
      for (const key of ['loudness_lufs', 'loudness_peak_db', 'audio_channels'] as const) {
        if (patch[key] === undefined) patch[key] = null
      }
    }

    // Slugs are the public URL: normalise and keep them unique (never 500 on a clash).
    if (patch.slug !== undefined) {
      const base = slugify(String(patch.slug || patch.title || current.title))
      if (base !== current.slug) {
        const { data: clash } = await supabase.from('podcast_episodes').select('slug').neq('id', id)
        patch.slug = uniqueSlug(base, new Set((clash ?? []).map((row) => row.slug)))
      } else {
        patch.slug = current.slug
      }
    }

    const merged = { ...current, ...patch } as PodcastEpisode
    const nextStatus = String(merged.status)
    // Gate the transition into release (not every later edit of an already-live episode).
    const releasing = (nextStatus === 'published' || nextStatus === 'scheduled') && nextStatus !== current.status

    if (releasing) {
      // Enclosure length is mandatory for Apple — recover it from the host if missing.
      if (merged.audio_url && !(merged.file_size && merged.file_size > 0)) {
        const size = await probeRemoteSize(merged.audio_url)
        if (size) {
          patch.file_size = size
          merged.file_size = size
        }
      }
      const { data: show } = merged.show_id
        ? await supabase.from('podcast_shows').select('cover_url').eq('id', merged.show_id).maybeSingle()
        : { data: null }
      const blockers = releaseBlockers(
        releaseChecks(merged, { server: true, show: { cover_url: show?.cover_url || PODCAST.image } }),
      )
      if (blockers.length) {
        return NextResponse.json(
          {
            error: `Not ready to ${nextStatus === 'published' ? 'publish' : 'schedule'}: ${blockers.map((b) => b.label).join(', ')}`,
            blockers,
          },
          { status: 400 },
        )
      }
    }

    if (nextStatus === 'scheduled') {
      if (!merged.scheduled_for || Number.isNaN(Date.parse(merged.scheduled_for))) {
        return NextResponse.json({ error: 'Pick a release date and time before scheduling' }, { status: 400 })
      }
      // Not live yet: a scheduled episode has no pubDate until the cron releases it.
      if (current.status !== 'published') patch.published_at = null
    }
    if (nextStatus === 'published') {
      const requested = typeof patch.published_at === 'string' ? Date.parse(patch.published_at) : NaN
      // pubDate never moves once set (feeds re-sort otherwise) and never lands in the future.
      if (current.published_at && current.status === 'published') {
        patch.published_at = current.published_at
      } else if (Number.isFinite(requested) && requested <= Date.now()) {
        patch.published_at = new Date(requested).toISOString()
      } else {
        patch.published_at = current.published_at && Date.parse(current.published_at) <= Date.now()
          ? current.published_at
          : new Date().toISOString()
      }
      patch.scheduled_for = merged.scheduled_for ?? null
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
