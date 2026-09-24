import { NextResponse } from 'next/server'
import { FBOT_GREETING, chipsForPath } from '@/lib/fbot/catalog'
import { loadFbotSnapshot } from '@/lib/fbot/live'
import { buildReply } from '@/lib/fbot/match'
import { requireAdmin } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

function pathFrom(request: Request, body?: { path?: string }) {
  const url = new URL(request.url)
  return String(body?.path || url.searchParams.get('path') || '/admin')
}

function isAuthError(err: unknown) {
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    message.includes('admin') ||
    message.includes('not authenticated') ||
    message.includes('not authorized') ||
    message.includes('forbidden') ||
    message.includes('privileges')
  )
}

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const path = pathFrom(request)
    const snapshot = await loadFbotSnapshot()
    return NextResponse.json({
      greeting: FBOT_GREETING,
      chips: chipsForPath(path),
      snapshot,
    })
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[fbot] GET', err)
    return NextResponse.json({ error: 'FBot could not load context' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = (await request.json()) as { q?: string; path?: string }
    const q = String(body.q || '').trim()
    const path = pathFrom(request, body)
    const snapshot = await loadFbotSnapshot()
    const reply = buildReply(q, path, snapshot)
    return NextResponse.json({
      greeting: FBOT_GREETING,
      snapshot,
      ...reply,
    })
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[fbot] POST', err)
    return NextResponse.json({ error: 'FBot could not answer' }, { status: 500 })
  }
}
