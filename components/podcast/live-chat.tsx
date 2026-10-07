'use client'

/**
 * Viewer chat / Q&A for /podcast/live.
 *
 * Renders nothing until the host turns chat on. Messages arrive over Supabase Realtime
 * (INSERTs on podcast_live_messages, RLS-filtered to visible rows of live shows) and
 * moderation events (hide / pin / settings) as broadcasts; a periodic GET re-syncs in case
 * the socket dropped. Posting goes through /api/podcast/live/chat, which filters out
 * anything that could identify or locate a person before it is stored.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Eye, EyeOff, Flag, MessageCircle, Pin, PinOff, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Checkbox, Chip, EmptyState, LoadingState, Select } from '@/components/studio-ui'
import { cn } from '@/lib/utils'
import {
  CHAT_BROADCAST_EVENT,
  CHAT_RESYNC_MS,
  CHAT_SETTINGS_OFF,
  CHAT_SLOW_MODE_CHOICES_SEC,
  applyModerationEvent,
  chatChannelName,
  fetchAdminChat,
  fetchPublicChat,
  getViewerId,
  loadChatName,
  mergeMessages,
  moderateChat,
  postChatMessage,
  saveChatName,
  type ChatAdminAction,
  type ChatAdminPayload,
  type ChatKind,
  type ChatMessageAdmin,
  type ChatMessagePublic,
  type ChatModerationEvent,
  type ChatSettings,
} from '@/lib/podcast/live/chat'
import { CHAT_MAX_BODY, CHAT_MAX_NAME } from '@/lib/podcast/live/moderation'

type Props = { sessionId: string }

const focusRing = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#53D6FF]'
const input = `w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] placeholder:text-[#5B6873] ${focusRing}`

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function LiveChat({ sessionId }: Props) {
  const [settings, setSettings] = useState<ChatSettings>(CHAT_SETTINGS_OFF)
  const [messages, setMessages] = useState<ChatMessagePublic[]>([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<ChatKind>('message')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [connected, setConnected] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const stateRef = useRef({ messages, settings })
  stateRef.current = { messages, settings }

  useEffect(() => setName(loadChatName()), [])

  const sync = useCallback(async () => {
    try {
      const data = await fetchPublicChat(sessionId)
      setSettings(data.settings)
      setMessages((prev) => (data.settings.enabled ? mergeMessages(prev, data.messages) : []))
      setLoaded(true)
    } catch {
      /* keep the last known state; retry on the next tick */
    }
  }, [sessionId])

  useEffect(() => {
    void sync()
    const id = window.setInterval(() => void sync(), CHAT_RESYNC_MS)
    return () => window.clearInterval(id)
  }, [sync])

  // Realtime: new messages + moderation events.
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    const channel = supabase
      .channel(chatChannelName(sessionId))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'podcast_live_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as Partial<ChatMessagePublic> & { hidden?: boolean }
          if (!row.id || !row.body || row.hidden) return
          if (!stateRef.current.settings.enabled) return
          setMessages((prev) => mergeMessages(prev, [row as ChatMessagePublic]))
        },
      )
      .on('broadcast', { event: CHAT_BROADCAST_EVENT }, ({ payload }) => {
        const event = payload as ChatModerationEvent
        const next = applyModerationEvent(stateRef.current, event)
        setSettings(next.settings)
        setMessages(event.type === 'settings' && !next.settings.enabled ? [] : next.messages)
        if (event.type === 'settings' && next.settings.enabled && !stateRef.current.settings.enabled) void sync()
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, sync])

  // Keep the newest message in view unless the viewer scrolled up.
  useEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (waitUntil <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [waitUntil])

  const questionsOnly = settings.mode === 'questions'
  useEffect(() => {
    if (questionsOnly) setKind('question')
  }, [questionsOnly])

  const viewerId = useMemo(() => (typeof window === 'undefined' ? '' : getViewerId()), [])
  const waitSec = Math.max(0, Math.ceil((waitUntil - now) / 1000))

  async function send() {
    const body = draft.trim()
    const displayName = name.trim()
    if (!body || !displayName || sending || waitSec > 0) return
    setSending(true)
    setError(null)
    try {
      saveChatName(displayName)
      const { message } = await postChatMessage({ sessionId, displayName, body, kind, viewerId: viewerId || getViewerId() })
      setMessages((prev) => mergeMessages(prev, [message]))
      setDraft('')
      stickRef.current = true
      const slow = Math.max(5, settings.slowModeSec)
      setWaitUntil(Date.now() + slow * 1000)
      setNow(Date.now())
    } catch (err) {
      const e = err as Error & { status?: number; retryAfterSec?: number }
      setError(e.message || 'Could not send that message.')
      if (e.status === 429 && e.retryAfterSec) {
        setWaitUntil(Date.now() + e.retryAfterSec * 1000)
        setNow(Date.now())
      }
    } finally {
      setSending(false)
    }
  }

  if (!loaded || !settings.enabled) return null

  return (
    <section
      className="flex h-[480px] flex-col rounded-2xl border border-[#27313B] bg-[#11161C] lg:h-full lg:min-h-[420px]"
      aria-label="Live chat"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#27313B] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#F6FAFC]">
          <MessageCircle className="h-4 w-4 text-[#53D6FF]" aria-hidden />
          {questionsOnly ? 'Questions for the host' : 'Live chat'}
        </h2>
        <span className="text-[11px] text-[#7C8B97]">
          {settings.slowModeSec > 0 ? `Slow mode · 1 per ${settings.slowModeSec}s` : connected ? 'Live' : 'Updating…'}
        </span>
      </header>

      {settings.pinned && (
        <div className="border-b border-[#27313B] bg-[#0A1016] px-4 py-2 text-sm" role="status">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">
            <Pin className="h-3 w-3" aria-hidden /> Pinned {settings.pinned.kind === 'question' ? 'question' : 'message'}
          </p>
          <p className="text-[#F6FAFC]">
            <span className="text-[#B8C4CF]">{settings.pinned.display_name}: </span>
            {settings.pinned.body}
          </p>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <p className="text-sm text-[#7C8B97]">
            {questionsOnly ? 'No questions yet — ask the first one.' : 'Say hello. Please keep names, places and contact details out of the chat.'}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`text-sm ${m.kind === 'question' ? 'rounded-lg border border-[#53D6FF]/30 bg-[#0A1016] px-2 py-1.5' : ''}`}>
            <span className="text-[#8DEBFF]">{m.display_name}</span>
            {m.kind === 'question' && <span className="ml-1 text-[10px] uppercase tracking-wider text-[#53D6FF]">Q</span>}
            <span className="ml-1 text-[10px] text-[#5B6873]">{timeOf(m.created_at)}</span>
            <p className="break-words text-[#F6FAFC]">{m.body}</p>
          </div>
        ))}
      </div>

      <form
        className="space-y-2 border-t border-[#27313B] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <div className="flex gap-2">
          <input
            className={`${input} max-w-[150px]`}
            value={name}
            maxLength={CHAT_MAX_NAME}
            placeholder="Display name"
            aria-label="Display name"
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          {!questionsOnly && (
            <select
              className={`${input} max-w-[150px]`}
              value={kind}
              aria-label="Message type"
              onChange={(e) => setKind(e.target.value as ChatKind)}
            >
              <option value="message">Message</option>
              <option value="question">Ask a question</option>
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className={input}
            value={draft}
            maxLength={CHAT_MAX_BODY}
            placeholder={questionsOnly ? 'Ask the host a question…' : 'Write a message…'}
            aria-label={questionsOnly ? 'Your question' : 'Your message'}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending || waitSec > 0 || !draft.trim() || !name.trim()}
            className={`inline-flex min-h-[40px] min-w-[44px] items-center justify-center rounded-lg bg-[#53D6FF] px-3 text-[#061016] disabled:opacity-40 ${focusRing}`}
            aria-label={waitSec > 0 ? `Wait ${waitSec} seconds` : 'Send'}
          >
            {waitSec > 0 ? `${waitSec}s` : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {error && (
          <p className="text-xs text-[#FF9AB0]" role="alert">
            {error}
          </p>
        )}
        <p className="text-[11px] text-[#7C8B97]">
          Anonymous. No phone numbers, emails, links, addresses or real names — messages with those are not posted. The host
          can hide messages and pin questions.
        </p>
      </form>
    </section>
  )
}

// ============================================================
// Host moderation panel (control room) — studio-ui styled
// ============================================================

const MOD_POLL_MS = 3000
const hint = 'studio-type-body text-[12px] leading-snug text-silver-label'

type ModProps = {
  sessionId: string | null
  /** Session is live (chat can be on). Off air, the panel only shows settings. */
  live: boolean
  /** Fires whenever the pinned message changes so the compositor can paint the lower third. */
  onPinned?: (pinned: ChatMessagePublic | null) => void
  onError?: (message: string) => void
}

type ModFilter = 'all' | 'questions' | 'flagged' | 'hidden'

export function LiveChatModerationPanel({ sessionId, live, onPinned, onError }: ModProps) {
  const [data, setData] = useState<ChatAdminPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<ModFilter>('all')
  const pinnedId = data?.settings.pinned?.id ?? null
  const pinnedRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!sessionId) {
      setData(null)
      return
    }
    try {
      setData(await fetchAdminChat(sessionId))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not load chat')
    }
  }, [sessionId, onError])

  useEffect(() => {
    void load()
    if (!sessionId) return
    const id = window.setInterval(() => void load(), live ? MOD_POLL_MS : MOD_POLL_MS * 4)
    return () => window.clearInterval(id)
  }, [load, sessionId, live])

  useEffect(() => {
    if (pinnedRef.current === pinnedId) return
    pinnedRef.current = pinnedId
    onPinned?.(data?.settings.pinned ?? null)
  }, [pinnedId, data, onPinned])

  async function act(input: ChatAdminAction) {
    if (!sessionId) return
    setBusy(true)
    try {
      setData(await moderateChat(sessionId, input))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Moderation failed')
    } finally {
      setBusy(false)
    }
  }

  if (!sessionId) return <p className="studio-type-body text-silver">Select a show to manage its chat.</p>

  const settings = data?.settings
  const messages = data?.messages ?? []
  const shown = messages.filter((m) =>
    filter === 'all' ? !m.hidden : filter === 'questions' ? m.kind === 'question' && !m.hidden : filter === 'flagged' ? m.flagged : m.hidden,
  )
  const flaggedCount = messages.filter((m) => m.flagged && !m.hidden).length
  const filters: { id: ModFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'questions', label: 'Questions' },
    { id: 'flagged', label: flaggedCount > 0 ? `Flagged (${flaggedCount})` : 'Flagged' },
    { id: 'hidden', label: 'Hidden' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Checkbox
          label="Chat on"
          checked={Boolean(settings?.enabled)}
          disabled={busy || !data}
          onChange={(e) => void act({ action: 'settings', enabled: e.target.checked })}
          wrapperClassName="pb-2"
        />
        <Checkbox
          label="Questions only"
          checked={settings?.mode === 'questions'}
          disabled={busy || !data}
          onChange={(e) => void act({ action: 'settings', mode: e.target.checked ? 'questions' : 'all' })}
          wrapperClassName="pb-2"
        />
        <Select
          label="Slow mode"
          value={settings?.slowModeSec ?? 0}
          disabled={busy || !data}
          onChange={(e) => void act({ action: 'settings', slowModeSec: Number(e.target.value) })}
          wrapperClassName="w-auto min-w-[140px]"
        >
          {CHAT_SLOW_MODE_CHOICES_SEC.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'off (1 per 5 s)' : `1 per ${s} s`}
            </option>
          ))}
        </Select>
      </div>
      {!live && settings?.enabled && <p className={cn(hint, 'text-lane-cohost-1')}>Chat opens for viewers as soon as this show is live.</p>}
      {settings?.pinned && (
        <div className="flex items-start gap-2 rounded-control border border-forged/50 bg-obsidian px-3 py-2 shadow-glow-subtle" role="status">
          <Pin className="mt-0.5 h-4 w-4 shrink-0 text-ice" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="studio-type-label text-ice">On screen · {settings.pinned.display_name}</p>
            <p className="studio-type-body break-words text-white">{settings.pinned.body}</p>
          </div>
          <Button size="dense" variant="ghost" disabled={busy} onClick={() => void act({ action: 'pin', messageId: null })}>
            <PinOff size={12} aria-hidden /> Unpin
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter messages">
        {filters.map((f) => (
          <Button
            key={f.id}
            size="dense"
            variant={filter === f.id ? 'primary' : 'ghost'}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto" aria-live="polite">
        {shown.length === 0 && (
          <li>
            {data ? (
              <EmptyState
                size="compact"
                icon={<MessageCircle size={18} />}
                title="No messages yet"
                description="Comments and questions from viewers show up here."
              />
            ) : (
              <LoadingState size="compact" label="Loading chat…" />
            )}
          </li>
        )}
        {shown.map((m: ChatMessageAdmin) => (
          <li
            key={m.id}
            className={cn(
              'rounded-control border px-2.5 py-2',
              m.hidden ? 'border-divider opacity-60' : m.flagged ? 'border-lane-cohost-1/60' : m.kind === 'question' ? 'border-forged/40' : 'border-divider',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-silver">
              <span className="text-ice">{m.display_name}</span>
              <span className="font-mono text-silver-label" title="Viewer tag (hashed browser id)">
                #{m.viewer_tag}
              </span>
              {m.kind === 'question' && <Chip tone="accent">Q</Chip>}
              {m.flagged && (
                <span className="inline-flex items-center gap-1 text-lane-cohost-1">
                  <Flag size={10} aria-hidden /> {m.flag_reason}
                </span>
              )}
              <span>{timeOf(m.created_at)}</span>
            </div>
            <p className="studio-type-body break-words text-white">{m.body}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {!m.hidden && (
                <Button
                  size="dense"
                  variant={pinnedId === m.id ? 'primary' : 'secondary'}
                  disabled={busy}
                  aria-pressed={pinnedId === m.id}
                  onClick={() => void act({ action: 'pin', messageId: pinnedId === m.id ? null : m.id })}
                >
                  <Pin size={12} aria-hidden /> {pinnedId === m.id ? 'Unpin' : 'Pin on screen'}
                </Button>
              )}
              <Button size="dense" disabled={busy} onClick={() => void act({ action: 'hide', messageId: m.id, hidden: !m.hidden })}>
                {m.hidden ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />} {m.hidden ? 'Unhide' : 'Hide'}
              </Button>
              <Button
                size="dense"
                variant="ghost"
                className="text-heart hover:text-heart"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Ban #${m.viewer_tag} from this show’s chat and hide everything they posted?`)) {
                    void act({ action: 'ban', messageId: m.id })
                  }
                }}
              >
                <Ban size={12} aria-hidden /> Ban
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {data && data.bans.length > 0 && (
        <details className={hint}>
          <summary className="cursor-pointer text-silver">Banned this show ({data.bans.length})</summary>
          <ul className="mt-1 space-y-1">
            {data.bans.map((b) => (
              <li key={b.viewer_tag} className="flex items-center gap-2">
                <span className="font-mono">#{b.viewer_tag}</span>
                <Button size="dense" variant="ghost" disabled={busy} onClick={() => void act({ action: 'unban', viewerTag: b.viewer_tag })}>
                  Unban
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className={hint}>
        Chat is off until you turn it on. Phone numbers, emails, links, addresses, handles and “real name is…” style
        messages are blocked before they are stored; flagged messages mention self-harm or are shouting. Ban hides
        everything from that browser for this show. Viewer tags are hashed — no IPs are kept.
      </p>
    </div>
  )
}
