import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  dispatchAndRecord,
  campaignStatusFrom,
  type DispatchAccount,
  type DispatchPost,
} from '@/lib/social/post'

export const dynamic = 'force-dynamic'

/**
 * One-click publish: post a campaign's posts to all selected connected accounts
 * right now. Body (all optional): { accountIds?: string[], postIds?: string[],
 * force?: boolean }. Without a selection every not-yet-posted post is sent. Already
 * posted rows are skipped unless `force`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const admin = await createAdminClient()

    const body = (await request.json().catch(() => ({}))) as {
      accountIds?: string[]
      postIds?: string[]
      force?: boolean
    }
    const accountIds = new Set((body.accountIds || []).filter(Boolean))
    const postIds = new Set((body.postIds || []).filter(Boolean))

    const { data: posts, error: postsError } = await admin
      .from('social_posts')
      .select('id, campaign_id, platform, caption, link_url, media_urls, account_id, status')
      .eq('campaign_id', id)
    if (postsError) throw postsError
    if (!posts?.length) return NextResponse.json({ error: 'This campaign has no posts' }, { status: 400 })

    const { data: accounts, error: accErr } = await admin
      .from('social_accounts')
      .select('id, platform, account_id, access_token, connection_status, enabled')
    if (accErr) throw accErr

    const accountsById = new Map<string, DispatchAccount>()
    const accountsByPlatform = new Map<string, DispatchAccount>()
    for (const a of (accounts || []) as DispatchAccount[]) {
      accountsById.set(a.id, a)
      const key = (a.platform || '').toLowerCase()
      if (!accountsByPlatform.has(key)) accountsByPlatform.set(key, a)
    }

    // Which accounts were selected (by id). Also resolve to platforms so posts
    // without an account_id still match a selected platform.
    const selectedPlatforms = new Set<string>()
    for (const aid of accountIds) {
      const a = accountsById.get(aid)
      if (a) selectedPlatforms.add((a.platform || '').toLowerCase())
    }

    const targets = (posts as (DispatchPost & { status: string })[]).filter((p) => {
      if (postIds.size) return postIds.has(p.id)
      if (!body.force && (p.status === 'posted' || p.status === 'mock_posted')) return false
      if (accountIds.size === 0) return true
      if (p.account_id && accountIds.has(p.account_id)) return true
      return selectedPlatforms.has((p.platform || '').toLowerCase())
    })

    if (!targets.length) return NextResponse.json({ error: 'No matching posts to publish', results: [] }, { status: 400 })

    const results = await dispatchAndRecord(admin, targets, accountsById, accountsByPlatform)
    const campaign_status = campaignStatusFrom(results)
    await admin
      .from('social_campaigns')
      .update({ campaign_status, updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({
      campaign_status,
      posted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('social publish failed:', err)
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 })
  }
}
