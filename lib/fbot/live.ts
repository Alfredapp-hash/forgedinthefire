import { createAdminClient, createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import type { FbotLiveItem, FbotSnapshot } from '@/lib/fbot/types'

function hrefTopic(id: string) {
  return `/admin/studio/topics/${id}`
}

function hrefPost(id: string) {
  return `/admin/blog/${id}`
}

function hrefEpisode(id: string) {
  return `/admin/podcast/${id}`
}

export async function loadFbotSnapshot(): Promise<FbotSnapshot> {
  await requireAdmin()
  let supabase = await createClient()
  try {
    supabase = await createAdminClient()
  } catch {
    // Fall back to the signed-in client if the service role is not set.
  }
  if (!supabase) {
    return emptySnapshot('Database is not configured.')
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const todayIso = startOfDay.toISOString()

  const [
    topicsRes,
    draftsRes,
    scheduledRes,
    draftCountRes,
    publishedRes,
    subsRes,
    newSubsRes,
    campaignsRes,
    giftsRes,
    careersRes,
    episodesRes,
    needAudioRes,
    playsRes,
    newsletterDraftsRes,
    adsRes,
  ] = await Promise.all([
    supabase
      .from('content_topics')
      .select('id, title, scheduled_on, status')
      .in('status', ['idea', 'planned', 'in_production'])
      .order('scheduled_on', { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from('content')
      .select('id, title, status, updated_at')
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(3),
    supabase
      .from('content')
      .select('id, title, scheduled_for, status')
      .eq('status', 'scheduled')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .limit(3),
    supabase.from('content').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('content').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('fundraising_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('fundraising_gifts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('job_positions').select('*', { count: 'exact', head: true }).eq('active', false),
    supabase
      .from('podcast_episodes')
      .select('id, title, status, audio_url, episode_number')
      .in('status', ['draft', 'recording', 'editing', 'review', 'scheduled'])
      .order('episode_number', { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from('podcast_episodes')
      .select('*', { count: 'exact', head: true })
      .in('status', ['draft', 'recording', 'editing', 'review', 'scheduled'])
      .is('audio_url', null),
    supabase
      .from('podcast_analytics_events')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_at', todayIso),
    supabase.from('newsletters').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const topics = topicsRes.data || []
  const dated = topics.find((t) => t.scheduled_on)
  const nextTopicRow = dated || topics[0] || null
  const nextTopic: FbotLiveItem | null = nextTopicRow
    ? {
        title: nextTopicRow.title,
        detail: [nextTopicRow.status, nextTopicRow.scheduled_on].filter(Boolean).join(' · '),
        href: hrefTopic(nextTopicRow.id),
      }
    : null

  const nextDraftRow = draftsRes.data?.[0]
  const nextDraft: FbotLiveItem | null = nextDraftRow
    ? { title: nextDraftRow.title, href: hrefPost(nextDraftRow.id) }
    : null

  const scheduledRow = scheduledRes.data?.[0]
  const scheduledPost: FbotLiveItem | null = scheduledRow
    ? {
        title: scheduledRow.title,
        detail: scheduledRow.scheduled_for ? new Date(scheduledRow.scheduled_for).toLocaleString() : 'scheduled',
        href: hrefPost(scheduledRow.id),
      }
    : null

  const episodes = episodesRes.data || []
  const needAudio = episodes.filter((ep) => !ep.audio_url)
  const nextEpisodeRow = needAudio[0] || episodes[0] || null
  const nextEpisode: FbotLiveItem | null = nextEpisodeRow
    ? {
        title: nextEpisodeRow.title,
        detail: nextEpisodeRow.audio_url ? nextEpisodeRow.status : `${nextEpisodeRow.status} · needs audio`,
        href: hrefEpisode(nextEpisodeRow.id),
      }
    : null

  let podcastPlaysToday: number | null = null
  let podcastPlaysNote: string | null = null
  if (playsRes.error) {
    podcastPlaysNote = 'Podcast play counts are not readable with this login (table grant missing).'
  } else {
    podcastPlaysToday = playsRes.count ?? 0
  }

  return {
    nextTopic,
    nextDraft,
    scheduledPost,
    drafts: draftCountRes.count ?? draftsRes.data?.length ?? 0,
    published: publishedRes.count ?? 0,
    subscribers: subsRes.count ?? 0,
    newSubs7d: newSubsRes.count ?? 0,
    liveCampaigns: campaignsRes.error ? 0 : (campaignsRes.count ?? 0),
    pendingGifts: giftsRes.error ? 0 : (giftsRes.count ?? 0),
    inactiveCareers: careersRes.error ? 0 : (careersRes.count ?? 0),
    episodesNeedAudio: needAudioRes.count ?? needAudio.length,
    nextEpisode,
    podcastPlaysToday,
    podcastPlaysNote,
    visitsNote:
      'Site visits today are not in this admin yet — GA4 Data API is not returning numbers.',
    newsletterDrafts: newsletterDraftsRes.error ? 0 : (newsletterDraftsRes.count ?? 0),
    activeAds: adsRes.error ? 0 : (adsRes.count ?? 0),
  }
}

function emptySnapshot(visitsNote: string): FbotSnapshot {
  return {
    nextTopic: null,
    nextDraft: null,
    scheduledPost: null,
    drafts: 0,
    published: 0,
    subscribers: 0,
    newSubs7d: 0,
    liveCampaigns: 0,
    pendingGifts: 0,
    inactiveCareers: 0,
    episodesNeedAudio: 0,
    nextEpisode: null,
    podcastPlaysToday: null,
    podcastPlaysNote: visitsNote,
    visitsNote,
    newsletterDrafts: 0,
    activeAds: 0,
  }
}
