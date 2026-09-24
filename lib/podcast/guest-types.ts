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
  'cue',
  'tally',
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

export const GUEST_TALLY_PHASES = ['waiting', 'count-in', 'rec', 'stopped'] as const
export type GuestTallyPhase = (typeof GUEST_TALLY_PHASES)[number]
export const GUEST_TALLY_PHASE_SET = new Set<string>(GUEST_TALLY_PHASES)

export function parseTallyPhase(value: unknown): GuestTallyPhase | null {
  return typeof value === 'string' && GUEST_TALLY_PHASE_SET.has(value) ? (value as GuestTallyPhase) : null
}

export function describeGuestTally(phase: GuestTallyPhase): { label: string; tone: GuestUiTone } {
  if (phase === 'count-in') return { label: 'Count-in', tone: 'wait' }
  if (phase === 'rec') return { label: '● REC', tone: 'rec' }
  if (phase === 'stopped') return { label: 'Stopped', tone: 'idle' }
  return { label: 'Waiting', tone: 'wait' }
}

export function iceLooksUp(ice?: RTCIceConnectionState | '') {
  return ice === 'connected' || ice === 'completed'
}

/**
 * A live-with-host presence that hasn't heartbeat in ~2-3 beats (guest posts one
 * every 8s). Older than this and the tab is almost certainly gone even though the
 * peer never fired `failed`. Admin-side only — the guest always knows its own tab
 * is open, so it never marks itself stale.
 */
export const GUEST_STALE_MS = 20_000

export function guestLooksStale(lastSeenAt?: string | null, now = Date.now()) {
  if (!lastSeenAt) return false
  const seen = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(seen)) return false
  return now - seen > GUEST_STALE_MS
}

/**
 * Human connection-state progression for the booth UI, replacing the raw ICE
 * enum. `reconnecting` covers a `disconnected` drop or an in-flight ICE restart.
 */
export function describeIceProgress(
  ice: RTCIceConnectionState | '',
  opts: { reconnecting?: boolean } = {},
): { label: string; tone: GuestUiTone } {
  if (opts.reconnecting && ice !== 'connected' && ice !== 'completed') {
    return { label: 'Reconnecting', tone: 'warn' }
  }
  switch (ice) {
    case 'new':
      return { label: 'Gathering', tone: 'wait' }
    case 'checking':
      return { label: 'Checking', tone: 'wait' }
    case 'connected':
    case 'completed':
      return { label: 'Connected', tone: 'live' }
    case 'disconnected':
      return { label: 'Reconnecting', tone: 'warn' }
    case 'failed':
      return { label: 'Failed', tone: 'fail' }
    case 'closed':
      return { label: 'Closed', tone: 'idle' }
    default:
      return { label: 'Gathering', tone: 'wait' }
  }
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
  /** Admin-side: guest hasn't heartbeat in ~2-3 beats. Surfaces as "not responding". */
  stale?: boolean
}): { phase: GuestUiPhase; label: string; tone: GuestUiTone } {
  const { side, state, revoked, expired, ice } = opts
  if (side === 'admin' && !opts.hasInvite) return { phase: 'none', label: 'No invite', tone: 'idle' }
  if (revoked) return { phase: 'revoked', label: 'Revoked', tone: 'fail' }
  if (expired) return { phase: 'expired', label: 'Expired', tone: 'fail' }
  if (state === 'left' && !iceLooksUp(ice)) {
    return { phase: 'left', label: side === 'admin' ? 'Guest left' : 'You left', tone: 'idle' }
  }

  // A guest that stopped heartbeating but never fired `failed` (tab closed / put
  // to sleep) should read as "not responding" instead of a stuck live badge.
  if (opts.stale && side === 'admin' && state !== 'left') {
    return { phase: 'dropped', label: 'Guest not responding', tone: 'warn' }
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
