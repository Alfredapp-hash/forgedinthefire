import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase } = await withStudioAdmin()
    const { data, error } = await supabase.from('podcast_episodes').select('*').eq('id', id).single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return studioError(err)
  }
}
