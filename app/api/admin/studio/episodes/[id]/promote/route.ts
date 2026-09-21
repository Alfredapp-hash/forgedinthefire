import { NextResponse } from 'next/server'
import { createDefaultClips, studioError, withStudioAdmin } from '@/lib/studio/api'
import { clipCopyFromEpisode, clipNeedsPrefill } from '@/lib/studio/prefill-clips'
import { DEFAULT_HASHTAGS, type StudioClip } from '@/lib/studio/types'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://forgedinthefireohio.org'

/**
 * Prefill topic social clips from episode show notes and optionally
 * open a Social Publisher campaign — Captivate/Buzzsprout promote parity.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withStudioAdmin()
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { createCampaign?: boolean }
    const createCampaign = body.createCampaign !== false

    const { data: episode, error } = await supabase
      .from('podcast_episodes')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    let talkingPoints: string[] = []
    if (episode.topic_id) {
      const { data: topic } = await supabase
        .from('content_topics')
        .select('talking_points')
        .eq('id', episode.topic_id)
        .maybeSingle()
      talkingPoints = Array.isArray(topic?.talking_points) ? topic.talking_points : []
      await createDefaultClips(supabase, episode.topic_id)
    }

    const copy = clipCopyFromEpisode({
      title: episode.title,
      showNotes: episode.show_notes,
      summary: episode.summary,
      talkingPoints,
      slug: episode.slug,
    })

    let clipsUpdated = 0
    let clips: StudioClip[] = []
    if (episode.topic_id) {
      const { data: existing } = await supabase
        .from('studio_clips')
        .select('*')
        .eq('topic_id', episode.topic_id)
      clips = (existing ?? []) as StudioClip[]
      for (const clip of clips) {
        if (!clipNeedsPrefill(clip)) continue
        const { data } = await supabase
          .from('studio_clips')
          .update({
            hook: copy.hook,
            script: copy.script,
            caption: copy.caption,
            cta: copy.cta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clip.id)
          .select()
          .single()
        if (data) {
          clipsUpdated++
          clips = clips.map((c) => (c.id === clip.id ? (data as StudioClip) : c))
        }
      }
    }

    const link = `${SITE.replace(/\/$/, '')}/podcast/${episode.slug}`
    const caption = clips[0]?.caption || [copy.hook, copy.caption, copy.cta, DEFAULT_HASHTAGS.join(' ')].filter(Boolean).join('\n\n')

    let campaignId: string | null = null
    if (createCampaign) {
      const posts = (clips.length ? clips : [{ platform: 'facebook' }, { platform: 'instagram' }, { platform: 'linkedin' }]).map((c) => ({
        platform: 'platform' in c && c.platform === 'youtube_shorts' ? 'youtube' : ('platform' in c ? c.platform : 'facebook'),
        caption: ('caption' in c && c.caption) ? c.caption : caption,
        link_url: link,
      }))
      const { data: campaign, error: campaignError } = await supabase
        .from('social_campaigns')
        .insert({
          title: `Promote: ${episode.title}`,
          source_type: 'podcast_episode',
          source_id: episode.id,
          utm_campaign: 'forged-podcast',
          campaign_status: 'draft',
        })
        .select()
        .single()
      if (campaignError) throw campaignError
      campaignId = campaign.id
      await supabase.from('social_posts').insert(
        posts.map((p) => ({
          campaign_id: campaign.id,
          platform: p.platform,
          caption: p.caption,
          link_url: p.link_url,
          status: 'draft',
        })),
      )
    }

    return NextResponse.json({
      ok: true,
      clipsUpdated,
      campaignId,
      campaignUrl: campaignId ? `/admin/social/campaigns/${campaignId}` : null,
      topicUrl: episode.topic_id ? `/admin/studio/topics/${episode.topic_id}` : null,
      copy,
    })
  } catch (err) {
    return studioError(err)
  }
}
