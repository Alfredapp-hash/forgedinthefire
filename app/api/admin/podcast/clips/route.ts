import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { CLIP_ASPECTS, CLIP_MAX_SEC, CLIP_MIN_SEC, type ClipAspect, type EpisodeClip } from '@/lib/podcast/clips/types'

export const dynamic = 'force-dynamic'

const TABLE = 'podcast_episode_clips'
const MIGRATION = '20260925000002_podcast_clips.sql'
const noStore = { 'Cache-Control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: noStore })
}

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')))
}

/** Only files from our own public media bucket may be saved as clips. */
function isMediaStorageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    const u = new URL(value)
    if (base && u.origin !== new URL(base).origin) return false
    return /\/storage\/v1\/object\/public\/media\//.test(u.pathname)
  } catch {
    return false
  }
}

function clean(row: Record<string, unknown>): EpisodeClip {
  return {
    id: String(row.id),
    episode_id: String(row.episode_id),
    title: String(row.title ?? ''),
    start_sec: Number(row.start_sec),
    end_sec: Number(row.end_sec),
    aspect: row.aspect as ClipAspect,
    url: String(row.url),
    poster_url: row.poster_url ? String(row.poster_url) : null,
    created_at: String(row.created_at),
  }
}

/** GET ?episode=<id> → { available, clips } */
export async function GET(request: Request) {
  try {
    const episodeId = new URL(request.url).searchParams.get('episode') || ''
    if (!UUID.test(episodeId)) return bad('episode required')
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase.from(TABLE).select('*').eq('episode_id', episodeId).order('created_at', { ascending: false })
    if (error) {
      if (missingTable(error)) return NextResponse.json({ available: false, clips: [], migration: MIGRATION }, { headers: noStore })
      throw error
    }
    return NextResponse.json({ available: true, clips: (data ?? []).map(clean) }, { headers: noStore })
  } catch (err) {
    return studioError(err)
  }
}

/** POST { episode_id, title, start_sec, end_sec, aspect, url, poster_url } → clip */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await withStudioAdmin()
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const episodeId = String(body.episode_id || '')
    if (!UUID.test(episodeId)) return bad('episode_id required')
    const start = Number(body.start_sec)
    const end = Number(body.end_sec)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return bad('Invalid clip range')
    const len = end - start
    if (len < CLIP_MIN_SEC - 0.05 || len > CLIP_MAX_SEC + 0.05) return bad(`Clips are ${CLIP_MIN_SEC}–${CLIP_MAX_SEC} seconds`)
    const aspect = String(body.aspect || '9:16') as ClipAspect
    if (!CLIP_ASPECTS.includes(aspect)) return bad('Invalid aspect')
    if (!isMediaStorageUrl(body.url)) return bad('Clip file must be uploaded to site media first')
    if (body.poster_url != null && body.poster_url !== '' && !isMediaStorageUrl(body.poster_url)) return bad('Poster must be uploaded to site media first')

    const { data: episode, error: epError } = await supabase.from('podcast_episodes').select('id, duration_seconds').eq('id', episodeId).maybeSingle()
    if (epError) throw epError
    if (!episode) return bad('Episode not found', 404)
    const duration = Number(episode.duration_seconds || 0)
    if (duration > 0 && end > duration + 1) return bad('The clip runs past the end of the episode')

    const row = {
      episode_id: episodeId,
      title: String(body.title || '').trim().slice(0, 140),
      start_sec: Math.round(start * 100) / 100,
      end_sec: Math.round(end * 100) / 100,
      aspect,
      url: body.url,
      poster_url: body.poster_url ? String(body.poster_url) : null,
      created_by: user.email || user.id,
    }
    const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
    if (error) {
      if (missingTable(error)) return bad(`Run the ${MIGRATION} migration to save clips`, 503)
      throw error
    }
    return NextResponse.json(clean(data), { status: 201, headers: noStore })
  } catch (err) {
    return studioError(err)
  }
}

/** DELETE ?id=<clip id> — removes the row; the files stay in media storage (they may be shared). */
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id') || ''
    if (!UUID.test(id)) return bad('id required')
    const { supabase } = await withStudioAdmin()
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (err) {
    return studioError(err)
  }
}
