export const GUEST_STATES = ['pending', 'joined', 'connected', 'recording', 'left'] as const
export type GuestConnectionState = (typeof GUEST_STATES)[number]

export type GuestInviteRow = {
  id: string
  episode_id: string
  token_hash: string
  label: string | null
  expires_at: string
  revoked_at: string | null
  guest_name: string | null
  guest_joined_at: string | null
  last_seen_at: string | null
  connection_state: GuestConnectionState
  take_url: string | null
  take_mime: string | null
  camera_url: string | null
  camera_mime: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GuestInvitePublic = {
  id: string
  episodeTitle: string
  label: string | null
  guestName: string | null
  expiresAt: string
  state: GuestConnectionState
  recording: boolean
  takeReady: boolean
  takeUrl: string | null
  cameraReady: boolean
  cameraUrl: string | null
}

export type GuestInviteAdmin = GuestInvitePublic & {
  url?: string
  rawToken?: string
  lastSeenAt: string | null
  revoked: boolean
  expired: boolean
}

export type GuestSignal = {
  id: number
  from_role: 'admin' | 'guest'
  kind: string
  payload: Record<string, unknown>
  created_at: string
}

export function guestLinkPath(rawToken: string) {
  return `/studio/join/${rawToken}`
}

export function inviteLooksLive(expiresAt: string, revoked?: boolean) {
  if (revoked) return false
  return new Date(expiresAt).getTime() > Date.now()
}
