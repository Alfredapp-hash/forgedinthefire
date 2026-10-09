/**
 * Host moderation for one show's chat.
 *
 *   GET   → settings + every message (hidden and flagged included, viewer tags) + bans
 *   PATCH → { action: 'settings' | 'hide' | 'pin' | 'ban' | 'unban', ... }
 *
 * Each change is broadcast to viewers on the show's Realtime channel (best effort).
 * The service-role client is used for the tables (they are service-role only); the admin
 * check is the same verifyAdminAccess as every other admin route.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { withLiveAdmin } from '@/lib/podcast/live/admin'
import { createServiceClient } from '@/lib/supabase/service'
import {
  CHAT_MODES,
  CHAT_SLOW_MODE_CHOICES_SEC,
  type ChatAdminPayload,
  type ChatMode,
} from '@/lib/podcast/live/chat'
import {
  broadcastChat,
  chatError,
  loadChatSession,
  loadPinned,
  toAdminMessage,
  toPublicMessage,
  viewerTag,
  type ChatMessageRow,
  type ChatSessionRow,
} from '@/lib/podcast/live/chat-server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const NO_STORE = { 'Cache-Control': 'no-store' }
const ADMIN_LIMIT = 300

async function payload(sessionId: string, session: ChatSessionRow): Promise<ChatAdminPayload> {
  const db = createServiceClient()
  const [{ data: rows, error }, { data: bans, error: banErr }] = await Promise.all([
    db.from('podcast_live_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(ADMIN_LIMIT),
    db.from('podcast_live_bans').select('viewer_hash, reason, created_at').eq('session_id', sessionId).order('created_at', { ascending: false }),
  ])
  if (error) throw error
  if (banErr) throw banErr
  const settings = {
    enabled: session.chat_enabled,
    mode: session.chat_mode,
    slowModeSec: session.chat_slow_mode_sec,
    pinned: await loadPinned(db, session),
  }
  return {
    settings,
    messages: ((rows ?? []) as ChatMessageRow[]).map(toAdminMessage).reverse(),
    bans: ((bans ?? []) as { viewer_hash: string; reason: string | null; created_at: string }[]).map((b) => ({
      viewer_tag: viewerTag(b.viewer_hash),
      reason: b.reason,
      created_at: b.created_at,
    })),
  }
}

function fail(err: unknown) {
  const { status, error } = chatError(err)
  return NextResponse.json({ error }, { status, headers: NO_STORE })
}

export async function GET(_request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const session = await loadChatSession(createServiceClient(), id)
    if (!session) return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
    return NextResponse.json(await payload(id, session), { headers: NO_STORE })
  } catch (err) {
    return fail(err)
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const admin = await withLiveAdmin()
  if (!admin.ok) return admin.response
  try {
    const { id } = await context.params
    const db = createServiceClient()
    const session = await loadChatSession(db, id)
    if (!session) return NextResponse.json({ error: 'Live session not found' }, { status: 404 })
    const body = ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>
    const action = String(body.action ?? '')
    const now = new Date().toISOString()

    if (action === 'settings') {
      const patch: Record<string, unknown> = { updated_at: now }
      if (body.enabled !== undefined) patch.chat_enabled = Boolean(body.enabled)
      if (body.mode !== undefined) {
        const mode = String(body.mode) as ChatMode
        if (!CHAT_MODES.includes(mode)) return NextResponse.json({ error: 'Unknown chat mode' }, { status: 400 })
        patch.chat_mode = mode
      }
      if (body.slowModeSec !== undefined) {
        const sec = Number(body.slowModeSec)
        if (!(CHAT_SLOW_MODE_CHOICES_SEC as readonly number[]).includes(sec)) {
          return NextResponse.json({ error: 'Unknown slow mode value' }, { status: 400 })
        }
        patch.chat_slow_mode_sec = sec
      }
      const { error } = await db.from('podcast_live_sessions').update(patch).eq('id', id)
      if (error) throw error
      const next = { ...session, ...(await loadChatSession(db, id)) } as ChatSessionRow
      await broadcastChat(id, {
        type: 'settings',
        settings: { enabled: next.chat_enabled, mode: next.chat_mode, slowModeSec: next.chat_slow_mode_sec },
      })
      return NextResponse.json(await payload(id, next), { headers: NO_STORE })
    }

    if (action === 'hide') {
      const messageId = String(body.messageId ?? '')
      const hidden = body.hidden === undefined ? true : Boolean(body.hidden)
      const { data, error } = await db
        .from('podcast_live_messages')
        .update({ hidden })
        .eq('id', messageId)
        .eq('session_id', id)
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      let next = session
      if (hidden && session.pinned_message_id === messageId) {
        await db.from('podcast_live_sessions').update({ pinned_message_id: null, updated_at: now }).eq('id', id)
        next = { ...session, pinned_message_id: null }
      }
      await broadcastChat(id, hidden ? { type: 'hide', ids: [messageId] } : { type: 'unhide', message: toPublicMessage(data as ChatMessageRow) })
      return NextResponse.json(await payload(id, next), { headers: NO_STORE })
    }

    if (action === 'pin') {
      const messageId = body.messageId ? String(body.messageId) : null
      let pinned: ChatMessageRow | null = null
      if (messageId) {
        const { data, error } = await db.from('podcast_live_messages').select('*').eq('id', messageId).eq('session_id', id).maybeSingle()
        if (error) throw error
        if (!data) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
        pinned = data as ChatMessageRow
        if (pinned.hidden) return NextResponse.json({ error: 'Unhide the message before pinning it' }, { status: 409 })
      }
      const { error } = await db.from('podcast_live_sessions').update({ pinned_message_id: messageId, updated_at: now }).eq('id', id)
      if (error) throw error
      await broadcastChat(id, { type: 'pin', message: pinned ? toPublicMessage(pinned) : null })
      return NextResponse.json(await payload(id, { ...session, pinned_message_id: messageId }), { headers: NO_STORE })
    }

    if (action === 'ban') {
      const messageId = String(body.messageId ?? '')
      const { data: msg, error } = await db.from('podcast_live_messages').select('viewer_hash').eq('id', messageId).eq('session_id', id).maybeSingle()
      if (error) throw error
      if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      const hash = (msg as { viewer_hash: string }).viewer_hash
      const reason = body.reason ? String(body.reason).slice(0, 200) : null
      const { error: banErr } = await db
        .from('podcast_live_bans')
        .upsert({ session_id: id, viewer_hash: hash, reason, created_by: admin.user.email }, { onConflict: 'session_id,viewer_hash' })
      if (banErr) throw banErr
      // Everything that person posted in this show disappears too (a doxxing attempt is usually more than one line).
      const { data: theirs } = await db
        .from('podcast_live_messages')
        .update({ hidden: true })
        .eq('session_id', id)
        .eq('viewer_hash', hash)
        .eq('hidden', false)
        .select('id')
      const ids = ((theirs ?? []) as { id: string }[]).map((m) => m.id)
      let next = session
      if (session.pinned_message_id && ids.includes(session.pinned_message_id)) {
        await db.from('podcast_live_sessions').update({ pinned_message_id: null, updated_at: now }).eq('id', id)
        next = { ...session, pinned_message_id: null }
      }
      if (ids.length) await broadcastChat(id, { type: 'hide', ids })
      return NextResponse.json(await payload(id, next), { headers: NO_STORE })
    }

    if (action === 'unban') {
      const tag = String(body.viewerTag ?? '')
      if (!/^[0-9a-f]{8}$/i.test(tag)) return NextResponse.json({ error: 'viewerTag is required' }, { status: 400 })
      const { error } = await db.from('podcast_live_bans').delete().eq('session_id', id).like('viewer_hash', `${tag.toLowerCase()}%`)
      if (error) throw error
      return NextResponse.json(await payload(id, session), { headers: NO_STORE })
    }

    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })
  } catch (err) {
    return fail(err)
  }
}
