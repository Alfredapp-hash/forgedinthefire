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

export const GUEST_SIGNAL_KINDS = [
  'offer',
  'answer',
  'ice',
  'hangup',
  'record',
  'talkback',
  'camera',
  'mute',
  'reconnect',
] as const

export type GuestSignalKind = (typeof GUEST_SIGNAL_KINDS)[number]

export const GUEST_SIGNAL_KIND_SET = new Set<string>(GUEST_SIGNAL_KINDS)

export type GuestSignal = {
  id: number
  from_role: 'admin' | 'guest'
  kind: string
  payload: Record<string, unknown>
  created_at: string
}

export type GuestUiPhase =
  | 'none'
  | 'waiting'
  | 'linking'
  | 'connected'
  | 'recording'
  | 'dropped'
  | 'failed'
  | 'left'
  | 'revoked'
  | 'expired'

export type GuestUiTone = 'idle' | 'wait' | 'live' | 'rec' | 'warn' | 'fail'

export function iceLooksUp(ice?: RTCIceConnectionState | '') {
  return ice === 'connected' || ice === 'completed'
}

export function iceLooksDead(ice?: RTCIceConnectionState | '') {
  return ice === 'failed' || ice === 'closed'
}

export function iceLooksDropped(ice?: RTCIceConnectionState | '') {
  return ice === 'disconnected'
}

export function describeGuestSession(opts: {
  side: 'admin' | 'guest'
  hasInvite?: boolean
  state?: GuestConnectionState | null
  revoked?: boolean
  expired?: boolean
  ice?: RTCIceConnectionState | ''
  recording?: boolean
}): { phase: GuestUiPhase; label: string; tone: GuestUiTone } {
  const { side, state, revoked, expired, ice } = opts
  if (side === 'admin' && !opts.hasInvite) return { phase: 'none', label: 'No invite', tone: 'idle' }
  if (revoked) return { phase: 'revoked', label: 'Revoked', tone: 'fail' }
  if (expired) return { phase: 'expired', label: 'Expired', tone: 'fail' }
  if (state === 'left' && !iceLooksUp(ice)) {
    return { phase: 'left', label: side === 'admin' ? 'Guest left' : 'You left', tone: 'idle' }
  }

  const rec = Boolean(opts.recording || state === 'recording')
  if (iceLooksDead(ice)) {
    return {
      phase: 'failed',
      label: rec ? '● REC — peer failed' : 'Peer failed',
      tone: 'fail',
    }
  }
  if (iceLooksDropped(ice)) {
    return {
      phase: 'dropped',
      label: rec ? '● REC — connection dropped' : side === 'admin' ? 'Guest disconnected' : 'Connection dropped',
      tone: 'warn',
    }
  }
  if (rec) {
    return {
      phase: 'recording',
      label: side === 'admin' ? '● REC — guest live' : '● REC — host is rolling',
      tone: 'rec',
    }
  }
  if (iceLooksUp(ice) || state === 'connected') {
    return {
      phase: 'connected',
      label: side === 'admin' ? 'Guest connected' : 'Live with host',
      tone: 'live',
    }
  }
  if (state === 'joined' || ice === 'checking' || ice === 'new') {
    return {
      phase: 'linking',
      label: side === 'admin' ? 'Guest in booth — linking' : 'Linking to host',
      tone: 'wait',
    }
  }
  return {
    phase: 'waiting',
    label: side === 'admin' ? 'Waiting for guest' : 'Waiting for host',
    tone: 'idle',
  }
}

export function guestLinkPath(rawToken: string) {
  return `/studio/join/${rawToken}`
}

export function inviteLooksLive(expiresAt: string, revoked?: boolean) {
  if (revoked) return false
  return new Date(expiresAt).getTime() > Date.now()
}
