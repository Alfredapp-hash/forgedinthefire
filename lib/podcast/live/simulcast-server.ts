import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { liveProviderStatus, readLiveEnv } from '@/lib/podcast/live/server'
import {
  buildIngestTarget,
  mapCloudflareOutputState,
  maskIngestUrl,
  maskSecret,
  type CloudflareOutput,
  type DestinationInput,
  type DestinationKind,
  type DestinationProtocol,
  type DestinationPublic,
  type DestinationState,
} from '@/lib/podcast/live/simulcast'

/** Row shape of podcast_live_destinations (service role only). */
export type DestinationRow = {
  id: string
  label: string
  kind: DestinationKind
  protocol: DestinationProtocol
  url_enc: string
  key_enc: string | null
  enabled: boolean
  provider_output_id: string | null
  state: DestinationState
  state_detail: string | null
  last_checked_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ---------- encryption at rest ----------

function destinationKey() {
  const material = readLiveEnv('LIVE_DESTINATION_SECRET') || readLiveEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!material) throw new Error('LIVE_DESTINATION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to store destinations')
  return createHash('sha256').update(`fitf-live-destination:${material}`).digest()
}

export function sealSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', destinationKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function unsealSecret(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', destinationKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Never returns url/key in full. */
export function toPublicDestination(row: DestinationRow): DestinationPublic {
  const url = unsealSecret(row.url_enc)
  const key = row.key_enc ? unsealSecret(row.key_enc) : null
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    protocol: row.protocol,
    urlMasked: url ? maskIngestUrl(url) : '(cannot decrypt — LIVE_DESTINATION_SECRET changed?)',
    keyMasked: row.key_enc ? (key ? maskSecret(key) : '••••') : null,
    enabled: row.enabled,
    state: row.enabled ? row.state : 'disabled',
    stateDetail: row.state_detail,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  }
}

export function rowFromInput(input: Required<DestinationInput>, createdBy: string | null) {
  return {
    label: input.label,
    kind: input.kind,
    protocol: input.protocol,
    url_enc: sealSecret(input.url),
    key_enc: input.streamKey ? sealSecret(input.streamKey) : null,
    enabled: input.enabled,
    state: 'idle' as DestinationState,
    state_detail: null,
    provider_output_id: null,
    created_by: createdBy,
  }
}

// ---------- Cloudflare Stream Live Outputs ----------

export type CloudflareConfig = { accountId: string; token: string; inputId: string }

/**
 * Cloudflare needs the account id, an API token with Stream:Edit, and the live input uid.
 * The uid is the first path segment of the WHEP/HLS playback URL
 * (https://customer-<code>.cloudflarestream.com/<input-uid>/webRTC/play); LIVE_CF_INPUT_ID overrides.
 */
export function cloudflareConfig(): CloudflareConfig | null {
  const accountId = readLiveEnv('CLOUDFLARE_ACCOUNT_ID')
  const token = readLiveEnv('CLOUDFLARE_STREAM_API_TOKEN') || readLiveEnv('CLOUDFLARE_API_TOKEN')
  const inputId = readLiveEnv('LIVE_CF_INPUT_ID') || inputIdFromPlaybackUrl()
  if (!accountId || !token || !inputId) return null
  return { accountId, token, inputId }
}

export function inputIdFromPlaybackUrl(): string | null {
  for (const name of ['LIVE_PLAYBACK_WHEP_URL', 'LIVE_PLAYBACK_HLS_URL']) {
    const raw = readLiveEnv(name)
    if (!raw) continue
    try {
      const first = new URL(raw).pathname.split('/').filter(Boolean)[0]
      if (first && /^[0-9a-f]{32}$/i.test(first)) return first
    } catch {
      /* ignore */
    }
  }
  return null
}

export type SimulcastCapability =
  | { provider: 'cloudflare'; automatic: true; config: CloudflareConfig }
  | { provider: 'cloudflare'; automatic: false; reason: string }
  | { provider: 'mediamtx' | 'livekit' | 'other' | null; automatic: false; reason: string }

/** Can the server start/stop restreams itself for the configured provider? */
export function simulcastCapability(): SimulcastCapability {
  const status = liveProviderStatus()
  if (status.provider === 'cloudflare') {
    const config = cloudflareConfig()
    if (config) return { provider: 'cloudflare', automatic: true, config }
    return {
      provider: 'cloudflare',
      automatic: false,
      reason:
        'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN (Stream: Edit) and, if the playback URL does not carry the input uid, LIVE_CF_INPUT_ID.',
    }
  }
  return {
    provider: status.provider,
    automatic: false,
    reason:
      status.provider === 'mediamtx'
        ? 'MediaMTX pushes to other platforms from its own config (runOnReady ffmpeg). See docs/podcast-live.md.'
        : status.provider === 'livekit'
          ? 'LiveKit restreams through an Egress (RTMP output). See docs/podcast-live.md.'
          : 'Automatic restreaming is only wired for Cloudflare Stream. Configure the relay on your provider.',
  }
}

const CF_API = 'https://api.cloudflare.com/client/v4'
const CF_TIMEOUT_MS = 12_000

async function cfFetch<T>(config: CloudflareConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CF_API}/accounts/${config.accountId}/stream/live_inputs/${config.inputId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(CF_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string }[] }
  if (!res.ok || data.success === false) {
    const msg = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Cloudflare answered ${res.status}`
    throw new Error(msg.slice(0, 200))
  }
  return data.result as T
}

export async function cfCreateOutput(config: CloudflareConfig, url: string, streamKey: string | null) {
  const target = buildIngestTarget(url, streamKey)
  return cfFetch<CloudflareOutput>(config, '/outputs', {
    method: 'POST',
    body: JSON.stringify({ url: target.url, streamKey: target.streamKey || '', enabled: true }),
  })
}

export async function cfListOutputs(config: CloudflareConfig) {
  return (await cfFetch<CloudflareOutput[]>(config, '/outputs')) || []
}

export async function cfDeleteOutput(config: CloudflareConfig, outputId: string) {
  await cfFetch<unknown>(config, `/outputs/${encodeURIComponent(outputId)}`, { method: 'DELETE' })
}

// ---------- orchestration (fail closed: the main stream never depends on these) ----------

type Db = SupabaseClient

export async function listDestinationRows(db: Db) {
  const { data, error } = await db.from('podcast_live_destinations').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as DestinationRow[]
}

async function setState(db: Db, id: string, patch: Partial<DestinationRow>) {
  await db
    .from('podcast_live_destinations')
    .update({ ...patch, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
}

/** Called when a show starts. Each destination is attempted independently; failures are recorded, not thrown. */
export async function startSimulcast(db: Db): Promise<{ destinations: DestinationPublic[]; warning: string | null }> {
  const rows = await listDestinationRows(db)
  const enabled = rows.filter((r) => r.enabled)
  if (!enabled.length) return { destinations: rows.map(toPublicDestination), warning: null }
  const cap = simulcastCapability()
  if (!cap.automatic) {
    for (const row of enabled) await setState(db, row.id, { state: 'unsupported', state_detail: cap.reason })
    return { destinations: (await listDestinationRows(db)).map(toPublicDestination), warning: cap.reason }
  }
  const problems: string[] = []
  for (const row of enabled) {
    const url = unsealSecret(row.url_enc)
    const key = row.key_enc ? unsealSecret(row.key_enc) : null
    if (!url || (row.key_enc && !key)) {
      await setState(db, row.id, { state: 'failed', state_detail: 'Could not decrypt this destination. Re-enter it.' })
      problems.push(`${row.label}: cannot decrypt`)
      continue
    }
    try {
      // Reuse an output left over from a crashed show rather than creating a duplicate.
      if (row.provider_output_id) {
        await cfDeleteOutput(cap.config, row.provider_output_id).catch(() => {})
      }
      const output = await cfCreateOutput(cap.config, url, key)
      await setState(db, row.id, {
        provider_output_id: output.uid,
        state: 'queued',
        state_detail: 'Waiting for the platform to accept the stream…',
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Could not create the restream'
      await setState(db, row.id, { provider_output_id: null, state: 'failed', state_detail: detail })
      problems.push(`${row.label}: ${detail}`)
    }
  }
  return {
    destinations: (await listDestinationRows(db)).map(toPublicDestination),
    warning: problems.length ? `Simulcast: ${problems.join(' · ')}. The main stream continues.` : null,
  }
}

/** Poll provider state for every destination that has a provider output. */
export async function pollSimulcast(db: Db, startedAtIso?: string | null): Promise<DestinationPublic[]> {
  const rows = await listDestinationRows(db)
  const active = rows.filter((r) => r.enabled && r.provider_output_id)
  if (!active.length) return rows.map(toPublicDestination)
  const cap = simulcastCapability()
  if (!cap.automatic) return rows.map(toPublicDestination)
  let outputs: CloudflareOutput[]
  try {
    outputs = await cfListOutputs(cap.config)
  } catch (err) {
    const detail = `Could not read restream status: ${err instanceof Error ? err.message : 'unknown'}`
    for (const row of active) await setState(db, row.id, { state_detail: detail })
    return (await listDestinationRows(db)).map(toPublicDestination)
  }
  const since = startedAtIso ? new Date(startedAtIso).getTime() : undefined
  for (const row of active) {
    const output = outputs.find((o) => o.uid === row.provider_output_id) || null
    const mapped = mapCloudflareOutputState(output, { sinceMs: since })
    await setState(db, row.id, { state: mapped.state, state_detail: mapped.detail })
  }
  return (await listDestinationRows(db)).map(toPublicDestination)
}

/** Called when a show ends: remove provider outputs so the next show starts clean. */
export async function stopSimulcast(db: Db): Promise<DestinationPublic[]> {
  const rows = await listDestinationRows(db)
  const cap = simulcastCapability()
  for (const row of rows) {
    if (row.provider_output_id && cap.automatic) {
      await cfDeleteOutput(cap.config, row.provider_output_id).catch(() => {})
    }
    if (row.provider_output_id || row.state !== 'idle') {
      await setState(db, row.id, { provider_output_id: null, state: 'idle', state_detail: null })
    }
  }
  return (await listDestinationRows(db)).map(toPublicDestination)
}

// ---------- route helpers ----------

export function destinationError(err: unknown) {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Request failed'
  console.error('[podcast-live simulcast]', err)
  const missing = /podcast_live_destinations/.test(raw) && /does not exist|schema cache/.test(raw)
  return NextResponse.json(
    {
      error: missing
        ? 'podcast_live_destinations is missing — apply supabase/migrations/20260925000003_podcast_live_chat_simulcast.sql'
        : raw.slice(0, 240),
    },
    { status: missing ? 503 : 500, headers: { 'Cache-Control': 'no-store' } },
  )
}

export type SimulcastCapabilityPublic = { provider: string | null; automatic: boolean; reason: string | null }

export function capabilityPublic(): SimulcastCapabilityPublic {
  const cap = simulcastCapability()
  return { provider: cap.provider, automatic: cap.automatic, reason: cap.automatic ? null : cap.reason }
}
