'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, ChevronRight, Headphones, Maximize2, Minimize2, Radio, Square, Users } from 'lucide-react'

import { Button, Chip, IconButton, Panel, RecordButton, SegmentedControl } from '@/components/studio-ui'
import { createActiveSpeakerTracker } from '@/lib/podcast/active-speaker'
import {
  gridClass,
  laneIndexById,
  mmss,
  recentTakes,
  takesSummary,
  type BoothTakeSummary,
} from '@/lib/podcast/booth-layout'
import { laneColor } from '@/lib/podcast/lanes'

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
export type BoothLayout = 'grid' | 'auto'

/**
 * Everything the booth needs to render — owned by the editor, never here. The
 * inline Sound Booth stage and the full-screen Recording Booth overlay both
 * render this one component, so there is exactly one booth UI and zero
 * duplicated recording/takes/stream state.
 */
export type BoothStageProps = {
  /** 'inline' fills the stage under the production-room header; 'modal' is the full-screen overlay body. */
  variant: 'inline' | 'modal'
  title?: string
  participants: BoothParticipant[]
  recording: boolean
  tally: BoothTally
  countdownSec?: number | null
  elapsedSec: number
  /** A take is armed (or will be auto-armed) — the RecordButton reads "armed". */
  canRecord: boolean
  onToggleRecord: () => void
  onToggleMute: (id: string) => void
  onToggleCamera: (id: string) => void
  /** Talkback to the remote guest (only meaningful once a guest is in the room). */
  talkbackOn?: boolean
  talkbackAvailable?: boolean
  onToggleTalkback?: () => void
  /** Cue mix in the host's headphones while recording. */
  cueEnabled?: boolean
  onCueEnabledChange?: (on: boolean) => void
  /** Lead-in (preroll) seconds and metronome count-in beats. */
  preroll?: number
  onPrerollChange?: (sec: number) => void
  countInBeats?: number
  onCountInChange?: (beats: number) => void
  /** Takes already on the timeline (for the counter, the drawer list and "Re-record from here"). */
  takes?: BoothTakeSummary[]
  /** Click a take in the drawer → the editor jumps to Edit with it selected. */
  onOpenTake?: (id: string) => void
  /** Punch in at the playhead (record mode "Re-record from here"). */
  onRerecordFromHere?: () => void
  onMarkChapter?: () => void
  /** Small program monitor for the transport bar (when a switch EDL / program exists). */
  programMonitor?: React.ReactNode
  /** Remote guest invite / room panel for the drawer. */
  invitePanel?: React.ReactNode
  /** Extra transport controls (Advanced toggle, metronome…) — rendered at the far end of the transport. */
  extraControls?: React.ReactNode
  /** Inline only: expand to the full-screen overlay. */
  onExpand?: () => void
  /** Modal only: leave the overlay (recording keeps rolling). */
  onExit?: () => void
  /** Move focus to the RecordButton when the stage mounts (Sound Booth opens). */
  autoFocusRecord?: boolean
  /** Tailwind min-height for the inline stage (defaults to the viewport minus the sticky header). */
  minHeightClass?: string
  /** Inline alerts (camera size warning, input lost…) shown above the transport. */
  notices?: React.ReactNode
}

/** True when a keydown should be ignored because the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const DEFAULT_MIN_H = 'min-h-[calc(100dvh-var(--studio-header-h,168px)-5rem)]'

export function BoothStage(props: BoothStageProps): React.JSX.Element {
  const {
    variant,
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
    talkbackAvailable,
    onToggleTalkback,
    cueEnabled,
    onCueEnabledChange,
    preroll,
    onPrerollChange,
    countInBeats,
    onCountInChange,
    takes = [],
    onOpenTake,
    onRerecordFromHere,
    onMarkChapter,
    programMonitor,
    invitePanel,
    extraControls,
    onExpand,
    onExit,
    autoFocusRecord,
    minHeightClass,
    notices,
  } = props

  const inline = variant === 'inline'
  const countIn = tally === 'count-in'
  const [layout, setLayout] = useState<BoothLayout>('grid')
  const [drawerOpen, setDrawerOpen] = useState(inline)
  const laneById = useMemo(() => laneIndexById(participants), [participants])

  // --- Active speaker -----------------------------------------------------
  // One shared loop samples the per-tile levels ~20/s and advances the
  // deterministic tracker; React only re-renders when the speaker flips.
  const [activeId, setActiveId] = useState<string | null>(null)
  const levelsRef = useRef<Map<string, number>>(new Map())
  const trackerRef = useRef(createActiveSpeakerTracker())
  const activeIdRef = useRef<string | null>(null)
  const handleTileLevel = useCallback((id: string, level: number) => {
    levelsRef.current.set(id, level)
  }, [])
  const trackSpeakers = participants.length > 1 || layout === 'auto'
  useEffect(() => {
    if (!trackSpeakers) return
    const tracker = trackerRef.current
    tracker.reset()
    activeIdRef.current = null
    let raf = 0
    let lastTick = 0
    let primed = false
    const TICK_MS = 50
    const loop = (now: number) => {
      if (now - lastTick >= TICK_MS) {
        lastTick = now
        const samples = Array.from(levelsRef.current, ([id, level]) => ({ id, level }))
        const next = tracker.update(samples, now)
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
  }, [trackSpeakers])
  useEffect(() => {
    const live = new Set(participants.map((p) => p.id))
    for (const id of levelsRef.current.keys()) if (!live.has(id)) levelsRef.current.delete(id)
  }, [participants])

  const mainParticipant = participants.find((p) => p.id === activeId) ?? participants[0] ?? null
  const pipParticipants = mainParticipant ? participants.filter((p) => p.id !== mainParticipant.id) : []

  // --- Focus the RecordButton when the stage opens ---------------------------
  const recordRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (autoFocusRecord) recordRef.current?.focus({ preventScroll: true })
    // Only on mount: the editor re-renders this stage on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- aria-live tally ------------------------------------------------------
  const liveText = countIn
    ? 'Count-in'
    : recording
      ? 'Recording started'
      : tally === 'stopped'
        ? 'Recording stopped'
        : ''

  const recordState = recording ? 'recording' : countIn || canRecord ? 'armed' : 'idle'
  const recordLabel = recording ? 'Stop recording' : canRecord ? 'Start recording' : 'Arm a take to record'
  const recent = recentTakes(takes)
  const hasDrawer = Boolean(invitePanel) || takes.length > 0

  const tileProps = (p: BoothParticipant) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    videoStream: p.videoStream,
    audioStream: p.audioStream,
    hasLiveVideo: p.hasLiveVideo,
    muted: p.muted,
    cameraOn: p.cameraOn,
    connection: p.connection,
    onToggleMute,
    onToggleCamera,
    onLevel: handleTileLevel,
    laneIndex: laneById.get(p.id) ?? 0,
  })

  const stage =
    participants.length === 0 ? (
      <div className="studio-type-body flex h-full min-h-[14rem] w-full items-center justify-center rounded-tile border border-dashed border-divider text-silver-label">
        No one in the booth yet — turn on a camera or invite a guest.
      </div>
    ) : layout === 'auto' && mainParticipant ? (
      <div className="relative h-full min-h-[14rem] w-full">
        <BoothTile key={mainParticipant.id} {...tileProps(mainParticipant)} variant="main" active />
        {pipParticipants.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-end gap-2 overflow-x-auto sm:gap-3">
            {pipParticipants.map((p) => (
              <div
                key={p.id}
                className="pointer-events-auto aspect-video w-32 shrink-0 overflow-hidden rounded-tile shadow-depth-lg sm:w-48 lg:w-56"
              >
                <BoothTile {...tileProps(p)} variant="pip" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ) : (
      <div
        className={`grid w-full gap-3 [grid-auto-rows:minmax(theme(spacing.56),1fr)] sm:h-full sm:[grid-auto-rows:1fr] ${gridClass(
          participants.length,
        )}`}
      >
        {participants.map((p) => (
          <BoothTile key={p.id} {...tileProps(p)} active={participants.length > 1 && activeId === p.id} />
        ))}
      </div>
    )

  return (
    <section
      aria-labelledby="sound-booth-heading"
      data-booth-variant={variant}
      className={`flex flex-col ${inline ? `${minHeightClass ?? DEFAULT_MIN_H} bg-obsidian text-white` : 'h-full min-h-0 flex-1'}`}
    >
      {/* Stage header: h2 + on-air tally + layout toggle. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-divider bg-gunmetal px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="sound-booth-heading" className="studio-type-section !text-[15px] text-white">
            Sound Booth
          </h2>
          {title ? <span className="studio-type-body hidden truncate text-silver-label sm:inline">{title}</span> : null}
          <span className="sr-only" role="status" aria-live="assertive">
            {liveText}
          </span>
        </div>
        <div className="flex items-center gap-3">
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
            <Chip tone="accent" dot>
              Count-in{countdownSec != null ? ` ${countdownSec}` : ''}
            </Chip>
          ) : recording ? (
            <Chip tone="record" dot>
              REC {mmss(elapsedSec)}
            </Chip>
          ) : (
            <Chip tone="neutral">{tally === 'stopped' ? 'Stopped' : 'Standby'}</Chip>
          )}
          {hasDrawer ? (
            <Button
              variant={drawerOpen ? 'primary' : 'secondary'}
              size="dense"
              aria-expanded={drawerOpen}
              aria-controls="sound-booth-drawer"
              onClick={() => setDrawerOpen((v) => !v)}
              title="Remote guests and recent takes"
            >
              <Users size={13} /> Guests &amp; takes
            </Button>
          ) : null}
          {inline && onExpand ? (
            <IconButton aria-label="Expand to full screen" title="Expand to full screen" variant="secondary" size="dense" onClick={onExpand}>
              <Maximize2 size={14} />
            </IconButton>
          ) : null}
          {!inline && onExit ? (
            <Button variant="secondary" size="dense" onClick={onExit} title="Back to the production room — recording keeps rolling">
              <Minimize2 size={13} /> Exit full screen
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Video stage + transport */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:overflow-hidden sm:p-4">{stage}</div>

          {notices ? <div className="shrink-0 space-y-2 px-3 pb-2 sm:px-4">{notices}</div> : null}

          {/* Transport — sticky to the bottom on phones so Record is always reachable. */}
          <Panel
            elevation="raised"
            className="sticky bottom-0 z-10 shrink-0 rounded-none border-x-0 border-b-0 px-3 py-3 sm:px-4"
            role="group"
            aria-label="Sound Booth transport"
          >
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:justify-between">
              {/* Left: program monitor (when the session has picture) + lead-in / count-in. */}
              <div className="flex flex-wrap items-center gap-3">
                {programMonitor ? <div className="hidden sm:block">{programMonitor}</div> : null}
                {onPrerollChange ? (
                  <label className="studio-type-label flex items-center gap-1.5 normal-case tracking-normal text-silver-label">
                    Lead-in
                    <select
                      aria-label="Lead-in before recording"
                      className="rounded-control border border-divider bg-surface-raised px-2 py-1 text-xs text-white"
                      value={preroll ?? 0}
                      disabled={recording}
                      onChange={(e) => onPrerollChange(Number(e.target.value))}
                    >
                      <option value={0}>None</option>
                      <option value={1}>1s</option>
                      <option value={3}>3s</option>
                      <option value={5}>5s</option>
                    </select>
                  </label>
                ) : null}
                {onCountInChange ? (
                  <label className="studio-type-label flex items-center gap-1.5 normal-case tracking-normal text-silver-label">
                    Count-in
                    <select
                      aria-label="Count-in beats"
                      className="rounded-control border border-divider bg-surface-raised px-2 py-1 text-xs text-white"
                      value={countInBeats ?? 0}
                      disabled={recording}
                      onChange={(e) => onCountInChange(Number(e.target.value))}
                    >
                      <option value={0}>Off</option>
                      <option value={2}>2 beats</option>
                      <option value={4}>4 beats</option>
                    </select>
                  </label>
                ) : null}
              </div>

              {/* Centre: the big record button, timecode, takes counter, stop. */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <RecordButton
                    ref={recordRef}
                    state={recordState}
                    size={inline ? 72 : 56}
                    aria-label={recordLabel}
                    onClick={onToggleRecord}
                    data-autofocus
                  />
                  {countIn && countdownSec != null ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums text-white drop-shadow"
                    >
                      {countdownSec}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="studio-type-timecode text-white" aria-label="Elapsed">
                    {mmss(elapsedSec)}
                  </span>
                  <span className="studio-type-label text-silver-label" data-testid="booth-takes-counter">
                    {takesSummary(takes)}
                  </span>
                </div>
                {recording ? (
                  <Button variant="danger" size="compact" onClick={onToggleRecord} title="Stop — the take lands on the timeline">
                    <Square size={13} /> Stop
                  </Button>
                ) : takes.length > 0 && onRerecordFromHere ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={onRerecordFromHere}
                    title="Punch in at the playhead while the mix plays in your headphones"
                  >
                    Re-record from here
                  </Button>
                ) : null}
              </div>

              {/* Right: talkback, cue, chapter, extras. */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onToggleTalkback ? (
                  <Button
                    variant={talkbackOn ? 'primary' : 'secondary'}
                    size="compact"
                    aria-pressed={Boolean(talkbackOn)}
                    disabled={!talkbackAvailable}
                    onClick={onToggleTalkback}
                    title={talkbackAvailable ? 'Talk to the guest off-air' : 'Talkback needs a remote guest in the room'}
                  >
                    <Radio size={13} /> Talkback
                  </Button>
                ) : null}
                {onCueEnabledChange ? (
                  <Button
                    variant={cueEnabled ? 'primary' : 'secondary'}
                    size="compact"
                    aria-pressed={Boolean(cueEnabled)}
                    onClick={() => onCueEnabledChange(!cueEnabled)}
                    title="Cue mix: the other lanes play in your headphones while you record"
                  >
                    <Headphones size={13} /> Hear the mix in headphones
                  </Button>
                ) : null}
                <IconButton
                  aria-label="Mark a chapter here"
                  title="Mark a chapter at the current time"
                  variant="secondary"
                  size="compact"
                  disabled={!onMarkChapter}
                  onClick={onMarkChapter}
                >
                  <BookmarkPlus size={15} />
                </IconButton>
                {extraControls}
              </div>
            </div>
          </Panel>
        </div>

        {/* Drawer: remote guests + recent takes. Right column on desktop, below on phones. */}
        {hasDrawer && drawerOpen ? (
          <aside
            id="sound-booth-drawer"
            aria-label="Guests and takes"
            className="shrink-0 space-y-4 overflow-y-auto border-t border-divider bg-gunmetal p-4 lg:w-80 lg:border-l lg:border-t-0 xl:w-96"
          >
            {takes.length > 0 ? (
              <div className="space-y-2">
                <p className="studio-type-label text-ice">Recent takes</p>
                <ul className="space-y-1">
                  {recent.map((t) => {
                    const lane = laneColor(t.laneIndex)
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTake?.(t.id)}
                          disabled={!onOpenTake}
                          className="studio-type-body flex w-full items-center gap-2 rounded-control border border-divider bg-obsidian px-2.5 py-2 text-left text-silver-body transition-[border-color,box-shadow] hover:border-forged/60 hover:text-white hover:shadow-glow-subtle disabled:opacity-60"
                          title="Open this take in Edit"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: lane.base }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{t.person}</span>
                          <span className="font-mono text-xs text-silver-label">{mmss(t.durationSec)}</span>
                          <ChevronRight size={13} className="text-silver-label" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            {invitePanel ? (
              <div className="space-y-2">
                <p className="studio-type-label text-ice">Remote guests</p>
                {invitePanel}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  )
}
