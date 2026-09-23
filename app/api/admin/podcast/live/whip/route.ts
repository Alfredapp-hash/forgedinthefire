/**
 * Admin-only WHIP (RFC 9725) proxy. The browser never sees LIVE_WHIP_URL or
 * LIVE_WHIP_BEARER: it POSTs its SDP offer here, we forward it to the provider,
 * and return the SDP answer plus a sealed token for the WHIP resource URL.
 *
 *   GET    → provider config status (no secrets)
 *   POST   → SDP offer (application/sdp) → SDP answer, X-Live-Resource token
 *   PATCH  ?r=<token> → trickle ICE / ICE restart (application/trickle-ice-sdpfrag)
 *   DELETE ?r=<token> → end the WHIP session
 */

import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin/auth'
import {
  liveProviderStatus,
  resolveResource,
  sealResource,
  unsealResource,
  whipEndpoint,
  whipHeaders,
} from '@/lib/podcast/live/server'

export const dynamic = 'force-dynamic'

const MAX_SDP_BYTES = 128 * 1024
const UPSTREAM_TIMEOUT_MS = 15_000

async function guard() {
  const { isAdmin, error } = await verifyAdminAccess()
  if (isAdmin) return null
  const status = error === 'Not authenticated' ? 401 : error === 'Database not configured' ? 503 : 403
  return NextResponse.json({ error: error || 'Forbidden' }, { status })
}

function noStore(init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) } }
}

async function upstreamError(res: Response) {
  const text = (await res.text().catch(() => '')).slice(0, 300)
  return NextResponse.json(
    { error: `Live provider answered ${res.status}${text ? `: ${text}` : ''}` },
    noStore({ status: res.status >= 400 && res.status < 600 ? res.status : 502 }),
  )
}

function resourceFromQuery(request: NextRequest) {
  const endpoint = whipEndpoint()
  if (!endpoint) return { error: NextResponse.json({ error: 'LIVE_WHIP_URL is not set' }, { status: 503 }) }
  const token = request.nextUrl.searchParams.get('r') || ''
  const raw = token ? unsealResource(token) : null
  const resource = raw ? resolveResource(raw, endpoint) : null
  if (!resource) return { error: NextResponse.json({ error: 'Unknown WHIP session' }, { status: 400 }) }
  return { resource }
}

export async function GET() {
  const denied = await guard()
  if (denied) return denied
  return NextResponse.json(liveProviderStatus(), noStore())
}

export async function POST(request: NextRequest) {
  const denied = await guard()
  if (denied) return denied
  const endpoint = whipEndpoint()
  if (!endpoint) {
    return NextResponse.json(
      { error: 'LIVE_WHIP_URL is not set. See docs/podcast-live.md.' },
      noStore({ status: 503 }),
    )
  }
  const offer = await request.text()
  if (!offer.startsWith('v=0') || offer.length > MAX_SDP_BYTES) {
    return NextResponse.json({ error: 'Expected an SDP offer' }, noStore({ status: 400 }))
  }
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...whipHeaders('application/sdp'), Accept: 'application/sdp' },
      body: offer,
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach the live provider (${err instanceof Error ? err.message : 'network'})` },
      noStore({ status: 502 }),
    )
  }
  if (res.status !== 201 && res.status !== 200) return upstreamError(res)
  const answer = await res.text()
  if (!answer.startsWith('v=0')) {
    return NextResponse.json({ error: 'Live provider did not return an SDP answer' }, noStore({ status: 502 }))
  }
  const location = res.headers.get('location')
  const resource = location ? resolveResource(location, new URL(res.url || endpoint.toString())) : null
  const headers: Record<string, string> = { 'Content-Type': 'application/sdp' }
  if (resource) headers['X-Live-Resource'] = sealResource(resource)
  const etag = res.headers.get('etag')
  if (etag) headers['X-Live-Etag'] = etag
  // Provider-supplied STUN/TURN (RFC 9725 §4.6). Meant for the client; passed through as-is.
  const link = res.headers.get('link')
  if (link) headers['X-Live-Link'] = link.slice(0, 4000)
  return new NextResponse(answer, noStore({ status: 201, headers }))
}

export async function PATCH(request: NextRequest) {
  const denied = await guard()
  if (denied) return denied
  const found = resourceFromQuery(request)
  if ('error' in found) return found.error
  const body = await request.text()
  if (body.length > MAX_SDP_BYTES) return NextResponse.json({ error: 'Fragment too large' }, { status: 413 })
  const headers: Record<string, string> = {
    ...(whipHeaders('application/trickle-ice-sdpfrag') as Record<string, string>),
  }
  const ifMatch = request.headers.get('if-match')
  if (ifMatch) headers['If-Match'] = ifMatch
  let res: Response
  try {
    res = await fetch(found.resource, {
      method: 'PATCH',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach the live provider' }, noStore({ status: 502 }))
  }
  if (res.status === 204) return new NextResponse(null, noStore({ status: 204 }))
  if (!res.ok) return upstreamError(res)
  const text = await res.text()
  const out: Record<string, string> = { 'Content-Type': 'application/trickle-ice-sdpfrag' }
  const etag = res.headers.get('etag')
  if (etag) out['X-Live-Etag'] = etag
  return new NextResponse(text, noStore({ status: res.status, headers: out }))
}

export async function DELETE(request: NextRequest) {
  const denied = await guard()
  if (denied) return denied
  const found = resourceFromQuery(request)
  if ('error' in found) return found.error
  try {
    const res = await fetch(found.resource, {
      method: 'DELETE',
      headers: whipHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    // 404 means the provider already dropped the session — that is fine for a teardown.
    if (!res.ok && res.status !== 404) return upstreamError(res)
  } catch {
    return NextResponse.json({ error: 'Could not reach the live provider' }, noStore({ status: 502 }))
  }
  return new NextResponse(null, noStore({ status: 204 }))
}
