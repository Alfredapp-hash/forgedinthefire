import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { studioError } from '@/lib/studio/api'
import { createServiceClient } from '@/lib/supabase/service'
import { adminInvite } from '@/lib/podcast/guest-invite'
import { GUEST_STATES, type GuestInviteRow } from '@/lib/podcast/guest-types'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const supabase = createServiceClient()
    const { id } = await context.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const body = (await request.json().catch(() => ({}))) as {
      revoke?: boolean
      connection_state?: string
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.revoke) {
      patch.revoked_at = new Date().toISOString()
      patch.connection_state = 'left'
    }
    if (body.connection_state && GUEST_STATES.includes(body.connection_state as (typeof GUEST_STATES)[number])) {
      patch.connection_state = body.connection_state
    }
    const { data, error } = await supabase
      .from('podcast_guest_invites')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    if (body.revoke) {
      // Revoked links keep no SDP/ICE (which carry IP candidates) around.
      await supabase.from('podcast_guest_signals').delete().eq('invite_id', id)
    }
    const { data: episode } = await supabase
      .from('podcast_episodes')
      .select('title')
      .eq('id', data.episode_id)
      .maybeSingle()
    return NextResponse.json(
      { invite: adminInvite(data as GuestInviteRow, episode?.title || 'Episode') },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return studioError(err)
  }
}
