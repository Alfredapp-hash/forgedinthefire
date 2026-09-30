'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { laneColor } from '@/components/studio-ui'

import type { BoothConnection, BoothParticipantRole } from './recording-booth'

/**
 * A single on-air tile: live video (or a clean camera-off placeholder), a name +
 * role chip, an independent Web Audio level meter, a mute indicator, a guest
 * connection badge, and per-tile mute/camera toggles.
 *
 * The `<video>` is force-muted so the tiles never contribute to the monitor mix
 * — real audio is monitored elsewhere and doubling it here would feed back.
 */

const ROLE_LABEL: Record<BoothParticipantRole, string> = {
  host: 'Host',
  cohost: 'Cohost',
  guest: 'Guest',
}

type ConnectionBadge = { label: string; tone: 'wait' | 'warn' | 'fail' | 'idle' }

function connectionBadge(connection: BoothConnection): ConnectionBadge | null {
  switch (connection) {
    case 'linking':
      return { label: 'Linking…', tone: 'wait' }
    case 'dropped':
      return { label: 'Dropped', tone: 'warn' }
    case 'failed':
      return { label: 'Failed', tone: 'fail' }
    case 'offline':
      return { label: 'Offline', tone: 'idle' }
    default:
      return null
  }
}

const BADGE_TONE: Record<ConnectionBadge['tone'], string> = {
  wait: 'border-forged/40 bg-gunmetal/80 text-ice',
  warn: 'border-[#7A5A1E] bg-[#1A130A]/80 text-[#FFC46B]',
  fail: 'border-heart/60 bg-heart/15 text-heart',
  idle: 'border-divider bg-gunmetal/80 text-silver-label',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export type BoothTileProps = {
  id: string
  name: string
  role: BoothParticipantRole
  videoStream: MediaStream | null
  audioStream: MediaStream | null
  hasLiveVideo: boolean
  muted: boolean
  cameraOn: boolean
  connection?: BoothConnection
  onToggleMute: (id: string) => void
  onToggleCamera: (id: string) => void
  /**
   * Optional live-level sink (0..1), throttled to ~12/s. Lets a parent feed an
   * active-speaker tracker. Fires via a ref, so it never re-renders this tile.
   */
  onLevel?: (id: string, level: number) => void
  /** 'pip' renders a denser tile (smaller placeholder / tighter footer). */
  variant?: 'main' | 'pip'
  /**
   * Lane accent index (0 = host, 1 = guest, 2… = cohorts). Drives this
   * participant's persistent GarageBand-style hue on the name chip / ring.
   */
  laneIndex?: number
  /**
   * True when this tile is the Auto-layout active speaker (the MAIN slot).
   * Adds a cyan glow rim + subtle scale so the speaker reads as "live".
   */
  active?: boolean
}

/**
 * Live RMS/peak meter driven off its own AnalyserNode, cleaned up on unmount.
 *
 * `onLevel` (optional) receives the smoothed 0..1 level, throttled to ~12/s, so
 * a parent can drive an active-speaker tracker. It is intentionally a plain
 * number pushed through a ref-stable callback — it never triggers a React
 * re-render of this tile (the meter itself is driven purely via `style`).
 */
function useAudioLevel(
  stream: MediaStream | null,
  active: boolean,
  onLevel?: (level: number) => void,
): React.RefObject<HTMLDivElement | null> {
  const barRef = useRef<HTMLDivElement | null>(null)

  // Keep the latest callback in a ref so changing it never restarts the audio
  // graph (which would tear down and rebuild the AudioContext every render).
  const onLevelRef = useRef(onLevel)
  useEffect(() => {
    onLevelRef.current = onLevel
  }, [onLevel])

  useEffect(() => {
    // Captured for the cleanup closure — the ref may point elsewhere by then.
    const bar = barRef.current
    if (!bar) return
    if (!stream || !active) {
      bar.style.transform = 'scaleX(0)'
      onLevelRef.current?.(0)
      return
    }
    const tracks = stream.getAudioTracks()
    if (tracks.length === 0) {
      bar.style.transform = 'scaleX(0)'
      onLevelRef.current?.(0)
      return
    }

    const AudioCtx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)

    const data = new Float32Array(analyser.fftSize)
    let raf = 0
    let level = 0
    // Throttle upward level reporting to ~12/s (every ~83ms) so we drive the
    // parent's active-speaker tracker without a callback on every single frame.
    let lastReport = 0
    const REPORT_INTERVAL_MS = 83

    const tick = () => {
      analyser.getFloatTimeDomainData(data)
      let sumSquares = 0
      let peak = 0
      for (let i = 0; i < data.length; i += 1) {
        const s = data[i]!
        sumSquares += s * s
        const abs = Math.abs(s)
        if (abs > peak) peak = abs
      }
      const rms = Math.sqrt(sumSquares / data.length)
      // Blend RMS + peak for a lively-but-honest meter, then smooth the decay.
      const target = Math.min(1, rms * 2.2 + peak * 0.35)
      level = target > level ? target : level * 0.82 + target * 0.18
      const el = barRef.current
      if (el) el.style.transform = `scaleX(${level.toFixed(3)})`

      const now = performance.now()
      if (now - lastReport >= REPORT_INTERVAL_MS) {
        lastReport = now
        onLevelRef.current?.(level)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      try {
        source.disconnect()
        analyser.disconnect()
      } catch {
        /* nodes may already be torn down with the context */
      }
      void ctx.close().catch(() => {
        /* closing a context that never started can reject on some browsers */
      })
      bar.style.transform = 'scaleX(0)'
      onLevelRef.current?.(0)
    }
  }, [stream, active])

  return barRef
}

export function BoothTile({
  id,
  name,
  role,
  videoStream,
  audioStream,
  hasLiveVideo,
  muted,
  cameraOn,
  connection,
  onToggleMute,
  onToggleCamera,
  onLevel,
  variant = 'main',
  laneIndex = 0,
  active = false,
}: BoothTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const wantsVideo = hasLiveVideo && cameraOn && Boolean(videoStream)
  const meterActive = !muted && Boolean(audioStream)
  // Persistent GarageBand-style hue for this participant — drives the name
  // chip accent and the placeholder ring so each person reads consistently.
  const lane = laneColor(laneIndex)

  // Bind the tile's id into the level callback so the parent knows who spoke,
  // without the tile ever re-rendering on level changes (delivered via ref).
  const onTileLevel = useCallback(
    (level: number) => {
      onLevel?.(id, level)
    },
    [onLevel, id],
  )
  const meterRef = useAudioLevel(audioStream, meterActive, onTileLevel)
  const isPip = variant === 'pip'

  // Bind the stream and attempt playback. `videoPlaying` gates only the overlay
  // (never whether the <video> renders), so the state update here reflects an
  // external system (the media element) rather than driving a cascading render.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !wantsVideo || !videoStream) {
      setVideoPlaying(false)
      return
    }
    let cancelled = false
    el.srcObject = videoStream
    void el
      .play()
      .then(() => {
        if (!cancelled) setVideoPlaying(true)
      })
      .catch(() => {
        // Autoplay of a muted, playsInline video is normally allowed; if it is
        // blocked we keep the placeholder overlay up rather than a frozen box.
        if (!cancelled) setVideoPlaying(false)
      })
    return () => {
      cancelled = true
      el.srcObject = null
    }
  }, [wantsVideo, videoStream])

  const badge = role === 'guest' ? connectionBadge(connection ?? null) : null
  const showPlaceholder = !wantsVideo || !videoPlaying

  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-tile border bg-obsidian transition-[box-shadow,transform] duration-200 ease-calm ${
        active
          ? // Active speaker: a subtle lift (guarded — motion-safe only) plus the
            // cyan glow rim. Reduced-motion users skip the scale and instead get
            // a stronger, full-opacity forged border so "live" reads without any
            // motion cue.
            'z-10 border-forged shadow-highlight-rim motion-safe:scale-[1.02] motion-safe:border-forged/60'
          : muted
            ? 'border-heart/30 shadow-depth-md'
            : 'border-divider shadow-depth-md'
      }`}
      style={{ willChange: active ? 'transform' : undefined }}
    >
      {/* Video / placeholder */}
      <div className="relative min-h-0 flex-1 bg-obsidian">
        {wantsVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : null}
        {showPlaceholder ? (
          <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-gunmetal to-obsidian">
            <div
              className={`flex items-center justify-center rounded-full border font-semibold tracking-wide ${
                isPip ? 'h-12 w-12 text-base' : 'h-20 w-20 text-2xl'
              }`}
              style={{
                borderColor: lane.border,
                background: lane.laneBg,
                color: lane.base,
              }}
              aria-hidden="true"
            >
              {initials(name)}
            </div>
            {isPip ? null : (
              <span className="studio-type-label text-silver-label">Camera off</span>
            )}
          </div>
        ) : null}

        {/* Top-right badges */}
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5">
          {badge ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${BADGE_TONE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ) : null}
          {muted ? (
            <span className="flex items-center gap-1 rounded-full border border-heart/60 bg-heart/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-heart">
              <span className="h-1.5 w-1.5 rounded-full bg-heart" />
              Muted
            </span>
          ) : null}
        </div>
      </div>

      {/* Meter strip — kit-styled tactile well. The fill is driven imperatively
          by the AnalyserNode via `meterRef` (scaleX), never through React
          state, so metering stays off the render path. Smooth decay lives in
          useAudioLevel. */}
      <div className="px-3 pt-2.5">
        {/* Decorative level indicator — the value is driven imperatively by the
            AnalyserNode via scaleX (never React state), so it carries no ARIA
            role; accessible mic state lives on the mute button below. */}
        <div
          aria-hidden="true"
          className="relative h-2 w-full overflow-hidden rounded-full border border-divider bg-obsidian shadow-inset-well"
        >
          <div
            ref={meterRef}
            className={`h-full w-full origin-left rounded-full ${
              muted ? 'bg-heart/40' : 'bg-gradient-to-r from-forged to-ice'
            }`}
            style={{ transform: 'scaleX(0)', willChange: 'transform' }}
          />
        </div>
      </div>

      {/* Footer: name, role chip, controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {/* Lane accent dot — this participant's persistent hue. */}
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: lane.base }}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-white">{name}</span>
          <span
            className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
            style={{
              borderColor: lane.border,
              background: lane.laneBg,
              color: lane.base,
            }}
          >
            {ROLE_LABEL[role]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleMute(id)}
            aria-pressed={muted}
            aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
            title={muted ? 'Unmute' : 'Mute'}
            className={`flex h-8 w-8 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice ${
              muted
                ? 'border-heart/60 bg-heart/15 text-heart hover:bg-heart/25'
                : 'border-divider bg-surface-card text-silver-label hover:border-forged/40 hover:text-white'
            }`}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            type="button"
            onClick={() => onToggleCamera(id)}
            aria-pressed={!cameraOn}
            aria-label={cameraOn ? `Turn off ${name} camera` : `Turn on ${name} camera`}
            title={cameraOn ? 'Camera off' : 'Camera on'}
            className={`flex h-8 w-8 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ice ${
              cameraOn
                ? 'border-divider bg-surface-card text-silver-label hover:border-forged/40 hover:text-white'
                : 'border-[#7A5A1E] bg-[#1A130A] text-[#FFC46B] hover:bg-[#241a0c]'
            }`}
          >
            {cameraOn ? <CamIcon /> : <CamOffIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --- Inline icons (no external dep) --- */

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 9v-1a3 3 0 0 1 6 0v5M5 11a7 7 0 0 0 10.5 6M12 18v3" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  )
}

function CamIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-3v10l-6-3z" strokeLinejoin="round" />
    </svg>
  )
}

function CamOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M16 10l6-3v10l-6-3M2 8v10a2 2 0 0 0 2 2h10" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  )
}
