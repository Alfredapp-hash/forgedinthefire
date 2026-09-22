import { NextResponse } from 'next/server'
import { studioError, withStudioAdmin } from '@/lib/studio/api'
import { adminInvite } from '@/lib/podcast/guest-invite'
import { GUEST_STATES, type GuestInviteRow } from '@/lib/podcast/guest-types'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await withStudioAdmin()
    const { id } = await context.params
    const body = (await request.json()) as {
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
    const { data: episode } = await supabase
      .from('podcast_episodes')
      .select('title')
      .eq('id', data.episode_id)
      .maybeSingle()
    return NextResponse.json({ invite: adminInvite(data as GuestInviteRow, episode?.title || 'Episode') })
  } catch (err) {
    return studioError(err)
  }
}
