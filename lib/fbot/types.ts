export type FbotLink = {
  label: string
  href: string
}

export type FbotArticle = {
  id: string
  title: string
  routes: string[]
  keywords: string[]
  aliases: string[]
  body: string
  links: FbotLink[]
  tabs?: string[]
  page?: boolean
}

export type FbotLiveItem = {
  title: string
  detail?: string
  href?: string
}

export type FbotSnapshot = {
  nextTopic: FbotLiveItem | null
  nextDraft: FbotLiveItem | null
  scheduledPost: FbotLiveItem | null
  drafts: number
  published: number
  subscribers: number
  newSubs7d: number
  liveCampaigns: number
  pendingGifts: number
  inactiveCareers: number
  episodesNeedAudio: number
  nextEpisode: FbotLiveItem | null
  podcastPlaysToday: number | null
  podcastPlaysNote: string | null
  visitsNote: string
  newsletterDrafts: number
  activeAds: number
}

export type FbotAnswer = {
  title: string
  body: string
  links: FbotLink[]
  source: 'live' | 'guide' | 'page'
}

export type FbotReply = {
  answers: FbotAnswer[]
  chips: string[]
  snapshot: FbotSnapshot | null
}
