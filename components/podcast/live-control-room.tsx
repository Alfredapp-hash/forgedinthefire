'use client'

/**
 * LIVE SHOW control room.
 *
 * Program = LiveCompositor canvas (host cam, guest cam, slates) + LiveAudioMix
 * (host mic, guest mic, SFX) → WhipPublisher → /api/admin/podcast/live/whip → provider.
 * The same Program is recorded locally and can become a draft episode on End.
 *
 * Guest integration seam: the existing <GuestInvitePanel> (P2P via lib/podcast/webrtc.ts)
 * is reused unchanged. Its onRemoteStream callback feeds the guest MediaStream into
 * both the compositor (video) and the mixer (audio). Invites are per-episode, so a
 * live session must be linked to an episode before a guest link can be made.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarPlus,
  Camera,
  Download,
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Save,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react'
import { GuestInvitePanel } from '@/components/podcast/guest-invite-panel'
import { SfxPad } from '@/components/podcast/sfx-pad'
import { audioInputConstraints, stopStreams } from '@/lib/podcast/capture'
import { loadStudioIceServers } from '@/lib/podcast/webrtc'
import type { GuestTallyPhase } from '@/lib/podcast/guest-types'
import { LiveCompositor, type LivePerson, type VisionState } from '@/lib/podcast/live/compositor'
import { LiveAudioMix, type LiveLevels } from '@/lib/podcast/live/audio-mix'
import { WhipPublisher } from '@/lib/podcast/live/whip-client'
import { LiveRecorder, extensionFor, type LiveRecording } from '@/lib/podcast/live/recorder'
import { BroadcastVideoDelay, type DelayStatus } from '@/lib/podcast/live/broadcast-delay'
import { DELAY_CHOICES_SEC, DELAY_DEFAULT_SEC, clampDelaySec } from '@/lib/podcast/live/delay-ring'
import {
  bitrateCheck,
  delayCheck,
  faceBlurCheck,
  goLiveBlockers,
  type CheckStatus,
  type PreflightCheck,
} from '@/lib/podcast/live/preflight'
import {
  VOICE_DISGUISE_PRESETS,
  VOICE_DISGUISE_WARNING,
  type VoiceDisguisePreset,
} from '@/lib/podcast/live/voice-disguise'
import {
  createDraftEpisode,
  createLiveSession,
  deleteLiveSession,
  fetchLiveProvider,
  listLiveSessions,
  measureUploadMbps,
  patchLiveSession,
  probeLiveProvider,
  saveLiveAsEpisodeDraft,
} from '@/lib/podcast/live/client'
import {
  EMPTY_HEALTH,
  type LiveHealth,
  type LiveProviderStatus,
  type LiveScene,
  type LiveSessionRow,
} from '@/lib/podcast/live/types'

type EpisodeOption = { id: string; title: string }

type Props = {
  /** Episodes for linking a live show (guest invites are per-episode). */
  episodes?: EpisodeOption[]
}

type Phase = 'off' | 'connecting' | 'live' | 'ending' | 'ended'
type CameraScene = Extract<LiveScene, 'host' | 'guest' | 'pip'>

const HEARTBEAT_MS = 60_000
const END_SLATE_MS = 3000

const card = 'rounded-2xl border border-[#27313B] bg-[#151B22] p-4 space-y-3'
const label = 'text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]'
const input =
  'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] placeholder:text-[#5B6873]'
const focusRing =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#53D6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151B22]'
const btn = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#27313B] px-3 py-1.5 text-sm text-[#B8C4CF] hover:border-[#53D6FF] disabled:opacity-40 disabled:pointer-events-none ${focusRing}`
const kbd = 'rounded border border-black/30 bg-black/15 px-1.5 py-0.5 font-mono text-xs'

const CHECK_TONE: Record<CheckStatus, string> = {
  pending: 'text-[#A9B8C6]',
  ok: 'text-[#7CFFB2]',
  warn: 'text-[#FFB86B]',
  fail: 'text-[#FF7A9A]',
}
const CHECK_WORD: Record<CheckStatus, string> = { pending: 'Checking', ok: 'OK', warn: 'Warning', fail: 'Blocked' }

function visionLabel(on: boolean, state: VisionState) {
  if (!on) return 'off'
  if (state === 'ok') return 'active'
  if (state === 'failed') return 'FAILED — silhouette shown'
  if (state === 'stalled') return 'stalled — silhouette shown'
  return 'loading — silhouette shown'
}

function fmtBytes(n: number) {
  if (n > 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`
  if (n > 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t || !t.tagName) return false
  if (t.isContentEditable) return true
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'reset'].includes(type)
  }
  return false
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Meter({ value, name }: { value: number; name: string }) {
  const pct = Math.round(Math.min(1, value) * 100)
  return (
    <div className="flex items-center gap-2 text-[11px] text-[#A9B8C6]">
      <span className="w-14">{name}</span>
      <div className="h-1.5 flex-1 rounded bg-[#0A1016] overflow-hidden" aria-hidden>
        <div
          className={`h-full ${pct > 90 ? 'bg-[#FF7A9A]' : pct > 65 ? 'bg-[#FFB86B]' : 'bg-[#7CFFB2]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function LiveControlRoom({ episodes = [] }: Props) {
  const [provider, setProvider] = useState<LiveProviderStatus | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<LiveSessionRow[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Schedule form
  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fWhen, setFWhen] = useState('')
  const [fEpisode, setFEpisode] = useState('')
  const [fHls, setFHls] = useState('')
  const [fWhep, setFWhep] = useState('')

  // Devices
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId] = useState('')
  const [micId, setMicId] = useState('')
  const [hostStream, setHostStream] = useState<MediaStream | null>(null)
  const [guestStream, setGuestStream] = useState<MediaStream | null>(null)
  const [guestName, setGuestName] = useState<string | null>(null)

  // Program
  const [scene, setSceneState] = useState<LiveScene>('starting')
  const [lastCamera, setLastCamera] = useState<CameraScene>('pip')
  const [safe, setSafe] = useState(false)
  const [hostMuted, setHostMuted] = useState(false)
  const [guestMuted, setGuestMuted] = useState(false)
  const [monitor, setMonitor] = useState(true)
  const [lowerThird, setLowerThird] = useState(true)
  const [countdownSec, setCountdownSec] = useState(30)
  const [recordVideo, setRecordVideo] = useState(true)
  const [levels, setLevels] = useState<LiveLevels>({ host: 0, guest: 0, program: 0, air: 0 })

  // Safety: broadcast delay, face blur, voice disguise
  const [delaySec, setDelaySec] = useState<number>(DELAY_DEFAULT_SEC)
  const [activeDelaySec, setActiveDelaySec] = useState(0)
  const [delayStatus, setDelayStatus] = useState<DelayStatus | null>(null)
  const [blurGuest, setBlurGuest] = useState(true)
  const [blurHost, setBlurHost] = useState(false)
  const [vision, setVision] = useState<Record<LivePerson, { state: VisionState; detail?: string }>>({
    host: { state: 'off' },
    guest: { state: 'off' },
  })
  const [disguise, setDisguise] = useState<VoiceDisguisePreset | ''>('')
  const [disguiseError, setDisguiseError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [preflight, setPreflight] = useState<{ running: boolean; checks: PreflightCheck[] } | null>(null)

  // On air
  const [phase, setPhase] = useState<Phase>('off')
  const [health, setHealth] = useState<LiveHealth>(EMPTY_HEALTH)
  const [onAirAt, setOnAirAt] = useState<number | null>(null)
  const [clock, setClock] = useState(0)
  const [recording, setRecording] = useState<LiveRecording | null>(null)
  const [savedEpisodeId, setSavedEpisodeId] = useState<string | null>(null)

  const previewRef = useRef<HTMLDivElement | null>(null)
  const airRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const preflightRef = useRef<HTMLDivElement | null>(null)
  const delayRef = useRef<BroadcastVideoDelay | null>(null)
  const compositorRef = useRef<LiveCompositor | null>(null)
  const mixRef = useRef<LiveAudioMix | null>(null)
  const publisherRef = useRef<WhipPublisher | null>(null)
  const recorderRef = useRef<LiveRecorder | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const heartbeatRef = useRef<number | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  hostStreamRef.current = hostStream

  const active = sessions.find((s) => s.id === activeId) || null
  const onAir = phase === 'connecting' || phase === 'live' || phase === 'ending'

  // ---------- engine lifecycle ----------
  useEffect(() => {
    const compositor = new LiveCompositor()
    const mix = new LiveAudioMix()
    compositorRef.current = compositor
    mixRef.current = mix
    recorderRef.current = new LiveRecorder()
    compositor.canvas.className = 'w-full h-auto block rounded-lg bg-black'
    compositor.canvas.setAttribute('role', 'img')
    compositor.canvas.setAttribute('aria-label', 'Live monitor: Program as you switch it, before the broadcast delay')
    compositor.onVision = (who, state, detail) => setVision((prev) => ({ ...prev, [who]: { state, detail } }))
    previewRef.current?.appendChild(compositor.canvas)
    const meter = window.setInterval(() => setLevels(mix.levels()), 150)
    return () => {
      window.clearInterval(meter)
      if (countdownTimerRef.current != null) window.clearTimeout(countdownTimerRef.current)
      if (heartbeatRef.current != null) window.clearInterval(heartbeatRef.current)
      void publisherRef.current?.stop()
      publisherRef.current = null
      void recorderRef.current?.stop()
      compositor.onFrame = null
      delayRef.current?.stop()
      delayRef.current?.canvas.remove()
      delayRef.current = null
      compositor.canvas.remove()
      compositor.destroy()
      void mix.close()
      stopStreams([hostStreamRef.current])
    }
  }, [])

  // Warn on close while on air AND afterwards until the recording is saved as a draft
  // (the recording only lives in this tab's memory).
  const unsavedRecording = phase === 'ended' && Boolean(recording?.audio) && !savedEpisodeId
  const guardUnload = onAir || unsavedRecording
  useEffect(() => {
    if (!guardUnload) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [guardUnload])

  useEffect(() => {
    if (!onAir) return
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [onAir])

  const announce = useCallback((msg: string) => {
    // Re-set even when unchanged so screen readers repeat "DUMPED" on a second dump.
    setAnnouncement('')
    window.setTimeout(() => setAnnouncement(msg), 30)
  }, [])

  // Announce ingest trouble once per transition.
  const ingestTrouble =
    onAir && (health.state === 'reconnecting' || health.state === 'disconnected' || health.state === 'failed')
  useEffect(() => {
    if (ingestTrouble) announce('Stream reconnecting. Viewers see a reconnecting message.')
  }, [ingestTrouble, announce])

  // ---------- face blur / voice disguise ----------
  useEffect(() => {
    compositorRef.current?.setFaceBlur('guest', blurGuest)
  }, [blurGuest])

  useEffect(() => {
    compositorRef.current?.setFaceBlur('host', blurHost)
  }, [blurHost])

  useEffect(() => {
    const mix = mixRef.current
    if (!mix) return
    const preset = VOICE_DISGUISE_PRESETS.find((p) => p.id === disguise)
    setDisguiseError(null)
    mix.setGuestDisguise(preset ? preset.semitones : null).catch((err) => {
      setDisguiseError(
        `Voice disguise failed (${err instanceof Error ? err.message : 'unknown'}). The guest is held OUT of Program until you turn disguise off.`,
      )
    })
  }, [disguise])

  // ---------- data ----------
  const refreshSessions = useCallback(async () => {
    try {
      const { sessions: rows } = await listLiveSessions()
      setSessions(rows)
      setActiveId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev
        return (rows.find((r) => r.status === 'live') || rows.find((r) => r.status === 'scheduled'))?.id || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load live sessions')
    }
  }, [])

  const checkProvider = useCallback(async () => {
    setProviderError(null)
    try {
      setProvider(await fetchLiveProvider())
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Could not check the live provider')
    }
  }, [])

  useEffect(() => {
    void refreshSessions()
    void checkProvider()
  }, [refreshSessions, checkProvider])

  function upsertSession(row: LiveSessionRow) {
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== row.id)
      return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at))
    })
  }

  // ---------- program wiring ----------
  useEffect(() => {
    const compositor = compositorRef.current
    if (!compositor) return
    compositor.setCopy({
      showTitle: 'Forged in the Fire',
      episodeTitle: active?.title || '',
      lowerThird: lowerThird && active ? active.title : null,
    })
  }, [active, lowerThird])

  useEffect(() => {
    compositorRef.current?.setHost(hostStream, 'Host')
    mixRef.current?.setHost(hostStream)
  }, [hostStream])

  useEffect(() => {
    compositorRef.current?.setGuest(guestStream, guestName || 'Guest')
    mixRef.current?.setGuest(guestStream)
  }, [guestStream, guestName])

  useEffect(() => {
    mixRef.current?.setHostMuted(hostMuted)
  }, [hostMuted])

  useEffect(() => {
    // Safe slate always wins over the manual guest fader.
    mixRef.current?.setGuestMuted(safe || guestMuted)
  }, [safe, guestMuted])

  useEffect(() => {
    mixRef.current?.setMonitor(monitor)
  }, [monitor])

  function putScene(next: LiveScene, fade = false) {
    compositorRef.current?.setScene(next, fade)
    setSceneState(next)
    if (next === 'host' || next === 'guest' || next === 'pip') setLastCamera(next)
  }

  function takeCamera(next: CameraScene) {
    if (safe) return
    if (countdownTimerRef.current != null) {
      window.clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    putScene(next, true)
  }

  /** Survivor-safety kill switch: instant cut to slate + guest audio out of Program. */
  function engageSafeSlate(quiet = false) {
    if (countdownTimerRef.current != null) {
      window.clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    mixRef.current?.setGuestMuted(true)
    compositorRef.current?.setScene('slate')
    setSceneState('slate')
    if (!safe && !quiet) announce('Safe slate on. Guest removed from Program.')
    setSafe(true)
  }

  function releaseSafeSlate() {
    setSafe(false)
    mixRef.current?.setGuestMuted(guestMuted)
    putScene(lastCamera)
    announce(
      activeDelaySec > 0 && onAir
        ? `Safe slate released. Viewers see cameras in ${activeDelaySec} seconds.`
        : 'Safe slate released.',
    )
  }

  /**
   * DUMP: discard the delayed segment (video ring + audio delay line) so it never airs,
   * and put Program on the safe slate so the rebuilt delay starts from the slate too.
   * No confirm — this must be one keystroke.
   */
  function dump() {
    const delay = delayRef.current
    const buffered = Boolean(delay && onAir && activeDelaySec > 0)
    if (buffered) {
      delay!.dump()
      mixRef.current?.dumpAir()
    }
    engageSafeSlate(true)
    announce(
      buffered
        ? `DUMPED. The last ${activeDelaySec} seconds will not air. Delay rebuilding behind the safe slate.`
        : 'Safe slate on. No broadcast delay was running, so nothing was buffered to dump.',
    )
  }

  // Hotkeys: D = DUMP, S = safe slate. Only while this tab is visible and not typing.
  const dumpRef = useRef(dump)
  const safeRef = useRef(() => engageSafeSlate())
  dumpRef.current = dump
  safeRef.current = () => engageSafeSlate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      const root = rootRef.current
      if (!root || !root.isConnected || root.closest('[hidden]')) return
      const key = e.key.toLowerCase()
      if (key === 'd') {
        e.preventDefault()
        dumpRef.current()
      } else if (key === 's') {
        e.preventDefault()
        safeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- devices ----------
  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setCams(list.filter((d) => d.kind === 'videoinput'))
      setMics(list.filter((d) => d.kind === 'audioinput'))
    } catch {
      /* device labels appear after permission */
    }
  }

  async function openDevices() {
    setError(null)
    try {
      await mixRef.current?.resume()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: camId ? { exact: camId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: audioInputConstraints(micId || undefined, false),
      })
      stopStreams([hostStreamRef.current])
      setHostStream(stream)
      await refreshDevices()
      const vTrack = stream.getVideoTracks()[0]
      const aTrack = stream.getAudioTracks()[0]
      if (vTrack?.getSettings().deviceId) setCamId(vTrack.getSettings().deviceId || '')
      if (aTrack?.getSettings().deviceId) setMicId(aTrack.getSettings().deviceId || '')
    } catch (err) {
      setError(err instanceof Error ? `Camera/mic: ${err.message}` : 'Could not open camera and mic')
    }
  }

  function closeDevices() {
    stopStreams([hostStreamRef.current])
    setHostStream(null)
  }

  const hostTalkStream = useMemo(
    () => (hostStream ? new MediaStream(hostStream.getAudioTracks()) : null),
    [hostStream],
  )
  const noop = useCallback(() => {}, [])

  // ---------- sessions ----------
  async function scheduleShow() {
    if (!fTitle.trim()) {
      setError('Give the show a title')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { session } = await createLiveSession({
        title: fTitle.trim(),
        description: fDesc.trim() || null,
        scheduled_for: fWhen ? new Date(fWhen).toISOString() : null,
        episode_id: fEpisode || null,
        playback_hls_url: fHls.trim() || null,
        playback_whep_url: fWhep.trim() || null,
      })
      upsertSession(session)
      setActiveId(session.id)
      setFTitle('')
      setFDesc('')
      setFWhen('')
      setFEpisode('')
      setNotice('Show scheduled. It now appears on /podcast/live.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule')
    } finally {
      setBusy(false)
    }
  }

  async function linkEpisode(episodeId: string) {
    if (!active) return
    setBusy(true)
    try {
      const { session } = await patchLiveSession(active.id, { episode_id: episodeId || null })
      upsertSession(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link episode')
    } finally {
      setBusy(false)
    }
  }

  async function createLinkedEpisode() {
    if (!active) return
    setBusy(true)
    setError(null)
    try {
      const ep = await createDraftEpisode(active.title, active.description)
      const { session } = await patchLiveSession(active.id, { episode_id: ep.id })
      upsertSession(session)
      setNotice('Draft episode created and linked. You can now make a guest link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create episode')
    } finally {
      setBusy(false)
    }
  }

  async function removeSession(row: LiveSessionRow) {
    if (!window.confirm(`Delete “${row.title}”?`)) return
    try {
      await deleteLiveSession(row.id)
      setSessions((prev) => prev.filter((s) => s.id !== row.id))
      if (activeId === row.id) setActiveId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    }
  }

  async function markEnded(row: LiveSessionRow) {
    try {
      const { session } = await patchLiveSession(row.id, { action: 'end' })
      upsertSession(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end')
    }
  }

  // ---------- pre-flight / go live / end ----------
  const playbackMissing = Boolean(
    active && !active.playback_hls_url && !active.playback_whep_url && !provider?.defaultHlsUrl && !provider?.defaultWhepUrl,
  )
  const { blockers, warnings } = goLiveBlockers({
    active,
    hostStreamOpen: Boolean(hostStream),
    provider,
    providerError,
    guestConnected: Boolean(guestStream),
    playbackMissing,
  })

  function updateCheck(check: PreflightCheck) {
    setPreflight((prev) =>
      prev ? { ...prev, checks: prev.checks.map((c) => (c.id === check.id ? check : c)) } : prev,
    )
  }

  /** Go live → run the checklist first. The host confirms with "Go live now". */
  async function runPreflight() {
    if (blockers.length) return
    setError(null)
    const guestBlur = compositorRef.current?.getFaceBlur('guest') ?? { on: blurGuest, state: vision.guest.state }
    const hostBlur = compositorRef.current?.getFaceBlur('host') ?? { on: blurHost, state: vision.host.state }
    const checks: PreflightCheck[] = [
      { id: 'provider', label: 'Live provider reachable', status: 'pending', detail: 'Contacting the WHIP endpoint…' },
      bitrateCheck(null),
      delayCheck(clampDelaySec(delaySec)),
      guestBlur.on && !guestStream && guestBlur.state === 'loading'
        ? {
            id: 'blur-guest',
            label: 'Guest face blur',
            status: 'ok',
            detail: 'On. Starts when the guest camera arrives (silhouette until the first detection).',
          }
        : faceBlurCheck('Guest', { ...guestBlur, detail: vision.guest.detail }, true),
      faceBlurCheck('Host', { ...hostBlur, detail: vision.host.detail }, false),
      {
        id: 'slate',
        label: 'Safe slate ready',
        status: compositorRef.current ? 'ok' : 'fail',
        detail: compositorRef.current
          ? 'Press S (or SAFE SLATE) at any moment; D dumps the delay and cuts to it.'
          : 'Program engine is not running — reload the page.',
      },
      guestStream
        ? { id: 'guest', label: 'Guest', status: 'ok', detail: `${guestName || 'Guest'} connected.` }
        : { id: 'guest', label: 'Guest', status: 'warn', detail: 'Not connected. You can go live and bring them in later.' },
    ]
    if (disguise) {
      checks.push(
        disguiseError
          ? { id: 'disguise', label: 'Voice disguise', status: 'warn', detail: disguiseError }
          : { id: 'disguise', label: 'Voice disguise', status: 'ok', detail: 'On. Remember: pitch shifting can be reversed.' },
      )
    }
    setPreflight({ running: true, checks })
    window.setTimeout(() => preflightRef.current?.focus(), 0)
    await Promise.all([
      probeLiveProvider()
        .then((p) => {
          setProvider(p)
          if (!p.configured) {
            updateCheck({ id: 'provider', label: 'Live provider reachable', status: 'fail', detail: 'LIVE_WHIP_URL is not set.' })
          } else if (!p.reachable) {
            updateCheck({
              id: 'provider',
              label: 'Live provider reachable',
              status: 'fail',
              detail: `The server could not reach ${p.host} (${p.probeError || 'no answer'}).`,
            })
          } else {
            updateCheck({
              id: 'provider',
              label: 'Live provider reachable',
              status: 'ok',
              detail: `${p.provider} · ${p.host} answered in ${p.probeMs ?? '?'} ms.`,
            })
          }
        })
        .catch((err) =>
          updateCheck({
            id: 'provider',
            label: 'Live provider reachable',
            status: 'fail',
            detail: err instanceof Error ? err.message : 'Probe failed',
          }),
        ),
      measureUploadMbps()
        .then((mbps) => updateCheck(bitrateCheck(mbps)))
        .catch((err) => updateCheck(bitrateCheck(null, err instanceof Error ? err.message : 'failed'))),
    ])
    setPreflight((prev) => (prev ? { ...prev, running: false } : prev))
  }

  const preflightFailed = Boolean(preflight?.checks.some((c) => c.status === 'fail'))
  const preflightPending = Boolean(preflight?.running || preflight?.checks.some((c) => c.status === 'pending'))

  function teardownDelay() {
    const compositor = compositorRef.current
    if (compositor) compositor.onFrame = null
    delayRef.current?.stop()
    delayRef.current?.canvas.remove()
    delayRef.current = null
    setDelayStatus(null)
    setActiveDelaySec(0)
  }

  async function goLive() {
    const compositor = compositorRef.current
    const mix = mixRef.current
    if (!active || !compositor || !mix) return
    if (blockers.length) {
      setError(blockers.join(' '))
      return
    }
    setPreflight(null)
    setError(null)
    setNotice(null)
    setRecording(null)
    setSavedEpisodeId(null)
    setPhase('connecting')
    try {
      await mix.resume()
      const target = countdownSec > 0 ? Date.now() + countdownSec * 1000 : null
      compositor.setCopy({ countdownTo: target })
      if (!safe) putScene(target ? 'starting' : lastCamera)

      // Broadcast delay: Program canvas → ring buffer → Air canvas; audio through a DelayNode.
      const seconds = clampDelaySec(delaySec)
      const delay = new BroadcastVideoDelay({
        source: compositor.canvas,
        delayMs: seconds * 1000,
        width: compositor.width,
        height: compositor.height,
        paintHold: (ctx, reason) => compositor.paintHold(ctx, reason),
        onStatus: setDelayStatus,
      })
      delayRef.current = delay
      delay.canvas.className = 'w-full h-auto block rounded-lg bg-black'
      delay.canvas.setAttribute('role', 'img')
      delay.canvas.setAttribute('aria-label', `On-air monitor: what viewers get, ${seconds} seconds behind`)
      airRef.current?.replaceChildren(delay.canvas)
      await delay.start()
      // Start audio + video delay together so they stay aligned.
      mix.setAirDelay(seconds)
      compositor.onFrame = () => delay.tick()
      setActiveDelaySec(seconds)

      const program = new MediaStream([...delay.captureStream().getVideoTracks(), ...mix.stream.getAudioTracks()])
      const ice = await loadStudioIceServers()
      const publisher = new WhipPublisher({ iceServers: ice.iceServers, onHealth: setHealth })
      publisherRef.current = publisher
      await publisher.start(program)
      const { session } = await patchLiveSession(active.id, { action: 'start' })
      upsertSession(session)
      // Record what aired (post-delay, post-dump) — dumped material never reaches the draft.
      recorderRef.current?.start(program, mix.stream, recordVideo)
      setOnAirAt(Date.now())
      setPhase('live')
      announce(seconds > 0 ? `ON AIR with a ${seconds} second delay.` : 'ON AIR. No delay.')
      if (target) {
        const camera = lastCamera
        countdownTimerRef.current = window.setTimeout(() => {
          countdownTimerRef.current = null
          if (compositorRef.current?.getScene() === 'starting') putScene(camera, true)
        }, countdownSec * 1000)
      }
      heartbeatRef.current = window.setInterval(() => {
        void patchLiveSession(active.id, { action: 'heartbeat' }).catch(() => {})
      }, HEARTBEAT_MS)
    } catch (err) {
      await publisherRef.current?.stop().catch(() => {})
      publisherRef.current = null
      teardownDelay()
      mix.setAirDelay(0)
      setPhase('off')
      setError(err instanceof Error ? err.message : 'Could not go live')
      announce('Could not go live. Still off air.')
    }
  }

  async function endShow() {
    if (!active) return
    if (!window.confirm('End the live show for everyone?')) return
    setPhase('ending')
    if (countdownTimerRef.current != null) window.clearTimeout(countdownTimerRef.current)
    countdownTimerRef.current = null
    if (heartbeatRef.current != null) window.clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
    compositorRef.current?.setScene('ended')
    setSceneState('ended')
    // Let the delayed tail (and the end slate) finish airing before cutting the stream.
    await new Promise((r) => window.setTimeout(r, END_SLATE_MS + activeDelaySec * 1000))
    await publisherRef.current?.stop().catch(() => {})
    publisherRef.current = null
    const rec = (await recorderRef.current?.stop()) || null
    teardownDelay()
    mixRef.current?.setAirDelay(0)
    setRecording(rec)
    announce('OFF AIR. The stream has stopped.')
    try {
      const { session } = await patchLiveSession(active.id, { action: 'end' })
      upsertSession(session)
    } catch (err) {
      setError(err instanceof Error ? `Stream stopped, but: ${err.message}` : 'Could not mark ended')
    }
    setPhase('ended')
    setOnAirAt(null)
    setHealth(EMPTY_HEALTH)
  }

  async function saveDraft() {
    if (!active || !recording?.audio) return
    setBusy(true)
    setError(null)
    try {
      const out = await saveLiveAsEpisodeDraft({
        session: active,
        audio: recording.audio,
        durationSec: recording.durationSec,
      })
      upsertSession(out.session)
      setSavedEpisodeId(out.episodeId)
      setNotice('Saved as a draft episode. Edit and publish it from Episodes / Production room.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft')
    } finally {
      setBusy(false)
    }
  }

  // ---------- render ----------
  const recTally: GuestTallyPhase =
    phase === 'live' ? (scene === 'starting' ? 'count-in' : 'rec') : phase === 'ended' ? 'stopped' : 'waiting'
  const lossTone =
    health.packetLossPct > 5 ? 'text-[#FF7A9A]' : health.packetLossPct > 2 ? 'text-[#FFB86B]' : 'text-[#7CFFB2]'
  const elapsed = onAirAt && clock ? Math.max(0, Math.round((clock - onAirAt) / 1000)) : 0
  const rebuildingSec = delayStatus ? Math.ceil(delayStatus.rebuildingMs / 1000) : 0
  const rebuilding = onAir && activeDelaySec > 0 && rebuildingSec > 0
  const dumpedOnce = (delayStatus?.dumps ?? 0) > 0
  const airLabel = activeDelaySec > 0 ? `On air (+${activeDelaySec} s)` : onAir ? 'On air (no delay)' : 'On air'
  const goLiveDisabled = blockers.length > 0 || Boolean(preflight)

  return (
    <div className="space-y-4" ref={rootRef}>
      {/* Screen-reader announcements for ON AIR / OFF AIR / DUMPED / reconnecting. */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      {(error || notice) && (
        <div className="space-y-1" role="alert">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-[#8DEBFF]">{notice}</p>}
        </div>
      )}

      {ingestTrouble && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[#FFB86B] bg-[#2A1E10] px-4 py-3 text-[#FFD9A8]"
          role="alert"
        >
          <RefreshCw size={20} className="animate-spin motion-reduce:animate-none" aria-hidden />
          <p className="text-base font-bold">
            Stream {health.state === 'reconnecting' ? 'reconnecting' : health.state}… (attempt {health.reconnects})
          </p>
          <p className="text-sm">
            Retrying automatically with backoff. Viewers see “Reconnecting”. Keep talking — the local recording continues.
            {health.lastError ? ` Last error: ${health.lastError}.` : ''}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Program + switcher */}
        <section className={card} aria-label="Program">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={label}>Program</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {phase === 'live' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FF3B5C] px-3 py-1 font-bold uppercase tracking-widest text-white">
                  <Radio size={12} aria-hidden /> On air {fmtDuration(elapsed)}
                </span>
              ) : (
                phase !== 'connecting' &&
                phase !== 'ending' && (
                  <span className="rounded-full border border-[#27313B] px-3 py-1 font-bold uppercase tracking-widest text-[#A9B8C6]">
                    Off air
                  </span>
                )
              )}
              {phase === 'connecting' && <span className="text-[#FFB86B]">Connecting to ingest…</span>}
              {phase === 'ending' && (
                <span className="text-[#FFB86B]">
                  Ending… {activeDelaySec > 0 ? `the last ${activeDelaySec} s are still airing` : ''}
                </span>
              )}
              {safe && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFB86B] px-3 py-1 font-bold uppercase tracking-widest text-[#061016]">
                  Safe slate
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="space-y-1">
              <figcaption className="text-xs font-semibold text-[#B8C4CF]">Live (you)</figcaption>
              <div ref={previewRef} className="relative" />
            </figure>
            <figure className="space-y-1">
              <figcaption className="flex items-center justify-between text-xs font-semibold text-[#B8C4CF]">
                <span>{airLabel}</span>
                {delayStatus && delayStatus.mode !== 'off' && (
                  <span className="font-normal text-[#7C8B97]">
                    {delayStatus.mode === 'encoded'
                      ? `encoded buffer · ${fmtBytes(delayStatus.bufferedBytes)}`
                      : `frame buffer${delayStatus.plan ? ` ${delayStatus.plan.width}×${delayStatus.plan.height} @${delayStatus.plan.fps} fps` : ''} · ${fmtBytes(delayStatus.bufferedBytes)}`}
                  </span>
                )}
              </figcaption>
              <div className="relative">
                <div ref={airRef} />
                {!onAir && (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[#27313B] bg-[#05070A] text-sm text-[#7C8B97]">
                    Off air — the delayed feed appears here when you go live
                  </div>
                )}
                {rebuilding && (
                  <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/75 px-3 py-2 text-center text-sm font-bold text-[#FFB86B]">
                    {dumpedOnce ? `DUMPED · Delay rebuilding… ${rebuildingSec} s` : `Delay filling… ${rebuildingSec} s`}
                  </div>
                )}
              </div>
            </figure>
          </div>
          {delayStatus?.error && <p className="text-xs text-[#FFB86B]">{delayStatus.error}</p>}

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scenes">
            {(['host', 'guest', 'pip'] as const).map((id) => (
              <button
                key={id}
                type="button"
                disabled={safe}
                aria-pressed={scene === id}
                onClick={() => takeCamera(id)}
                className={`${btn} ${scene === id ? 'border-[#53D6FF] text-[#8DEBFF]' : ''}`}
              >
                {id === 'pip' ? 'PIP' : id === 'host' ? 'Host' : 'Guest'}
              </button>
            ))}
            <button
              type="button"
              disabled={safe}
              aria-pressed={scene === 'starting'}
              onClick={() => putScene('starting')}
              className={`${btn} ${scene === 'starting' ? 'border-[#53D6FF] text-[#8DEBFF]' : ''}`}
            >
              Starting soon
            </button>
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-[#A9B8C6]">
              <input type="checkbox" checked={lowerThird} onChange={(e) => setLowerThird(e.target.checked)} />
              Title lower third
            </label>
          </div>

          {/* Safety controls: big targets, hotkeys shown on the buttons. */}
          <div className="flex flex-wrap items-stretch gap-3">
            <button
              type="button"
              onClick={dump}
              aria-keyshortcuts="D"
              aria-label={
                activeDelaySec > 0 && onAir
                  ? `Dump: discard the last ${activeDelaySec} seconds and cut to the safe slate. Hotkey D.`
                  : 'Dump: cut to the safe slate. Hotkey D.'
              }
              className={`inline-flex min-h-[64px] min-w-[180px] items-center justify-center gap-3 rounded-2xl bg-[#E0162B] px-6 py-3 text-2xl font-black uppercase tracking-wider text-white shadow-lg hover:bg-[#FF2A40] ${focusRing}`}
            >
              <Trash2 size={24} aria-hidden /> Dump <kbd className={`${kbd} border-white/50 bg-white/15`}>D</kbd>
            </button>
            {!safe ? (
              <button
                type="button"
                onClick={() => engageSafeSlate()}
                aria-keyshortcuts="S"
                className={`inline-flex min-h-[64px] items-center gap-2 rounded-2xl bg-[#FFB86B] px-5 py-3 text-lg font-bold text-[#061016] hover:bg-[#FFC98A] ${focusRing}`}
                title="Instantly cut Program to the branded slate and remove guest audio"
              >
                <ShieldAlert size={20} aria-hidden /> SAFE SLATE <kbd className={kbd}>S</kbd>
              </button>
            ) : (
              <button
                type="button"
                onClick={releaseSafeSlate}
                className={`inline-flex min-h-[64px] items-center gap-2 rounded-2xl border-2 border-[#FFB86B] px-5 py-3 text-lg font-bold text-[#FFB86B] ${focusRing}`}
              >
                Release safe slate → {lastCamera.toUpperCase()}
              </button>
            )}
            {phase === 'off' || phase === 'ended' ? (
              <button
                type="button"
                onClick={() => void runPreflight()}
                disabled={goLiveDisabled}
                aria-describedby="go-live-why"
                className={`inline-flex min-h-[64px] items-center gap-2 rounded-2xl bg-[#FF3B5C] px-6 py-3 text-lg font-bold text-white disabled:opacity-40 ${focusRing}`}
              >
                <Radio size={20} aria-hidden /> Go live…
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void endShow()}
                disabled={phase !== 'live'}
                className={`inline-flex min-h-[64px] items-center gap-2 rounded-2xl border-2 border-[#FF3B5C] px-6 py-3 text-lg font-bold text-[#FF7A9A] disabled:opacity-40 ${focusRing}`}
              >
                <Square size={18} aria-hidden /> End show
              </button>
            )}
          </div>

          {(phase === 'off' || phase === 'ended') && (blockers.length > 0 || warnings.length > 0) && (
            <div id="go-live-why" className="space-y-1 text-sm">
              {blockers.length > 0 && <p className="font-semibold text-[#FF7A9A]">Go live is unavailable because:</p>}
              <ul className="space-y-0.5">
                {blockers.map((b) => (
                  <li key={b} className="text-[#FF9AB0]">
                    • {b}
                  </li>
                ))}
                {warnings.map((w) => (
                  <li key={w} className="text-[#FFB86B]">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preflight && (
            <div
              ref={preflightRef}
              tabIndex={-1}
              role="region"
              aria-label="Pre-flight checklist"
              className={`space-y-2 rounded-xl border border-[#53D6FF]/50 bg-[#0A1016] p-3 ${focusRing}`}
            >
              <p className={label}>Pre-flight checklist</p>
              <ul className="space-y-1.5" aria-live="polite">
                {preflight.checks.map((c) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    <span className={`w-20 shrink-0 font-bold ${CHECK_TONE[c.status]}`}>{CHECK_WORD[c.status]}</span>
                    <span>
                      <span className="text-[#F6FAFC]">{c.label}</span>
                      <span className="text-[#A9B8C6]"> — {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void goLive()}
                  disabled={preflightPending || preflightFailed || blockers.length > 0}
                  className={`inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#FF3B5C] px-5 py-2 text-base font-bold text-white disabled:opacity-40 ${focusRing}`}
                >
                  <Radio size={18} aria-hidden /> Go live now
                </button>
                <button type="button" className={btn} onClick={() => setPreflight(null)}>
                  Cancel
                </button>
                <button type="button" className={btn} disabled={preflight.running} onClick={() => void runPreflight()}>
                  <RefreshCw size={14} aria-hidden /> Re-run checks
                </button>
              </div>
              {preflightFailed && (
                <p className="text-xs text-[#FF9AB0]">Fix the blocked item(s) above, then re-run the checks.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-[#A9B8C6]">
              Broadcast delay
              <select
                value={delaySec}
                disabled={onAir}
                onChange={(e) => setDelaySec(Number(e.target.value))}
                className={`rounded border border-[#27313B] bg-[#05070A] px-2 py-1 text-sm text-[#F6FAFC] ${focusRing}`}
              >
                {DELAY_CHOICES_SEC.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? 'Off (DUMP = slate only)' : `${s} s${s === DELAY_DEFAULT_SEC ? ' (recommended)' : ''}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-[#A9B8C6]">
              Countdown
              <select
                value={countdownSec}
                disabled={onAir}
                onChange={(e) => setCountdownSec(Number(e.target.value))}
                className={`rounded border border-[#27313B] bg-[#05070A] px-2 py-1 text-sm text-[#F6FAFC] ${focusRing}`}
              >
                {[0, 10, 30, 60, 120, 300].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? 'none' : s < 60 ? `${s}s` : `${s / 60}m`}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-[#A9B8C6]">
              <input
                type="checkbox"
                checked={recordVideo}
                disabled={onAir}
                onChange={(e) => setRecordVideo(e.target.checked)}
              />
              Record program video locally
            </label>
          </div>
          <p className="text-xs text-[#7C8B97]">
            <strong className="text-[#B8C4CF]">DUMP</strong> (<kbd className="font-mono">D</kbd>) throws away everything
            in the delay so it never airs, cuts Program to the safe slate and rebuilds the delay behind it.{' '}
            <strong className="text-[#B8C4CF]">Safe slate</strong> (<kbd className="font-mono">S</kbd>) is an instant cut
            (no fade) that hard-mutes the guest; with a delay, viewers see it after the delay — use DUMP when something
            has just been said. Hotkeys work while this Live show tab is showing and you are not typing. You can switch
            console tabs while on air — the stream keeps running — but keep this browser tab in the foreground, because
            browsers slow down background tabs.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Meter name="Host" value={levels.host} />
              <Meter name="Guest" value={levels.guest} />
              <Meter name="Program" value={levels.program} />
              <Meter name="Air" value={levels.air} />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <button type="button" className={btn} aria-pressed={hostMuted} onClick={() => setHostMuted((v) => !v)}>
                {hostMuted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />} Host{' '}
                {hostMuted ? 'muted' : 'on'}
              </button>
              <button
                type="button"
                className={btn}
                disabled={safe}
                aria-pressed={guestMuted || safe}
                onClick={() => setGuestMuted((v) => !v)}
              >
                {guestMuted || safe ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />} Guest{' '}
                {guestMuted || safe ? 'muted' : 'on'}
              </button>
              <button type="button" className={btn} aria-pressed={monitor} onClick={() => setMonitor((v) => !v)}>
                <Headphones size={14} aria-hidden /> Monitor {monitor ? 'on' : 'off'}
              </button>
            </div>
          </div>
          <SfxPad compact disabled={!hostStream} onDrop={(id) => void mixRef.current?.playSfx(id)} />
        </section>

        {/* Right column: privacy, health, provider, devices */}
        <div className="space-y-4">
          <section className={card} aria-label="Privacy">
            <p className={label}>Privacy</p>
            <div className="space-y-2 text-sm">
              <label className="flex min-h-[40px] items-center gap-2 text-[#F6FAFC]">
                <input type="checkbox" checked={blurGuest} onChange={(e) => setBlurGuest(e.target.checked)} />
                Blur guest face
              </label>
              <p className={`-mt-1 text-xs ${blurGuest && vision.guest.state !== 'ok' ? 'text-[#FFB86B]' : 'text-[#A9B8C6]'}`}>
                Guest: {visionLabel(blurGuest, vision.guest.state)}
                {vision.guest.state === 'failed' && vision.guest.detail ? ` (${vision.guest.detail})` : ''}
              </p>
              <label className="flex min-h-[40px] items-center gap-2 text-[#F6FAFC]">
                <input type="checkbox" checked={blurHost} onChange={(e) => setBlurHost(e.target.checked)} />
                Blur host face
              </label>
              <p className={`-mt-1 text-xs ${blurHost && vision.host.state !== 'ok' ? 'text-[#FFB86B]' : 'text-[#A9B8C6]'}`}>
                Host: {visionLabel(blurHost, vision.host.state)}
              </p>
              <p className="text-xs text-[#7C8B97]">
                Guest blur is on by default. Turn it off only if the guest agreed to show their face. If the detector
                is loading, stalls or fails, that person is shown as a silhouette — never an unblurred face. When no
                face is found the whole picture is pixelated.
              </p>
              <label className="flex flex-col gap-1 text-[#F6FAFC]">
                Guest voice disguise
                <select
                  value={disguise}
                  onChange={(e) => setDisguise(e.target.value as VoiceDisguisePreset | '')}
                  className={`${input} ${focusRing}`}
                >
                  <option value="">Off — natural voice</option>
                  {VOICE_DISGUISE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {disguiseError && (
                <p className="text-xs text-[#FF9AB0]" role="alert">
                  {disguiseError}
                </p>
              )}
              {disguise && (
                <p className="flex gap-1 text-xs text-[#FFB86B]">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {VOICE_DISGUISE_WARNING}
                </p>
              )}
              {disguise && (
                <p className="text-xs text-[#7C8B97]">Your headphones keep the natural voice; only Program is shifted.</p>
              )}
            </div>
          </section>

          <section className={card}>
            <p className={label}>Stream health</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-[#A9B8C6]">Ingest</dt>
              <dd
                className={
                  health.state === 'connected'
                    ? 'font-semibold text-[#7CFFB2]'
                    : ingestTrouble
                      ? 'font-bold uppercase text-[#FFB86B]'
                      : 'text-[#F6FAFC]'
                }
              >
                {health.state}
              </dd>
              <dt className="text-[#A9B8C6]">Bitrate</dt>
              <dd className="text-[#F6FAFC]">{health.bitrateKbps ? `${health.bitrateKbps} kbps` : '—'}</dd>
              <dt className="text-[#A9B8C6]">Packet loss</dt>
              <dd className={lossTone}>{health.state === 'connected' ? `${health.packetLossPct}%` : '—'}</dd>
              <dt className="text-[#A9B8C6]">RTT</dt>
              <dd className="text-[#F6FAFC]">{health.rttMs != null ? `${health.rttMs} ms` : '—'}</dd>
              <dt className="text-[#A9B8C6]">Video</dt>
              <dd className="text-[#F6FAFC]">
                {health.frameWidth ? `${health.frameWidth}p-wide` : '—'}
                {health.fps != null ? ` · ${health.fps} fps` : ''}
              </dd>
              <dt className="text-[#A9B8C6]">Reconnects</dt>
              <dd className="text-[#F6FAFC]">{health.reconnects}</dd>
            </dl>
            {health.lastError && <p className="text-xs text-[#FFB86B]">{health.lastError}</p>}
          </section>

          <section className={card}>
            <div className="flex items-center justify-between">
              <p className={label}>Live provider</p>
              <button type="button" className={btn} onClick={() => void checkProvider()} aria-label="Re-check provider">
                <RefreshCw size={12} />
              </button>
            </div>
            {providerError && <p className="text-xs text-red-300">{providerError}</p>}
            {provider && (
              <div className="space-y-1 text-sm">
                <p className={provider.configured ? 'text-[#7CFFB2]' : 'text-[#FFB86B]'}>
                  {provider.configured
                    ? `WHIP ready · ${provider.provider} · ${provider.host}`
                    : 'Not configured — set LIVE_WHIP_URL on Netlify'}
                </p>
                <p className="text-xs text-[#A9B8C6]">
                  Bearer token: {provider.bearer ? 'set' : 'none'} · Default playback:{' '}
                  {provider.defaultHlsUrl ? 'HLS' : provider.defaultWhepUrl ? 'WHEP' : 'none'}
                </p>
              </div>
            )}
            <a href="/podcast/live" target="_blank" rel="noreferrer" className={btn}>
              <ExternalLink size={14} /> Open viewer page
            </a>
          </section>

          <section className={card}>
            <p className={label}>Host camera + mic</p>
            <select value={camId} onChange={(e) => setCamId(e.target.value)} className={input} disabled={onAir}>
              <option value="">Default camera</option>
              {cams.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <select value={micId} onChange={(e) => setMicId(e.target.value)} className={input} disabled={onAir}>
              <option value="">Default microphone</option>
              {mics.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Mic ${i + 1}`}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={onAir} onClick={() => void openDevices()}>
                <Camera size={14} /> {hostStream ? 'Re-open devices' : 'Open camera + mic'}
              </button>
              {hostStream && (
                <button type="button" className={btn} disabled={onAir} onClick={closeDevices}>
                  Close
                </button>
              )}
            </div>
            <p className="text-xs text-[#7C8B97]">Wear headphones: guest audio plays through this tab.</p>
          </section>
        </div>
      </div>

      {/* After the show */}
      {phase === 'ended' && recording && (
        <section className={card}>
          <p className={label}>After the show · {fmtDuration(recording.durationSec)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#53D6FF] px-3 py-1.5 text-sm text-[#061016] disabled:opacity-40"
              disabled={busy || !recording.audio || Boolean(savedEpisodeId)}
              onClick={() => void saveDraft()}
            >
              <Save size={14} /> {savedEpisodeId ? 'Saved as episode draft' : 'Save as episode draft'}
            </button>
            {recording.audio && (
              <button
                type="button"
                className={btn}
                onClick={() => download(recording.audio!, `live-audio.${extensionFor(recording.audio!)}`)}
              >
                <Download size={14} /> Program audio
              </button>
            )}
            {recording.video && (
              <button
                type="button"
                className={btn}
                onClick={() => download(recording.video!, `live-program.${extensionFor(recording.video!)}`)}
              >
                <Download size={14} /> Program video
              </button>
            )}
          </div>
          <p className="text-xs text-[#7C8B97]">
            The draft uses the same episode pipeline as pre-recorded shows: edit, add show notes, then publish from the
            Episodes tab. Download the video before closing this tab — it is not uploaded.
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sessions */}
        <section className={card}>
          <p className={label}>Shows</p>
          {sessions.length === 0 && <p className="text-sm text-[#A9B8C6]">No live shows yet. Schedule one →</p>}
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  s.id === activeId ? 'border-[#53D6FF]/60 bg-[#0A1016]' : 'border-[#27313B]'
                }`}
              >
                <button
                  type="button"
                  disabled={onAir}
                  className="flex-1 min-w-0 text-left text-[#F6FAFC] truncate"
                  onClick={() => setActiveId(s.id)}
                >
                  {s.title}
                </button>
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    s.status === 'live' ? 'text-[#FF7A9A]' : s.status === 'scheduled' ? 'text-[#8DEBFF]' : 'text-[#7C8B97]'
                  }`}
                >
                  {s.status}
                  {s.scheduled_for && s.status === 'scheduled'
                    ? ` · ${new Date(s.scheduled_for).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : ''}
                </span>
                {s.status === 'live' && !(onAir && s.id === activeId) && (
                  <button type="button" className={btn} onClick={() => void markEnded(s)} title="Stuck as live? Mark ended.">
                    Mark ended
                  </button>
                )}
                {s.status !== 'live' && (
                  <button type="button" className={btn} onClick={() => void removeSession(s)} aria-label={`Delete ${s.title}`}>
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {active && (
            <div className="space-y-2 border-t border-[#27313B] pt-3">
              <p className="text-xs text-[#A9B8C6]">
                Active: <span className="text-[#F6FAFC]">{active.title}</span>
                {active.scheduled_for ? ` · ${toLocalInput(active.scheduled_for).replace('T', ' ')}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={active.episode_id || ''}
                  disabled={busy || onAir}
                  onChange={(e) => void linkEpisode(e.target.value)}
                  className={`${input} flex-1`}
                  aria-label="Linked episode"
                >
                  <option value="">No linked episode</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.title}
                    </option>
                  ))}
                </select>
                {!active.episode_id && (
                  <button type="button" className={btn} disabled={busy} onClick={() => void createLinkedEpisode()}>
                    New draft episode
                  </button>
                )}
              </div>
              {playbackMissing && (
                <p className="flex items-center gap-1 text-xs text-[#FFB86B]">
                  <AlertTriangle size={12} /> No playback URL (session or LIVE_PLAYBACK_*). Viewers will see “being set
                  up”.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Schedule */}
        <section className={card}>
          <p className={label}>Schedule next show</p>
          <input className={input} placeholder="Title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
          <textarea
            className={input}
            rows={2}
            placeholder="Public description (optional)"
            value={fDesc}
            onChange={(e) => setFDesc(e.target.value)}
          />
          <input
            className={input}
            type="datetime-local"
            value={fWhen}
            onChange={(e) => setFWhen(e.target.value)}
            aria-label="Start time"
          />
          <select className={input} value={fEpisode} onChange={(e) => setFEpisode(e.target.value)} aria-label="Episode">
            <option value="">Link an episode later</option>
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.title}
              </option>
            ))}
          </select>
          <details className="text-xs text-[#A9B8C6]">
            <summary className="cursor-pointer">Per-show playback URLs (optional)</summary>
            <div className="mt-2 space-y-2">
              <input
                className={input}
                placeholder="HLS .m3u8 URL (defaults to LIVE_PLAYBACK_HLS_URL)"
                value={fHls}
                onChange={(e) => setFHls(e.target.value)}
              />
              <input
                className={input}
                placeholder="WHEP URL (defaults to LIVE_PLAYBACK_WHEP_URL)"
                value={fWhep}
                onChange={(e) => setFWhep(e.target.value)}
              />
            </div>
          </details>
          <button type="button" className={btn} disabled={busy} onClick={() => void scheduleShow()}>
            <CalendarPlus size={14} /> Schedule
          </button>
        </section>
      </div>

      {/* Guest (existing P2P invite flow, unchanged) */}
      <section className={card}>
        <p className={label}>Guest</p>
        {active?.episode_id ? (
          <GuestInvitePanel
            episodeId={active.episode_id}
            recording={phase === 'live'}
            recTally={recTally}
            hostStream={hostTalkStream}
            onRemoteStream={setGuestStream}
            onGuestName={setGuestName}
            onTakeUrl={noop}
          />
        ) : (
          <p className="text-sm text-[#A9B8C6]">
            Link this show to an episode (above) to create a private guest link. The guest joins from the same booth
            page used for pre-recorded episodes; their camera and mic feed Program here.
          </p>
        )}
        <p className="text-xs text-[#7C8B97]">
          Do not keep the Production room open on the same episode while live — both would answer the guest.
        </p>
      </section>
    </div>
  )
}
