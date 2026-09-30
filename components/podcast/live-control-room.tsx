'use client'

/**
 * LIVE SHOW control room — "Record, but broadcasting".
 *
 * Program = LiveCompositor canvas (host cam, guest cam, slates) + LiveAudioMix
 * (host mic, guest mic, SFX) → WhipPublisher → /api/admin/podcast/live/whip → provider.
 * The same Program is recorded locally (chunks in IndexedDB) and can become a draft episode on End.
 *
 * Two monitors: "Live in the room" is Program as the host switches it; "What viewers see now"
 * is the same picture after the broadcast delay. DUMP (D / Esc Esc) throws the delay away and
 * parks viewers on the safe slate with silence until Resume; SAFE SLATE (S) cuts Program only.
 *
 * Built on the studio-ui kit so it reads like the rest of the GarageBand studio: the
 * transport strip carries a RecordButton (armed = ready to go live, recording = on air),
 * scenes are a SegmentedControl, levels are Meters, states are Chips.
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
  Play,
  Radio,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Checkbox,
  Chip,
  IconButton,
  Input,
  Kbd,
  Meter,
  Panel,
  RecordButton,
  SegmentedControl,
  Select,
  Textarea,
  toast,
  type RecordState,
} from '@/components/studio-ui'
import { cn } from '@/lib/utils'
import { GuestInvitePanel, type RemoteGuestLane } from '@/components/podcast/guest-invite-panel'
import { LiveChatModerationPanel } from '@/components/podcast/live-chat'
import { LiveSimulcastCard } from '@/components/podcast/live-simulcast-card'
import { paintPinnedQuestion } from '@/lib/podcast/live/chat-overlay'
import type { ChatMessagePublic } from '@/lib/podcast/live/chat'
import { controlSimulcast } from '@/lib/podcast/live/simulcast-client'
import type { DestinationPublic } from '@/lib/podcast/live/simulcast'
import { SfxPad } from '@/components/podcast/sfx-pad'
import { audioInputConstraints, stopStreams } from '@/lib/podcast/capture'
import { loadStudioIceServers } from '@/lib/podcast/webrtc'
import type { GuestTallyPhase } from '@/lib/podcast/guest-types'
import { LiveCompositor, type LivePerson, type VisionState } from '@/lib/podcast/live/compositor'
import { LiveAudioMix, type LiveLevels } from '@/lib/podcast/live/audio-mix'
import { WhipPublisher } from '@/lib/podcast/live/whip-client'
import {
  LiveRecorder,
  deleteStoredRecording,
  extensionFor,
  listStoredRecordings,
  loadStoredRecording,
  type LiveRecording,
  type StoredRecordingMeta,
} from '@/lib/podcast/live/recorder'
import { BroadcastVideoDelay, type DelayStatus } from '@/lib/podcast/live/broadcast-delay'
import { DELAY_CHOICES_SEC, DELAY_DEFAULT_SEC, clampDelaySec } from '@/lib/podcast/live/delay-ring'
import { HOTKEY_HELP, HotkeyMatcher } from '@/lib/podcast/live/hotkeys'
import { transportDisabled, transportLabel, transportRecordState, viewerBadge } from '@/lib/podcast/live/transport'
import {
  bitrateCheck,
  delayCheck,
  faceBlurCheck,
  goLiveBlockers,
  hasLiveTrack,
  shouldWarnBeforeUnload,
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
  isCameraScene,
  type LiveCameraScene,
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
type CameraScene = LiveCameraScene

const HEARTBEAT_MS = 60_000
const END_SLATE_MS = 3000

const CAMERA_OPTIONS: { value: CameraScene; label: string }[] = [
  { value: 'host', label: 'Host' },
  { value: 'guest', label: 'Guest' },
  { value: 'pip', label: 'PIP' },
  { value: 'grid', label: 'Grid' },
]

/** Studio tone convention (see guest-invite-panel): green = live, amber = wait/warn, heart = fail/rec. */
const CHECK_TONE: Record<CheckStatus, string> = {
  pending: 'text-silver',
  ok: 'text-lane-cohost-2',
  warn: 'text-lane-cohost-1',
  fail: 'text-heart',
}
const CHECK_WORD: Record<CheckStatus, string> = { pending: 'Checking', ok: 'OK', warn: 'Warning', fail: 'Blocked' }

const hint = 'studio-type-body text-[12px] leading-snug text-silver-label'
const sectionLabel = 'studio-type-label'

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

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A labelled studio Meter row. */
function LevelRow({ name, level }: { name: string; level: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="studio-type-label w-16 shrink-0 text-silver-label">{name}</span>
      <Meter level={level} aria-label={`${name} level`} />
    </div>
  )
}

export function LiveControlRoom({ episodes = [] }: Props) {
  const [provider, setProvider] = useState<LiveProviderStatus | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<LiveSessionRow[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
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
  /** Room guests (2+ invites): one lane each for the grid scene. Empty on the P2P path. */
  const [guestLanes, setGuestLanes] = useState<RemoteGuestLane[]>([])

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
  const [saving, setSaving] = useState(false)
  /** Recordings still held in this browser's IndexedDB (recovery after a crash). */
  const [stored, setStored] = useState<StoredRecordingMeta[]>([])

  // Chat (pinned question → Program lower third) and simulcast (non-blocking warnings)
  const [pinnedQuestion, setPinnedQuestion] = useState<ChatMessagePublic | null>(null)
  const [simulcastStart, setSimulcastStart] = useState<{ destinations: DestinationPublic[]; warning: string | null } | null>(null)
  const [simulcastWarning, setSimulcastWarning] = useState<string | null>(null)

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
  /** DUMPED: viewers get the safe slate + silence until Resume. */
  const dumped = onAir && Boolean(delayStatus?.dumped)

  const notify = useCallback((title: string, description?: string) => {
    toast({ title, description, tone: 'success' })
  }, [])

  // ---------- engine lifecycle ----------
  useEffect(() => {
    const compositor = new LiveCompositor()
    const mix = new LiveAudioMix()
    compositorRef.current = compositor
    mixRef.current = mix
    recorderRef.current = new LiveRecorder()
    compositor.canvas.className = 'w-full h-auto block rounded-tile bg-black'
    compositor.canvas.setAttribute('role', 'img')
    compositor.canvas.setAttribute('aria-label', 'Live monitor: Program as you switch it, before the broadcast delay')
    compositor.onVision = (who, state, detail) => setVision((prev) => ({ ...prev, [who]: { state, detail } }))
    previewRef.current?.appendChild(compositor.canvas)
    const meter = window.setInterval(() => setLevels(mix.levels()), 150)
    void listStoredRecordings().then(setStored)
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
  // (the recording only lives in this browser).
  const guardUnload = shouldWarnBeforeUnload({
    phase,
    hasRecording: Boolean(recording && (recording.audio || recording.video)),
    saved: Boolean(savedEpisodeId),
    saving,
  })
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

  // Pinned chat question → lower third on camera scenes (never on slates; the compositor skips those).
  useEffect(() => {
    const compositor = compositorRef.current
    if (!compositor) return
    const pinned = pinnedQuestion
    compositor.overlay = pinned
      ? (ctx, w, h) => paintPinnedQuestion(ctx, w, h, pinned, { aboveTitleStrap: lowerThird && Boolean(active) })
      : null
  }, [pinnedQuestion, lowerThird, active])

  const onPinned = useCallback((pinned: ChatMessagePublic | null) => setPinnedQuestion(pinned), [])
  const onChatError = useCallback((message: string) => setError(message), [])
  const onSimulcastWarning = useCallback((message: string | null) => setSimulcastWarning(message), [])

  useEffect(() => {
    compositorRef.current?.setGuest(guestStream, guestName || 'Guest')
    mixRef.current?.setGuest(guestStream)
  }, [guestStream, guestName])

  // Room guests → grid tiles (audio already arrives merged on guestStream via mergeGuestAudio).
  const onRemoteGuests = useCallback((lanes: RemoteGuestLane[]) => setGuestLanes(lanes), [])
  useEffect(() => {
    compositorRef.current?.setGuests(
      guestLanes.map((lane) => ({ id: lane.inviteId, stream: lane.stream, label: lane.name })),
    )
  }, [guestLanes])

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
    if (isCameraScene(next)) setLastCamera(next)
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
   * park viewers on the hold slate with silence until Resume, and put Program on the
   * safe slate so the delay refills from the slate too. No confirm — one keystroke.
   */
  function dump() {
    const delay = delayRef.current
    if (delay && onAir) {
      delay.dump()
      mixRef.current?.dumpAir()
      engageSafeSlate(true)
      announce(
        activeDelaySec > 0
          ? `DUMPED. The last ${activeDelaySec} seconds will not air. Viewers see the safe slate and hear silence until you press Resume.`
          : 'DUMPED. Viewers see the safe slate and hear silence until you press Resume. No delay was running, so anything already said has aired.',
      )
      return
    }
    engageSafeSlate(true)
    announce('Safe slate on. Not on air, so nothing was buffered to dump.')
  }

  /** After a DUMP: refill the delay (viewers keep the slate for one delay), then Program airs again. */
  function resumeFeed() {
    const delay = delayRef.current
    if (!delay || !delay.isDumped) return
    delay.resume()
    mixRef.current?.resumeAir()
    announce(
      activeDelaySec > 0
        ? `Resumed. Viewers keep the slate for ${activeDelaySec} seconds while the delay refills. Release the safe slate when you want cameras back.`
        : 'Resumed. Release the safe slate when you want cameras back.',
    )
  }

  // Hotkeys: D = DUMP, S = safe slate, Esc Esc = DUMP (works in text fields).
  // Only while this control room is showing and, for the letters, not typing.
  const dumpRef = useRef(dump)
  const safeRef = useRef(() => engageSafeSlate())
  dumpRef.current = dump
  safeRef.current = () => engageSafeSlate()
  useEffect(() => {
    const matcher = new HotkeyMatcher()
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      if (!root || !root.isConnected || root.closest('[hidden]')) return
      const action = matcher.match(
        {
          key: e.key,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          repeat: e.repeat,
          defaultPrevented: e.defaultPrevented,
          target: e.target as HTMLElement | null,
        },
        performance.now(),
      )
      if (!action) return
      e.preventDefault()
      if (action === 'dump') dumpRef.current()
      else safeRef.current()
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
      notify('Show scheduled', 'It now appears on /podcast/live.')
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
      notify('Draft episode created and linked', 'You can now make a guest link.')
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
    hostVideoLive: hasLiveTrack(hostStream, 'video'),
    hostAudioLive: hasLiveTrack(hostStream, 'audio'),
    provider,
    providerError,
    guestConnected: Boolean(guestStream),
    playbackMissing,
    phase,
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
      { id: 'provider', label: 'Live provider reachable', status: 'pending', detail: 'Contacting the streaming service…' },
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
          ? 'Press S (or SAFE SLATE) at any moment; D (or Esc Esc) dumps the delay and holds viewers on the slate.'
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
            updateCheck({
              id: 'provider',
              label: 'Live provider reachable',
              status: 'fail',
              detail: 'The streaming service is not set up yet (see Advanced under Live provider).',
            })
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
      delay.canvas.className = 'w-full h-auto block rounded-tile bg-black'
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
      // Restream fan-out is provider-side and must never block the show: fire and report.
      setSimulcastStart(null)
      setSimulcastWarning(null)
      void controlSimulcast(active.id, 'start')
        .then((result) => {
          setSimulcastStart({ destinations: result.destinations, warning: result.warning ?? null })
          if (result.warning) setSimulcastWarning(result.warning)
        })
        .catch((err) => setSimulcastWarning(`Simulcast could not start (${err instanceof Error ? err.message : 'unknown'}). The main stream continues.`))
      // Record what aired (post-delay, post-dump) — dumped material never reaches the draft.
      // Chunks go to IndexedDB as they arrive, so a crashed tab can still recover the show.
      void recorderRef.current?.start(program, mix.stream, recordVideo, active.title)
      setOnAirAt(Date.now())
      setPhase('live')
      announce(seconds > 0 ? `ON AIR with a ${seconds} second delay.` : 'ON AIR. No delay.')
      toast({ title: 'On air', description: seconds > 0 ? `${seconds} s broadcast delay` : 'No delay', tone: 'record' })
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
      mix.setAirMuted(false)
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
    // While dumped nothing is buffered: viewers stay on the slate, so only the slate wait applies.
    const wasDumped = Boolean(delayRef.current?.isDumped)
    await new Promise((r) => window.setTimeout(r, END_SLATE_MS + (wasDumped ? 0 : activeDelaySec * 1000)))
    await publisherRef.current?.stop().catch(() => {})
    publisherRef.current = null
    void controlSimulcast(active.id, 'stop').catch(() => {})
    setSimulcastWarning(null)
    const rec = (await recorderRef.current?.stop()) || null
    teardownDelay()
    mixRef.current?.setAirDelay(0)
    mixRef.current?.setAirMuted(false)
    setRecording(rec)
    void listStoredRecordings().then(setStored)
    announce('OFF AIR. The stream has stopped. Save the recording as an episode draft before leaving this page.')
    toast({ title: 'Off air', description: 'Save the recording as an episode draft before leaving.', tone: 'neutral' })
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
    setSaving(true)
    setError(null)
    try {
      const out = await saveLiveAsEpisodeDraft({
        session: active,
        audio: recording.audio,
        durationSec: recording.durationSec,
      })
      upsertSession(out.session)
      setSavedEpisodeId(out.episodeId)
      notify('Saved as a draft episode', 'Edit and publish it from Episodes / Production room.')
      announce('Saved as an episode draft.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft')
      announce('Saving the draft failed.')
    } finally {
      setBusy(false)
      setSaving(false)
    }
  }

  async function discardRecording() {
    if (!recording) return
    if (!window.confirm('Delete this show’s local recording from this browser? This cannot be undone.')) return
    await deleteStoredRecording(recording.id)
    setRecording(null)
    setStored(await listStoredRecordings())
  }

  async function recoverStored(meta: StoredRecordingMeta, kind: 'audio' | 'video') {
    try {
      const rec = await loadStoredRecording(meta)
      const blob = kind === 'audio' ? rec.audio : rec.video
      if (!blob) {
        setError(`That recording has no ${kind}.`)
        return
      }
      download(blob, `live-${kind}-${new Date(meta.startedAt).toISOString().slice(0, 10)}.${extensionFor(blob)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the stored recording')
    }
  }

  async function removeStored(meta: StoredRecordingMeta) {
    if (!window.confirm('Delete this stored recording from this browser?')) return
    await deleteStoredRecording(meta.id)
    setStored(await listStoredRecordings())
  }

  // ---------- render ----------
  const recTally: GuestTallyPhase =
    phase === 'live' ? (scene === 'starting' ? 'count-in' : 'rec') : phase === 'ended' ? 'stopped' : 'waiting'
  const lossTone =
    health.packetLossPct > 5 ? 'text-heart' : health.packetLossPct > 2 ? 'text-lane-cohost-1' : 'text-lane-cohost-2'
  const elapsed = onAirAt && clock ? Math.max(0, Math.round((clock - onAirAt) / 1000)) : 0
  const rebuildingSec = delayStatus ? Math.ceil(delayStatus.rebuildingMs / 1000) : 0
  const rebuilding = onAir && activeDelaySec > 0 && rebuildingSec > 0
  const dumpedOnce = (delayStatus?.dumps ?? 0) > 0
  const badge = viewerBadge({ phase, dumped, activeDelaySec, rebuildingSec: rebuilding ? rebuildingSec : 0 })
  const olderStored = stored.filter((s) => s.id !== recording?.id && s.id !== recorderRef.current?.recordingId)
  const offAir = phase === 'off' || phase === 'ended'
  const whyId = offAir && (blockers.length > 0 || warnings.length > 0) ? 'go-live-why' : undefined

  // The transport's RecordButton: idle = something blocks going live; armed = ready; recording = on air.
  const transport = { phase, blockers: blockers.length, preflightOpen: Boolean(preflight) }
  const recordState: RecordState = transportRecordState({ phase, blockers: blockers.length, hasActiveShow: Boolean(active) })
  const recordLabel = transportLabel(transport)
  const recordDisabled = transportDisabled(transport)
  const cameraValue: CameraScene = isCameraScene(scene) ? scene : lastCamera

  return (
    <div className="space-y-4" ref={rootRef}>
      {/* Screen-reader announcements for ON AIR / OFF AIR / DUMPED / reconnecting. */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      {error && (
        <p className="studio-type-body text-heart" role="alert">
          {error}
        </p>
      )}

      {ingestTrouble && (
        <Panel elevation="floating" className="flex flex-wrap items-center gap-3 border-lane-cohost-1/60 px-4 py-3" role="alert">
          <RefreshCw size={20} className="text-lane-cohost-1 motion-safe:animate-spin" aria-hidden />
          <p className="text-base font-bold text-white">
            Stream {health.state === 'reconnecting' ? 'reconnecting' : health.state}… (attempt {health.reconnects})
          </p>
          <p className="studio-type-body text-silver">
            Retrying automatically with backoff. Viewers see “Reconnecting”. Keep talking — the local recording continues.
            {health.lastError ? ` Last error: ${health.lastError}.` : ''}
          </p>
        </Panel>
      )}

      {simulcastWarning && (
        <Panel elevation="flat" className="flex flex-wrap items-center gap-2 border-lane-cohost-1/50 px-4 py-2" role="status">
          <AlertTriangle size={16} className="text-lane-cohost-1" aria-hidden />
          <span className="studio-type-body flex-1 text-white">{simulcastWarning}</span>
          <Button size="dense" variant="ghost" onClick={() => setSimulcastWarning(null)}>
            Dismiss
          </Button>
        </Panel>
      )}

      {/* Transport strip — the live room's equivalent of the booth's record bar. */}
      <Panel tactile className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="studio-type-label hidden text-silver-label sm:inline">Live show</span>
          <h2 className="truncate text-sm font-medium text-white sm:text-base">{active?.title || 'No show selected'}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-label="Broadcast state">
          {phase === 'live' ? (
            <Chip tone="record" dot>
              On air <span className="studio-type-timecode text-white">{fmtDuration(elapsed)}</span>
            </Chip>
          ) : phase === 'connecting' ? (
            <Chip tone="accent" dot>
              Connecting…
            </Chip>
          ) : phase === 'ending' ? (
            <Chip tone="accent" dot>
              Ending{activeDelaySec > 0 ? ` · last ${activeDelaySec} s airing` : ''}
            </Chip>
          ) : (
            <Chip tone="neutral">Off air</Chip>
          )}
          {onAir && activeDelaySec > 0 && !dumped && <Chip tone="accent">{activeDelaySec} s delay</Chip>}
          {safe && (
            <Chip className="border-lane-cohost-1/60 bg-lane-cohost-1/10 text-lane-cohost-1" dot>
              Safe slate
            </Chip>
          )}
          {dumped && (
            <Chip tone="record" dot>
              Dumped
            </Chip>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="studio-type-button hidden text-silver-label sm:inline">{onAir ? 'End show' : 'Go live'}</span>
          <RecordButton
            state={recordState}
            size={56}
            aria-label={recordLabel}
            aria-describedby={whyId}
            disabled={recordDisabled}
            onClick={() => (onAir ? void endShow() : void runPreflight())}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Program + switcher */}
        <Panel className="space-y-4 p-4" aria-label="Program">
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="space-y-1.5">
              <figcaption className="flex items-center justify-between gap-2">
                <span className="studio-type-label text-silver-label">Live in the room (you, now)</span>
                <Chip tone="neutral">No delay</Chip>
              </figcaption>
              <div ref={previewRef} className="relative overflow-hidden rounded-tile border border-divider bg-black" />
            </figure>
            <figure className="space-y-1.5">
              <figcaption className="flex items-center justify-between gap-2">
                <span className="studio-type-label text-silver-label">What viewers see now</span>
                <Chip tone={dumped ? 'record' : onAir && activeDelaySec > 0 ? 'accent' : 'neutral'} dot={onAir} role="status">
                  {badge}
                </Chip>
              </figcaption>
              <div
                className={cn(
                  'relative overflow-hidden rounded-tile border bg-black',
                  dumped ? 'border-heart ring-2 ring-heart/60' : 'border-divider',
                )}
              >
                <div ref={airRef} />
                {!onAir && (
                  <div className="studio-type-body flex aspect-video w-full items-center justify-center border border-dashed border-divider text-silver-label">
                    Off air — the delayed feed appears here when you go live
                  </div>
                )}
                {rebuilding && !dumped && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 text-center text-sm font-bold text-lane-cohost-1">
                    {dumpedOnce ? `Resumed · delay refilling… ${rebuildingSec} s` : `Delay filling… ${rebuildingSec} s`}
                  </div>
                )}
                {dumped && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 text-center text-sm font-bold text-heart">
                    DUMPED · viewers get the slate and silence until you press Resume
                  </div>
                )}
              </div>
            </figure>
          </div>
          {delayStatus?.error && <p className={cn(hint, 'text-lane-cohost-1')}>{delayStatus.error}</p>}

          {/* Scenes */}
          <div className="flex flex-wrap items-center gap-3">
            <span title={safe ? 'Release the safe slate to switch cameras' : undefined}>
              <SegmentedControl<CameraScene>
                aria-label="Camera scene"
                options={CAMERA_OPTIONS}
                value={cameraValue}
                onValueChange={takeCamera}
                className={cn(safe && 'pointer-events-none opacity-40')}
              />
            </span>
            <Button
              variant={scene === 'starting' ? 'primary' : 'secondary'}
              disabled={safe}
              aria-pressed={scene === 'starting'}
              onClick={() => putScene('starting')}
            >
              Starting soon
            </Button>
            <Checkbox
              label="Title lower third"
              checked={lowerThird}
              onChange={(e) => setLowerThird(e.target.checked)}
            />
          </div>

          {/* Safety controls: big targets, hotkeys shown on the buttons. */}
          <div className="flex flex-wrap items-stretch gap-3" role="group" aria-label="Safety">
            {!dumped ? (
              <Button
                variant="danger"
                size="touch"
                onClick={dump}
                aria-keyshortcuts="D Escape+Escape"
                aria-label={
                  activeDelaySec > 0 && onAir
                    ? `Dump: discard the last ${activeDelaySec} seconds; viewers get the safe slate and silence until Resume. Hotkey D, or Escape twice.`
                    : 'Dump: cut viewers to the safe slate with silence until Resume. Hotkey D, or Escape twice.'
                }
                className="min-h-[56px] min-w-[180px] text-base font-bold uppercase tracking-wider"
              >
                <Trash2 size={20} aria-hidden /> Dump <Kbd className="border-white/40 bg-white/10 text-white">D</Kbd>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="touch"
                onClick={resumeFeed}
                aria-label={
                  activeDelaySec > 0
                    ? `Resume broadcast: refill the ${activeDelaySec} second delay behind the safe slate.`
                    : 'Resume broadcast behind the safe slate.'
                }
                className="min-h-[56px] min-w-[180px] text-base font-bold uppercase tracking-wider"
              >
                <Play size={20} aria-hidden /> Resume broadcast
              </Button>
            )}
            {!safe ? (
              <Button
                variant="secondary"
                size="touch"
                onClick={() => engageSafeSlate()}
                aria-keyshortcuts="S"
                title="Instantly cut Program to the branded slate and remove guest audio"
                className="min-h-[56px] border-lane-cohost-1/60 text-lane-cohost-1 hover:border-lane-cohost-1"
              >
                <ShieldAlert size={18} aria-hidden /> Safe slate <Kbd>S</Kbd>
              </Button>
            ) : (
              <Button variant="secondary" size="touch" onClick={releaseSafeSlate} className="min-h-[56px] border-lane-cohost-1/60 text-lane-cohost-1">
                Release safe slate → {lastCamera.toUpperCase()}
              </Button>
            )}
          </div>

          {whyId && (
            <div id={whyId} className="space-y-1">
              {blockers.length > 0 && <p className="studio-type-body font-semibold text-heart">Go live is unavailable because:</p>}
              <ul className="space-y-0.5">
                {blockers.map((b) => (
                  <li key={b} className="studio-type-body text-heart">
                    • {b}
                  </li>
                ))}
                {warnings.map((w) => (
                  <li key={w} className="studio-type-body text-lane-cohost-1">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preflight && (
            <Panel
              ref={preflightRef}
              elevation="flat"
              tabIndex={-1}
              role="region"
              aria-label="Pre-flight checklist"
              className="space-y-3 border-forged/50 p-3"
            >
              <p className={sectionLabel}>Pre-flight checklist</p>
              <ul className="space-y-1.5" aria-live="polite">
                {preflight.checks.map((c) => (
                  <li key={c.id} className="studio-type-body flex gap-2">
                    <span className={cn('w-20 shrink-0 font-bold', CHECK_TONE[c.status])}>{CHECK_WORD[c.status]}</span>
                    <span>
                      <span className="text-white">{c.label}</span>
                      <span className="text-silver"> — {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="touch"
                  onClick={() => void goLive()}
                  disabled={preflightPending || preflightFailed || blockers.length > 0}
                  loading={preflightPending}
                >
                  <Radio size={16} aria-hidden /> Go live now
                </Button>
                <Button onClick={() => setPreflight(null)}>Cancel</Button>
                <Button variant="ghost" disabled={preflight.running} onClick={() => void runPreflight()}>
                  <RefreshCw size={14} aria-hidden /> Re-run checks
                </Button>
              </div>
              {preflightFailed && <p className={cn(hint, 'text-heart')}>Fix the blocked item(s) above, then re-run the checks.</p>}
            </Panel>
          )}

          {/* Broadcast settings (locked while on air). */}
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Broadcast delay"
              value={delaySec}
              disabled={onAir}
              onChange={(e) => setDelaySec(Number(e.target.value))}
              wrapperClassName="w-auto min-w-[200px]"
            >
              {DELAY_CHOICES_SEC.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'Off (DUMP = slate only)' : `${s} s${s === DELAY_DEFAULT_SEC ? ' (recommended)' : ''}`}
                </option>
              ))}
            </Select>
            <Select
              label="Countdown"
              value={countdownSec}
              disabled={onAir}
              onChange={(e) => setCountdownSec(Number(e.target.value))}
              wrapperClassName="w-auto min-w-[120px]"
            >
              {[0, 10, 30, 60, 120, 300].map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'none' : s < 60 ? `${s}s` : `${s / 60}m`}
                </option>
              ))}
            </Select>
            <Checkbox
              label="Record program video locally"
              checked={recordVideo}
              disabled={onAir}
              onChange={(e) => setRecordVideo(e.target.checked)}
              wrapperClassName="pb-2"
            />
          </div>
          <p className={hint}>
            <strong className="text-silver">Dump</strong> (<Kbd>D</Kbd>, or <Kbd>Esc</Kbd> twice — that one works even while
            typing) throws away everything in the delay so it never airs and holds viewers on the safe slate with{' '}
            <em>silence</em> until you press <strong className="text-silver">Resume</strong>; the delay then refills behind
            the slate. <strong className="text-silver">Safe slate</strong> (<Kbd>S</Kbd>) is an instant cut (no fade) that
            hard-mutes the guest but keeps the delay; with a delay, viewers see it after the delay — use Dump when something
            has just been said. Letter hotkeys work while this Live show tab is showing and you are not typing. You can
            switch console tabs while on air — the stream keeps running — but keep this browser tab in the foreground,
            because browsers slow down background tabs.
          </p>
          <ul className="sr-only" aria-label="Keyboard shortcuts">
            {HOTKEY_HELP.map((h) => (
              <li key={h.keys}>
                {h.keys}: {h.action}
              </li>
            ))}
          </ul>

          {/* Levels + mutes + SFX */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <LevelRow name="Host" level={levels.host} />
              <LevelRow name="Guest" level={levels.guest} />
              <LevelRow name="Program" level={levels.program} />
              <LevelRow name="Air" level={levels.air} />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button aria-pressed={hostMuted} onClick={() => setHostMuted((v) => !v)}>
                {hostMuted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />} Host {hostMuted ? 'muted' : 'on'}
              </Button>
              <Button disabled={safe} aria-pressed={guestMuted || safe} onClick={() => setGuestMuted((v) => !v)}>
                {guestMuted || safe ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />} Guest{' '}
                {guestMuted || safe ? 'muted' : 'on'}
              </Button>
              <Button aria-pressed={monitor} onClick={() => setMonitor((v) => !v)}>
                <Headphones size={14} aria-hidden /> Monitor {monitor ? 'on' : 'off'}
              </Button>
            </div>
          </div>
          <SfxPad compact disabled={!hostStream} onDrop={(id) => void mixRef.current?.playSfx(id)} />
        </Panel>

        {/* Right column: privacy, chat, health, provider, simulcast, devices */}
        <div className="space-y-4">
          <Panel className="space-y-3 p-4" aria-label="Privacy">
            <p className={sectionLabel}>Privacy</p>
            <Checkbox label="Blur guest face" checked={blurGuest} onChange={(e) => setBlurGuest(e.target.checked)} />
            <p className={cn(hint, '-mt-1', blurGuest && vision.guest.state !== 'ok' && 'text-lane-cohost-1')}>
              Guest: {visionLabel(blurGuest, vision.guest.state)}
              {vision.guest.state === 'failed' && vision.guest.detail ? ` (${vision.guest.detail})` : ''}
            </p>
            <Checkbox label="Blur host face" checked={blurHost} onChange={(e) => setBlurHost(e.target.checked)} />
            <p className={cn(hint, '-mt-1', blurHost && vision.host.state !== 'ok' && 'text-lane-cohost-1')}>
              Host: {visionLabel(blurHost, vision.host.state)}
            </p>
            <p className={hint}>
              Guest blur is on by default. Turn it off only if the guest agreed to show their face. If the detector is
              loading, stalls or fails, that person is shown as a silhouette — never an unblurred face. When no face is
              found the whole picture is pixelated.
            </p>
            <Select
              label="Guest voice disguise"
              value={disguise}
              onChange={(e) => setDisguise(e.target.value as VoiceDisguisePreset | '')}
            >
              <option value="">Off — natural voice</option>
              {VOICE_DISGUISE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            {disguiseError && (
              <p className={cn(hint, 'text-heart')} role="alert">
                {disguiseError}
              </p>
            )}
            {disguise && (
              <p className={cn(hint, 'flex gap-1 text-lane-cohost-1')}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {VOICE_DISGUISE_WARNING}
              </p>
            )}
            {disguise && <p className={hint}>Your headphones keep the natural voice; only Program is shifted.</p>}
          </Panel>

          <Panel className="space-y-3 p-4" aria-label="Chat and questions">
            <p className={sectionLabel}>Chat &amp; Q&amp;A</p>
            <LiveChatModerationPanel sessionId={active?.id ?? null} live={phase === 'live'} onPinned={onPinned} onError={onChatError} />
          </Panel>

          <Panel className="space-y-3 p-4" aria-label="Stream health">
            <p className={sectionLabel}>Stream health</p>
            <dl className="studio-type-body grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-silver">Ingest</dt>
              <dd
                className={cn(
                  health.state === 'connected' && 'font-semibold text-lane-cohost-2',
                  ingestTrouble && 'font-bold uppercase text-lane-cohost-1',
                  !ingestTrouble && health.state !== 'connected' && 'text-white',
                )}
              >
                {health.state}
              </dd>
              <dt className="text-silver">Bitrate</dt>
              <dd className="text-white">{health.bitrateKbps ? `${health.bitrateKbps} kbps` : '—'}</dd>
              <dt className="text-silver">Packet loss</dt>
              <dd className={lossTone}>{health.state === 'connected' ? `${health.packetLossPct}%` : '—'}</dd>
              <dt className="text-silver">RTT</dt>
              <dd className="text-white">{health.rttMs != null ? `${health.rttMs} ms` : '—'}</dd>
              <dt className="text-silver">Video</dt>
              <dd className="text-white">
                {health.frameWidth ? `${health.frameWidth}p-wide` : '—'}
                {health.fps != null ? ` · ${health.fps} fps` : ''}
              </dd>
              <dt className="text-silver">Reconnects</dt>
              <dd className="text-white">{health.reconnects}</dd>
            </dl>
            {health.lastError && <p className={cn(hint, 'text-lane-cohost-1')}>{health.lastError}</p>}
          </Panel>

          <Panel className="space-y-3 p-4" aria-label="Live provider">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>Live provider</p>
              <IconButton size="dense" aria-label="Re-check provider" onClick={() => void checkProvider()}>
                <RefreshCw />
              </IconButton>
            </div>
            {providerError && <p className={cn(hint, 'text-heart')}>{providerError}</p>}
            {provider && (
              <p className={cn('studio-type-body', provider.configured ? 'text-lane-cohost-2' : 'text-lane-cohost-1')}>
                {provider.configured
                  ? `Ready · ${provider.provider} · ${provider.host}`
                  : 'Not set up yet — an admin needs to add the streaming settings on the server (see Advanced).'}
              </p>
            )}
            <a
              href="/podcast/live"
              target="_blank"
              rel="noreferrer"
              className="studio-type-button inline-flex h-control-compact items-center gap-2 rounded-control border border-divider bg-surface-raised px-3 text-white shadow-inset-top hover:border-forged/60"
            >
              <ExternalLink size={14} aria-hidden /> Open viewer page
            </a>
            <details className={hint}>
              <summary className="cursor-pointer text-silver">Advanced (technical details)</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt>Publish protocol</dt>
                <dd className="text-white">
                  {provider?.configured
                    ? `WHIP · ${provider.provider} · ${provider.host}`
                    : 'WHIP — LIVE_WHIP_URL is not set (Netlify environment variables; see docs/podcast-live.md)'}
                </dd>
                <dt>Bearer token</dt>
                <dd className="text-white">{provider?.bearer ? 'set (LIVE_WHIP_BEARER)' : 'none'}</dd>
                <dt>Default playback</dt>
                <dd className="text-white">
                  {provider?.defaultHlsUrl
                    ? 'HLS (LIVE_PLAYBACK_HLS_URL)'
                    : provider?.defaultWhepUrl
                      ? 'WHEP (LIVE_PLAYBACK_WHEP_URL)'
                      : 'none (LIVE_PLAYBACK_HLS_URL / LIVE_PLAYBACK_WHEP_URL unset)'}
                </dd>
                <dt>Delay engine</dt>
                <dd className="text-white">
                  {delayStatus
                    ? delayStatus.mode === 'off'
                      ? 'passthrough (no delay)'
                      : delayStatus.mode === 'encoded'
                        ? `WebCodecs · ${fmtBytes(delayStatus.bufferedBytes)} buffered`
                        : `frame buffer${delayStatus.plan ? ` ${delayStatus.plan.width}×${delayStatus.plan.height} @${delayStatus.plan.fps} fps` : ''} · ${fmtBytes(delayStatus.bufferedBytes)} buffered`
                    : 'starts when you go live'}
                </dd>
                <dt>Face detector</dt>
                <dd className="text-white">MediaPipe BlazeFace (in-browser; model + WASM from CDN)</dd>
              </dl>
            </details>
          </Panel>

          <Panel className="space-y-3 p-4" aria-label="Simulcast">
            <p className={sectionLabel}>Simulcast</p>
            <LiveSimulcastCard liveSessionId={onAir && active ? active.id : null} startResult={simulcastStart} onWarning={onSimulcastWarning} />
          </Panel>

          <Panel className="space-y-3 p-4" aria-label="Host camera and mic">
            <p className={sectionLabel}>Host camera + mic</p>
            <Select aria-label="Camera" value={camId} onChange={(e) => setCamId(e.target.value)} disabled={onAir}>
              <option value="">Default camera</option>
              {cams.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </Select>
            <Select aria-label="Microphone" value={micId} onChange={(e) => setMicId(e.target.value)} disabled={onAir}>
              <option value="">Default microphone</option>
              {mics.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Mic ${i + 1}`}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button variant={hostStream ? 'secondary' : 'primary'} disabled={onAir} onClick={() => void openDevices()}>
                <Camera size={14} aria-hidden /> {hostStream ? 'Re-open devices' : 'Open camera + mic'}
              </Button>
              {hostStream && (
                <Button variant="ghost" disabled={onAir} onClick={closeDevices}>
                  Close
                </Button>
              )}
            </div>
            <p className={hint}>Wear headphones: guest audio plays through this tab.</p>
          </Panel>
        </div>
      </div>

      {/* After the show */}
      {phase === 'ended' && recording && (
        <Panel elevation="floating" className="space-y-3 p-4" aria-label="After the show">
          <p className={sectionLabel}>After the show · {fmtDuration(recording.durationSec)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || !recording.audio || Boolean(savedEpisodeId)}
              loading={saving}
              onClick={() => void saveDraft()}
            >
              <Save size={14} aria-hidden /> {savedEpisodeId ? 'Saved as episode draft' : 'Save as episode draft'}
            </Button>
            {recording.audio && (
              <Button onClick={() => download(recording.audio!, `live-audio.${extensionFor(recording.audio!)}`)}>
                <Download size={14} aria-hidden /> Program audio
              </Button>
            )}
            {recording.video && (
              <Button onClick={() => download(recording.video!, `live-program.${extensionFor(recording.video!)}`)}>
                <Download size={14} aria-hidden /> Program video
              </Button>
            )}
            <Button variant="ghost" disabled={saving} onClick={() => void discardRecording()}>
              <Trash2 size={12} aria-hidden /> Discard recording
            </Button>
          </div>
          <p className={hint}>
            The recording is what viewers got (after the delay; dumped seconds are not in it). The draft uses the same
            episode pipeline as pre-recorded shows: edit, add show notes, then publish from the Episodes tab. The video is
            not uploaded.
            {recording.storage !== 'memory'
              ? ' A copy stays in this browser until you discard it, so it is still here if the tab closes.'
              : ' This browser could not store it on disk: download the video before closing this tab.'}
            {!savedEpisodeId && ' This page will warn you if you try to leave before saving.'}
          </p>
        </Panel>
      )}

      {olderStored.length > 0 && !onAir && (
        <Panel className="space-y-3 p-4" aria-labelledby="live-stored-heading">
          <h2 id="live-stored-heading" className={sectionLabel}>
            Recordings kept in this browser
          </h2>
          <p className={hint}>
            Saved chunk by chunk while on air, so a show survives a crashed or closed tab. Only this browser has them; the
            newest two are kept.
          </p>
          <ul className="space-y-1.5">
            {olderStored.map((s) => (
              <li key={s.id} className="studio-type-body flex flex-wrap items-center gap-2 rounded-control border border-divider px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-white">
                  {s.title} · {new Date(s.startedAt).toLocaleString()}
                  {s.endedAt ? '' : ' (tab closed during the show)'}
                </span>
                {s.audioMime && (
                  <Button size="dense" onClick={() => void recoverStored(s, 'audio')}>
                    <Download size={12} aria-hidden /> Audio
                  </Button>
                )}
                {s.videoMime && (
                  <Button size="dense" onClick={() => void recoverStored(s, 'video')}>
                    <Download size={12} aria-hidden /> Video
                  </Button>
                )}
                <IconButton size="dense" aria-label={`Delete stored recording ${s.title}`} onClick={() => void removeStored(s)}>
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Shows */}
        <Panel className="space-y-3 p-4" aria-label="Shows">
          <p className={sectionLabel}>Shows</p>
          {sessions.length === 0 && <p className="studio-type-body text-silver">No live shows yet. Schedule one →</p>}
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'studio-type-body flex flex-wrap items-center gap-2 rounded-control border px-3 py-2',
                  s.id === activeId ? 'border-forged/60 bg-obsidian shadow-glow-subtle' : 'border-divider',
                )}
              >
                <button
                  type="button"
                  disabled={onAir}
                  aria-pressed={s.id === activeId}
                  className="min-w-0 flex-1 truncate text-left text-white disabled:opacity-60"
                  onClick={() => setActiveId(s.id)}
                >
                  {s.title}
                </button>
                <Chip tone={s.status === 'live' ? 'record' : s.status === 'scheduled' ? 'accent' : 'neutral'} dot={s.status === 'live'}>
                  {s.status}
                  {s.scheduled_for && s.status === 'scheduled'
                    ? ` · ${new Date(s.scheduled_for).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : ''}
                </Chip>
                {s.status === 'live' && !(onAir && s.id === activeId) && (
                  <Button size="dense" onClick={() => void markEnded(s)} title="Stuck as live? Mark ended.">
                    Mark ended
                  </Button>
                )}
                {s.status !== 'live' && (
                  <IconButton size="dense" aria-label={`Delete ${s.title}`} onClick={() => void removeSession(s)}>
                    <Trash2 />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>

          {active && (
            <div className="space-y-2 border-t border-divider pt-3">
              <p className={hint}>
                Active: <span className="text-white">{active.title}</span>
                {active.scheduled_for ? ` · ${toLocalInput(active.scheduled_for).replace('T', ' ')}` : ''}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  label="Linked episode"
                  value={active.episode_id || ''}
                  disabled={busy || onAir}
                  onChange={(e) => void linkEpisode(e.target.value)}
                  wrapperClassName="flex-1"
                >
                  <option value="">No linked episode</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.title}
                    </option>
                  ))}
                </Select>
                {!active.episode_id && (
                  <Button disabled={busy} onClick={() => void createLinkedEpisode()}>
                    New draft episode
                  </Button>
                )}
              </div>
              {playbackMissing && (
                <p className={cn(hint, 'flex items-center gap-1 text-lane-cohost-1')}>
                  <AlertTriangle size={12} aria-hidden /> No playback URL (session or LIVE_PLAYBACK_*). Viewers will see “being
                  set up”.
                </p>
              )}
            </div>
          )}
        </Panel>

        {/* Schedule */}
        <Panel className="space-y-3 p-4" aria-label="Schedule next show">
          <p className={sectionLabel}>Schedule next show</p>
          <Input label="Title" placeholder="Title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
          <Textarea
            label="Public description (optional)"
            rows={2}
            value={fDesc}
            onChange={(e) => setFDesc(e.target.value)}
          />
          <Input label="Start time" type="datetime-local" value={fWhen} onChange={(e) => setFWhen(e.target.value)} />
          <Select label="Episode" value={fEpisode} onChange={(e) => setFEpisode(e.target.value)}>
            <option value="">Link an episode later</option>
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.title}
              </option>
            ))}
          </Select>
          <details className={hint}>
            <summary className="cursor-pointer text-silver">Advanced: per-show playback addresses (optional)</summary>
            <div className="mt-2 space-y-2">
              <Input
                placeholder="HLS .m3u8 URL (defaults to LIVE_PLAYBACK_HLS_URL)"
                aria-label="HLS playback URL"
                value={fHls}
                onChange={(e) => setFHls(e.target.value)}
              />
              <Input
                placeholder="WHEP URL (defaults to LIVE_PLAYBACK_WHEP_URL)"
                aria-label="WHEP playback URL"
                value={fWhep}
                onChange={(e) => setFWhep(e.target.value)}
              />
            </div>
          </details>
          <Button variant="primary" disabled={busy} loading={busy} onClick={() => void scheduleShow()}>
            <CalendarPlus size={14} aria-hidden /> Schedule
          </Button>
        </Panel>
      </div>

      {/* Guest (existing P2P invite flow, unchanged) */}
      <Panel className="space-y-3 p-4" aria-label="Guest">
        <p className={sectionLabel}>Guest</p>
        {active?.episode_id ? (
          <GuestInvitePanel
            episodeId={active.episode_id}
            recording={phase === 'live'}
            recTally={recTally}
            hostStream={hostTalkStream}
            onRemoteStream={setGuestStream}
            onRemoteGuests={onRemoteGuests}
            mergeGuestAudio
            onGuestName={setGuestName}
            onTakeUrl={noop}
            safePause={safe}
          />
        ) : (
          <p className="studio-type-body text-silver">
            Link this show to an episode (above) to create a private guest link. The guest joins from the same booth page
            used for pre-recorded episodes; their camera and mic feed Program here.
          </p>
        )}
        <p className={hint}>Do not keep the Production room open on the same episode while live — both would answer the guest.</p>
      </Panel>
    </div>
  )
}
