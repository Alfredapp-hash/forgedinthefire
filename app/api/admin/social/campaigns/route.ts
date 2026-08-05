import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const { data, error } = await supabase
      .from('social_campaigns')
      .select('*, social_posts(*)')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const body = await request.json() as {
      title: string
      source_type?: string
      source_id?: string
      posts?: { platform: string; caption: string; link_url?: string }[]
    }

    const { data: campaign, error } = await supabase
      .from('social_campaigns')
      .insert({
        title: body.title,
        source_type: body.source_type ?? 'blog_post',
        source_id: body.source_id,
        utm_campaign: 'forged-blog',
        campaign_status: 'draft',
      })
      .select()
      .single()

    if (error) throw error

    if (body.posts?.length) {
      await supabase.from('social_posts').insert(
        body.posts.map((p) => ({
          campaign_id: campaign.id,
          platform: p.platform,
          caption: p.caption,
          link_url: p.link_url,
          status: 'draft',
        }))
      )
    }

    return NextResponse.json(campaign, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
