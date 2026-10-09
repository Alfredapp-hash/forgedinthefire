import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** One connected social account (tokens stay server-side; never returned to the client). */
export type DispatchAccount = {
  id: string
  platform: string
  account_id?: string | null
  access_token?: string | null
  connection_status?: string | null
  enabled?: boolean | null
}

export type DispatchPost = {
  id: string
  platform: string
  caption: string
  link_url?: string | null
  media_urls?: string[] | null
  account_id?: string | null
}

export type DispatchResult = {
  postId: string
  platform: string
  ok: boolean
  status: 'posted' | 'mock_posted' | 'failed'
  externalId?: string | null
  error?: string | null
}

const FB_API = 'https://graph.facebook.com/v21.0'

function withLink(caption: string, link?: string | null) {
  if (!link) return caption
  return caption.includes(link) ? caption : `${caption}\n\n${link}`
}

async function postFacebook(acc: DispatchAccount, post: DispatchPost): Promise<Partial<DispatchResult>> {
  if (!acc.account_id || !acc.access_token) return { ok: false, status: 'failed', error: 'Facebook page id or token missing' }
  const body = new URLSearchParams()
  body.set('message', withLink(post.caption, post.link_url))
  if (post.link_url) body.set('link', post.link_url)
  body.set('access_token', acc.access_token)
  const res = await fetch(`${FB_API}/${acc.account_id}/feed`, { method: 'POST', body })
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!res.ok || j.error) return { ok: false, status: 'failed', error: j.error?.message || `Facebook error ${res.status}` }
  return { ok: true, status: 'posted', externalId: j.id ?? null }
}

async function postInstagram(acc: DispatchAccount, post: DispatchPost): Promise<Partial<DispatchResult>> {
  const image = post.media_urls?.[0]
  if (!acc.account_id || !acc.access_token) return { ok: false, status: 'failed', error: 'Instagram account id or token missing' }
  if (!image) return { ok: false, status: 'failed', error: 'Instagram needs an image or video — add media to this post' }
  const create = new URLSearchParams({ image_url: image, caption: withLink(post.caption, post.link_url), access_token: acc.access_token })
  const c = await fetch(`${FB_API}/${acc.account_id}/media`, { method: 'POST', body: create })
  const cj = (await c.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!c.ok || !cj.id) return { ok: false, status: 'failed', error: cj.error?.message || `Instagram container error ${c.status}` }
  const pub = new URLSearchParams({ creation_id: cj.id, access_token: acc.access_token })
  const p = await fetch(`${FB_API}/${acc.account_id}/media_publish`, { method: 'POST', body: pub })
  const pj = (await p.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!p.ok || !pj.id) return { ok: false, status: 'failed', error: pj.error?.message || `Instagram publish error ${p.status}` }
  return { ok: true, status: 'posted', externalId: pj.id ?? null }
}

async function postLinkedIn(acc: DispatchAccount, post: DispatchPost): Promise<Partial<DispatchResult>> {
  if (!acc.account_id || !acc.access_token) return { ok: false, status: 'failed', error: 'LinkedIn URN or token missing' }
  const author = acc.account_id.startsWith('urn:') ? acc.account_id : `urn:li:person:${acc.account_id}`
  const payload = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: withLink(post.caption, post.link_url) },
        shareMediaCategory: post.link_url ? 'ARTICLE' : 'NONE',
        ...(post.link_url ? { media: [{ status: 'READY', originalUrl: post.link_url }] } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${acc.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  })
  const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok) return { ok: false, status: 'failed', error: j.message || `LinkedIn error ${res.status}` }
  return { ok: true, status: 'posted', externalId: res.headers.get('x-restli-id') || j.id || null }
}

/**
 * Post one caption to one account's platform. Returns a structured result — it
 * never throws. 'mock' always succeeds (dev). Real platforms use the account's
 * stored token; a missing/expired token yields a clear failure, not a crash.
 */
export async function dispatchPost(acc: DispatchAccount | null, post: DispatchPost): Promise<DispatchResult> {
  const base = { postId: post.id, platform: acc?.platform || post.platform }
  try {
    const platform = (acc?.platform || post.platform || '').toLowerCase()
    if (platform === 'mock') return { ...base, ok: true, status: 'mock_posted', externalId: `mock-${post.id.slice(0, 8)}` }
    if (!acc) return { ...base, ok: false, status: 'failed', error: 'No connected account for this platform' }
    if (acc.enabled === false) return { ...base, ok: false, status: 'failed', error: 'Account is disabled' }
    if (acc.connection_status && acc.connection_status !== 'connected')
      return { ...base, ok: false, status: 'failed', error: `Account not connected (${acc.connection_status})` }
    let r: Partial<DispatchResult>
    if (platform === 'facebook') r = await postFacebook(acc, post)
    else if (platform === 'instagram') r = await postInstagram(acc, post)
    else if (platform === 'linkedin') r = await postLinkedIn(acc, post)
    else if (platform === 'tiktok') r = { ok: false, status: 'failed', error: 'TikTok needs a video upload — not supported from here yet' }
    else r = { ok: false, status: 'failed', error: `Unsupported platform: ${platform}` }
    return { ...base, ...r } as DispatchResult
  } catch (err) {
    return { ...base, ok: false, status: 'failed', error: err instanceof Error ? err.message : 'Dispatch error' }
  }
}

/** Dispatch each post and record the outcome on its row. Returns per-post results. */
export async function dispatchAndRecord(
  admin: SupabaseClient,
  posts: DispatchPost[],
  accountsById: Map<string, DispatchAccount>,
  accountsByPlatform: Map<string, DispatchAccount>,
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []
  for (const post of posts) {
    const acc =
      (post.account_id ? accountsById.get(post.account_id) : undefined) ||
      accountsByPlatform.get((post.platform || '').toLowerCase()) ||
      null
    const r = await dispatchPost(acc, post)
    await admin
      .from('social_posts')
      .update({
        status: r.status,
        posted_at: r.ok ? new Date().toISOString() : null,
        external_post_id: r.externalId ?? null,
        error_message: r.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id)
    results.push(r)
  }
  return results
}

/** Roll up per-post results into a campaign status. */
export function campaignStatusFrom(results: { ok: boolean }[]): 'posted' | 'partially_posted' | 'failed' {
  if (results.length === 0) return 'failed'
  const okCount = results.filter((r) => r.ok).length
  if (okCount === results.length) return 'posted'
  if (okCount === 0) return 'failed'
  return 'partially_posted'
}
