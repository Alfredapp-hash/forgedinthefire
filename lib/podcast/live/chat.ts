/**
 * Live chat / Q&A: types shared by the public route, the admin route, the viewer widget and
 * the host moderation panel, plus browser fetch helpers. No server code here.
 *
 * Realtime: viewers join `live-chat:<sessionId>` and receive
 *   - postgres_changes INSERT on podcast_live_messages (RLS: visible rows of live shows only)
 *   - broadcast `moderation` events sent by the server after hide / pin / settings / ban.
 * They also re-sync from GET /api/podcast/live/chat every CHAT_RESYNC_MS in case an event was missed.
 */

export const CHAT_KINDS = ['message', 'question'] as const
export type ChatKind = (typeof CHAT_KINDS)[number]

export const CHAT_MODES = ['all', 'questions'] as const
export type ChatMode = (typeof CHAT_MODES)[number]

export const CHAT_SLOW_MODE_CHOICES_SEC = [0, 10, 30, 60, 120] as const

/** What viewers may see of a message. */
export type ChatMessagePublic = {
  id: string
  session_id: string
  display_name: string
  body: string
  kind: ChatKind
  created_at: string
}

/** Host view: moderation state plus a short viewer tag (never the raw browser id). */
export type ChatMessageAdmin = ChatMessagePublic & {
  hidden: boolean
  flagged: boolean
  flag_reason: string | null
  /** First 8 hex chars of the viewer hash — enough to spot one person across messages. */
  viewer_tag: string
}

export type ChatSettings = {
  enabled: boolean
  mode: ChatMode
  slowModeSec: number
  pinned: ChatMessagePublic | null
}

export const CHAT_SETTINGS_OFF: ChatSettings = { enabled: false, mode: 'all', slowModeSec: 0, pinned: null }

export type ChatPublicPayload = {
  settings: ChatSettings
  messages: ChatMessagePublic[]
  now: string
}

export type ChatAdminPayload = {
  settings: ChatSettings
  messages: ChatMessageAdmin[]
  bans: { viewer_tag: string; reason: string | null; created_at: string }[]
}

/** Broadcast events the server sends on `live-chat:<sessionId>` after moderation. */
export type ChatModerationEvent =
  | { type: 'hide'; ids: string[] }
  | { type: 'unhide'; message: ChatMessagePublic }
  | { type: 'pin'; message: ChatMessagePublic | null }
  | { type: 'settings'; settings: Omit<ChatSettings, 'pinned'> }

export const CHAT_BROADCAST_EVENT = 'moderation'
export const CHAT_RESYNC_MS = 15_000
export const CHAT_VIEWER_HEADER = 'x-live-viewer'
export const CHAT_HISTORY_LIMIT = 100

export function chatChannelName(sessionId: string) {
  return `live-chat:${sessionId}`
}

// ---------- browser helpers ----------

const VIEWER_KEY = 'ff-live-viewer'
const NAME_KEY = 'ff-live-chat-name'

/** Stable per-browser id (random UUID kept in localStorage). Only ever hashed on the server. */
export function getViewerId(): string {
  try {
    const existing = window.localStorage.getItem(VIEWER_KEY)
    if (existing && /^[0-9a-f-]{20,}$/i.test(existing)) return existing
    const fresh = crypto.randomUUID()
    window.localStorage.setItem(VIEWER_KEY, fresh)
    return fresh
  } catch {
    return `s-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
  }
}

export function loadChatName() {
  try {
    return window.localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

export function saveChatName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* private window */
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; retryAfterSec?: number }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & { status?: number; retryAfterSec?: number }
    err.status = res.status
    err.retryAfterSec = data.retryAfterSec
    throw err
  }
  return data
}

export async function fetchPublicChat(sessionId: string, after?: string | null) {
  const qs = new URLSearchParams({ session: sessionId })
  if (after) qs.set('after', after)
  return readJson<ChatPublicPayload>(await fetch(`/api/podcast/live/chat?${qs}`, { cache: 'no-store' }))
}

export async function postChatMessage(input: {
  sessionId: string
  displayName: string
  body: string
  kind: ChatKind
  viewerId: string
}) {
  return readJson<{ message: ChatMessagePublic }>(
    await fetch('/api/podcast/live/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CHAT_VIEWER_HEADER]: input.viewerId },
      body: JSON.stringify({
        session_id: input.sessionId,
        display_name: input.displayName,
        body: input.body,
        kind: input.kind,
      }),
    }),
  )
}

// ---------- admin helpers ----------

const ADMIN_BASE = '/api/admin/podcast/live'

export type ChatAdminAction =
  | { action: 'settings'; enabled?: boolean; mode?: ChatMode; slowModeSec?: number }
  | { action: 'hide'; messageId: string; hidden: boolean }
  | { action: 'pin'; messageId: string | null }
  | { action: 'ban'; messageId: string; reason?: string }
  | { action: 'unban'; viewerTag: string }

export async function fetchAdminChat(sessionId: string) {
  return readJson<ChatAdminPayload>(await fetch(`${ADMIN_BASE}/${sessionId}/chat`, { cache: 'no-store' }))
}

export async function moderateChat(sessionId: string, input: ChatAdminAction) {
  return readJson<ChatAdminPayload>(
    await fetch(`${ADMIN_BASE}/${sessionId}/chat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

/** Apply a broadcast moderation event to a viewer's local list. Pure; unit-tested. */
export function applyModerationEvent(
  state: { messages: ChatMessagePublic[]; settings: ChatSettings },
  event: ChatModerationEvent,
): { messages: ChatMessagePublic[]; settings: ChatSettings } {
  switch (event.type) {
    case 'hide': {
      const gone = new Set(event.ids)
      return {
        messages: state.messages.filter((m) => !gone.has(m.id)),
        settings:
          state.settings.pinned && gone.has(state.settings.pinned.id)
            ? { ...state.settings, pinned: null }
            : state.settings,
      }
    }
    case 'unhide':
      return { ...state, messages: mergeMessages(state.messages, [event.message]) }
    case 'pin':
      return { ...state, settings: { ...state.settings, pinned: event.message } }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...event.settings } }
    default:
      return state
  }
}

/** Insert without duplicates, keep chronological order, cap history. */
export function mergeMessages(current: ChatMessagePublic[], incoming: ChatMessagePublic[], limit = CHAT_HISTORY_LIMIT) {
  const byId = new Map<string, ChatMessagePublic>()
  for (const m of current) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(-limit)
}
