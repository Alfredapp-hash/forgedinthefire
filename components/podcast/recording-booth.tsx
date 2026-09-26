'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { RecordButton, SegmentedControl } from '@/components/studio-ui'
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
 *
 * On phones (<640px) every case collapses to a SINGLE column so tiles stay
 * tappable; the stage scrolls vertically (see the grid container) rather than
 * cramming 3-across into a narrow viewport. Row auto-sizing + a per-tile min
 * height keep each tile a usable size on small screens.
 */
function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 sm:grid-rows-1'
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-1'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
  if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
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
      // Esc is handled by the <dialog>'s native cancel event (see onCancel).
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

  // Stable lane hue per participant, GarageBand-style. Host → lane 0 (forged
  // blue), the sole guest → lane 1 (ice), and everyone else fans out across
  // the remaining cohost lanes (2…) by encounter order so each person keeps a
  // distinct, consistent accent. laneColor() wraps the index for large casts.
  const laneIndexById = useMemo(() => {
    const map = new Map<string, number>()
    let next = 2
    let guestTaken = false
    for (const p of participants) {
      if (p.role === 'host') {
        map.set(p.id, 0)
      } else if (p.role === 'guest' && !guestTaken) {
        map.set(p.id, 1)
        guestTaken = true
      } else {
        map.set(p.id, next++)
      }
    }
    return map
  }, [participants])

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

  // Drive the native modal so the booth sits in the browser top layer (above
  // native <select> popups and everything else) and the page behind goes inert.
  // `<dialog showModal>` traps Tab within the dialog natively; we add the focus
  // RETURN (native dialogs don't restore focus to the trigger) and move initial
  // focus into the dialog so keyboard users start inside the trap.
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dlg = dialogRef.current
    if (open && mounted && dlg && !dlg.open) {
      triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
      dlg.showModal()
      const initial = dlg.querySelector<HTMLElement>('[data-autofocus]')
      initial?.focus()
    }
    return () => {
      const trigger = triggerRef.current
      if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) {
        trigger.focus()
      }
      triggerRef.current = null
    }
  }, [open, mounted])

  if (!open || !mounted) return null

  const overlay = (
    <dialog
      ref={dialogRef}
      aria-label={title ? `Recording booth — ${title}` : 'Recording booth'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="admin-portal fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none flex-col border-0 bg-obsidian p-0 text-white backdrop:bg-obsidian"
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-divider bg-gunmetal px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="studio-type-label hidden text-silver-label sm:inline">On air</span>
          <h1 className="truncate text-sm font-medium text-white sm:text-base">
            {title || 'Untitled episode'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Layout toggle: Grid (default) vs Auto (active-speaker). The Auto
              hint ("Active speaker becomes the main camera") is surfaced via a
              native tooltip on the group and folded into the group's accessible
              name, since the SegmentedControl exposes no per-option aria. */}
          <span title="Auto: the active speaker becomes the main camera">
            <SegmentedControl
              aria-label="Camera layout — Auto makes the active speaker the main camera"
              size="dense"
              value={layout}
              onValueChange={setLayout}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'auto', label: 'Auto' },
              ]}
            />
          </span>

          {countIn ? (
            <div className="flex items-center gap-2" aria-live="assertive">
              <span className="studio-type-label text-ice">Count-in</span>
              <span className="min-w-[2ch] text-center text-3xl font-semibold tabular-nums text-ice">
                {countdownSec ?? ''}
              </span>
            </div>
          ) : recording ? (
            <div className="flex items-center gap-3" aria-live="polite">
              {/* Tactile heartbeat REC affordance — the rim pulses on the
                  studio record cadence (reduced-motion → static rim). */}
              <span
                className="studio-rec-recording flex h-3 w-3 items-center justify-center rounded-full bg-heart"
                aria-hidden="true"
              />
              <span className="studio-type-label text-heart">Rec</span>
              <span className="studio-type-timecode text-white">{mmss(elapsedSec)}</span>
            </div>
          ) : (
            <span className="studio-type-label text-silver-label">
              {tally === 'stopped' ? 'Stopped' : 'Standby'}
            </span>
          )}
        </div>
      </header>

      {/* Participant stage. On phones the grid stacks single-column and scrolls
          vertically (overflow-y-auto), so tiles never get crushed; from sm up it
          is a fixed, non-scrolling equal grid. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto p-4 sm:overflow-hidden">
        {tiles.length === 0 ? (
          <div className="studio-type-body flex h-full w-full items-center justify-center rounded-tile border border-dashed border-divider text-silver-label">
            No participants in the booth yet.
          </div>
        ) : layout === 'auto' && mainParticipant ? (
          <div className="relative h-full w-full">
            {/* MAIN — the active speaker, large, with the cyan glow rim. */}
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
              laneIndex={laneIndexById.get(mainParticipant.id) ?? 0}
              active
            />

            {/* PIP strip — everyone else, overlaid along the bottom. With just
                the host, this is empty and the MAIN fills the stage. */}
            {pipParticipants.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-end gap-2 overflow-x-auto sm:gap-3">
                {pipParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="pointer-events-auto aspect-video w-32 shrink-0 overflow-hidden rounded-tile shadow-depth-lg sm:w-48 lg:w-56"
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
                      laneIndex={laneIndexById.get(p.id) ?? 0}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={`grid w-full gap-4 [grid-auto-rows:minmax(theme(spacing.44),1fr)] sm:h-full sm:[grid-auto-rows:1fr] ${gridClass(tiles.length)}`}
          >
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
                laneIndex={laneIndexById.get(p.id) ?? 0}
              />
            ))}
          </div>
        )}
      </main>

      {/* Invite panel (revealed above the control bar) */}
      {inviteOpen && invitePanel ? (
        <div className="shrink-0 border-t border-divider bg-gunmetal px-5 py-4">
          <div className="mx-auto max-w-3xl">{invitePanel}</div>
        </div>
      ) : null}

      {/* Control bar */}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-divider bg-gunmetal px-5 py-4">
        <div className="flex items-center gap-2">
          {onToggleTalkback ? (
            <button
              type="button"
              onClick={onToggleTalkback}
              aria-pressed={Boolean(talkbackOn)}
              className={`studio-type-button flex h-control-compact items-center gap-2 rounded-control border px-3.5 transition-colors ${
                talkbackOn
                  ? 'border-forged bg-forged/10 text-ice shadow-glow-subtle'
                  : 'border-divider bg-surface-card text-silver-label hover:border-forged/40 hover:text-white'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${talkbackOn ? 'bg-forged' : 'bg-divider'}`} />
              Talkback
            </button>
          ) : null}

          {invitePanel ? (
            <button
              type="button"
              onClick={handleAddGuest}
              aria-expanded={inviteOpen}
              className={`studio-type-button flex h-control-compact items-center gap-2 rounded-control border px-3.5 transition-colors ${
                inviteOpen
                  ? 'border-forged bg-forged/10 text-ice shadow-glow-subtle'
                  : 'border-divider bg-surface-card text-silver-label hover:border-forged/40 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">+</span>
              Add guest
            </button>
          ) : null}
        </div>

        {/* Primary record / stop — the signature tactile RecordButton, with a
            label so the affordance reads clearly in the control bar. */}
        <div className="flex items-center gap-3">
          {/* The RecordButton is the booth's primary action, so it takes initial
              focus when the dialog opens. During count-in the big countdown
              number is overlaid on the button so the beat reads at a glance. */}
          <div className="relative">
            <RecordButton
              state={recording ? 'recording' : countIn ? 'armed' : 'idle'}
              size={52}
              disabled={!canRecord}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              onClick={onToggleRecord}
              data-autofocus
            />
            {countIn && countdownSec != null ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums text-white drop-shadow"
              >
                {countdownSec}
              </span>
            ) : null}
          </div>
          <span className="studio-type-button hidden text-silver-label sm:inline">
            {recording ? 'Stop' : 'Record'}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="studio-type-button flex h-control-compact items-center gap-2 rounded-control border border-divider bg-surface-card px-3.5 text-silver-label transition-colors hover:border-forged/40 hover:text-white"
        >
          Exit booth
        </button>
      </footer>
    </dialog>
  )

  return createPortal(overlay, document.body)
}
