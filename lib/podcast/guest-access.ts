import { createAdminClient } from '@/lib/supabase/server'
import {
  hashGuestToken,
  inviteIsLive,
  publicInvite,
  type GuestInviteRow,
} from '@/lib/podcast/guest-invite'
import type { GuestConnectionState } from '@/lib/podcast/guest-types'

export async function guestAdminDb() {
  return createAdminClient()
}

export async function loadInviteByToken(token: string) {
  const supabase = await guestAdminDb()
  const hash = hashGuestToken(token)
  const { data: row, error } = await supabase
    .from('podcast_guest_invites')
    .select('*')
    .eq('token_hash', hash)
    .maybeSingle()
  if (error) throw error
  if (!row) return { supabase, row: null, episodeTitle: '', live: false }
  const invite = row as GuestInviteRow
  const { data: episode } = await supabase
    .from('podcast_episodes')
    .select('title')
    .eq('id', invite.episode_id)
    .maybeSingle()
  return {
    supabase,
    row: invite,
    episodeTitle: episode?.title || 'Forged in the Fire',
    live: inviteIsLive(invite),
  }
}

export function denyGuest(row: GuestInviteRow | null, live: boolean) {
  if (!row) return 'Invite not found'
  if (row.revoked_at) return 'This invite was revoked'
  if (!live) return 'This invite has expired'
  return null
}

export function sessionPayload(row: GuestInviteRow, episodeTitle: string) {
  return publicInvite(row, episodeTitle)
}

export async function touchInvite(
  supabase: Awaited<ReturnType<typeof guestAdminDb>>,
  id: string,
  patch: Partial<GuestInviteRow> & { connection_state?: GuestConnectionState },
) {
  const { data, error } = await supabase
    .from('podcast_guest_invites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GuestInviteRow
}
