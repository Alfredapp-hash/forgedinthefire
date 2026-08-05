export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'mock'

export type SocialAccount = {
  id: string
  platform: SocialPlatform
  account_name: string
  account_id?: string
  connection_status: 'connected' | 'not_connected' | 'expired' | 'error' | 'disabled'
  enabled: boolean
  created_at: string
}

export type SocialCampaign = {
  id: string
  title: string
  campaign_status: 'draft' | 'ready' | 'scheduled' | 'partially_posted' | 'posted' | 'failed' | 'archived'
  source_type?: string
  source_id?: string
  utm_campaign?: string
  scheduled_at?: string
  created_at: string
  updated_at: string
  posts?: SocialPost[]
}

export type SocialPost = {
  id: string
  campaign_id: string
  platform: SocialPlatform
  caption: string
  link_url?: string
  status: 'draft' | 'scheduled' | 'posted' | 'mock_posted' | 'failed'
  scheduled_at?: string
  posted_at?: string
}

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  mock: 'Mock (Dev)',
}

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  youtube: '#FF0000',
  mock: '#6B7280',
}
