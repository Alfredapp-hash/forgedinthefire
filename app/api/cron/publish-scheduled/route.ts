import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { PODCAST, probeRemoteSize } from '@/lib/podcast'
import { releaseBlockers, releaseChecks } from '@/lib/studio/release'
import { releaseConsentStatus } from '@/lib/podcast/guest-consent'
import type { PodcastEpisode } from '@/lib/studio/types'

export const dynamic = 'force-dynamic'

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  // Fail CLOSED: with no secret configured nothing may trigger a publish.
  if (!secret) return { ok: false as const, status: 503, error: 'CRON_SECRET is not configured' }
  const header = request.headers.get('authorization') || ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false as const, status: 401, error: 'Unauthorized' }
  }
  return { ok: true as const }
}

type Admin = Awaited<ReturnType<typeof createAdminClient>>

async function publishPosts(admin: Admin, now: string) {
  const { data, error } = await admin
    .from('content')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
  if (error) throw error
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length) {
    const { error: updateError } = await admin
      .from('content')
      .update({ status: 'published', published_at: now })
      .in('id', ids)
    if (updateError) throw updateError
  }
  return ids
}

/** Scheduled podcast episodes → published, with the scheduled time as pubDate. */
async function publishEpisodes(admin: Admin, now: string) {
  const { data, error } = await admin
    .from('podcast_episodes')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
  if (error) return { published: [] as string[], held: [] as { id: string; reasons: string[] }[], note: error.message }

  const published: string[] = []
  const held: { id: string; reasons: string[] }[] = []
  for (const row of (data ?? []) as PodcastEpisode[]) {
    const ep = { ...row }
    if (ep.audio_url && !(ep.file_size && ep.file_size > 0)) {
      ep.file_size = await probeRemoteSize(ep.audio_url)
    }
    let guestConsent
    try {
      guestConsent = await releaseConsentStatus(ep.id, admin)
    } catch (err) {
      // Fail closed: stay scheduled and retry next run.
      held.push({ id: ep.id, reasons: [`Guest consent check failed: ${err instanceof Error ? err.message : 'unknown error'}`] })
      continue
    }
    const blockers = releaseBlockers(
      releaseChecks(ep, { server: true, show: { cover_url: PODCAST.image }, guestConsent }),
    )
    if (blockers.length) {
      // Stay scheduled so staff see it in the Scheduled column; retried every run.
      held.push({ id: ep.id, reasons: blockers.map((b) => b.label) })
      continue
    }
    const scheduled = ep.scheduled_for && ep.scheduled_for <= now ? ep.scheduled_for : now
    const { error: updateError } = await admin
      .from('podcast_episodes')
      .update({
        status: 'published',
        published_at: ep.published_at && ep.published_at <= now ? ep.published_at : scheduled,
        file_size: ep.file_size,
        updated_at: now,
      })
      .eq('id', ep.id)
      .eq('status', 'scheduled')
    if (updateError) held.push({ id: ep.id, reasons: [updateError.message] })
    else published.push(ep.id)
  }
  return { published, held, note: null as string | null }
}

/** Repair enclosure length on already-live episodes (Apple flags length="0"). */
async function backfillFileSizes(admin: Admin) {
  const { data } = await admin
    .from('podcast_episodes')
    .select('id, audio_url, file_size')
    .eq('status', 'published')
    .not('audio_url', 'is', null)
    .or('file_size.is.null,file_size.lte.0')
    .limit(10)
  let fixed = 0
  for (const row of data ?? []) {
    const size = row.audio_url ? await probeRemoteSize(row.audio_url) : null
    if (!size) continue
    const { error } = await admin.from('podcast_episodes').update({ file_size: size }).eq('id', row.id)
    if (!error) fixed += 1
  }
  return fixed
}

async function run(request: Request) {
  const auth = authorized(request)
  if (!auth.ok) {
    if (auth.status === 503) console.error('publish-scheduled: CRON_SECRET missing — refusing to run')
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const admin = await createAdminClient()
    const now = new Date().toISOString()
    const posts = await publishPosts(admin, now)
    const podcast = await publishEpisodes(admin, now)
    const fileSizesFixed = podcast.note ? 0 : await backfillFileSizes(admin)
    if (podcast.held.length) console.warn('publish-scheduled: episodes held', JSON.stringify(podcast.held))
    return NextResponse.json({
      published: posts.length,
      posts,
      podcast_published: podcast.published.length,
      podcast_ids: podcast.published,
      podcast_held: podcast.held,
      podcast_note: podcast.note,
      file_sizes_fixed: fileSizesFixed,
    })
  } catch (err) {
    console.error('Scheduled publish cron error:', err)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
