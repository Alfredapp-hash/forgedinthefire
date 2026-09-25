'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { BoothTile } from './booth-tile'

export type BoothParticipantRole = 'host' | 'cohost' | 'guest'
export type BoothConnection = 'connected' | 'linking' | 'dropped' | 'failed' | 'offline' | null
export type BoothParticipant = {
  id: string
  name: string
  role: BoothParticipantRole
  videoStream: MediaStream | null
  audioStream: MediaStream | null
  hasLiveVideo: boolean
  muted: boolean
  cameraOn: boolean
  connection?: BoothConnection
}
export type BoothTally = 'idle' | 'count-in' | 'rec' | 'stopped'
export type RecordingBoothProps = {
  open: boolean
  onClose: () => void
  title?: string
  participants: BoothParticipant[]
  recording: boolean
  tally: BoothTally
  countdownSec?: number | null
  elapsedSec: number
  canRecord: boolean
  onToggleRecord: () => void
  onToggleMute: (id: string) => void
  onToggleCamera: (id: string) => void
  talkbackOn?: boolean
  onToggleTalkback?: () => void
  invitePanel?: React.ReactNode
}

/** Store that never emits — used only to distinguish server vs client render. */
function subscribeNoop(): () => void {
  return () => {}
}

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

/**
 * Responsive grid class for an equal tile layout that stays balanced from 1 up
 * to ~6 participants (beyond that it wraps to a dense 3-wide grid).
 *   1 → full · 2 → side-by-side · 3-4 → 2×2 · 5-6 → 3×2
 */
function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1'
  if (count === 2) return 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-2 lg:grid-cols-3'
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function RecordingBooth(props: RecordingBoothProps): React.JSX.Element | null {
  const {
    open,
    onClose,
    title,
    participants,
    recording,
    tally,
    countdownSec,
    elapsedSec,
    canRecord,
    onToggleRecord,
    onToggleMute,
    onToggleCamera,
    talkbackOn,
    onToggleTalkback,
    invitePanel,
  } = props

  // SSR-safe "are we on the client" flag without a setState-in-effect: the store
  // never changes, so this returns false during SSR/first paint and true after.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
  const [inviteOpen, setInviteOpen] = useState(false)

  // Keep the latest callbacks/flags in refs so the global key handler stays
  // stable and never fires a stale callback. Refs are updated inside an effect
  // (never during render).
  const toggleRecordRef = useRef(onToggleRecord)
  const canRecordRef = useRef(canRecord)
  const closeRef = useRef(onClose)
  useEffect(() => {
    toggleRecordRef.current = onToggleRecord
    canRecordRef.current = canRecord
    closeRef.current = onClose
  }, [onToggleRecord, canRecord, onClose])

  // Lock background scroll while the booth is on-air.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Global keyboard: Esc closes, R toggles record (never while typing).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        if (canRecordRef.current) toggleRecordRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleAddGuest = useCallback(() => setInviteOpen((v) => !v), [])

  const tiles = useMemo(() => participants, [participants])
  const countIn = tally === 'count-in'

  if (!open || !mounted) return null

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Recording booth — ${title}` : 'Recording booth'}
      className="fixed inset-0 z-[9999] flex flex-col bg-[#05070A] text-[#F6FAFC]"
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#27313B] bg-[#0B0F14] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden text-[11px] uppercase tracking-[0.2em] text-[#A9B8C6] sm:inline">On air</span>
          <h1 className="truncate text-sm font-medium text-[#F6FAFC] sm:text-base">
            {title || 'Untitled episode'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {countIn ? (
            <div className="flex items-center gap-2" aria-live="assertive">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#8DEBFF]">Count-in</span>
              <span className="min-w-[2ch] text-center text-3xl font-semibold tabular-nums text-[#8DEBFF]">
                {countdownSec ?? ''}
              </span>
            </div>
          ) : recording ? (
            <div className="flex items-center gap-2" aria-live="polite">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF5B73] opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF5B73]" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF8DA0]">Rec</span>
              <span className="text-lg font-semibold tabular-nums text-[#F6FAFC]">{mmss(elapsedSec)}</span>
            </div>
          ) : (
            <span className="text-xs uppercase tracking-wider text-[#A9B8C6]">
              {tally === 'stopped' ? 'Stopped' : 'Standby'}
            </span>
          )}
        </div>
      </header>

      {/* Participant grid */}
      <main className="min-h-0 flex-1 overflow-hidden p-4">
        {tiles.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[#27313B] text-sm text-[#A9B8C6]">
            No participants in the booth yet.
          </div>
        ) : (
          <div className={`grid h-full w-full gap-4 ${gridClass(tiles.length)}`}>
            {tiles.map((p) => (
              <BoothTile
                key={p.id}
                id={p.id}
                name={p.name}
                role={p.role}
                videoStream={p.videoStream}
                audioStream={p.audioStream}
                hasLiveVideo={p.hasLiveVideo}
                muted={p.muted}
                cameraOn={p.cameraOn}
                connection={p.connection}
                onToggleMute={onToggleMute}
                onToggleCamera={onToggleCamera}
              />
            ))}
          </div>
        )}
      </main>

      {/* Invite panel (revealed above the control bar) */}
      {inviteOpen && invitePanel ? (
        <div className="shrink-0 border-t border-[#27313B] bg-[#0B0F14] px-5 py-4">
          <div className="mx-auto max-w-3xl">{invitePanel}</div>
        </div>
      ) : null}

      {/* Control bar */}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#27313B] bg-[#0B0F14] px-5 py-4">
        <div className="flex items-center gap-2">
          {onToggleTalkback ? (
            <button
              type="button"
              onClick={onToggleTalkback}
              aria-pressed={Boolean(talkbackOn)}
              className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                talkbackOn
                  ? 'border-[#53D6FF] bg-[#0d2530] text-[#8DEBFF]'
                  : 'border-[#27313B] bg-[#0B0F14] text-[#A9B8C6] hover:border-[#3A4652] hover:text-[#F6FAFC]'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${talkbackOn ? 'bg-[#53D6FF]' : 'bg-[#3A4652]'}`} />
              Talkback
            </button>
          ) : null}

          {invitePanel ? (
            <button
              type="button"
              onClick={handleAddGuest}
              aria-expanded={inviteOpen}
              className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                inviteOpen
                  ? 'border-[#53D6FF] bg-[#0d2530] text-[#8DEBFF]'
                  : 'border-[#27313B] bg-[#0B0F14] text-[#A9B8C6] hover:border-[#3A4652] hover:text-[#F6FAFC]'
              }`}
            >
              <span className="text-base leading-none">+</span>
              Add guest
            </button>
          ) : null}
        </div>

        {/* Primary record / stop */}
        <button
          type="button"
          onClick={onToggleRecord}
          disabled={!canRecord}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          className={`flex h-12 items-center gap-2.5 rounded-full px-7 text-sm font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            recording
              ? 'bg-[#FF5B73] text-[#05070A] hover:bg-[#ff7186]'
              : 'bg-[#53D6FF] text-[#05070A] hover:bg-[#8DEBFF]'
          }`}
        >
          {recording ? (
            <>
              <span className="h-3.5 w-3.5 rounded-[2px] bg-[#05070A]" />
              Stop
            </>
          ) : (
            <>
              <span className="h-3.5 w-3.5 rounded-full bg-[#05070A]" />
              Record
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center gap-2 rounded-lg border border-[#27313B] bg-[#0B0F14] px-3.5 text-sm font-medium text-[#A9B8C6] transition-colors hover:border-[#3A4652] hover:text-[#F6FAFC]"
        >
          Exit booth
        </button>
      </footer>
    </div>
  )

  return createPortal(overlay, document.body)
}
