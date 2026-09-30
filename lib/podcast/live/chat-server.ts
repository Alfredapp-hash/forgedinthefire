import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { readLiveEnv } from '@/lib/podcast/live/server'
import {
  CHAT_BROADCAST_EVENT,
  CHAT_SETTINGS_OFF,
  chatChannelName,
  type ChatMessageAdmin,
  type ChatMessagePublic,
  type ChatModerationEvent,
  type ChatMode,
  type ChatSettings,
} from '@/lib/podcast/live/chat'

export type ChatMessageRow = ChatMessagePublic & {
  viewer_hash: string
  hidden: boolean
  flagged: boolean
  flag_reason: string | null
}

export type ChatSessionRow = {
  id: string
  status: 'scheduled' | 'live' | 'ended'
  started_at: string | null
  chat_enabled: boolean
  chat_mode: ChatMode
  chat_slow_mode_sec: number
  pinned_message_id: string | null
}

export const CHAT_SESSION_COLUMNS = 'id, status, started_at, chat_enabled, chat_mode, chat_slow_mode_sec, pinned_message_id'
export const CHAT_PUBLIC_COLUMNS = 'id, session_id, display_name, body, kind, created_at'

/** Salted hash of the per-browser id. The salt is server-only, so the hash cannot be reversed or recomputed by a viewer. */
export function viewerHash(viewerId: string) {
  const salt = readLiveEnv('LIVE_CHAT_SALT') || readLiveEnv('SUPABASE_SERVICE_ROLE_KEY') || 'fitf-live-chat'
  return createHash('sha256').update(`fitf-viewer:${salt}:${viewerId}`).digest('hex').slice(0, 32)
}

export function viewerTag(hash: string) {
  return hash.slice(0, 8)
}

export function toPublicMessage(row: ChatMessageRow | ChatMessagePublic): ChatMessagePublic {
  return {
    id: row.id,
    session_id: row.session_id,
    display_name: row.display_name,
    body: row.body,
    kind: row.kind,
    created_at: row.created_at,
  }
}

export function toAdminMessage(row: ChatMessageRow): ChatMessageAdmin {
  return {
    ...toPublicMessage(row),
    hidden: row.hidden,
    flagged: row.flagged,
    flag_reason: row.flag_reason,
    viewer_tag: viewerTag(row.viewer_hash),
  }
}

export function extraBlocklist(): string[] {
  const raw = readLiveEnv('CHAT_EXTRA_BLOCKLIST') || ''
  return raw.split(',').map((w) => w.trim()).filter(Boolean)
}

export async function loadChatSession(db: SupabaseClient, sessionId: string): Promise<ChatSessionRow | null> {
  const { data, error } = await db.from('podcast_live_sessions').select(CHAT_SESSION_COLUMNS).eq('id', sessionId).maybeSingle()
  if (error) throw error
  return (data as ChatSessionRow | null) || null
}

export async function loadPinned(db: SupabaseClient, session: ChatSessionRow): Promise<ChatMessagePublic | null> {
  if (!session.pinned_message_id) return null
  const { data } = await db
    .from('podcast_live_messages')
    .select(`${CHAT_PUBLIC_COLUMNS}, hidden`)
    .eq('id', session.pinned_message_id)
    .maybeSingle()
  const row = data as (ChatMessagePublic & { hidden: boolean }) | null
  if (!row || row.hidden) return null
  return toPublicMessage(row)
}

export async function chatSettingsFor(db: SupabaseClient, session: ChatSessionRow): Promise<ChatSettings> {
  if (session.status !== 'live') return CHAT_SETTINGS_OFF
  return {
    enabled: session.chat_enabled,
    mode: session.chat_mode,
    slowModeSec: session.chat_slow_mode_sec,
    pinned: await loadPinned(db, session),
  }
}

/**
 * Push a moderation event to viewers. supabase-js sends a broadcast over HTTP when the
 * channel is not joined, so this works from a serverless route. Best effort: viewers also
 * re-sync every CHAT_RESYNC_MS.
 */
export async function broadcastChat(sessionId: string, event: ChatModerationEvent) {
  try {
    const client = createServiceClient()
    const channel = client.channel(chatChannelName(sessionId))
    const result = await channel.httpSend(CHAT_BROADCAST_EVENT, event, { timeout: 5000 })
    await client.removeChannel(channel)
    if (!result.success) throw new Error(result.error || 'broadcast rejected')
  } catch (err) {
    console.warn('[live-chat] broadcast failed (viewers will re-sync):', err instanceof Error ? err.message : err)
  }
}

export function chatError(err: unknown, fallback = 'Chat request failed') {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : fallback
  console.error('[live-chat]', err)
  const missing = /podcast_live_(messages|bans)|chat_enabled/.test(raw) && /does not exist|schema cache|column/.test(raw)
  return {
    status: missing ? 503 : 500,
    error: missing
      ? 'Live chat tables are missing — apply supabase/migrations/20260925000003_podcast_live_chat_simulcast.sql'
      : raw.slice(0, 240),
  }
}
