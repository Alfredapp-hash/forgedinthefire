/**
 * Admin-only upload speed probe for the live pre-flight. The control room POSTs a
 * ~1.5 MB random body and times the round trip; we only count the bytes. This measures
 * the host's uplink to the site (not to the live provider) — a good-enough proxy for
 * "can this connection sustain a 2.5 Mbps WHIP stream".
 */

import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024

export async function POST(request: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess()
  if (!isAdmin) {
    const status = error === 'Not authenticated' ? 401 : error === 'Database not configured' ? 503 : 403
    return NextResponse.json({ error: error || 'Forbidden' }, { status })
  }
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  return NextResponse.json({ bytes: body.byteLength }, { headers: { 'Cache-Control': 'no-store' } })
}
