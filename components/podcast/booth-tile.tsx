'use client'

import { useEffect, useRef, useState } from 'react'

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
  wait: 'border-[#3A4652] bg-[#0B0F14]/80 text-[#8DEBFF]',
  warn: 'border-[#7A5A1E] bg-[#1A130A]/80 text-[#FFC46B]',
  fail: 'border-[#7A2733] bg-[#1A0A0E]/80 text-[#FF8DA0]',
  idle: 'border-[#27313B] bg-[#0B0F14]/80 text-[#A9B8C6]',
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
}

/** Live RMS/peak meter driven off its own AnalyserNode, cleaned up on unmount. */
function useAudioLevel(stream: MediaStream | null, active: boolean): React.RefObject<HTMLDivElement | null> {
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Captured for the cleanup closure — the ref may point elsewhere by then.
    const bar = barRef.current
    if (!bar) return
    if (!stream || !active) {
      bar.style.transform = 'scaleX(0)'
      return
    }
    const tracks = stream.getAudioTracks()
    if (tracks.length === 0) {
      bar.style.transform = 'scaleX(0)'
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
}: BoothTileProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const wantsVideo = hasLiveVideo && cameraOn && Boolean(videoStream)
  const meterActive = !muted && Boolean(audioStream)
  const meterRef = useAudioLevel(audioStream, meterActive)

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
    <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[#27313B] bg-[#05070A]">
      {/* Video / placeholder */}
      <div className="relative min-h-0 flex-1 bg-[#05070A]">
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
          <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0B0F14] to-[#05070A]">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full border border-[#27313B] bg-[#0B0F14] text-2xl font-semibold tracking-wide text-[#8DEBFF]"
              aria-hidden="true"
            >
              {initials(name)}
            </div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-[#A9B8C6]">Camera off</span>
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
            <span className="rounded-full border border-[#7A2733] bg-[#1A0A0E]/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#FF8DA0]">
              Muted
            </span>
          ) : null}
        </div>
      </div>

      {/* Meter strip */}
      <div className="px-3 pt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0B0F14]">
          <div
            ref={meterRef}
            className={`h-full w-full origin-left rounded-full ${
              muted ? 'bg-[#3A4652]' : 'bg-gradient-to-r from-[#53D6FF] to-[#8DEBFF]'
            }`}
            style={{ transform: 'scaleX(0)', willChange: 'transform' }}
          />
        </div>
      </div>

      {/* Footer: name, role chip, controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-[#F6FAFC]">{name}</span>
          <span className="shrink-0 rounded-md border border-[#27313B] bg-[#0B0F14] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#A9B8C6]">
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
            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-colors ${
              muted
                ? 'border-[#7A2733] bg-[#1A0A0E] text-[#FF8DA0] hover:bg-[#26101499]'
                : 'border-[#27313B] bg-[#0B0F14] text-[#A9B8C6] hover:border-[#3A4652] hover:text-[#F6FAFC]'
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
            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-colors ${
              cameraOn
                ? 'border-[#27313B] bg-[#0B0F14] text-[#A9B8C6] hover:border-[#3A4652] hover:text-[#F6FAFC]'
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
