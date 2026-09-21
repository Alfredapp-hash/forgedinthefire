export type TopicStatus = 'idea' | 'planned' | 'in_production' | 'published' | 'archived'
export type EpisodeStatus =
  | 'draft'
  | 'recording'
  | 'editing'
  | 'review'
  | 'scheduled'
  | 'published'
  | 'archived'
export type EpisodeType = 'full' | 'trailer' | 'bonus'
export type EpisodeVisibility = 'public' | 'unlisted' | 'private'
export type DistributionPlatform =
  | 'apple'
  | 'spotify'
  | 'amazon'
  | 'youtube'
  | 'iheart'
  | 'pocket_casts'
  | 'overcast'
  | 'rss'
export type DistributionStatus = 'not_started' | 'submitted' | 'in_review' | 'live' | 'blocked'
export type ClipPlatform = 'tiktok' | 'instagram' | 'youtube_shorts' | 'facebook' | 'linkedin'
export type CanvasFormat = '9:16' | '1:1' | '4:5' | '16:9'
export type TemplateKind = 'blog' | 'social' | 'podcast_cover'

export type PodcastChapter = {
  start_ms: number
  title: string
  url?: string | null
}

export type PodcastAdMarker = {
  position: 'pre' | 'mid' | 'post'
  offset_ms: number | null
  label: string
  sponsor?: string | null
}

export type ContentTopic = {
  id: string
  title: string
  slug: string
  summary: string | null
  talking_points: string[]
  scheduled_on: string | null
  status: TopicStatus
  blog_post_id: string | null
  /** Present after 20260918_content_topics_cover migration; Studio also resolves from manifest. */
  cover_url?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PodcastEpisode = {
  id: string
  guid?: string | null
  topic_id: string | null
  show_id: string | null
  title: string
  slug: string
  summary: string | null
  show_notes: string | null
  guest_name: string | null
  guest_bio: string | null
  audio_url: string | null
  audio_mime: string | null
  duration_seconds: number | null
  file_size: number | null
  cover_url: string | null
  transcript: string | null
  season: number
  episode_number: number | null
  episode_type: EpisodeType
  visibility: EpisodeVisibility
  explicit: boolean
  status: EpisodeStatus
  scheduled_for: string | null
  published_at: string | null
  chapters: PodcastChapter[]
  keywords: string[]
  ad_markers: PodcastAdMarker[]
  created_by: string | null
  created_at: string
  updated_at: string
  consent_confirmed?: boolean
  identity_protection?: 'anonymous' | 'pseudonym' | 'first_name' | 'real_name'
  preview_token?: string | null
  lufs_integrated?: number | null
  lufs_true_peak?: number | null
  content_warning?: string | null
  graphic_detail_reviewed?: boolean
  identifying_info_reviewed?: boolean
  show_public_advisory?: boolean
}

export type PodcastShow = {
  id: string
  slug: string
  title: string
  author: string
  email: string
  description: string
  category: string
  subcategory: string | null
  language: string
  explicit: boolean
  cover_url: string | null
  website_url: string | null
  copyright: string | null
  itunes_type: 'episodic' | 'serial'
  owner_name: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export type PodcastDistributionRow = {
  id: string
  show_id: string
  platform: DistributionPlatform
  status: DistributionStatus
  listing_url: string | null
  notes: string | null
  submitted_at: string | null
  live_at: string | null
  updated_at: string
}

export type PodcastSubscriber = {
  id: string
  show_id: string
  email: string
  name: string | null
  token: string
  status: 'active' | 'revoked'
  invited_at: string
  last_access_at: string | null
  notes: string | null
  created_at: string
}

export const EPISODE_PIPELINE: EpisodeStatus[] = [
  'draft',
  'recording',
  'editing',
  'review',
  'scheduled',
  'published',
  'archived',
]

export const DISTRIBUTION_LABELS: Record<DistributionPlatform, string> = {
  apple: 'Apple Podcasts',
  spotify: 'Spotify',
  amazon: 'Amazon Music',
  youtube: 'YouTube Music',
  iheart: 'iHeartRadio',
  pocket_casts: 'Pocket Casts',
  overcast: 'Overcast',
  rss: 'Public RSS',
}

export type StudioCanvas = {
  format: CanvasFormat
  background: {
    kind: 'color' | 'gradient'
    color: string
    color2?: string
  }
  image?: {
    url: string
    opacity: number
  }
  headline: { text: string; color: string; size: number }
  body: { text: string; color: string; size: number }
  logo: { visible: boolean }
  cta: { visible: boolean; text: string }
}

export type StudioClip = {
  id: string
  topic_id: string
  platform: ClipPlatform
  format: string
  hook: string | null
  script: string | null
  caption: string | null
  cta: string | null
  media_url: string | null
  duration_seconds: number | null
  canvas: StudioCanvas | Record<string, unknown>
  status: string
  created_at: string
  updated_at: string
}

export type StudioTemplate = {
  id: string
  name: string
  kind: TemplateKind
  format: string | null
  canvas: StudioCanvas | Record<string, unknown>
  thumbnail_url: string | null
  created_at: string
}

export type TopicBundle = {
  topic: ContentTopic
  episode: PodcastEpisode | null
  clips: StudioClip[]
  blog: { id: string; title: string; slug: string; status: string } | null
}

export const FORMAT_PX: Record<CanvasFormat, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
}

export const FORMAT_LABELS: Record<CanvasFormat, string> = {
  '9:16': '1080×1920 · TikTok / Reels',
  '1:1': '1080×1080 · Feed square',
  '4:5': '1080×1350 · Portrait feed',
  '16:9': '1920×1080 · Landscape / YouTube',
}

export const BRAND = {
  ink: '#05070A',
  panel: '#151B22',
  line: '#27313B',
  ice: '#53D6FF',
  glow: '#8DEBFF',
  paper: '#F6FAFC',
  mute: '#B8C4CF',
  logo: '/brand/fitf-lockup.png',
  mark: '/brand/fitf-mark.png',
} as const

export const DEFAULT_HASHTAGS = [
  '#ForgedInTheFire',
  '#LorainCounty',
  '#NortheastOhio',
  '#SurvivorSupport',
  '#TraumaInformed',
]
