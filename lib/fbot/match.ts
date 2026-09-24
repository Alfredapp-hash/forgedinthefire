import { chipsForPath, FBOT_ARTICLES } from '@/lib/fbot/catalog'
import { isVagueQuestion, parseAdminPath, pathHitsRoute } from '@/lib/fbot/context'
import type { AdminContext } from '@/lib/fbot/context'
import type { FbotAnswer, FbotArticle, FbotSnapshot } from '@/lib/fbot/types'
import { toBullets } from '@/lib/fbot/voice'

const STOP = new Set([
  'the', 'and', 'for', 'how', 'do', 'i', 'a', 'to', 'of', 'in', 'on', 'is', 'it',
  'what', 'where', 'can', 'we', 'you', 'this', 'that', 'with', 'an', 'or', 'be',
  'my', 'our', 'me', 'at', 'from', 'about', 'please',
])

export function tokenize(q: string) {
  return q
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
}

function bigrams(tokens: string[]) {
  const out: string[] = []
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`)
  return out
}

function scoreArticle(article: FbotArticle, tokens: string[], ctx: AdminContext, raw: string) {
  let score = 0
  const hay = `${article.title} ${article.keywords.join(' ')} ${article.aliases.join(' ')}`.toLowerCase()
  for (const t of tokens) {
    if (article.keywords.includes(t)) score += 3
    else if (hay.includes(t)) score += 1
  }
  for (const phrase of bigrams(tokens)) {
    if (article.keywords.includes(phrase) || article.aliases.some((alias) => alias.includes(phrase))) score += 4
    else if (hay.includes(phrase)) score += 2
  }
  for (const alias of article.aliases) {
    if (raw.includes(alias)) score += 8
  }
  const onRoute = article.routes.some((route) => pathHitsRoute(ctx, route, article.tabs))
  if (onRoute) score += article.tabs?.length ? 5 : 2
  else if (article.tabs?.length) score -= 2
  if (article.page && !onRoute) score -= 4
  if (article.id === 'here-campaign-desk' && !/^\/admin\/campaigns\/[^/]+/.test(ctx.pathname)) score -= 8
  if (article.id === 'here-campaigns' && /^\/admin\/campaigns\/[^/]+/.test(ctx.pathname)) score -= 6
  if (article.id === 'here-episode-editor' && ctx.desk === 'episode') score += 6
  if (article.id === 'here-topic' && ctx.desk === 'topic') score += 6
  if (article.id === 'here-blog-post' && ctx.desk === 'post') score += 6
  return score
}

export function detectLiveKeys(raw: string, tokens: string[]) {
  const keys = new Set<string>()
  if (
    /\b(visits?|traffic|pageviews?|ga4|page views?)\b/.test(raw) ||
    (tokens.includes('today') && (tokens.includes('visit') || tokens.includes('visits')))
  ) {
    keys.add('visits')
  }
  if (/next blog|upcoming post|what should i write|next topic|next post/.test(raw)) keys.add('next_blog')
  if (tokens.includes('draft') || tokens.includes('drafts')) keys.add('drafts')
  if (/subscriber|newsletter/.test(raw)) keys.add('subscribers')
  if (/campaign|fundrais|gift|zeffy|advocate/.test(raw)) keys.add('campaigns')
  if (/need(s)? audio|record queue|episodes needing/.test(raw) || (tokens.includes('episode') && tokens.includes('audio'))) {
    keys.add('podcast_queue')
  }
  if (/next episode/.test(raw)) keys.add('podcast_queue')
  if (/play today|downloads today|podcast analytic|plays today/.test(raw)) keys.add('podcast_plays')
  if (/attention inbox|what needs attention|what needs/.test(raw)) keys.add('attention')
  if (/where am i|what is this page/.test(raw)) keys.add('here')
  if (/\bads?\b|utm|roas|ad spend/.test(raw)) keys.add('ads')
  return keys
}

export function pageGuide(path: string): FbotArticle | undefined {
  const ctx = parseAdminPath(path)
  const ranked = FBOT_ARTICLES
    .filter((article) => article.page)
    .map((article) => {
      let n = 0
      for (const route of article.routes) {
        if (pathHitsRoute(ctx, route, article.tabs)) n = Math.max(n, route.length + (article.tabs?.length ? 25 : 0))
      }
      if (article.id === 'here-campaign-desk') {
        if (!/^\/admin\/campaigns\/[^/]+/.test(ctx.pathname)) n = 0
        else if (ctx.tab && ['safety', 'gifts', 'advocates'].includes(ctx.tab)) n = 0
        else n += 40
      }
      if (article.id === 'here-campaigns' && ctx.pathname === '/admin/campaigns') n += 40
      if (article.id === 'here-episode-editor' && ctx.desk === 'episode') n += 80
      if (article.id === 'here-episode-editor' && ctx.desk !== 'episode') n = 0
      if (article.id === 'here-topic' && ctx.desk === 'topic') n += 80
      if (article.id === 'here-topic' && ctx.desk !== 'topic') n = 0
      if (article.id === 'here-blog-post' && ctx.desk === 'post') n += 80
      if (article.id === 'here-blog-post' && ctx.desk !== 'post') n = 0
      if (article.id === 'here-blog' && ctx.desk === 'post') n = 0
      if (article.id === 'here-studio' && ctx.desk === 'topic') n = 0
      if (article.id === 'here-podcast-studio' && ctx.desk !== 'podcast') n = 0
      if (article.id === 'here' && ctx.pathname !== '/admin') n = 0
      return { article, n }
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
  return ranked[0]?.article
}

export function matchArticles(question: string, path: string, limit = 2): FbotArticle[] {
  const ctx = parseAdminPath(path)
  const raw = question.toLowerCase().replace(/['’]/g, '')
  const tokens = tokenize(question)
  if (isVagueQuestion(raw, tokens)) {
    const page = pageGuide(path)
    return page ? [page] : []
  }
  let ranked = FBOT_ARTICLES
    .map((article) => ({ article, score: scoreArticle(article, tokens, ctx, raw) }))
    .filter((row) => row.score >= 4)
    .sort((a, b) => b.score - a.score)

  const ids = new Set(ranked.map((row) => row.article.id))
  if (ids.has('record-track') && ids.has('edit-track')) {
    const wantEdit = tokens.includes('edit') && !tokens.includes('record')
    const wantRecord = tokens.includes('record') && !tokens.includes('edit')
    const drop = wantEdit ? 'record-track' : wantRecord ? 'edit-track' : ranked[0].article.id === 'record-track' ? 'edit-track' : 'record-track'
    ranked = ranked.filter((row) => row.article.id !== drop)
  }
  if (ids.has('campaigns') && ids.has('campaign-safety') && /go live|safety|dignity/.test(raw)) {
    ranked = ranked.filter((row) => row.article.id !== 'campaigns')
  }

  return ranked.slice(0, limit).map((row) => row.article)
}

export function liveAnswers(keys: Set<string>, snap: FbotSnapshot): FbotAnswer[] {
  const out: FbotAnswer[] = []
  if (keys.has('visits')) {
    out.push({
      source: 'live',
      title: 'Visits today',
      body: toBullets(
        [
          snap.visitsNote,
          snap.podcastPlaysToday != null
            ? `Podcast plays/downloads today: ${snap.podcastPlaysToday}.`
            : snap.podcastPlaysNote,
          `Subscribers: ${snap.subscribers} active (${snap.newSubs7d} new in 7 days).`,
          'Do this: open Analytics for the rest of traffic, or Podcast analytics for plays.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      links: [
        { label: 'Analytics', href: '/admin/analytics' },
        { label: 'Podcast analytics', href: '/admin/podcast?tab=analytics' },
      ],
    })
  }
  if (keys.has('next_blog')) {
    const lines = [
      snap.nextTopic
        ? `Next Studio topic: ${snap.nextTopic.title}${snap.nextTopic.detail ? ` (${snap.nextTopic.detail})` : ''}.`
        : 'No dated Studio topic is queued.',
      snap.scheduledPost
        ? `Scheduled blog: ${snap.scheduledPost.title}${snap.scheduledPost.detail ? ` (${snap.scheduledPost.detail})` : ''}.`
        : null,
      snap.nextDraft ? `Latest draft: ${snap.nextDraft.title}.` : 'No blog drafts.',
      `${snap.drafts} drafts · ${snap.published} published.`,
      snap.nextTopic?.href ? 'Do this: open the topic, then Blog → New from it.' : 'Do this: open Studio and add a topic.',
    ].filter(Boolean) as string[]
    out.push({
      source: 'live',
      title: 'Next to write / publish',
      body: toBullets(lines.join('\n')),
      links: [
        snap.nextTopic?.href ? { label: 'Open topic', href: snap.nextTopic.href } : { label: 'Studio', href: '/admin/studio' },
        snap.nextDraft?.href ? { label: 'Open draft', href: snap.nextDraft.href } : { label: 'Blog', href: '/admin/blog' },
      ],
    })
  }
  if (keys.has('drafts')) {
    out.push({
      source: 'live',
      title: 'Drafts',
      body: toBullets(
        [
          `${snap.drafts} blog draft${snap.drafts === 1 ? '' : 's'}.`,
          snap.nextDraft ? `Latest: ${snap.nextDraft.title}.` : null,
          snap.newsletterDrafts > 0 ? `${snap.newsletterDrafts} newsletter draft${snap.newsletterDrafts === 1 ? '' : 's'}.` : null,
          'Do this: open Blog and finish the latest draft.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      links: [{ label: 'Blog drafts', href: '/admin/blog' }],
    })
  }
  if (keys.has('subscribers')) {
    out.push({
      source: 'live',
      title: 'Subscribers',
      body: toBullets(
        [
          `${snap.subscribers} active.`,
          `${snap.newSubs7d} new in the last 7 days.`,
          snap.newsletterDrafts > 0 ? `${snap.newsletterDrafts} newsletter draft${snap.newsletterDrafts === 1 ? '' : 's'} waiting to send.` : null,
          'Do this: open Subscribers, or Newsletters → New to send.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      links: [{ label: 'Subscribers', href: '/admin/subscribers' }],
    })
  }
  if (keys.has('campaigns')) {
    out.push({
      source: 'live',
      title: 'Campaigns',
      body: toBullets(
        [
          `${snap.liveCampaigns} live campaign${snap.liveCampaigns === 1 ? '' : 's'}.`,
          `${snap.pendingGifts} gift${snap.pendingGifts === 1 ? '' : 's'} waiting for confirmation.`,
          snap.pendingGifts > 0 ? 'Do this: open Campaigns → Gifts and confirm or void pending gifts.' : 'Do this: open Campaigns to start or check a page.',
        ].join('\n'),
      ),
      links: [{ label: 'Campaigns', href: '/admin/campaigns' }],
    })
  }
  if (keys.has('ads')) {
    out.push({
      source: 'live',
      title: 'Ad campaigns',
      body: toBullets(
        [
          `${snap.activeAds} active ad campaign${snap.activeAds === 1 ? '' : 's'} in this admin.`,
          'Spend and returns are logged on Ad analytics — I do not pull Meta or Google Ads APIs.',
          'Do this: open Ad analytics to log spend or copy a UTM URL.',
        ].join('\n'),
      ),
      links: [{ label: 'Ad analytics', href: '/admin/ads' }],
    })
  }
  if (keys.has('podcast_queue') || keys.has('podcast_plays')) {
    out.push({
      source: 'live',
      title: 'Podcast queue',
      body: toBullets(
        [
          `${snap.episodesNeedAudio} episode${snap.episodesNeedAudio === 1 ? '' : 's'} still need audio.`,
          snap.nextEpisode ? `Next in production: ${snap.nextEpisode.title} (${snap.nextEpisode.detail}).` : null,
          snap.podcastPlaysToday != null ? `Plays/downloads today: ${snap.podcastPlaysToday}.` : snap.podcastPlaysNote,
          'Do this: open Production room and arm a person.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      links: [
        { label: 'Production room', href: '/admin/podcast?tab=studio' },
        snap.nextEpisode?.href ? { label: 'Open episode', href: snap.nextEpisode.href } : { label: 'Episodes', href: '/admin/podcast' },
      ],
    })
  }
  if (keys.has('attention')) {
    const bits = [
      snap.drafts > 0 ? `${snap.drafts} blog drafts` : null,
      snap.pendingGifts > 0 ? `${snap.pendingGifts} gifts to confirm` : null,
      snap.episodesNeedAudio > 0 ? `${snap.episodesNeedAudio} episodes need audio` : null,
      snap.inactiveCareers > 0 ? `${snap.inactiveCareers} inactive career listings` : null,
      snap.newsletterDrafts > 0 ? `${snap.newsletterDrafts} newsletter drafts` : null,
      snap.nextTopic ? `Next topic: ${snap.nextTopic.title}` : null,
    ].filter(Boolean)
    out.push({
      source: 'live',
      title: 'Attention',
      body: toBullets(
        (bits.length ? bits : ['Nothing flagged in the live snapshot.']).concat(['Do this: work the first item, then ask me again.']).join('\n'),
      ),
      links: [{ label: 'Dashboard', href: '/admin' }],
    })
  }
  return out
}

export function buildReply(question: string, path: string, snap: FbotSnapshot | null): {
  answers: FbotAnswer[]
  chips: string[]
} {
  const raw = question.toLowerCase().replace(/['’]/g, '')
  const tokens = tokenize(question)
  const keys = detectLiveKeys(raw, tokens)
  const vague = isVagueQuestion(raw, tokens)
  const guides = matchArticles(question, path, 1)
  const answers: FbotAnswer[] = []
  if (snap && !vague) answers.push(...liveAnswers(keys, snap))
  for (const article of guides) {
    if (answers.some((a) => a.title === article.title)) continue
    answers.push({
      source: article.page || article.id === 'here' ? 'page' : 'guide',
      title: article.title,
      body: toBullets(article.body),
      links: article.links,
    })
  }
  if (answers.length === 0) {
    const page = pageGuide(path)
    answers.push({
      source: 'page',
      title: page ? page.title : 'I do not have that as a live fact or a guide yet',
      body: toBullets(
        page
          ? page.body
          : 'Try: How do I record a track?\nWhat is the next blog?\nHow many visits today?',
      ),
      links: page?.links || [{ label: 'Dashboard', href: '/admin' }],
    })
  }
  return { answers, chips: chipsForPath(path) }
}
