import type { GuestInviteAdmin, GuestInvitePublic, GuestSignal } from '@/lib/podcast/guest-types'

const SESSION_KEY = 'fitf-guest-session'
const sessions = new Map<string, string>()

/** Short, non-reversible tag so sessionStorage never holds the invite token itself. */
function tokenTag(token: string) {
  let h = 2166136261
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** Device session minted by Join. Survives a reload of this tab only. */
export function getGuestSession(token: string) {
  const mem = sessions.get(token)
  if (mem) return mem
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { t?: string; s?: string }
    if (parsed.t === tokenTag(token) && parsed.s) {
      sessions.set(token, parsed.s)
      return parsed.s
    }
  } catch {
    /* storage blocked */
  }
  return null
}

export function setGuestSession(token: string, session: string | null) {
  if (!session) {
    clearGuestSession(token)
    return
  }
  sessions.set(token, session)
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ t: tokenTag(token), s: session }))
  } catch {
    /* storage blocked: memory copy still works for this page */
  }
}

export function clearGuestSession(token: string) {
  sessions.delete(token)
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function guestHeaders(token: string, json = false): Record<string, string> {
  const out: Record<string, string> = {}
  if (json) out['Content-Type'] = 'application/json'
  const session = getGuestSession(token)
  if (session) out['x-guest-session'] = session
  return out
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export async function fetchGuestSession(token: string) {
  return readJson<GuestInvitePublic>(
    await fetch(`/api/studio/guest/${token}`, { cache: 'no-store', referrerPolicy: 'no-referrer' }),
  )
}

export async function postGuestSession(
  token: string,
  body: {
    action: 'join' | 'heartbeat' | 'leave' | 'connected'
    name?: string
    /** Join only: guest accepted the recording notice. */
    consent?: boolean
    /** Join only: guest chose audio only. */
    audioOnly?: boolean
  },
) {
  const data = await readJson<GuestInvitePublic & { guestSession?: string | null; signalCursor?: number }>(
    await fetch(`/api/studio/guest/${token}`, {
      method: 'POST',
      headers: guestHeaders(token, true),
      body: JSON.stringify(body),
      referrerPolicy: 'no-referrer',
      keepalive: body.action === 'leave',
    }),
  )
  if (body.action === 'join' && data.guestSession) setGuestSession(token, data.guestSession)
  if (body.action === 'leave') clearGuestSession(token)
  const { guestSession: _omit, ...session } = data
  void _omit
  /** signalCursor (join only): last host signal id before this join; older ones are history. */
  return session as GuestInvitePublic & { signalCursor?: number }
}

export async function pullGuestSignals(token: string, after: number) {
  const res = await fetch(`/api/studio/guest/${token}/signal?after=${after}`, {
    cache: 'no-store',
    headers: guestHeaders(token),
    referrerPolicy: 'no-referrer',
  })
  return readJson<{ signals: GuestSignal[]; session: GuestInvitePublic }>(res)
}

export async function pullAdminSignals(inviteId: string, after: number) {
  const res = await fetch(`/api/admin/podcast/invites/${inviteId}/signal?after=${after}`, { cache: 'no-store' })
  return readJson<{ signals: GuestSignal[]; invite: GuestInviteAdmin; live: boolean }>(res)
}

export async function pushGuestSignal(token: string, kind: string, payload: Record<string, unknown> = {}) {
  return readJson<{ ok: true }>(
    await fetch(`/api/studio/guest/${token}/signal`, {
      method: 'POST',
      headers: guestHeaders(token, true),
      body: JSON.stringify({ role: 'guest', kind, payload }),
      referrerPolicy: 'no-referrer',
      keepalive: kind === 'hangup',
    }),
  )
}

export async function pushAdminSignal(inviteId: string, kind: string, payload: Record<string, unknown> = {}) {
  return readJson<{ ok: true }>(
    await fetch(`/api/admin/podcast/invites/${inviteId}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, payload }),
    }),
  )
}

export async function listAdminInvites(episodeId: string) {
  const res = await fetch(`/api/admin/podcast/invites?episode_id=${encodeURIComponent(episodeId)}`, {
    cache: 'no-store',
  })
  return readJson<{ invites: GuestInviteAdmin[] }>(res)
}

export async function createAdminInvite(episodeId: string, hours: number, label?: string) {
  const res = await fetch('/api/admin/podcast/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ episode_id: episodeId, hours, label }),
  })
  return readJson<{ invite: GuestInviteAdmin }>(res)
}

export async function revokeAdminInvite(id: string) {
  const res = await fetch(`/api/admin/podcast/invites/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revoke: true }) })
  return readJson<{ invite: GuestInviteAdmin }>(res)
}

export async function setAdminInviteState(id: string, connection_state: GuestInvitePublic['state']) {
  const res = await fetch(`/api/admin/podcast/invites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection_state }),
  })
  return readJson<{ invite: GuestInviteAdmin }>(res)
}

export async function requestGuestTakeUpload(
  token: string,
  mime: string,
  size: number,
  kind: 'audio' | 'camera' = 'audio',
) {
  return readJson<{ signedUrl: string; path: string; publicUrl: string; mime?: string }>(
    await fetch(`/api/studio/guest/${token}/take`, {
      method: 'POST',
      headers: guestHeaders(token, true),
      body: JSON.stringify({ mime, size, kind }),
      referrerPolicy: 'no-referrer',
    }),
  )
}

export async function finalizeGuestTake(
  token: string,
  path: string,
  publicUrl: string,
  mime: string,
  kind: 'audio' | 'camera' = 'audio',
) {
  return readJson<{ takeReady: boolean; cameraReady: boolean }>(
    await fetch(`/api/studio/guest/${token}/take`, {
      method: 'PUT',
      headers: guestHeaders(token, true),
      body: JSON.stringify({ path, publicUrl, mime, kind }),
      referrerPolicy: 'no-referrer',
    }),
  )
}
