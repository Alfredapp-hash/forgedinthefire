import type { GuestInviteAdmin, GuestInvitePublic, GuestSignal } from '@/lib/podcast/guest-types'

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export async function fetchGuestSession(token: string) {
  return readJson<GuestInvitePublic>(await fetch(`/api/studio/guest/${token}`, { cache: 'no-store' }))
}

export async function postGuestSession(
  token: string,
  body: { action: 'join' | 'heartbeat' | 'leave' | 'connected'; name?: string },
) {
  return readJson<GuestInvitePublic>(
    await fetch(`/api/studio/guest/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function pullGuestSignals(token: string, after: number) {
  const res = await fetch(`/api/studio/guest/${token}/signal?after=${after}&role=guest`, { cache: 'no-store' })
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'guest', kind, payload }),
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
  return readJson<{ signedUrl: string; path: string; publicUrl: string }>(
    await fetch(`/api/studio/guest/${token}/take`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mime, size, kind }),
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, publicUrl, mime, kind }),
    }),
  )
}
