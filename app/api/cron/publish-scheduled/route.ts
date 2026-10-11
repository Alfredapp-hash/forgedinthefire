import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { PODCAST, probeRemoteSize } from '@/lib/podcast'
import { releaseConsentStatus } from '@/lib/podcast/guest-consent'
import { releaseBlockers, releaseChecks } from '@/lib/studio/release'
import { notifyFeedUpdate } from '@/lib/podcast/notify-feeds'
import { recordPodcastAudit } from '@/lib/podcast/audit-log'
import { runPodcastRetention } from '@/lib/podcast/retention'
import { dispatchAndRecord, type DispatchAccount, type DispatchPost } from '@/lib/social/post'
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
    // Recorded booth consent gates release alongside the manual "consent on file" column
    // and the sign-off checks. A consent lookup failure holds the episode (fail closed).
    let guestConsent: Awaited<ReturnType<typeof releaseConsentStatus>> | null = null
    try {
      guestConsent = await releaseConsentStatus(ep.id)
    } catch (err) {
      held.push({ id: ep.id, reasons: [`Guest consent could not be checked: ${err instanceof Error ? err.message : 'unknown error'}`] })
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

/** Due scheduled social posts → dispatched to their platforms, campaign status rolled up. */
async function publishDuePosts(admin: Admin, now: string) {
  const { data: due, error } = await admin
    .from('social_posts')
    .select('id, campaign_id, platform, caption, link_url, media_urls, account_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
  if (error) return { sent: 0, failed: 0, note: error.message }
  const posts = (due ?? []) as (DispatchPost & { campaign_id: string | null })[]
  if (!posts.length) return { sent: 0, failed: 0, note: null as string | null }

  const { data: accounts } = await admin
    .from('social_accounts')
    .select('id, platform, account_id, access_token, connection_status, enabled')
  const byId = new Map<string, DispatchAccount>()
  const byPlat = new Map<string, DispatchAccount>()
  for (const a of (accounts ?? []) as DispatchAccount[]) {
    byId.set(a.id, a)
    const k = (a.platform || '').toLowerCase()
    if (!byPlat.has(k)) byPlat.set(k, a)
  }

  const results = await dispatchAndRecord(admin, posts, byId, byPlat)

  const campaignIds = [...new Set(posts.map((p) => p.campaign_id).filter((x): x is string => Boolean(x)))]
  for (const cid of campaignIds) {
    const { data: all } = await admin.from('social_posts').select('status').eq('campaign_id', cid)
    const statuses = (all ?? []).map((r) => (r as { status: string }).status)
    const okc = statuses.filter((x) => x === 'posted' || x === 'mock_posted').length
    const pending = statuses.some((x) => x === 'scheduled' || x === 'draft')
    const cs = okc === 0 ? 'failed' : pending || statuses.some((x) => x === 'failed') ? 'partially_posted' : 'posted'
    await admin.from('social_campaigns').update({ campaign_status: cs, updated_at: now }).eq('id', cid)
  }
  return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, note: null as string | null }
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
    const social = await publishDuePosts(admin, now)
    // Tell PodPing + the WebSub hub the feed changed so platforms ingest in
    // seconds instead of waiting for their next poll. Fail-soft: never blocks.
    if (podcast.published.length) {
      await notifyFeedUpdate(PODCAST.feed).catch((e) => console.error('notify-feeds failed:', e))
      for (const id of podcast.published) {
        await recordPodcastAudit({
          action: 'episode.publish',
          episodeId: id,
          summary: 'Hourly job published a scheduled episode',
        })
      }
    }
    const retention = await runPodcastRetention().catch((err) => ({
      guestTakes: 0,
      previousAudio: 0,
      note: err instanceof Error ? err.message : 'retention failed',
    }))
    if (podcast.held.length) console.warn('publish-scheduled: episodes held', JSON.stringify(podcast.held))
    return NextResponse.json({
      published: posts.length,
      posts,
      podcast_published: podcast.published.length,
      podcast_ids: podcast.published,
      podcast_held: podcast.held,
      podcast_note: podcast.note,
      file_sizes_fixed: fileSizesFixed,
      social_sent: social.sent,
      social_failed: social.failed,
      social_note: social.note,
      retention_guest_takes: retention.guestTakes,
      retention_previous_audio: retention.previousAudio,
      retention_note: retention.note,
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
