import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'

const DEFAULT_ACCOUNTS = [
  { platform: 'facebook', account_name: 'Facebook Page' },
  { platform: 'instagram', account_name: 'Instagram' },
  { platform: 'linkedin', account_name: 'LinkedIn' },
  { platform: 'mock', account_name: 'Mock Dev Account' },
]

export async function GET() {
  try {
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    let { data, error } = await supabase.from('social_accounts').select('*').order('platform')
    if (error) throw error

    if (!data?.length) {
      await supabase.from('social_accounts').insert(DEFAULT_ACCOUNTS)
      const res = await supabase.from('social_accounts').select('*').order('platform')
      data = res.data
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

    const body = await request.json() as { id: string; enabled?: boolean; connection_status?: string }
    const { data, error } = await supabase
      .from('social_accounts')
      .update({ enabled: body.enabled, connection_status: body.connection_status, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
