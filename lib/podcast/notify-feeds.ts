import 'server-only'

/**
 * Instant feed-update notification — PodPing + WebSub.
 *
 * Podcast platforms (Apple, Spotify, Amazon, Pocket Casts…) ingest our RSS feed
 * by polling it on their own schedule, often hours apart. PodPing (a Podcasting
 * 2.0 notification network) and WebSub (pub/sub hubs) let us *tell* them the
 * moment an episode publishes, so a new episode can appear in seconds instead of
 * hours.
 *
 * Both are env-gated and fail SOFT: if the secrets aren't set, or a hub is down,
 * we log once and return — publishing is never blocked by a notification.
 *   PODPING_TOKEN   — auth token from podping.cloud (free for indexed shows)
 *   PODPING_URL     — override the endpoint (default https://podping.cloud/)
 *   WEBSUB_HUB      — a WebSub hub URL (e.g. https://pubsubhubbub.appspot.com/)
 */

const NOTIFY_TIMEOUT_MS = 8000
let warnedPodping = false
let warnedWebSub = false

export type FeedNotifyResult = {
  podping: 'sent' | 'skipped' | 'failed'
  websub: 'sent' | 'skipped' | 'failed'
}

async function withTimeout(run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), NOTIFY_TIMEOUT_MS)
  try {
    return await run(ctrl.signal)
  } finally {
    clearTimeout(timer)
  }
}

/** PodPing: a single GET with the feed URL and an auth token. */
async function pingPodping(feedUrl: string): Promise<FeedNotifyResult['podping']> {
  const token = process.env.PODPING_TOKEN
  if (!token) {
    if (!warnedPodping) {
      warnedPodping = true
      console.warn('[notify-feeds] PODPING_TOKEN not set — skipping PodPing notifications')
    }
    return 'skipped'
  }
  const base = (process.env.PODPING_URL || 'https://podping.cloud/').replace(/\/+$/, '/')
  const url = `${base}?url=${encodeURIComponent(feedUrl)}&reason=update&medium=podcast`
  try {
    const res = await withTimeout((signal) =>
      fetch(url, {
        method: 'GET',
        headers: { Authorization: token, 'User-Agent': 'ForgedInTheFire/1.0 (+https://forgedinthefireohio.org)' },
        signal,
        cache: 'no-store',
      }),
    )
    if (!res.ok) {
      console.error('[notify-feeds] PodPing returned', res.status)
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error('[notify-feeds] PodPing error:', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

/** WebSub: POST hub.mode=publish&hub.url=<feed> to the configured hub. */
async function pingWebSub(feedUrl: string): Promise<FeedNotifyResult['websub']> {
  const hub = process.env.WEBSUB_HUB
  if (!hub) {
    if (!warnedWebSub) {
      warnedWebSub = true
      console.warn('[notify-feeds] WEBSUB_HUB not set — skipping WebSub notifications')
    }
    return 'skipped'
  }
  const body = new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': feedUrl })
  try {
    const res = await withTimeout((signal) =>
      fetch(hub, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal,
        cache: 'no-store',
      }),
    )
    // Hubs reply 2xx (often 202/204) on accept.
    if (!res.ok) {
      console.error('[notify-feeds] WebSub hub returned', res.status)
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error('[notify-feeds] WebSub error:', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

/**
 * Notify PodPing and the WebSub hub that the public feed changed. Call it after
 * an episode goes live (cron publish, or a manual status→published). Never throws
 * and never blocks the caller: both notifications run in parallel and fail soft.
 */
export async function notifyFeedUpdate(feedUrl: string): Promise<FeedNotifyResult> {
  const [podping, websub] = await Promise.all([pingPodping(feedUrl), pingWebSub(feedUrl)])
  const result = { podping, websub }
  if (podping === 'sent' || websub === 'sent') {
    console.info('[notify-feeds] feed update announced', JSON.stringify(result))
  }
  return result
}
