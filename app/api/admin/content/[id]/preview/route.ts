import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createAdminClient()
    const { data: existing } = await supabase
      .from('content')
      .select('preview_token, slug, title')
      .eq('id', id)
      .single()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    let token = existing.preview_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      await supabase.from('content').update({ preview_token: token }).eq('id', id)
    }
    return NextResponse.json({
      token,
      url: `/preview/blog/${token}`,
      title: existing.title,
    })
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to create preview' }, { status: 500 })
  }
}
