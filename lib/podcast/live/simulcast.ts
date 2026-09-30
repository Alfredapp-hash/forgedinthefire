/**
 * Simulcast (restream to YouTube Live / Facebook Live / custom RTMP(S) or WHIP).
 *
 * The host's browser publishes ONE WebRTC stream to the provider (WHIP). Fan-out to other
 * platforms happens provider-side:
 *   - Cloudflare Stream: Live Outputs API (POST /accounts/{acct}/stream/live_inputs/{input}/outputs),
 *     created when the show starts and deleted when it ends (lib/podcast/live/simulcast-server.ts).
 *   - MediaMTX / LiveKit: configured on the server (runOnReady ffmpeg push / egress) — the UI
 *     marks destinations `unsupported` for automatic control and the docs show the config.
 *
 * This file is pure (shared by the server, the control room and unit tests): presets, input
 * validation, masking and provider-state mapping. Secrets never leave the server unmasked.
 */

export const DESTINATION_KINDS = ['youtube', 'facebook', 'custom'] as const
export type DestinationKind = (typeof DESTINATION_KINDS)[number]

export const DESTINATION_PROTOCOLS = ['rtmp', 'rtmps', 'whip'] as const
export type DestinationProtocol = (typeof DESTINATION_PROTOCOLS)[number]

export const DESTINATION_STATES = ['idle', 'queued', 'live', 'failed', 'disabled', 'unsupported'] as const
export type DestinationState = (typeof DESTINATION_STATES)[number]

/** What the browser is allowed to see. `urlMasked` / `keyMasked` are display-only. */
export type DestinationPublic = {
  id: string
  label: string
  kind: DestinationKind
  protocol: DestinationProtocol
  urlMasked: string
  keyMasked: string | null
  enabled: boolean
  state: DestinationState
  stateDetail: string | null
  lastCheckedAt: string | null
  createdAt: string
}

export type DestinationInput = {
  label: string
  kind: DestinationKind
  protocol?: DestinationProtocol
  url: string
  streamKey?: string | null
  enabled?: boolean
}

export const DESTINATION_PRESETS: Record<
  DestinationKind,
  { label: string; url: string; protocol: DestinationProtocol; help: string }
> = {
  youtube: {
    label: 'YouTube Live',
    url: 'rtmps://a.rtmps.youtube.com:443/live2',
    protocol: 'rtmps',
    help: 'YouTube Studio → Go live → Stream → copy the Stream key. Leave the URL as the default RTMPS ingest.',
  },
  facebook: {
    label: 'Facebook Live',
    url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    protocol: 'rtmps',
    help: 'Facebook Live Producer → Streaming software → copy the Stream key (it changes per broadcast unless you use a persistent key).',
  },
  custom: {
    label: 'Custom',
    url: '',
    protocol: 'rtmps',
    help: 'Any RTMP(S) server (Twitch, Kick, a MediaMTX relay) or a WHIP endpoint that accepts a stream key/bearer.',
  },
}

/** Validate + normalise what the admin typed. Errors are plain language for the card. */
export function parseDestinationInput(body: Record<string, unknown>): { ok: true; value: Required<DestinationInput> } | { ok: false; error: string } {
  const label = String(body.label ?? '').trim().slice(0, 80)
  if (!label) return { ok: false, error: 'Give the destination a name (e.g. "YouTube – FITF channel").' }
  const kind = String(body.kind ?? 'custom') as DestinationKind
  if (!DESTINATION_KINDS.includes(kind)) return { ok: false, error: 'Unknown destination type.' }
  const preset = DESTINATION_PRESETS[kind]
  const url = String(body.url ?? '').trim() || preset.url
  const parsed = parseIngestUrl(url)
  if (!parsed) return { ok: false, error: 'The ingest address must start with rtmp://, rtmps:// or https:// (WHIP).' }
  const protocol = parsed.protocol
  const streamKey = body.streamKey == null ? '' : String(body.streamKey).trim()
  if (protocol !== 'whip' && !streamKey && !parsed.hasKeyInPath) {
    return { ok: false, error: 'Paste the stream key from the platform.' }
  }
  if (streamKey.length > 512) return { ok: false, error: 'That stream key is too long.' }
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled)
  return { ok: true, value: { label, kind, protocol, url: parsed.url, streamKey: streamKey || null, enabled } }
}

export function parseIngestUrl(raw: string): { url: string; protocol: DestinationProtocol; hasKeyInPath: boolean } | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (!u.hostname) return null
  if (u.protocol === 'rtmp:' || u.protocol === 'rtmps:') {
    const protocol = u.protocol === 'rtmps:' ? 'rtmps' : 'rtmp'
    // rtmp://host/app/streamkey → a key already in the path counts.
    const segments = u.pathname.split('/').filter(Boolean)
    return { url: u.toString(), protocol, hasKeyInPath: segments.length >= 2 }
  }
  if (u.protocol === 'https:' || u.protocol === 'http:') {
    return { url: u.toString(), protocol: 'whip', hasKeyInPath: true }
  }
  return null
}

/** Show at most the last 4 characters of a secret; short secrets are fully hidden. */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null
  const s = String(secret)
  if (s.length <= 6) return '••••••'
  return `••••${s.slice(-4)}`
}

/**
 * Keep scheme + host + the first path segment (the "app", e.g. /live2); everything after it can be
 * a stream key (RTMP) or a publish secret (WHIP) and is replaced by a marker.
 */
export function maskIngestUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const segments = u.pathname.split('/').filter(Boolean)
    const first = segments[0] ? `/${segments[0]}` : ''
    const rest = segments.length > 1 ? '/••••' : ''
    const base = `${u.protocol}//${u.host}${first}${rest}`
    return u.search ? `${base}?••••` : base
  } catch {
    return '••••'
  }
}

/** Full ingest target for the provider: RTMP app URL + key, or the WHIP URL as-is. */
export function buildIngestTarget(url: string, streamKey: string | null): { url: string; streamKey: string | null } {
  if (/^https?:/i.test(url)) return { url, streamKey: streamKey || null }
  return { url: url.replace(/\/+$/, ''), streamKey: streamKey || null }
}

// ---------- provider state mapping ----------

/** The status object Cloudflare returns for a Live Output (fields we rely on). */
export type CloudflareOutputStatus = {
  current?: { state?: string | null; reason?: string | null; statusEnteredAt?: string | null } | null
  last?: { state?: string | null; reason?: string | null } | null
} | null

export type CloudflareOutput = {
  uid: string
  url?: string
  streamKey?: string
  enabled?: boolean
  status?: CloudflareOutputStatus
}

/**
 * Cloudflare reports `connected` while frames flow to the platform, `disconnected` before the
 * first connect or after the platform dropped us, and `error` with a reason. Until the output
 * has connected once, `disconnected` just means "queued" (the platform takes a few seconds).
 */
export function mapCloudflareOutputState(
  output: Pick<CloudflareOutput, 'enabled' | 'status'> | null | undefined,
  opts: { sinceMs?: number; nowMs?: number; queuedGraceMs?: number } = {},
): { state: DestinationState; detail: string | null } {
  if (!output) return { state: 'failed', detail: 'The provider no longer lists this output.' }
  if (output.enabled === false) return { state: 'disabled', detail: null }
  const current = output.status?.current || null
  const state = (current?.state || '').toLowerCase()
  const reason = current?.reason || null
  if (state === 'connected') return { state: 'live', detail: null }
  if (state === 'error') return { state: 'failed', detail: reason || 'The platform refused the stream (check the key).' }
  const grace = opts.queuedGraceMs ?? 45_000
  const since = opts.sinceMs
  const now = opts.nowMs ?? Date.now()
  if (state === 'disconnected' || !state) {
    if (output.status?.last?.state?.toLowerCase() === 'connected') {
      return { state: 'failed', detail: reason || 'The platform disconnected. The main stream continues.' }
    }
    if (since != null && now - since > grace) {
      return { state: 'failed', detail: reason || 'The platform never connected. Check the stream key and that the event is set to "streaming software".' }
    }
    return { state: 'queued', detail: 'Waiting for the platform to accept the stream…' }
  }
  return { state: 'queued', detail: reason || state }
}

/** One line for the control room: "2 live · 1 failed". */
export function summarizeDestinations(rows: Pick<DestinationPublic, 'state' | 'enabled'>[]) {
  const on = rows.filter((r) => r.enabled)
  const count = (s: DestinationState) => on.filter((r) => r.state === s).length
  const parts: string[] = []
  if (count('live')) parts.push(`${count('live')} live`)
  if (count('queued')) parts.push(`${count('queued')} connecting`)
  if (count('failed')) parts.push(`${count('failed')} failed`)
  if (count('unsupported')) parts.push(`${count('unsupported')} manual`)
  return { enabled: on.length, failed: count('failed'), live: count('live'), text: parts.join(' · ') || (on.length ? 'idle' : 'none enabled') }
}
