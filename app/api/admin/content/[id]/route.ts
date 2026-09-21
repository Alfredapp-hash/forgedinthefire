import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'
import { contentFromDb, contentToDb } from '@/lib/content-db'
import { sendBlogPostNotification, isEmailConfigured } from '@/src/lib/email/service'
import type { ContentItem } from '@/src/features/content/types'
import { snapshotContent } from '@/lib/studio/revisions'
import { propagatePublicSurfaces } from '@/lib/studio/propagate'

async function maybeSendPublishNotification(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  id: string,
  previousStatus: string | undefined,
  updated: ContentItem
) {
  const justPublished =
    updated.status === 'published' &&
    previousStatus !== 'published' &&
    updated.sendBlogNotification &&
    !updated.notificationSentAt

  if (!justPublished || !isEmailConfigured()) return

  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, unsubscribe_token, preferences')
    .eq('status', 'active')
    .filter('preferences->blog_notifications', 'eq', 'true')

  if (!subscribers?.length) return

  let sent = 0
  for (const subscriber of subscribers) {
    try {
      const result = await sendBlogPostNotification(
        updated,
        subscriber.email,
        subscriber.id,
        subscriber.unsubscribe_token
      )
      if (result.success) sent++
    } catch {
      /* continue */
    }
  }

  if (sent > 0) {
    await supabase
      .from('content')
      .update({ notification_sent_at: new Date().toISOString() })
      .eq('id', id)
    updated.notificationSentAt = new Date().toISOString()
  }
}

// GET /api/admin/content/[id] - Get single content item
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    await requireAdmin()

    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(contentFromDb(data))
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Content get error:', err)
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 })
  }
}

// PATCH /api/admin/content/[id] - Update content
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const user = await requireAdmin()

    const { data: existing } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single()

    const body = await request.json()
    const dbPatch = contentToDb(body)

    const nextStatus = (dbPatch.status as string | undefined) ?? existing?.status
    const nextTemplate = (dbPatch.template as string | undefined) ?? existing?.template
    const nextConsent =
      dbPatch.consent_confirmed !== undefined
        ? Boolean(dbPatch.consent_confirmed)
        : Boolean(existing?.consent_confirmed)

    if (nextStatus === 'published' && nextTemplate === 'impact-story' && !nextConsent) {
      return NextResponse.json(
        { error: 'Survivor consent must be confirmed before publishing an impact story' },
        { status: 400 },
      )
    }

    if (nextStatus !== 'published' && existing?.status === 'published' && dbPatch.published_at === undefined) {
      dbPatch.published_at = null
    }

    try {
      const admin = await createAdminClient()
      if (existing) await snapshotContent(admin, id, existing, user.email)
    } catch (snapErr) {
      console.warn('content revision snapshot skipped', snapErr)
    }

    const { data, error } = await supabase
      .from('content')
      .update(dbPatch)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const item = contentFromDb(data)
    await maybeSendPublishNotification(supabase, id, existing?.status, item)
    if (nextStatus === 'published' || existing?.status === 'published') {
      propagatePublicSurfaces({ blogSlug: item.slug })
    }

    return NextResponse.json(item)
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Content update error:', err)
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 })
  }
}

// DELETE /api/admin/content/[id] - Delete content
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    await requireAdmin()

    const { error } = await supabase.from('content').delete().eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Content delete error:', err)
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 })
  }
}
