'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { createActiveSpeakerTracker } from '@/lib/podcast/active-speaker'

import { BoothTile } from './booth-tile'

type BoothLayout = 'grid' | 'auto'

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

  // --- Active-speaker (Auto layout) machinery -------------------------------
  const [layout, setLayout] = useState<BoothLayout>('grid')
  // The MAIN participant id in Auto mode. This is the ONLY value that re-renders
  // the booth as people talk — it flips at most a few times a second thanks to
  // the tracker's hold/release debounce, never per audio frame.
  const [activeId, setActiveId] = useState<string | null>(null)

  // Latest level per participant, written by tiles via onLevel (a ref sink, so
  // tile callbacks never trigger a React render here).
  const levelsRef = useRef<Map<string, number>>(new Map())
  const trackerRef = useRef(createActiveSpeakerTracker())
  const activeIdRef = useRef<string | null>(null)

  const handleTileLevel = useCallback((id: string, level: number) => {
    levelsRef.current.set(id, level)
  }, [])

  // Drive the tracker only while Auto is engaged and the booth is open. A single
  // shared loop samples the collected levels ~20/s, advances the deterministic
  // tracker, and commits a state change only when the MAIN id actually flips.
  const autoActive = open && layout === 'auto'
  useEffect(() => {
    if (!autoActive) return
    const tracker = trackerRef.current
    // Start from a clean decision each time Auto is (re)engaged. We reset the
    // tracker + refs here but let the RAF loop below commit the first React
    // state — never calling setState synchronously in the effect body.
    tracker.reset()
    activeIdRef.current = null

    let raf = 0
    let lastTick = 0
    let primed = false
    const TICK_MS = 50 // ~20 evaluations/sec — plenty for hold/release timing
    const loop = (now: number) => {
      if (now - lastTick >= TICK_MS) {
        lastTick = now
        const samples = Array.from(levelsRef.current, ([id, level]) => ({ id, level }))
        const next = tracker.update(samples, now)
        // Commit when the MAIN flips, and once on the first tick to clear any
        // stale id carried over from a previous Auto session.
        if (next !== activeIdRef.current || !primed) {
          primed = true
          activeIdRef.current = next
          setActiveId(next)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [autoActive])

  // Drop stale level entries when participants leave so a departed id can never
  // be picked as MAIN.
  useEffect(() => {
    const live = new Set(participants.map((p) => p.id))
    for (const id of levelsRef.current.keys()) {
      if (!live.has(id)) levelsRef.current.delete(id)
    }
  }, [participants])

  // Resolve the MAIN participant, falling back to the first tile so Auto always
  // has something on the big slot (e.g. before anyone has spoken, or a lone host).
  const mainParticipant =
    tiles.find((p) => p.id === activeId) ?? tiles[0] ?? null
  const pipParticipants =
    mainParticipant !== null ? tiles.filter((p) => p.id !== mainParticipant.id) : []

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
          {/* Layout toggle: Grid (default) vs Auto (active-speaker). */}
          <div
            role="group"
            aria-label="Camera layout"
            className="flex items-center gap-0.5 rounded-lg border border-[#27313B] bg-[#05070A] p-0.5"
          >
            <button
              type="button"
              onClick={() => setLayout('grid')}
              aria-pressed={layout === 'grid'}
              className={`h-7 rounded-md px-3 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                layout === 'grid'
                  ? 'bg-[#0d2530] text-[#8DEBFF]'
                  : 'text-[#A9B8C6] hover:text-[#F6FAFC]'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setLayout('auto')}
              aria-pressed={layout === 'auto'}
              title="Active speaker becomes the main camera"
              className={`h-7 rounded-md px-3 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                layout === 'auto'
                  ? 'bg-[#0d2530] text-[#8DEBFF]'
                  : 'text-[#A9B8C6] hover:text-[#F6FAFC]'
              }`}
            >
              Auto
            </button>
          </div>

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

      {/* Participant stage */}
      <main className="relative min-h-0 flex-1 overflow-hidden p-4">
        {tiles.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[#27313B] text-sm text-[#A9B8C6]">
            No participants in the booth yet.
          </div>
        ) : layout === 'auto' && mainParticipant ? (
          <div className="relative h-full w-full">
            {/* MAIN — the active speaker, large. */}
            <BoothTile
              key={mainParticipant.id}
              id={mainParticipant.id}
              name={mainParticipant.name}
              role={mainParticipant.role}
              videoStream={mainParticipant.videoStream}
              audioStream={mainParticipant.audioStream}
              hasLiveVideo={mainParticipant.hasLiveVideo}
              muted={mainParticipant.muted}
              cameraOn={mainParticipant.cameraOn}
              connection={mainParticipant.connection}
              onToggleMute={onToggleMute}
              onToggleCamera={onToggleCamera}
              onLevel={handleTileLevel}
              variant="main"
            />

            {/* PIP strip — everyone else, overlaid along the bottom. With just
                the host, this is empty and the MAIN fills the stage. */}
            {pipParticipants.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-end gap-3">
                {pipParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="pointer-events-auto aspect-video w-40 shrink-0 overflow-hidden rounded-lg shadow-lg shadow-black/40 sm:w-48 lg:w-56"
                  >
                    <BoothTile
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
                      onLevel={handleTileLevel}
                      variant="pip"
                    />
                  </div>
                ))}
              </div>
            ) : null}
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
                onLevel={handleTileLevel}
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
