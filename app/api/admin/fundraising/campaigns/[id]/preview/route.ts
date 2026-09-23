import { NextResponse } from 'next/server'
import { fundraisingError, withFundraisingAdmin } from '@/lib/fundraising/access'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withFundraisingAdmin()
    const { id } = await params
    const { data, error } = await supabase
      .from('fundraising_campaigns')
      .select('preview_token, slug')
      .eq('id', id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({
      token: data.preview_token,
      url: `/preview/campaign/${data.preview_token}`,
    })
  } catch (err) {
    return fundraisingError(err)
  }
}
