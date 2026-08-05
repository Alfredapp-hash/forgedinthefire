import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Cron: publish scheduled content posts whose scheduled_for has passed */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = await createAdminClient()
    const now = new Date().toISOString()

    const { data: due, error } = await admin
      .from('content')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)

    if (error) throw error

    if (!due?.length) {
      return NextResponse.json({ published: 0 })
    }

    const ids = due.map((r) => r.id)
    const { error: updateError } = await admin
      .from('content')
      .update({ status: 'published', published_at: now })
      .in('id', ids)

    if (updateError) throw updateError

    return NextResponse.json({ published: ids.length, ids })
  } catch (err) {
    console.error('Scheduled publish cron error:', err)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
