import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const [subs, posts, newSubsRes] = await Promise.all([
      supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('content').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ])

    return NextResponse.json({
      operational: {
        activeSubscribers: subs.count ?? 0,
        newSubscribers7d: newSubsRes.count ?? 0,
        publishedPosts: posts.count ?? 0,
      },
      ga4: null,
      ga4Configured: Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_CLIENT_EMAIL),
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
