import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const { data: existing, error } = await supabase
      .from('podcast_episodes')
      .select('preview_token, slug, title')
      .eq('id', id)
      .single()
    if (error) throw error
    let token = existing.preview_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      await supabase.from('podcast_episodes').update({ preview_token: token }).eq('id', id)
    }
    return NextResponse.json({
      token,
      url: `/preview/podcast/${token}`,
      title: existing.title,
    })
  } catch (err) {
    return studioError(err)
  }
}
