import { NextResponse, type NextRequest } from 'next/server'
import { liveError, livePatchFromBody, withLiveAdmin } from '@/lib/podcast/live/admin'

export const dynamic = 'force-dynamic'

/** List recent live sessions (newest first). */
export async function GET(request: NextRequest) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 30))
    const { data, error } = await admin.supabase
      .from('podcast_live_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return NextResponse.json({ sessions: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return liveError(err)
  }
}

/** Schedule a new live show. Always starts as `scheduled`; go live with PATCH action=start. */
export async function POST(request: NextRequest) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    if (body.title === undefined) body.title = ''
    const { patch, errors } = livePatchFromBody(body)
    if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    const { data, error } = await admin.supabase
      .from('podcast_live_sessions')
      .insert({ ...patch, status: 'scheduled', created_by: admin.user.email })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ session: data }, { status: 201 })
  } catch (err) {
    return liveError(err)
  }
}
