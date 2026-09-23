'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GripHorizontal, Minus, X } from 'lucide-react'
import type { FbotAnswer, FbotSnapshot } from '@/lib/fbot/types'
import { bulletLines, FBOT_BUSY } from '@/lib/fbot/voice'
import { ADMIN_PATH_EVENT, currentAdminPath } from '@/lib/fbot/path-signal'

const STORAGE_KEY = 'fitf-fbot'
const MASCOT = 56
const CHAT_W = 360
const CHAT_H = 500

type Point = { x: number; y: number }
type Persist = {
  hidden: boolean
  open: boolean
  mascot: Point
  chat: Point
}

type Message =
  | { id: string; role: 'you'; text: string }
  | { id: string; role: 'bot'; text?: string; answers?: FbotAnswer[]; snapshot?: FbotSnapshot | null }

function clamp(point: Point, w: number, h: number): Point {
  if (typeof window === 'undefined') return point
  return {
    x: Math.min(Math.max(8, point.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, point.y), Math.max(8, window.innerHeight - h - 8)),
  }
}

function defaults(): Persist {
  if (typeof window === 'undefined') {
    return { hidden: false, open: false, mascot: { x: 24, y: 24 }, chat: { x: 24, y: 24 } }
  }
  return {
    hidden: false,
    open: false,
    mascot: { x: window.innerWidth - MASCOT - 24, y: window.innerHeight - MASCOT - 24 },
    chat: { x: window.innerWidth - CHAT_W - 24, y: window.innerHeight - CHAT_H - 96 },
  }
}

function readPersist(): Persist {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Persist>
    return {
      hidden: Boolean(parsed.hidden),
      open: Boolean(parsed.open),
      mascot: clamp(parsed.mascot || base.mascot, MASCOT, MASCOT),
      chat: clamp(parsed.chat || base.chat, CHAT_W, CHAT_H),
    }
  } catch {
    return base
  }
}

function InstructionBody({ text }: { text: string }) {
  const lines = bulletLines(text)
  if (lines.length <= 1) {
    return <p className="text-xs leading-5 text-[#B8C4CF]">{lines[0] || text}</p>
  }
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-[#B8C4CF]">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}
function snapshotLines(snap: FbotSnapshot | null | undefined) {
  if (!snap) return []
  return [
    snap.nextTopic ? `Next topic: ${snap.nextTopic.title}` : null,
    snap.nextDraft ? `Latest draft: ${snap.nextDraft.title}` : null,
    `${snap.drafts} drafts · ${snap.published} published`,
    `${snap.subscribers} subscribers (${snap.newSubs7d} new / 7d)`,
    `${snap.liveCampaigns} live campaigns · ${snap.pendingGifts} gifts to confirm`,
    snap.nextEpisode
      ? `Podcast: ${snap.nextEpisode.title}${snap.nextEpisode.detail ? ` — ${snap.nextEpisode.detail}` : ''}`
      : null,
    snap.podcastPlaysToday != null ? `Podcast plays today: ${snap.podcastPlaysToday}` : snap.podcastPlaysNote,
    snap.newsletterDrafts > 0 ? `${snap.newsletterDrafts} newsletter drafts` : null,
    snap.activeAds > 0 ? `${snap.activeAds} active ad campaigns` : null,
  ].filter(Boolean) as string[]
}

function useDrag(onMove: (dx: number, dy: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    start.current = { x: event.clientX, y: event.clientY }
    moved.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true
    if (moved.current) {
      start.current = { x: event.clientX, y: event.clientY }
      onMove(dx, dy)
    }
  }

  const onPointerUp = () => {
    start.current = null
  }

  return {
    moved: () => moved.current,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  }
}

export function FBot() {
  const pathname = usePathname()
  const [adminHref, setAdminHref] = useState(pathname)
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [mascot, setMascot] = useState<Point>({ x: 24, y: 24 })
  const [chat, setChat] = useState<Point>({ x: 24, y: 24 })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [chips, setChips] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const persistRef = useRef<Persist | null>(null)

  const writePersist = useCallback((next: Persist) => {
    persistRef.current = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota */
    }
  }, [])

  const save = useCallback(
    (patch: Partial<Persist>) => {
      const current = persistRef.current || {
        hidden,
        open,
        mascot,
        chat,
      }
      const next = { ...current, ...patch }
      writePersist(next)
    },
    [hidden, open, mascot, chat, writePersist],
  )

  useEffect(() => {
    const stored = readPersist()
    persistRef.current = stored
    setHidden(stored.hidden)
    setOpen(stored.open)
    setMascot(stored.mascot)
    setChat(stored.chat)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    save({ hidden, open, mascot, chat })
  }, [ready, hidden, open, mascot, chat, save])

  useEffect(() => {
    function onResize() {
      setMascot((p) => clamp(p, MASCOT, MASCOT))
      setChat((p) => clamp(p, CHAT_W, CHAT_H))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const greet = useCallback(async (href: string) => {
    try {
      const res = await fetch(`/api/admin/fbot?path=${encodeURIComponent(href)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'FBot could not load')
      setChips(data.chips || [])
      setMessages((rows) => {
        if (rows.some((row) => row.role === 'you')) return rows
        return [
          {
            id: `greet-${href}`,
            role: 'bot',
            text: data.greeting,
            snapshot: data.snapshot,
          },
        ]
      })
    } catch (err) {
      setMessages([
        {
          id: 'greet-error',
          role: 'bot',
          text: err instanceof Error ? err.message : 'FBot could not load context.',
        },
      ])
    }
  }, [])

  const greetedFor = useRef<string | null>(null)
  useEffect(() => {
    function syncPath() {
      setAdminHref(currentAdminPath())
    }
    syncPath()
    window.addEventListener(ADMIN_PATH_EVENT, syncPath)
    window.addEventListener('popstate', syncPath)
    return () => {
      window.removeEventListener(ADMIN_PATH_EVENT, syncPath)
      window.removeEventListener('popstate', syncPath)
    }
  }, [pathname])

  useEffect(() => {
    if (!ready || hidden || !open) return
    if (greetedFor.current === adminHref) return
    greetedFor.current = adminHref
    void greet(adminHref)
  }, [ready, hidden, open, adminHref, greet])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, busy])

  const mascotDrag = useDrag((dx, dy) => {
    setMascot((p) => clamp({ x: p.x + dx, y: p.y + dy }, MASCOT, MASCOT))
  })
  const chatDrag = useDrag((dx, dy) => {
    setChat((p) => clamp({ x: p.x + dx, y: p.y + dy }, CHAT_W, 64))
  })

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages((rows) => [...rows, { id: `you-${Date.now()}`, role: 'you', text: q }])
    setBusy(true)
    try {
      const res = await fetch('/api/admin/fbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, path: currentAdminPath() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'FBot could not answer')
      setChips(data.chips || [])
      setMessages((rows) => [
        ...rows,
        {
          id: `bot-${Date.now()}`,
          role: 'bot',
          answers: data.answers,
        },
      ])
    } catch (err) {
      setMessages((rows) => [
        ...rows,
        {
          id: `err-${Date.now()}`,
          role: 'bot',
          text: err instanceof Error ? err.message : 'FBot could not answer.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div className="print:hidden">
      {hidden ? (
        <button
          type="button"
          className="fixed z-[80] right-0 top-1/2 -translate-y-1/2 rounded-l-lg border border-[#53D6FF]/50 bg-[#0A1820] px-2 py-3 text-[11px] font-semibold tracking-[0.14em] text-[#8DEBFF]"
          onClick={() => {
            setHidden(false)
            setOpen(true)
          }}
        >
          FBot
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label={open ? 'Close FBot chat' : 'Open FBot'}
            className="fixed z-[80] flex h-14 w-14 select-none items-center justify-center rounded-full border border-[#8DEBFF]/50 bg-[#53D6FF] text-xl font-black text-[#05070A] shadow-[0_0_24px_rgba(83,214,255,0.45)] touch-none"
            style={{ left: mascot.x, top: mascot.y }}
            {...mascotDrag.handlers}
            onClick={() => {
              if (mascotDrag.moved()) return
              setOpen((value) => !value)
            }}
          >
            F
          </button>
          {!open && (
            <span
              className="pointer-events-none fixed z-[80] text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8DEBFF]"
              style={{ left: mascot.x + 4, top: mascot.y + MASCOT + 4 }}
            >
              FBot
            </span>
          )}
        </>
      )}

      {open && !hidden && (
        <section
          className="fixed z-[81] flex flex-col overflow-hidden rounded-2xl border border-[#27313B] bg-[#0C1116] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ left: chat.x, top: chat.y, width: CHAT_W, height: CHAT_H }}
          aria-label="FBot helper"
        >
          <header
            className="flex cursor-grab items-center gap-2 border-b border-[#27313B] bg-[#121A22] px-3 py-2 touch-none active:cursor-grabbing"
            {...chatDrag.handlers}
          >
            <GripHorizontal size={14} className="text-[#53D6FF]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#8DEBFF]">FBot</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#A9B8C6]">Helpful · bullets · not AI</p>
            </div>
            <button
              type="button"
              aria-label="Hide FBot"
              className="rounded p-1 text-[#A9B8C6] hover:bg-[#1A232C] hover:text-[#F6FAFC]"
              onClick={() => {
                setOpen(false)
                setHidden(true)
              }}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              aria-label="Close FBot chat"
              className="rounded p-1 text-[#A9B8C6] hover:bg-[#1A232C] hover:text-[#F6FAFC]"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'you' ? 'ml-8' : 'mr-4'}>
                {message.role === 'you' ? (
                  <p className="rounded-xl bg-[#1A232C] px-3 py-2 text-sm text-[#F6FAFC]">{message.text}</p>
                ) : (
                  <div className="space-y-2">
                    {message.text && (
                      <p className="rounded-xl border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#D5DEE6]">
                        {message.text}
                      </p>
                    )}
                    {message.snapshot && (
                      <ul className="rounded-xl border border-[#53D6FF]/20 bg-[#0A1820] px-3 py-2 text-xs text-[#8DEBFF] space-y-1">
                        {snapshotLines(message.snapshot).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {message.answers?.map((answer) => (
                      <article
                        key={`${message.id}-${answer.title}`}
                        className="rounded-xl border border-[#27313B] bg-[#151B22] px-3 py-2"
                      >
                        <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#F6FAFC]">
                          {answer.title}
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[#53D6FF]">{answer.source}</span>
                        </p>
                        <InstructionBody text={answer.body} />
                        {answer.links.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {answer.links.map((link) => (
                              <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-full border border-[#53D6FF]/30 px-2 py-0.5 text-[11px] text-[#8DEBFF] hover:bg-[#0A1820]"
                              >
                                {link.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-[#A9B8C6]">{FBOT_BUSY}</p>}
          </div>

          <div className="border-t border-[#27313B] px-3 py-2">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border border-[#27313B] px-2 py-1 text-[11px] text-[#D5DEE6] hover:border-[#53D6FF]/40 hover:text-[#8DEBFF]"
                  onClick={() => void ask(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void ask(input)
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask FBot about this admin…"
                className="h-9 flex-1 rounded-lg border border-[#27313B] bg-[#0A1016] px-2 text-sm text-[#F6FAFC] placeholder:text-[#6B7A88] outline-none focus:border-[#53D6FF]/50"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="h-9 rounded-lg bg-[#53D6FF] px-3 text-sm font-semibold text-[#05070A] disabled:opacity-40"
              >
                Ask
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  )
}
