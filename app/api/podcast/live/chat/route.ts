/**
 * Public live chat / Q&A.
 *
 *   GET  ?session=<id>[&after=<iso>]  → chat settings + visible messages (live shows only)
 *   POST { session_id, display_name, body, kind } + x-live-viewer header → post a message
 *
 * Every write runs here with the service role: the browser never inserts directly.
 * Order of checks on POST: session live + chat on → mode → name/body filters → ban →
 * per-viewer rate limit (1 per 5 s, or the slow-mode window) → per-IP limit → insert.
 * Viewer ids are hashed with a server salt before they touch the database.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { clientIp, hashedKey, rateLimitHit } from '@/lib/security/rate-limit'
import {
  CHAT_HISTORY_LIMIT,
  CHAT_KINDS,
  CHAT_SETTINGS_OFF,
  CHAT_VIEWER_HEADER,
  type ChatKind,
  type ChatMessagePublic,
  type ChatPublicPayload,
} from '@/lib/podcast/live/chat'
import {
  CHAT_PUBLIC_COLUMNS,
  chatError,
  chatSettingsFor,
  extraBlocklist,
  loadChatSession,
  toPublicMessage,
  viewerHash,
  type ChatMessageRow,
} from '@/lib/podcast/live/chat-server'
import {
  chatRateRule,
  moderateChatBody,
  secondsUntilWindowEnds,
  validateDisplayName,
} from '@/lib/podcast/live/moderation'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Per IP: a burst guard so one network cannot flood the room with many "browsers". */
const IP_RULE = { windowSec: 60, max: 20 }

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE })
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session') || ''
  if (!UUID.test(sessionId)) return bad('session is required')
  const after = request.nextUrl.searchParams.get('after')
  const empty: ChatPublicPayload = { settings: CHAT_SETTINGS_OFF, messages: [], now: new Date().toISOString() }
  try {
    const db = createServiceClient()
    const session = await loadChatSession(db, sessionId)
    if (!session || session.status !== 'live') return NextResponse.json(empty, { headers: NO_STORE })
    const settings = await chatSettingsFor(db, session)
    if (!settings.enabled) return NextResponse.json({ ...empty, settings }, { headers: NO_STORE })
    let query = db
      .from('podcast_live_messages')
      .select(CHAT_PUBLIC_COLUMNS)
      .eq('session_id', sessionId)
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT)
    if (after && !Number.isNaN(new Date(after).getTime())) query = query.gt('created_at', new Date(after).toISOString())
    const { data, error } = await query
    if (error) throw error
    const messages = ((data ?? []) as ChatMessagePublic[]).map(toPublicMessage).reverse()
    return NextResponse.json({ settings, messages, now: new Date().toISOString() } satisfies ChatPublicPayload, {
      headers: NO_STORE,
    })
  } catch (err) {
    const { status, error } = chatError(err)
    // Viewers should never see a broken page because chat is down.
    if (status === 503) return NextResponse.json(empty, { headers: NO_STORE })
    return bad(error, status)
  }
}

export async function POST(request: NextRequest) {
  const viewerId = (request.headers.get(CHAT_VIEWER_HEADER) || '').trim()
  if (!viewerId || viewerId.length < 8 || viewerId.length > 80 || !/^[\w-]+$/.test(viewerId)) {
    return bad('This browser could not be identified. Reload the page and try again.')
  }
  const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
  const sessionId = String(body.session_id ?? '')
  if (!UUID.test(sessionId)) return bad('session_id is required')
  const kind = (String(body.kind ?? 'message') as ChatKind) || 'message'
  if (!CHAT_KINDS.includes(kind)) return bad('Unknown message kind')

  try {
    const db = createServiceClient()
    const session = await loadChatSession(db, sessionId)
    if (!session || session.status !== 'live') return bad('The show is not live right now.', 409)
    if (!session.chat_enabled) return bad('Chat is closed right now.', 409)
    if (session.chat_mode === 'questions' && kind !== 'question') {
      return bad('The host is taking questions only right now — switch to "Ask a question".', 409)
    }

    const extra = extraBlocklist()
    const name = validateDisplayName(String(body.display_name ?? ''), { extraBlocklist: extra })
    if (!name.ok) return bad(name.message)
    const moderated = moderateChatBody(String(body.body ?? ''), { extraBlocklist: extra })
    if (!moderated.ok) return bad(moderated.message, 422, { reason: moderated.reason })

    const hash = viewerHash(viewerId)
    const { data: ban } = await db
      .from('podcast_live_bans')
      .select('viewer_hash')
      .eq('session_id', sessionId)
      .eq('viewer_hash', hash)
      .maybeSingle()
    if (ban) return bad('You can no longer post in this chat.', 403)

    const rule = chatRateRule(session.chat_slow_mode_sec)
    const viewerOk = await rateLimitHit(db, hashedKey(`live-chat:${sessionId}`, hash), rule.windowSec, rule.max)
    if (!viewerOk) {
      const retryAfterSec = secondsUntilWindowEnds(rule.windowSec)
      return bad(
        session.chat_slow_mode_sec > 0
          ? `Slow mode is on: one message every ${rule.windowSec} seconds.`
          : 'You are sending messages too quickly. Give it a few seconds.',
        429,
        { retryAfterSec },
      )
    }
    const ipOk = await rateLimitHit(db, hashedKey('live-chat-ip', clientIp(request)), IP_RULE.windowSec, IP_RULE.max)
    if (!ipOk) return bad('Too many messages from this network. Please wait a minute.', 429, { retryAfterSec: 60 })

    const { data, error } = await db
      .from('podcast_live_messages')
      .insert({
        session_id: sessionId,
        display_name: name.name,
        body: moderated.body,
        kind,
        viewer_hash: hash,
        flagged: moderated.flagged,
        flag_reason: moderated.flagReason,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ message: toPublicMessage(data as ChatMessageRow) }, { status: 201, headers: NO_STORE })
  } catch (err) {
    const { status, error } = chatError(err)
    return bad(status === 503 ? 'Chat is not available right now.' : error, status)
  }
}
