import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'
import { sendBlogPostNotification, isEmailConfigured } from '@/src/lib/email/service'
import { contentFromDb } from '@/lib/content-db'

async function subscriberQuery(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  return supabase
    .from('newsletter_subscribers')
    .select('id, email, name, unsubscribe_token, preferences')
    .eq('status', 'active')
    .filter('preferences->blog_notifications', 'eq', 'true')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const { data: post } = await supabase.from('content').select('id, status, notification_sent_at').eq('id', id).single()
    if (!post) return NextResponse.json({ error: 'Blog post not found' }, { status: 404 })

    const { count } = await supabase
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .filter('preferences->blog_notifications', 'eq', 'true')

    return NextResponse.json({
      count: count ?? 0,
      sentAt: post.notification_sent_at,
      published: post.status === 'published',
      configured: isEmailConfigured(),
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load notification status' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    await requireAdmin()

    if (!isEmailConfigured()) {
      return NextResponse.json({
        error: 'Email delivery not configured. Add RESEND_API_KEY to send notifications.',
        configured: false,
      }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as { force?: boolean }

    const { data: row } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single()

    if (!row) {
      return NextResponse.json({ error: 'Blog post not found' }, { status: 404 })
    }

    const post = contentFromDb(row)

    if (post.status !== 'published') {
      return NextResponse.json({
        error: 'Can only send notifications for published posts',
      }, { status: 400 })
    }

    if (row.notification_sent_at && !body.force) {
      return NextResponse.json({
        error: 'Notification already sent for this post',
        sent_at: row.notification_sent_at,
      }, { status: 400 })
    }

    const { data: subscribers } = await subscriberQuery(supabase)

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({
        error: 'No subscribers opted into blog notifications',
      }, { status: 400 })
    }

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const subscriber of subscribers) {
      try {
        const result = await sendBlogPostNotification(
          post,
          subscriber.email,
          subscriber.id,
          subscriber.unsubscribe_token,
        )

        if (result.success) {
          results.sent++
        } else {
          results.failed++
          results.errors.push(`${subscriber.email}: ${result.error}`)
        }
      } catch (err) {
        results.failed++
        results.errors.push(`${subscriber.email}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (results.sent > 0) {
      await supabase
        .from('content')
        .update({ notification_sent_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({
      success: results.failed === 0,
      message: `Sent to ${results.sent} subscribers. ${results.failed} failed.`,
      results,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Blog notification error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
