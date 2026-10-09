/** Browser fetch helpers for the Simulcast card in the control room. */

import type { DestinationInput, DestinationPublic } from '@/lib/podcast/live/simulcast'

export type SimulcastCapabilityPublic = { provider: string | null; automatic: boolean; reason: string | null }
export type SimulcastPayload = { destinations: DestinationPublic[]; capability: SimulcastCapabilityPublic; warning?: string | null }

const BASE = '/api/admin/podcast/live'

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export async function listDestinations() {
  return readJson<SimulcastPayload>(await fetch(`${BASE}/destinations`, { cache: 'no-store' }))
}

export async function createDestination(input: DestinationInput) {
  return readJson<{ destination: DestinationPublic }>(
    await fetch(`${BASE}/destinations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  )
}

export async function patchDestination(id: string, input: Partial<DestinationInput>) {
  return readJson<{ destination: DestinationPublic }>(
    await fetch(`${BASE}/destinations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  )
}

export async function deleteDestination(id: string) {
  return readJson<{ success: true }>(await fetch(`${BASE}/destinations/${id}`, { method: 'DELETE' }))
}

export async function pollSimulcastStatus(sessionId: string) {
  return readJson<SimulcastPayload>(await fetch(`${BASE}/${sessionId}/simulcast`, { cache: 'no-store' }))
}

export async function controlSimulcast(sessionId: string, action: 'start' | 'stop') {
  return readJson<SimulcastPayload>(
    await fetch(`${BASE}/${sessionId}/simulcast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }),
  )
}
