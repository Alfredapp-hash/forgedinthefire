'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CloudUpload,
  Coffee,
  Download,
  Headphones,
  LogOut,
  Mic2,
  Music2,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import { Button, Checkbox, Chip, Input, Panel, Select, Textarea, toast } from '@/components/studio-ui'
import { ORG } from '@/lib/constants'
import { createGuestHeadphoneMix, type GuestHeadphoneMix } from '@/lib/podcast/guest-cue'
import { CameraPreview } from '@/components/podcast/camera-preview'
import { openCameraStream } from '@/lib/podcast/camera'
import { attachInputMeter } from '@/lib/podcast/record-session'
import { openInputStream, stopStreams } from '@/lib/podcast/capture'
import {
  GUEST_DURABLE_KINDS,
  describeGuestSession,
  describeGuestTally,
  describeIceProgress,
  parseTallyPhase,
  type GuestInvitePublic,
  type GuestRoomPublic,
  type GuestTallyPhase,
  type GuestUiPhase,
} from '@/lib/podcast/guest-types'
import {
  clearGuestSession,
  fetchGuestSession,
  getGuestSession,
  postGuestSession,
  pullGuestSignals,
  pushGuestSignal,
  withdrawGuestRecording,
  type GuestRoomToken,
} from '@/lib/podcast/guest-signal'
import {
  addIce,
  applyAnswer,
  applyIceServers,
  attachLocalAudio,
  attachLocalVideo,
  closePeer,
  createStudioPeer,
  detachLocalVideo,
  ensureCueRecvTransceiver,
  ensureVideoTransceiver,
  guestConnectionHelp,
  iceConfigStale,
  iceRefreshDelay,
  loadStudioIceServers,
  makeOffer,
  makeRestartOffer,
  newPeerGeneration,
  remoteAudioByRole,
  type StudioIceConfig,
} from '@/lib/podcast/webrtc'
import { createGuestAudioSession, type GuestAudioSession } from '@/lib/podcast/guest/audio-session'
import {
  SignalDeduper,
  createControlChannel,
  errorPollDelay,
  nextPollDelay,
  stampControl,
  wireControlChannel,
  type ControlChannel,
} from '@/lib/podcast/guest/control-channel'
import {
  CONSENT_POINTS,
  CONSENT_VERSION,
  DEFAULT_CONSENT_CHOICES,
  guestReferenceCode,
  type ConsentChoices,
} from '@/lib/podcast/guest/consent-text'
import { createStudioRoom, roomConnectionHelp, type RoomConnectionState, type StudioRoom } from '@/lib/podcast/rooms/client'
import {
  hasPendingGuestBackups,
  resumeGuestBackups,
  startGuestBackup,
  type BackupStatus,
  type GuestBackup,
} from '@/lib/podcast/upload/guest-backup'

/**
 * The guest booth. Calm, plain-language, mobile-first. The guest owns their
 * mic, camera, mute, "I need a moment" and Leave; the host owns Record,
 * talkback, cue, punch, FX and export.
 *
 * One remote guest talks to the host peer-to-peer (free). From the second
 * invite on an episode the host moves everyone into the episode room (SFU);
 * the booth swaps transport without touching the mic, the consent or a
 * running backup.
 */

type Phase = 'loading' | 'blocked' | 'consent' | 'lobby' | 'booth' | 'left'

/** Automatic ICE restarts per peer before we ask the guest to press Try again. */
const MAX_AUTO_RESTARTS = 3
/** How long "disconnected" may last before we restart ICE ourselves. */
const DISCONNECT_GRACE_MS = 4000
/** Host signals that still matter if they were sent before this join. */
const STATE_KINDS = new Set(['mute', 'camera', 'tally', 'talkback', 'cue', 'pause'])

type MediaProblem = { message: string; help: boolean }

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Turn getUserMedia errors into plain language. */
function mediaProblem(err: unknown, device: 'microphone' | 'camera'): MediaProblem {
  const name = (err as { name?: string } | null)?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return { message: `Your browser is blocking the ${device}. You can allow it and try again — steps below.`, help: true }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return { message: `We could not find a ${device}. Plug one in (or pick another from the list) and try again.`, help: false }
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      message: `Your ${device} is busy in another app (like Zoom, Teams, or FaceTime). Close that app, then try again.`,
      help: false,
    }
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { message: `The ${device} only works on a secure (https) page.`, help: false }
  }
  const msg = err instanceof Error && err.message ? err.message : `The ${device} could not start.`
  return { message: msg, help: false }
}

/** What the guest sees about the connection, in plain words. */
function plainStatus(phase: GuestUiPhase, turnConfigured: boolean, restarting: boolean, panel = false) {
  switch (phase) {
    case 'recording':
      return panel
        ? 'Recording is on. The host is recording this panel; you can hear the other guests.'
        : 'Recording is on. The host is recording this conversation.'
    case 'connected':
      return panel ? 'You are in the panel room. The host and the other guests can hear you.' : 'You are connected. The host can hear you.'
    case 'linking':
      return panel ? 'Joining the panel room…' : 'Connecting you to the host…'
    case 'dropped':
      return restarting ? 'Connection lost. Reconnecting automatically…' : 'Connection lost. Reconnecting…'
    case 'failed':
      return panel ? roomConnectionHelp() : guestConnectionHelp(turnConfigured)
    case 'left':
      return 'You left the booth.'
    default:
      return 'Waiting for the host to connect. This can take a minute.'
  }
}

type BackupEntry = { key: string; backup: GuestBackup; status: BackupStatus }

const HINT = 'studio-type-label normal-case tracking-normal text-silver'
const HINT_BODY = 'studio-type-label normal-case tracking-normal text-silver-body'

export function GuestPortal({
  token,
  initialSession,
  initialError,
}: {
  token: string
  initialSession?: GuestInvitePublic | null
  initialError?: string | null
}) {
  const [phase, setPhase] = useState<Phase>(initialError ? 'blocked' : initialSession ? 'consent' : 'loading')
  const [session, setSession] = useState<GuestInvitePublic | null>(initialSession || null)
  const [error, setError] = useState<string | null>(initialError || null)
  const [permissionHelp, setPermissionHelp] = useState(false)
  const [audioOnly, setAudioOnly] = useState(true)
  const [choices, setChoices] = useState<ConsentChoices>(DEFAULT_CONSENT_CHOICES)
  const [name, setName] = useState('')
  const [phones, setPhones] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState('')
  const [camId, setCamId] = useState('')
  const [camOn, setCamOn] = useState(false)
  const [camStream, setCamStream] = useState<MediaStream | null>(null)
  const [camLocked, setCamLocked] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [muted, setMuted] = useState(false)
  const [muteLocked, setMuteLocked] = useState(false)
  const [pauseRequested, setPauseRequested] = useState(false)
  const [hostPause, setHostPause] = useState<{ slate: boolean } | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [peak, setPeak] = useState(0)
  const [clip, setClip] = useState(false)
  const [hostPeak, setHostPeak] = useState(0)
  const [ice, setIce] = useState<RTCIceConnectionState | ''>('')
  const [recording, setRecording] = useState(false)
  const [tally, setTally] = useState<GuestTallyPhase>('waiting')
  const [talkback, setTalkback] = useState(false)
  const [cueOn, setCueOn] = useState(false)
  const [cueLive, setCueLive] = useState(false)
  const [cueVolume, setCueVolume] = useState(0.85)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [ok, setOk] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [turnConfigured, setTurnConfigured] = useState(false)
  const [hostEnded, setHostEnded] = useState(false)
  // Presentational: elapsed offset frozen at the moment a drop was detected, for
  // the reassuring "disconnected at MM:SS" banner.
  const [dropAtSec, setDropAtSec] = useState<number | null>(null)
  const connectedAtRef = useRef<number | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  /** Panel shows: the episode room replaces the P2P peer (same controls, same backups). */
  const roomRef = useRef<StudioRoom | null>(null)
  const roomNameRef = useRef<string | null>(null)
  const [roomInfo, setRoomInfo] = useState<GuestRoomPublic | null>(null)
  const switchingRef = useRef(false)
  const genRef = useRef<string>('')
  const afterRef = useRef(0)
  const joinCursorRef = useRef(0)
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const stopMeterRef = useRef<(() => void) | null>(null)
  const stopHostMeterRef = useRef<(() => void) | null>(null)
  const mutedRef = useRef(false)
  const muteLockedRef = useRef(false)
  const camLockedRef = useRef(false)
  const talkbackRef = useRef(false)
  const cueLiveRef = useRef(false)
  const audioOnlyRef = useRef(true)
  const pauseRequestedRef = useRef(false)
  const phonesRef = useRef<GuestHeadphoneMix | null>(null)
  const audioSessionRef = useRef<GuestAudioSession | null>(null)
  const controlRef = useRef<ControlChannel | null>(null)
  const dedupeRef = useRef(new SignalDeduper())
  const wakePollRef = useRef<() => void>(() => {})
  const startingPeerRef = useRef(false)
  const restartAttemptsRef = useRef(0)
  const restartingRef = useRef(false)
  const disconnectTimerRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>(phase)
  /** Host session clock from the latest record-on signal: where the guest backup starts. */
  const recordClockRef = useRef<{ sessionSec: number | null; hostAt: number | null }>({ sessionSec: null, hostAt: null })
  /** Backups currently recording, by kind. */
  const activeBackupRef = useRef<{ audio?: GuestBackup; camera?: GuestBackup }>({})
  const backupStartingRef = useRef(false)
  const backupSeqRef = useRef(0)
  const backupsRef = useRef<BackupEntry[]>([])
  const hostPauseRef = useRef(false)
  /** Backups left over from an earlier visit are resumed once per page, as soon as a device session exists. */
  const resumeStateRef = useRef<'idle' | 'running' | 'done'>('idle')
  /** Latest host-signal handler: the data channel and the poll loop outlive renders. */
  const handleHostSignalRef = useRef<(kind: string, payload: Record<string, unknown>) => Promise<void>>(async () => {})
  backupsRef.current = backups
  hostPauseRef.current = Boolean(hostPause)
  mutedRef.current = muted
  muteLockedRef.current = muteLocked
  camLockedRef.current = camLocked
  talkbackRef.current = talkback
  cueLiveRef.current = cueLive
  audioOnlyRef.current = audioOnly
  pauseRequestedRef.current = pauseRequested
  phaseRef.current = phase

  useEffect(() => {
    setMounted(true)
    if (initialError) return
    void loadStudioIceServers(token).then((cfg) => {
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
    })
  }, [token, initialError])

  useEffect(() => {
    if (initialError || initialSession) return
    let cancelled = false
    void fetchGuestSession(token)
      .then((data) => {
        if (cancelled) return
        setSession(data)
        if (data.guestName) setName(data.guestName)
        setPhase('consent')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'This invite is not valid')
        setPhase('blocked')
      })
    return () => {
      cancelled = true
    }
  }, [token, initialError, initialSession])

  useEffect(() => {
    return () => {
      teardown(true)
      audioSessionRef.current?.close()
      audioSessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unsent backup slices saved on this device (reload, crashed tab): send them as soon as we can.
  useEffect(() => {
    if (initialError || !session) return
    void resumePendingBackups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, initialError])

  // Tell the host we left if the tab is closed mid-session (keepalive fetch).
  useEffect(() => {
    if (phase !== 'booth') return
    const onHide = (event: PageTransitionEvent) => {
      if (event.persisted) return
      void pushGuestSignal(token, 'hangup', stampControl()).catch(() => {})
      void postGuestSession(token, { action: 'leave' }).catch(() => {})
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [phase, token])

  // Warn before closing the tab while a backup is still uploading.
  const uploadsPending = backups.some((b) => b.status.state === 'recording' || b.status.state === 'finishing')
  /** Everything recorded is with the host (or nothing was recorded): closing the tab loses nothing. */
  const safeToClose = backups.length > 0 && backups.every((b) => b.status.safeToClose)
  useEffect(() => {
    if (!uploadsPending) return
    const onBefore = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [uploadsPending])

  // Network came back (Wi-Fi switch, phone woke up): restart ICE right away.
  useEffect(() => {
    if (phase !== 'booth') return
    const onOnline = () => {
      restartAttemptsRef.current = 0
      if (!roomRef.current) void restartIce()
      wakePollRef.current()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Short-lived TURN credentials (default 2 h): refresh them on the live peer before they lapse.
  useEffect(() => {
    if (phase !== 'booth') return
    let timer: number | null = null
    let cancelled = false
    const schedule = () => {
      const cfg = iceCfgRef.current
      const delay = cfg ? iceRefreshDelay(cfg) : 60_000
      timer = window.setTimeout(async () => {
        const next = await loadStudioIceServers(token)
        if (cancelled) return
        iceCfgRef.current = next
        setTurnConfigured(next.turnConfigured)
        applyIceServers(peerRef.current, next)
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [phase, token])

  /** Create (once) and unlock the booth's single AudioContext. Call from a tap, before any await. */
  function unlockAudio() {
    if (!audioSessionRef.current) audioSessionRef.current = createGuestAudioSession()
    audioSessionRef.current?.unlock()
    return audioSessionRef.current
  }

  function meter(stream: MediaStream, onLevel: (peak: number) => void) {
    const shared = audioSessionRef.current
    return shared ? shared.meter(stream, onLevel) : attachInputMeter(stream, onLevel)
  }

  /** Send a control signal: data channel when open, signal table as fallback (and always for durable kinds). */
  function sendControl(kind: string, payload: Record<string, unknown> = {}) {
    const stamped = stampControl(payload)
    const onChannel = roomRef.current
      ? roomRef.current.sendControl(kind, stamped)
      : (controlRef.current?.send(kind, stamped) ?? false)
    if (!onChannel || GUEST_DURABLE_KINDS.has(kind)) {
      return pushGuestSignal(token, kind, stamped).then(
        () => undefined,
        () => undefined,
      )
    }
    return Promise.resolve()
  }

  function showMediaProblem(err: unknown, device: 'microphone' | 'camera') {
    const problem = mediaProblem(err, device)
    setError(problem.message)
    setPermissionHelp(problem.help)
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const list = await navigator.mediaDevices.enumerateDevices()
    setMics(list.filter((d) => d.kind === 'audioinput'))
    setCams(list.filter((d) => d.kind === 'videoinput'))
  }

  function micShouldBeLive() {
    return !(mutedRef.current || pauseRequestedRef.current || hostPauseRef.current)
  }

  async function prepareMic(deviceId = micId) {
    setError(null)
    setPermissionHelp(false)
    stopMeterRef.current?.()
    stopStreams([streamRef.current])
    streamRef.current = null
    setMicReady(false)
    let stream: MediaStream
    try {
      stream = await openInputStream(deviceId || undefined, false)
    } catch (err) {
      // A remembered device can vanish (unplugged headset): fall back to the default mic.
      if ((err as { name?: string })?.name === 'OverconstrainedError' && deviceId) {
        setMicId('')
        stream = await openInputStream(undefined, false)
      } else {
        throw err
      }
    }
    streamRef.current = stream
    const track = stream.getAudioTracks()[0]
    if (track) track.enabled = micShouldBeLive()
    setMicReady(true)
    await refreshDevices()
    stopMeterRef.current = meter(stream, (level) => {
      setPeak(level)
      if (level >= 0.98) {
        setClip(true)
        window.setTimeout(() => setClip(false), 1200)
      }
    })
    if (peerRef.current) attachLocalAudio(peerRef.current, stream)
    if (roomRef.current && track) void roomRef.current.publishMic(track).catch(() => {})
  }

  function testMic() {
    unlockAudio()
    void prepareMic().catch((err) => showMediaProblem(err, 'microphone'))
  }

  async function openGuestCamera(deviceId?: string) {
    if (audioOnlyRef.current) return null
    const stream = await openCameraStream(deviceId || camId || undefined)
    const prev = camStreamRef.current
    if (prev && prev !== stream) stopStreams([prev])
    camStreamRef.current = stream
    setCamStream(stream)
    setCamOn(true)
    await refreshDevices()
    if (peerRef.current) {
      attachLocalVideo(peerRef.current, stream)
      await sendControl('camera', { on: true })
    }
    if (roomRef.current) {
      const track = stream.getVideoTracks()[0]
      if (track) await roomRef.current.publishCamera(track).catch(() => {})
      await sendControl('camera', { on: true })
    }
    return stream
  }

  async function closeGuestCamera() {
    if (peerRef.current) detachLocalVideo(peerRef.current)
    if (roomRef.current) await roomRef.current.publishCamera(null).catch(() => {})
    stopStreams([camStreamRef.current])
    camStreamRef.current = null
    setCamStream(null)
    setCamOn(false)
    if (peerRef.current || roomRef.current) await sendControl('camera', { on: false })
  }

  async function toggleCamera() {
    if (audioOnlyRef.current) return
    if (camLockedRef.current && !camOn) return
    setError(null)
    try {
      if (camOn) await closeGuestCamera()
      else await openGuestCamera(camId || undefined)
    } catch (err) {
      showMediaProblem(err, 'camera')
    }
  }

  async function switchToAudioOnly() {
    setAudioOnly(true)
    audioOnlyRef.current = true
    setChoices((c) => ({ ...c, audio_only: true }))
    if (camOn) await closeGuestCamera()
  }

  function toggleMute() {
    if (muteLockedRef.current) return
    setMuted((v) => !v)
  }

  /** "I need a moment": mic off locally at once, then tell the host. */
  function requestPause(on: boolean) {
    pauseRequestedRef.current = on
    setPauseRequested(on)
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) track.enabled = micShouldBeLive()
    void sendControl('pause', { on })
  }

  async function changeCameraDevice(deviceId: string) {
    setCamId(deviceId)
    if (!camOn) return
    setError(null)
    try {
      await openGuestCamera(deviceId || undefined)
    } catch (err) {
      showMediaProblem(err, 'camera')
    }
  }

  function acceptConsent() {
    setError(null)
    setChoices((c) => ({ ...c, audio_only: audioOnlyRef.current, face_blurred: audioOnlyRef.current ? false : c.face_blurred }))
    setPhase('lobby')
  }

  async function joinBooth() {
    // Inside the Join tap, BEFORE any await: iOS/Safari only starts audio here.
    const audio = unlockAudio()
    if (audio && !phonesRef.current) {
      const mix = createGuestHeadphoneMix(audio.ctx)
      mix.setCueVolume(cueVolume)
      phonesRef.current = mix
    }
    const display = name.trim()
    if (display.length < 2) {
      setError('Enter a name for the host to see. A first name or nickname is fine.')
      return
    }
    if (!phones) {
      setError('Please confirm you are wearing headphones, so the host’s voice does not echo into your microphone.')
      return
    }
    setError(null)
    try {
      if (!streamRef.current) {
        try {
          await prepareMic()
        } catch (err) {
          showMediaProblem(err, 'microphone')
          return
        }
      }
      if (!phonesRef.current) {
        // Fallback when the shared context could not be created (very old browsers).
        const mix = createGuestHeadphoneMix(audioSessionRef.current?.ctx)
        mix.setCueVolume(cueVolume)
        phonesRef.current = mix
      }
      const next = await postGuestSession(token, {
        action: 'join',
        name: display,
        consent: true,
        audioOnly: audioOnlyRef.current,
        consentVersion: CONSENT_VERSION,
        choices: { ...choices, audio_only: audioOnlyRef.current },
      })
      setSession(next)
      joinCursorRef.current = Number(next.signalCursor || 0)
      afterRef.current = 0
      dedupeRef.current.reset()
      setHostEnded(false)
      setDropAtSec(null)
      connectedAtRef.current = null
      setPhase('booth')
      if (resumeStateRef.current === 'idle') void resumePendingBackups()
      if (next.room && next.roomToken) await startRoom(next.room, next.roomToken)
      else await startPeer()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    }
  }

  function clearDisconnectTimer() {
    if (disconnectTimerRef.current != null) {
      window.clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
  }

  // Freeze the "disconnected at MM:SS" offset once per drop so the banner reads a
  // stable timestamp across the reconnect attempts. Presentational only.
  function noteDrop() {
    setDropAtSec((prev) => {
      if (prev != null) return prev
      const startedAt = connectedAtRef.current
      return startedAt != null ? (Date.now() - startedAt) / 1000 : 0
    })
  }

  /** Fresh TURN credentials before an ICE restart if the old ones are near expiry. */
  async function freshIce(peer: RTCPeerConnection | null) {
    if (!iceConfigStale(iceCfgRef.current)) return iceCfgRef.current as StudioIceConfig
    const cfg = await loadStudioIceServers(token)
    iceCfgRef.current = cfg
    setTurnConfigured(cfg.turnConfigured)
    applyIceServers(peer, cfg)
    return cfg
  }

  /** ICE restart on the same peer. Falls back to asking for Try again after a few attempts. */
  async function restartIce() {
    const peer = peerRef.current
    if (roomRef.current || !peer || restartingRef.current || startingPeerRef.current) return
    if (restartAttemptsRef.current >= MAX_AUTO_RESTARTS) {
      setRestarting(false)
      return
    }
    restartAttemptsRef.current += 1
    restartingRef.current = true
    setRestarting(true)
    try {
      await freshIce(peer)
      const offer = await makeRestartOffer(peer)
      if (offer && peerRef.current === peer) {
        await pushGuestSignal(token, 'offer', { type: offer.type, sdp: offer.sdp, gen: genRef.current, restart: true })
        wakePollRef.current()
      }
    } catch {
      /* next state change or Try again */
    } finally {
      restartingRef.current = false
    }
  }

  /** Host audio lines (talkback / cue) into the headphone mix — same as the two P2P m-lines. */
  function applyHostAudio(talk: MediaStream | null, cue: MediaStream | null) {
    hostStreamRef.current = talk || cue
    const mix = phonesRef.current
    mix?.attach(talk, cue)
    mix?.setTalkbackOn(talkbackRef.current)
    mix?.setCueLive(cueLiveRef.current)
    setSoundBlocked(Boolean(mix?.running && !mix.running()))
    const audio = hostAudioRef.current
    if (audio) {
      // Chrome only feeds remote WebRTC audio into Web Audio if a media element holds it.
      audio.srcObject = talk || cue
      audio.muted = true
      void audio.play().catch(() => {})
    }
    stopHostMeterRef.current?.()
    const meterStream = talk || cue
    stopHostMeterRef.current = meterStream ? meter(meterStream, setHostPeak) : null
  }

  function markConnected() {
    const wasDown = connectedAtRef.current == null
    connectedAtRef.current = Date.now()
    setDropAtSec(null)
    if (wasDown) toast({ title: roomRef.current ? 'You are in the panel room' : 'Connected to the host', tone: 'success' })
  }

  function stopRoom() {
    roomRef.current?.disconnect()
    roomRef.current = null
    roomNameRef.current = null
    setRoomInfo(null)
  }

  /** Panel show: join the episode room (SFU) instead of offering a P2P peer. */
  async function startRoom(room: GuestRoomPublic, tok: GuestRoomToken) {
    if (startingPeerRef.current) return
    startingPeerRef.current = true
    clearDisconnectTimer()
    try {
      controlRef.current?.close()
      controlRef.current = null
      closePeer(peerRef.current, false)
      peerRef.current = null
      roomRef.current?.disconnect()
      const handle = createStudioRoom({
        url: room.url,
        token: tok.token,
        role: 'guest',
        playPeerAudio: true,
        measureClock: true,
        onControl: (_from, kind, payload) => void handleHostSignalRef.current(kind, payload),
        onHostAudio: applyHostAudio,
        onState: (state: RoomConnectionState, detail) => {
          if (roomRef.current !== handle) return
          const asIce: RTCIceConnectionState =
            state === 'connected' ? 'connected' : state === 'connecting' ? 'checking' : state === 'reconnecting' ? 'disconnected' : 'failed'
          setIce(asIce)
          if (state === 'connected') {
            setRestarting(false)
            setReconnecting(false)
            setError(null)
            setOk(null)
            markConnected()
            void postGuestSession(token, { action: 'connected' }).catch(() => {})
            if (camStreamRef.current && !camLockedRef.current && !audioOnlyRef.current) void sendControl('camera', { on: true })
            void sendControl('mute', { on: mutedRef.current })
            if (pauseRequestedRef.current) void sendControl('pause', { on: true })
            wakePollRef.current()
          } else if (state === 'reconnecting') {
            noteDrop()
            setRestarting(true)
          } else if (state === 'disconnected' && detail) {
            noteDrop()
            setRestarting(false)
          }
        },
      })
      roomRef.current = handle
      roomNameRef.current = room.name
      setRoomInfo(room)
      restartAttemptsRef.current = 0
      await handle.connect()
      if (roomRef.current !== handle) return
      const mic = streamRef.current?.getAudioTracks()[0]
      if (mic) {
        mic.enabled = micShouldBeLive()
        await handle.publishMic(mic)
      }
      const cam = camStreamRef.current?.getVideoTracks()[0]
      if (cam && !camLockedRef.current && !audioOnlyRef.current) await handle.publishCamera(cam)
      if (!handle.canPlaybackAudio()) setSoundBlocked(true)
      wakePollRef.current()
    } finally {
      startingPeerRef.current = false
    }
  }

  /**
   * The host moved this invite into (or out of) a room mid-session: swap the transport
   * without touching the mic, the consent or a running backup.
   */
  async function switchTransport(room: GuestRoomPublic | null) {
    if (switchingRef.current || phaseRef.current !== 'booth') return
    switchingRef.current = true
    try {
      if (room && roomNameRef.current !== room.name) {
        setOk('The host added more guests — moving you to the panel room…')
        const fresh = await postGuestSession(token, { action: 'room' })
        if (fresh.room && fresh.roomToken) await startRoom(fresh.room, fresh.roomToken)
      } else if (!room && roomRef.current) {
        stopRoom()
        setOk('Back on the direct call…')
        await startPeer()
      }
    } catch (err) {
      setError(roomConnectionHelp(err instanceof Error ? err.message : null))
    } finally {
      switchingRef.current = false
    }
  }

  async function startPeer() {
    if (startingPeerRef.current) return
    startingPeerRef.current = true
    clearDisconnectTimer()
    try {
      controlRef.current?.close()
      controlRef.current = null
      closePeer(peerRef.current, false)
      const cfg = await freshIce(null)
      const peer = createStudioPeer(cfg.iceServers)
      const gen = newPeerGeneration()
      genRef.current = gen
      peerRef.current = peer
      restartAttemptsRef.current = 0
      ensureVideoTransceiver(peer, 'sendonly')
      if (streamRef.current) {
        attachLocalAudio(peer, streamRef.current)
        const track = streamRef.current.getAudioTracks()[0]
        if (track) track.enabled = micShouldBeLive()
      }
      ensureCueRecvTransceiver(peer)
      if (camStreamRef.current && !camLockedRef.current && !audioOnlyRef.current) {
        attachLocalVideo(peer, camStreamRef.current)
      }
      const dc = createControlChannel(peer)
      if (dc) {
        controlRef.current = wireControlChannel(dc, {
          remoteRole: 'admin',
          measureClock: true,
          onSignal: (kind, payload) => void handleHostSignalRef.current(kind, payload),
          onOpenChange: (open) => {
            if (peerRef.current !== peer) return
            if (open) {
              // Re-state what the host must know, on the fast path.
              void sendControl('mute', { on: mutedRef.current })
              if (pauseRequestedRef.current) void sendControl('pause', { on: true })
            }
            wakePollRef.current()
          },
        })
      }
      peer.onicecandidate = (event) => {
        if (event.candidate && peerRef.current === peer) {
          void pushGuestSignal(token, 'ice', { candidate: event.candidate.toJSON(), gen }).catch(() => {})
        }
      }
      peer.ontrack = (event) => {
        if (event.track.kind !== 'audio') return
        const { talk, cue } = remoteAudioByRole(peer)
        applyHostAudio(talk.getAudioTracks().length ? talk : null, cue.getAudioTracks().length ? cue : null)
      }
      const markLive = () => {
        clearDisconnectTimer()
        restartAttemptsRef.current = 0
        setRestarting(false)
        markConnected()
        void postGuestSession(token, { action: 'connected' }).catch(() => {})
        if (camStreamRef.current && !camLockedRef.current && !audioOnlyRef.current) {
          void sendControl('camera', { on: true })
        }
        void sendControl('mute', { on: mutedRef.current })
        setError(null)
        setReconnecting(false)
        setOk(null)
      }
      peer.oniceconnectionstatechange = () => {
        if (peerRef.current !== peer) return
        const state = peer.iceConnectionState
        setIce(state)
        if (state === 'connected' || state === 'completed') markLive()
        else wakePollRef.current()
        if (state === 'disconnected') {
          noteDrop()
          clearDisconnectTimer()
          disconnectTimerRef.current = window.setTimeout(() => {
            if (peerRef.current === peer && peer.iceConnectionState === 'disconnected') void restartIce()
          }, DISCONNECT_GRACE_MS)
        }
        if (state === 'failed') {
          noteDrop()
          clearDisconnectTimer()
          void restartIce()
        }
      }
      const offer = await makeOffer(peer, false)
      if (offer) await pushGuestSignal(token, 'offer', { type: offer.type, sdp: offer.sdp, gen })
      wakePollRef.current()
    } finally {
      startingPeerRef.current = false
    }
  }

  async function retryPeer() {
    setError(null)
    setReconnecting(true)
    setOk('Trying again…')
    try {
      if (!streamRef.current || !streamRef.current.getAudioTracks().some((t) => t.readyState === 'live')) {
        await prepareMic()
      }
      await phonesRef.current?.resume?.()
      if (roomRef.current || roomNameRef.current) {
        const fresh = await postGuestSession(token, { action: 'room' })
        if (fresh.room && fresh.roomToken) await startRoom(fresh.room, fresh.roomToken)
        else {
          stopRoom()
          await startPeer()
        }
      } else {
        await startPeer()
      }
    } catch (err) {
      setReconnecting(false)
      setOk(null)
      setError(err instanceof Error ? err.message : 'Could not reconnect')
    }
  }

  /** One handler for host signals from the data channel and from the signal table (de-duped by cid/seq). */
  async function handleHostSignal(kind: string, payload: Record<string, unknown>) {
    if (phaseRef.current !== 'booth') return
    if (!dedupeRef.current.accept(kind, payload)) return
    const signalGen = typeof payload.gen === 'string' ? payload.gen : null
    const staleGen = Boolean(signalGen && signalGen !== genRef.current)
    if (kind === 'answer' && payload.sdp && peerRef.current && !staleGen) {
      await applyAnswer(peerRef.current, { type: 'answer', sdp: String(payload.sdp) })
    }
    if (kind === 'ice' && peerRef.current && !staleGen) {
      await addIce(peerRef.current, (payload.candidate as RTCIceCandidateInit) || null)
    }
    if (kind === 'record') {
      const on = Boolean(payload.on)
      setRecording(on)
      const tallyPhase = parseTallyPhase(payload.phase)
      setTally(tallyPhase || (on ? 'rec' : 'stopped'))
      if (on) {
        recordClockRef.current = {
          sessionSec: typeof payload.sessionSec === 'number' ? payload.sessionSec : null,
          hostAt: typeof payload.hostAt === 'number' ? payload.hostAt : null,
        }
        void startLocalTake()
      } else {
        void stopLocalTake()
      }
    }
    if (kind === 'tally') {
      const tallyPhase = parseTallyPhase(payload.phase)
      if (tallyPhase) setTally(tallyPhase)
    }
    if (kind === 'talkback') {
      const on = Boolean(payload.on)
      setTalkback(on)
      phonesRef.current?.setTalkbackOn(on)
    }
    if (kind === 'cue') {
      const on = Boolean(payload.on)
      const live = Boolean(payload.live)
      setCueOn(on)
      setCueLive(live)
      cueLiveRef.current = live
      phonesRef.current?.setCueLive(live)
    }
    if (kind === 'mute') {
      const on = Boolean(payload.on)
      setMuteLocked(on)
      setMuted(on)
    }
    if (kind === 'pause') {
      const on = Boolean(payload.on)
      hostPauseRef.current = on
      setHostPause(on ? { slate: Boolean(payload.slate) } : null)
      const track = streamRef.current?.getAudioTracks()[0]
      if (track) track.enabled = micShouldBeLive()
    }
    if (kind === 'camera') {
      if (payload.on) {
        setCamLocked(false)
      } else {
        setCamLocked(true)
        await closeGuestCamera()
      }
    }
    if (kind === 'reconnect') {
      setOk('The host asked to reconnect…')
      void retryPeer()
    }
    if (kind === 'hangup') {
      setTalkback(false)
      setCueOn(false)
      setCueLive(false)
      cueLiveRef.current = false
      phonesRef.current?.setTalkbackOn(false)
      phonesRef.current?.setCueLive(false)
      setTally('stopped')
      setHostPause(null)
      await stopLocalTake()
      teardown(true)
      setHostEnded(true)
      setError('The host ended the session. Thank you for joining.')
      setPhase('blocked')
      void settleBackupsThenClear()
    }
  }

  handleHostSignalRef.current = handleHostSignal

  // Signal poll: a setTimeout chain (never overlapping). Fast while negotiating,
  // ~10 s once control runs on the data channel, backing off when quiet or failing.
  useEffect(() => {
    if (phase !== 'booth') return
    let cancelled = false
    let timer: number | null = null
    let inFlight = false
    let wakeQueued = false
    let idleTicks = 0
    let errDelay = 0

    const schedule = (ms: number) => {
      if (cancelled) return
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => void tick(), ms)
    }

    const tick = async () => {
      if (cancelled) return
      if (inFlight) {
        wakeQueued = true
        return
      }
      inFlight = true
      timer = null
      let got = false
      try {
        const data = await pullGuestSignals(token, afterRef.current)
        if (cancelled) return
        errDelay = 0
        setSession(data.session)
        setRecording(data.session.recording)
        const room = data.session.room ?? null
        if ((room && roomNameRef.current !== room.name) || (!room && roomRef.current)) void switchTransport(room)
        for (const signal of data.signals) {
          if (signal.id <= afterRef.current) continue
          afterRef.current = signal.id
          const historic = signal.id <= joinCursorRef.current
          if (historic && !STATE_KINDS.has(signal.kind)) continue
          await handleHostSignalRef.current(signal.kind, signal.payload || {})
          if (cancelled || phaseRef.current !== 'booth') return
        }
        got = data.signals.length > 0
      } catch (err) {
        const message = (err as Error).message || ''
        if (/revoked|expired|not valid|another device|join the booth/i.test(message)) {
          void stopLocalTake()
          teardown(true)
          clearGuestSession(token)
          setError(
            /another device/i.test(message)
              ? 'This invite was opened on another device or tab, so this one was disconnected.'
              : message,
          )
          setPhase('blocked')
          return
        }
        errDelay = errorPollDelay(errDelay || 1000)
      } finally {
        inFlight = false
      }
      if (cancelled) return
      idleTicks = got ? 0 : idleTicks + 1
      const peer = peerRef.current
      const up = peer ? peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed' : false
      const channelUp = Boolean(up && controlRef.current?.isOpen()) || roomRef.current?.state() === 'connected'
      const delay = errDelay || nextPollDelay({ channelUp, gotSignals: got, idleTicks })
      if (wakeQueued) {
        wakeQueued = false
        schedule(0)
      } else {
        schedule(delay)
      }
    }

    wakePollRef.current = () => {
      if (cancelled) return
      if (inFlight) wakeQueued = true
      else schedule(0)
    }
    void tick()
    const beat = window.setInterval(() => {
      void postGuestSession(token, { action: 'heartbeat' }).catch(() => {})
    }, 15000)
    return () => {
      cancelled = true
      wakePollRef.current = () => {}
      if (timer != null) window.clearTimeout(timer)
      window.clearInterval(beat)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, token])

  useEffect(() => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) track.enabled = !(muted || pauseRequested || hostPause)
  }, [muted, pauseRequested, hostPause])

  useEffect(() => {
    if (phase === 'booth') void sendControl('mute', { on: muted })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, phase, token])

  useEffect(() => {
    phonesRef.current?.setTalkbackOn(talkback)
    const audio = hostAudioRef.current
    if (audio) audio.muted = true
  }, [talkback])

  useEffect(() => {
    phonesRef.current?.setCueVolume(cueVolume)
  }, [cueVolume])

  useEffect(() => {
    if (phase !== 'booth') return
    const mix = phonesRef.current || createGuestHeadphoneMix(audioSessionRef.current?.ctx)
    mix.setCueVolume(cueVolume)
    mix.setTalkbackOn(talkbackRef.current)
    mix.setCueLive(cueLiveRef.current)
    phonesRef.current = mix
    return () => {
      mix.stop()
      if (phonesRef.current === mix) phonesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function enableSound() {
    // Tap handler: unlock synchronously, then resume the mix.
    audioSessionRef.current?.unlock()
    void phonesRef.current?.resume?.()
    void roomRef.current?.startAudio().catch(() => {})
    void hostAudioRef.current?.play().catch(() => {})
    window.setTimeout(() => setSoundBlocked(Boolean(phonesRef.current?.running && !phonesRef.current.running())), 300)
  }

  function trackBackup(backup: GuestBackup, key = `${backup.kind}-${++backupSeqRef.current}`) {
    const entry: BackupEntry = { key, backup, status: backup.status() }
    setBackups((prev) => [...prev.filter((b) => b.key !== key), entry].slice(-8))
    let announced = false
    return (status: BackupStatus) => {
      setBackups((prev) => prev.map((b) => (b.key === key ? { ...b, status } : b)))
      if (status.state === 'done' && !announced) {
        announced = true
        toast({ title: 'Backup sent to the host', description: status.resumed ? 'Parts saved from your last visit arrived.' : undefined, tone: 'success' })
      }
    }
  }

  /**
   * Send backup slices an earlier visit left on this device. Needs the device
   * session (survives a reload of this tab; a fresh tab gets one at Join), so
   * this runs when the session loads and again right after Join.
   */
  async function resumePendingBackups() {
    if (resumeStateRef.current !== 'idle') return
    if (!getGuestSession(token)) return
    let pending = false
    try {
      pending = await hasPendingGuestBackups(token)
    } catch {
      pending = false
    }
    if (!pending) {
      resumeStateRef.current = 'done'
      return
    }
    resumeStateRef.current = 'running'
    const updaters = new Map<string, (s: BackupStatus) => void>()
    const queued = new Map<string, BackupStatus>()
    try {
      const resumed = await resumeGuestBackups({
        token,
        onStatus: (takeId, s) => {
          const update = updaters.get(takeId)
          if (update) update(s)
          else queued.set(takeId, s)
        },
      })
      for (const backup of resumed) {
        const takeId = backup.status().takeId || `resumed-${++backupSeqRef.current}`
        const update = trackBackup(backup, `resumed-${takeId}`)
        updaters.set(takeId, update)
        const last = queued.get(takeId)
        if (last) update(last)
      }
      if (resumed.length) setOk('Sending backup parts saved on this device from your last visit…')
    } finally {
      resumeStateRef.current = 'done'
    }
  }

  async function startOneBackup(kind: 'audio' | 'camera', stream: MediaStream) {
    let update: ((s: BackupStatus) => void) | null = null
    const pending: BackupStatus[] = []
    const backup = await startGuestBackup({
      token,
      kind,
      stream,
      sessionSec: recordClockRef.current.sessionSec,
      hostAt: recordClockRef.current.hostAt,
      clock: () => ({
        offsetMs: roomRef.current?.offsetMs() ?? controlRef.current?.offsetMs() ?? null,
        rttMs: roomRef.current?.rttMs() ?? controlRef.current?.rttMs() ?? null,
      }),
      onStatus: (s) => (update ? update(s) : pending.push(s)),
    })
    update = trackBackup(backup)
    const last = pending.pop()
    if (last) update(last)
    activeBackupRef.current[kind] = backup
    return backup
  }

  /** Record-on from the host: start progressive backups (no AudioContext, no gesture needed). */
  async function startLocalTake() {
    if (backupStartingRef.current) return
    backupStartingRef.current = true
    try {
      const stream = streamRef.current
      if (stream && !activeBackupRef.current.audio) {
        try {
          await startOneBackup('audio', stream)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not start your backup')
        }
      }
      const cam = audioOnlyRef.current ? null : camStreamRef.current
      if (cam && !activeBackupRef.current.camera) {
        try {
          await startOneBackup('camera', cam)
        } catch {
          /* camera backup is optional */
        }
      }
      setOk(
        cam
          ? 'Recording. A backup of your audio and camera is saved as you talk and sent only to the host.'
          : 'Recording. A backup of your audio is saved as you talk and sent only to the host.',
      )
    } finally {
      backupStartingRef.current = false
    }
  }

  /** Stop recorders (flush last slice); uploads continue in the background. */
  async function stopLocalTake() {
    const { audio, camera } = activeBackupRef.current
    activeBackupRef.current = {}
    await Promise.all([audio?.stopRecording(), camera?.stopRecording()].filter(Boolean))
    if (audio || camera) setOk('Recording stopped. Sending the rest of your backup to the host…')
  }

  /** After leaving / host hangup: let uploads finish, then release the device session. */
  async function settleBackupsThenClear() {
    const all = backupsRef.current.map((b) => b.backup)
    const extra = [activeBackupRef.current.audio, activeBackupRef.current.camera].filter(Boolean) as GuestBackup[]
    await Promise.all([...all, ...extra].map((b) => b.settled.catch(() => null)))
    clearGuestSession(token)
  }

  function downloadBackup(entry: BackupEntry) {
    const blob = entry.backup.localBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = entry.backup.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  function teardown(stopMic: boolean) {
    clearDisconnectTimer()
    stopMeterRef.current?.()
    stopHostMeterRef.current?.()
    controlRef.current?.close()
    controlRef.current = null
    closePeer(peerRef.current, false)
    peerRef.current = null
    stopRoom()
    genRef.current = ''
    if (stopMic) {
      stopStreams([streamRef.current, camStreamRef.current])
      streamRef.current = null
      camStreamRef.current = null
      setCamStream(null)
      setCamOn(false)
      setMicReady(false)
    }
    // stop() is idempotent; the booth effect's cleanup may run after this and find nothing to do.
    const phonesMix = phonesRef.current
    phonesRef.current = null
    phonesMix?.stop()
    if (hostAudioRef.current) hostAudioRef.current.srcObject = null
  }

  /** Always available. Stops mic/camera at once; tells the host if we were in the booth. */
  async function leave() {
    const wasInBooth = phase === 'booth'
    // Flush the backup's last slice before the mic stops.
    await stopLocalTake()
    teardown(true)
    setPhase('left')
    setError(null)
    setOk(null)
    setPermissionHelp(false)
    setPauseRequested(false)
    setHostPause(null)
    if (wasInBooth) {
      await pushGuestSignal(token, 'hangup', stampControl()).catch(() => {})
      // The device session stays valid until the backup upload settles, then we release it.
      void Promise.all(backupsRef.current.map((b) => b.backup.settled.catch(() => null))).then(() =>
        postGuestSession(token, { action: 'leave' }).catch(() => {}),
      )
      void settleBackupsThenClear()
    } else {
      clearGuestSession(token)
    }
  }

  function rejoin() {
    setError(null)
    setOk(null)
    setPhase('consent')
  }

  const presence = describeGuestSession({
    side: 'guest',
    hasInvite: Boolean(session),
    state: session?.state,
    ice,
    recording,
  })
  const tallyUi = describeGuestTally(tally)
  const conn = describeIceProgress(ice, { reconnecting: reconnecting || restarting })
  const outOfRestarts = restartAttemptsRef.current >= MAX_AUTO_RESTARTS
  const showTryAgain = presence.phase === 'failed' || (presence.phase === 'dropped' && (outOfRestarts || !restarting))
  const showDropBanner = phase === 'booth' && (showTryAgain || (dropAtSec != null && presence.phase !== 'connected' && presence.phase !== 'recording'))
  const canLeave = phase === 'consent' || phase === 'lobby' || phase === 'booth'
  const paused = Boolean(hostPause) || pauseRequested
  const referenceCode = session?.id ? guestReferenceCode(session.id) : null
  const panel = Boolean(roomInfo)

  const tallyToneClass = paused
    ? 'border-lane-cohost-2/50 bg-lane-cohost-2/5'
    : tallyUi.tone === 'rec'
      ? 'border-heart/70 bg-heart/10'
      : tallyUi.tone === 'wait'
        ? 'border-lane-cohost-1/70 bg-lane-cohost-1/10'
        : 'border-divider bg-surface'
  const tallyLabelTone = paused
    ? 'text-lane-cohost-2'
    : tallyUi.tone === 'rec'
      ? 'text-heart'
      : tallyUi.tone === 'wait'
        ? 'text-lane-cohost-1'
        : 'text-silver'
  const connToneClass =
    conn.tone === 'live'
      ? 'text-lane-cohost-2'
      : conn.tone === 'fail'
        ? 'text-heart'
        : conn.tone === 'warn'
          ? 'text-lane-cohost-1'
          : 'text-silver'

  return (
    // z-40 keeps the site's Quick Exit button (z-50) visible above the booth.
    <div className="fixed inset-0 z-40 overflow-auto bg-obsidian text-white">
      <audio ref={hostAudioRef} autoPlay playsInline muted className="hidden" />
      <div className="mx-auto min-h-full max-w-xl space-y-5 px-4 py-8 pb-28">
        <header className="flex items-start justify-between gap-3 border-b border-divider pb-4">
          <div className="min-w-0">
            <p className="studio-type-label text-ice">Forged in the Fire · Guest booth</p>
            <h1 className="studio-type-title mt-1">{session?.episodeTitle || 'Podcast recording'}</h1>
          </div>
          {canLeave && (
            <Button variant="secondary" size="touch" onClick={() => void leave()} className="shrink-0 border-heart/50 text-heart hover:border-heart">
              <LogOut size={16} /> Leave
            </Button>
          )}
        </header>

        {phase === 'loading' && <p className="studio-type-body text-silver">Checking your invite…</p>}

        {phase === 'blocked' && (
          <Panel elevation="flat" className="border-heart/50 bg-heart/10 p-4" role="alert">
            <p className="studio-type-body inline-flex items-start gap-2 text-heart">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error || 'This invite is closed.'}</span>
            </p>
          </Panel>
        )}

        {phase === 'left' && (
          <Panel elevation="flat" className="space-y-3 p-4">
            <p className="studio-type-body text-white">You have left. Your microphone and camera are off.</p>
            <p className="studio-type-body text-silver">Leaving is always okay.</p>
            <Button variant="secondary" size="touch" onClick={rejoin}>
              I want to rejoin
            </Button>
          </Panel>
        )}

        {(phase === 'left' || phase === 'blocked') && backups.length > 0 && (
          <BackupPanel backups={backups} safeToClose={safeToClose} onDownload={downloadBackup} />
        )}

        {(phase === 'left' || (phase === 'blocked' && hostEnded)) && (
          <Aftercare token={token} referenceCode={referenceCode} />
        )}

        {phase === 'consent' && (
          <Panel elevation="raised" className="space-y-4 p-5" aria-labelledby="consent-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-ice" />
              <h2 id="consent-title" className="studio-type-body text-base font-medium text-white">
                Before we start
              </h2>
            </div>
            <p className="studio-type-body text-silver-body">
              You have been invited to talk with the Forged in the Fire podcast host. Please read this first.
              Nothing turns on until you choose to.
            </p>
            <ul className="studio-type-body list-disc space-y-2 pl-5 text-silver-body">
              {CONSENT_POINTS.map((point) => (
                <li key={point.title}>
                  <strong className="text-white">{point.title}:</strong> {point.body}
                </li>
              ))}
            </ul>
            <fieldset className="space-y-1">
              <legend className={`${HINT} mb-1`}>How do you want to join?</legend>
              <RadioRow
                name="media-mode"
                checked={audioOnly}
                onChange={() => setAudioOnly(true)}
                label="Audio only"
                hint="My camera stays off the whole time."
              />
              <RadioRow
                name="media-mode"
                checked={!audioOnly}
                onChange={() => setAudioOnly(false)}
                label="I may use my camera"
                hint="It still stays off until I turn it on."
              />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className={`${HINT} mb-1`}>Your privacy choices (you can pick any, or none)</legend>
              <Checkbox
                checked={choices.voice_altered}
                onChange={(e) => setChoices((c) => ({ ...c, voice_altered: e.target.checked }))}
                label="Please change my voice"
                hint="We alter your voice in the published episode so it is harder to recognise."
              />
              {!audioOnly && (
                <Checkbox
                  checked={choices.face_blurred}
                  onChange={(e) => setChoices((c) => ({ ...c, face_blurred: e.target.checked }))}
                  label="Please blur my face"
                  hint="Any video we publish will have your face blurred."
                />
              )}
              <Checkbox
                checked={choices.first_name_only}
                onChange={(e) => setChoices((c) => ({ ...c, first_name_only: e.target.checked }))}
                label="Use my first name only (or a nickname)"
                hint="We will not use your full name anywhere."
              />
              <Checkbox
                checked={!choices.may_publish}
                onChange={(e) => setChoices((c) => ({ ...c, may_publish: !e.target.checked }))}
                label="I want to hear the final cut before it is published"
                hint="We will not publish the episode until you have heard it."
              />
            </fieldset>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" size="touch" onClick={acceptConsent}>
                I understand — continue
              </Button>
              <Button variant="secondary" size="touch" onClick={() => void leave()}>
                No thanks, leave
              </Button>
            </div>
            {session && (
              <p className={HINT}>
                This link is private to you and stops working{' '}
                {mounted ? new Date(session.expiresAt).toLocaleString() : 'soon'}. Please do not share it.
              </p>
            )}
          </Panel>
        )}

        {phase === 'lobby' && (
          <Panel elevation="raised" className="space-y-4 p-4">
            <p className="studio-type-label text-ice">Get ready</p>
            {!turnConfigured && (
              <Notice tone="warn">
                If you cannot connect from your current network (some work, school or public Wi-Fi block
                calls), try your phone’s hotspot. Your link stays the same.
              </Notice>
            )}
            <Input
              label="Your name for the host"
              hint="A first name or nickname is fine."
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              placeholder="First name or nickname"
              className="min-h-[44px] px-3"
            />
            <Select
              label="Microphone"
              value={micId}
              onChange={(e) => {
                const id = e.target.value
                setMicId(id)
                if (micReady) void prepareMic(id).catch((err) => showMediaProblem(err, 'microphone'))
              }}
              className="min-h-[44px] px-3"
            >
              <option value="">Default</option>
              {mics.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || 'Microphone'}
                </option>
              ))}
            </Select>
            {!audioOnly && (
              <Select
                label="Camera (off until you turn it on)"
                value={camId}
                disabled={recording}
                onChange={(e) => void changeCameraDevice(e.target.value)}
                className="min-h-[44px] px-3"
              >
                <option value="">Default camera</option>
                {cams.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || 'Camera'}
                  </option>
                ))}
              </Select>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="touch" onClick={testMic}>
                <Mic2 size={16} /> {micReady ? 'Microphone on — test again' : 'Test my microphone'}
              </Button>
              {!audioOnly && (
                <Button variant={camOn ? 'primary' : 'secondary'} size="touch" aria-pressed={camOn} onClick={() => void toggleCamera()}>
                  {camOn ? <Video size={16} /> : <VideoOff size={16} />}
                  {camOn ? 'Camera on — turn off' : 'Turn camera on'}
                </Button>
              )}
              {!audioOnly && (
                <Button variant="ghost" size="touch" onClick={() => void switchToAudioOnly()}>
                  Switch to audio only
                </Button>
              )}
            </div>
            {camStream && <CameraPreview stream={camStream} label="You · only you see this" />}
            {micReady && <Meter label="You" peak={peak} clip={clip} />}
            <label className="studio-type-body flex min-h-[44px] items-start gap-3 text-silver-body">
              <input
                type="checkbox"
                checked={phones}
                onChange={(e) => setPhones(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded-[5px] border border-divider bg-obsidian accent-forged"
              />
              <span className="flex gap-2">
                <Headphones size={16} className="mt-0.5 shrink-0 text-ice" />
                I am wearing headphones or earbuds (so the host’s voice does not echo into my microphone).
              </span>
            </label>
            <Button variant="primary" size="touch" onClick={() => void joinBooth()} className="w-full">
              Join — turn on my microphone
            </Button>
          </Panel>
        )}

        {phase === 'booth' && paused && (
          <Panel
            elevation="floating"
            className="space-y-4 border-lane-cohost-2/40 bg-lane-cohost-2/5 p-6 text-center"
            role="status"
            aria-live="assertive"
          >
            <Coffee size={28} className="mx-auto text-lane-cohost-2" aria-hidden />
            {hostPause ? (
              <>
                <h2 className="text-lg font-medium text-white">Paused — you’re off the recording</h2>
                <p className="studio-type-body text-silver-body">
                  Your microphone is off{camOn ? ' and your camera is hidden from the show' : ''}. Nothing you say now
                  is recorded. Take a breath — the host will continue when you are both ready.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium text-white">You asked for a moment</h2>
                <p className="studio-type-body text-silver-body">
                  Your microphone is off and the host has been told. Take all the time you need. You can also leave —
                  that is always okay.
                </p>
              </>
            )}
            {pauseRequested && (
              <Button variant="primary" size="touch" onClick={() => requestPause(false)} className="w-full text-base">
                I’m ready to continue
              </Button>
            )}
            {hostPause && !pauseRequested && (
              <p className={HINT}>You do not need to do anything. This screen will change when the pause ends.</p>
            )}
          </Panel>
        )}

        {phase === 'booth' && (
          <div className="space-y-4">
            <div
              className={`flex items-center justify-between gap-3 rounded-panel border px-4 py-3 ${tallyToneClass}`}
              role="status"
              aria-live="polite"
            >
              <div className="min-w-0">
                <p className={`studio-type-body font-medium ${tallyLabelTone}`}>
                  {paused
                    ? 'Paused — not recording you'
                    : tally === 'rec'
                      ? '● Recording'
                      : tally === 'count-in'
                        ? 'Recording is about to start'
                        : 'Not recording'}
                </p>
                <p className={`${HINT} mt-0.5`}>{plainStatus(presence.phase, turnConfigured, restarting, panel)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className={`studio-type-timecode ${connToneClass}`}>{conn.label}</p>
                {panel && (
                  <Chip tone="accent" dot>
                    Panel
                  </Chip>
                )}
              </div>
            </div>

            {!pauseRequested && !hostPause && (
              <Button
                variant="secondary"
                size="touch"
                onClick={() => requestPause(true)}
                className="w-full border-lane-cohost-1/60 text-base text-lane-cohost-1 hover:border-lane-cohost-1"
              >
                <Coffee size={18} /> I need a moment
              </Button>
            )}

            {soundBlocked && (
              <Button variant="primary" size="touch" onClick={enableSound} className="w-full">
                <Volume2 size={16} /> Tap here to hear the host
              </Button>
            )}

            {/* Drop recovery — prominent + reassuring. Try again reuses the same invite (ICE restart / rebuild), no new link. */}
            {showDropBanner && (
              <Panel elevation="flat" className="space-y-2.5 border-heart/60 bg-heart/10 p-4" role="alert">
                <div className="flex items-start gap-2.5">
                  <WifiOff size={18} className="mt-0.5 shrink-0 text-heart" />
                  <div className="space-y-1">
                    <p className="studio-type-body font-medium text-white">
                      {dropAtSec != null
                        ? `Disconnected at ${mmss(dropAtSec)} — everything you said so far is safe.`
                        : 'Disconnected — everything you said so far is safe.'}
                    </p>
                    <p className={HINT_BODY}>{panel ? roomConnectionHelp() : guestConnectionHelp(turnConfigured)}</p>
                    <p className={`${HINT_BODY} inline-flex items-center gap-1.5`}>
                      <ShieldCheck size={13} className="shrink-0 text-lane-cohost-2" />
                      You do not need a new link. If recording is on, your backup keeps saving in this tab.
                    </p>
                  </div>
                </div>
                {showTryAgain && (
                  <Button variant="primary" size="touch" disabled={reconnecting} onClick={() => void retryPeer()}>
                    <RefreshCw size={16} /> {reconnecting ? 'Trying again…' : 'Try again'}
                  </Button>
                )}
              </Panel>
            )}

            <Panel elevation="flat" className="space-y-3 bg-surface-sunken p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="studio-type-body text-white">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-lane-cohost-2" />
                  {name || 'You'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!audioOnly && (
                    <Button
                      variant={camOn && !camLocked ? 'primary' : 'secondary'}
                      size="touch"
                      aria-pressed={camOn}
                      disabled={recording || (camLocked && !camOn)}
                      onClick={() => void toggleCamera()}
                      className={camLocked ? 'border-heart/50 text-heart' : undefined}
                    >
                      {camOn ? <Video size={16} /> : <VideoOff size={16} />}
                      {camLocked ? 'Camera off (host)' : camOn ? 'Camera on' : 'Camera off'}
                    </Button>
                  )}
                  <Button
                    variant={muted ? 'danger' : 'secondary'}
                    size="touch"
                    aria-pressed={muted}
                    aria-label={muteLocked ? 'Muted by host' : muted ? 'Unmute my microphone' : 'Mute my microphone'}
                    disabled={muteLocked}
                    onClick={() => toggleMute()}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    {muteLocked ? 'Muted by host' : muted ? 'Muted — tap to unmute' : 'Mute me'}
                  </Button>
                </div>
              </div>
              {(muteLocked || camLocked) && (
                <p className={`${HINT} text-lane-cohost-1`}>
                  {muteLocked && camLocked
                    ? 'The host muted you and turned your camera off for now.'
                    : muteLocked
                      ? 'The host muted you for now. They will unmute you when it is your turn.'
                      : 'The host turned your camera off for now.'}
                </p>
              )}
              {!audioOnly && camOn && (
                <Select
                  value={camId}
                  disabled={recording || camLocked}
                  onChange={(e) => void changeCameraDevice(e.target.value)}
                  className="min-h-[44px] px-3"
                  aria-label="Camera"
                >
                  <option value="">Default camera</option>
                  {cams.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || 'Camera'}
                    </option>
                  ))}
                </Select>
              )}
              {camStream && <CameraPreview stream={camStream} label="You · only you see this preview" live={recording} />}
              <Meter label="You" peak={muted || paused ? 0 : peak} clip={clip} />
              {!audioOnly && !recording && (
                <Button variant="ghost" size="touch" onClick={() => void switchToAudioOnly()} className="text-ice">
                  Switch to audio only
                </Button>
              )}
            </Panel>

            <Panel elevation="flat" className="space-y-3 bg-surface-sunken p-4">
              <p className="studio-type-body text-white">
                <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${talkback ? 'bg-forged' : 'bg-divider'}`} />
                Host{talkback ? ' · you can hear them' : ''}
              </p>
              <Meter label="Host" peak={talkback ? hostPeak : 0} clip={false} />
              <p className={HINT}>
                {talkback
                  ? 'The host’s voice is in your headphones.'
                  : panel
                    ? 'You can hear the other guests. You will hear the host in your headphones when they turn on their microphone to you.'
                    : 'You will hear the host in your headphones when they turn on their microphone to you.'}
              </p>
            </Panel>

            {(cueOn || cueLive) && (
              <Panel elevation="flat" className={`space-y-3 p-4 ${cueLive ? 'border-forged/50 bg-forged/5' : 'bg-surface-sunken'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="studio-type-body text-white">
                    <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${cueLive ? 'bg-forged' : 'bg-lane-cohost-1'}`} />
                    Show audio{cueLive ? ' · playing' : ' · ready'}
                  </p>
                  {cueLive && (
                    <span className="studio-type-timecode inline-flex items-center gap-1 text-ice">
                      <Music2 size={12} /> LIVE
                    </span>
                  )}
                </div>
                <label className="studio-type-body flex min-h-[44px] items-center gap-3 text-silver">
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cueVolume}
                    onChange={(e) => setCueVolume(Number(e.target.value))}
                    className="flex-1 accent-forged"
                    aria-label="Show audio volume"
                  />
                </label>
                <p className={HINT}>Music or clips the host is playing. Only you hear this, in your headphones.</p>
              </Panel>
            )}

            {backups.length > 0 && <BackupPanel backups={backups} safeToClose={safeToClose} onDownload={downloadBackup} />}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="touch" onClick={() => void leave()} className="text-heart">
                <PhoneOff size={16} /> Leave
              </Button>
            </div>
          </div>
        )}

        {permissionHelp && phase !== 'blocked' && phase !== 'left' && <PermissionHelp />}
        {ok && phase !== 'blocked' && phase !== 'left' && (
          <p className="studio-type-body text-ice" role="status">
            {ok}
          </p>
        )}
        {error && phase !== 'blocked' && (
          <Notice tone="error">{error}</Notice>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces -- */

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'border-heart/50 bg-heart/10 text-heart' : 'border-lane-cohost-1/50 bg-lane-cohost-1/10 text-lane-cohost-1'
  return (
    <div className={`rounded-control border px-3 py-2 ${cls}`} role={tone === 'error' ? 'alert' : undefined}>
      <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>{children}</span>
      </p>
    </div>
  )
}

function RadioRow({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
  hint: string
}) {
  return (
    <label className="studio-type-body flex min-h-[44px] items-start gap-3 py-1 text-silver-body">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 h-5 w-5 shrink-0 accent-forged" />
      <span>
        <strong className="font-medium text-white">{label}</strong>
        <span className="block text-[12px] text-silver">{hint}</span>
      </span>
    </label>
  )
}

function backupLine(status: BackupStatus) {
  const what = status.resumed
    ? status.kind === 'camera'
      ? 'Camera backup from your last visit'
      : 'Audio backup from your last visit'
    : status.kind === 'camera'
      ? 'Camera backup'
      : 'Audio backup'
  switch (status.state) {
    case 'recording':
      return status.chunksRecorded === 0
        ? `${what}: saving as you talk…`
        : `${what}: saving as you talk — ${status.chunksUploaded} of ${status.chunksRecorded} parts sent`
    case 'finishing':
      return `${what}: sending the last parts (${status.chunksUploaded} of ${status.chunksRecorded})… please keep this tab open`
    case 'done':
      return `${what}: sent privately to the host ✓`
    case 'failed':
      return status.persisted
        ? `${what}: could not be sent yet. It is saved on this device — open this same link again and it will keep sending. You can also download it.`
        : `${what}: could not be sent. Please download it and keep it safe, or try again.`
    case 'local-only':
      return `${what}: kept in this tab only. Please download it before closing.`
  }
}

function BackupPanel({
  backups,
  safeToClose,
  onDownload,
}: {
  backups: BackupEntry[]
  safeToClose: boolean
  onDownload: (entry: BackupEntry) => void
}) {
  const sending = backups.some((b) => b.status.state === 'recording' || b.status.state === 'finishing')
  return (
    <Panel elevation="flat" className="space-y-3 bg-surface-sunken p-4" aria-live="polite">
      <p className="studio-type-body flex items-center gap-2 text-white">
        <CloudUpload size={16} className="text-ice" /> Your backup
      </p>
      {safeToClose && (
        <p className="studio-type-body flex items-center gap-2 text-[13px] text-lane-cohost-2" role="status">
          <ShieldCheck size={14} /> Everything you recorded is with the host. It is safe to close this tab.
        </p>
      )}
      {!safeToClose && sending && (
        <p className="studio-type-body text-[13px] text-lane-cohost-1" role="status">
          Please keep this tab open until every part is sent. If it closes anyway, the unsent parts stay saved on this device and
          continue when you open the same link again.
        </p>
      )}
      <ul className="space-y-3">
        {backups.map((entry) => {
          const s = entry.status
          const pct = s.chunksRecorded ? Math.round((s.chunksUploaded / s.chunksRecorded) * 100) : 0
          const problem = s.state === 'failed' || s.state === 'local-only'
          return (
            <li key={entry.key} className="space-y-2">
              <p className={`studio-type-body text-[13px] ${problem ? 'text-lane-cohost-1' : 'text-silver-body'}`}>{backupLine(s)}</p>
              {(s.state === 'recording' || s.state === 'finishing') && s.chunksRecorded > 0 && (
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface-raised"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${s.kind} backup upload`}
                >
                  <div className="h-full bg-forged transition-[width] duration-150 ease-calm" style={{ width: `${pct}%` }} />
                </div>
              )}
              {problem && (
                <div className="flex flex-wrap gap-2">
                  {entry.backup.localBlob() && (
                    <Button variant="primary" size="touch" onClick={() => onDownload(entry)}>
                      <Download size={16} /> Download my backup
                    </Button>
                  )}
                  <Button variant="secondary" size="touch" onClick={() => void entry.backup.retry()}>
                    <RefreshCw size={16} /> Try sending again
                  </Button>
                </div>
              )}
              {s.state === 'done' && entry.backup.kind === 'camera' && (
                <Button variant="ghost" size="touch" onClick={() => onDownload(entry)} className="text-ice">
                  Save a copy of my camera backup
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/** After the session: how to ask for the recording to be withdrawn. */
function Aftercare({ token, referenceCode }: { token: string; referenceCode: string | null }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'sending' | 'sent' | 'error'>('idle')
  const [reason, setReason] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const subject = encodeURIComponent(`Podcast recording withdrawal${referenceCode ? ` — ${referenceCode}` : ''}`)

  async function send() {
    setStep('sending')
    setMessage(null)
    try {
      await withdrawGuestRecording(token, reason, contact)
      setStep('sent')
    } catch (err) {
      setStep('error')
      setMessage(err instanceof Error ? err.message : 'We could not send your request.')
    }
  }

  return (
    <Panel elevation="flat" className="space-y-3 p-4" aria-labelledby="aftercare-title">
      <h2 id="aftercare-title" className="studio-type-body font-medium text-white">
        Changed your mind?
      </h2>
      <p className="studio-type-body text-silver-body">
        You can ask us not to use your recording — today or later. You do not have to give a reason. Nothing is published
        until a person on our team has checked your request.
      </p>
      {referenceCode && (
        <p className="studio-type-body text-silver-body">
          Your reference code: <strong className="studio-type-timecode select-all text-white">{referenceCode}</strong>
          <span className={`${HINT} block`}>Keep it somewhere safe. It lets us find your recording without your name.</span>
        </p>
      )}
      {step === 'idle' && (
        <Button variant="secondary" size="touch" onClick={() => setStep('confirm')} className="border-lane-cohost-1/60 text-lane-cohost-1">
          Ask to withdraw my recording
        </Button>
      )}
      {(step === 'confirm' || step === 'sending' || step === 'error') && (
        <div className="space-y-3">
          <Textarea
            label="Anything you want us to know (optional)"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <Input
            label="How can we reach you about this? (optional)"
            hint="An email, a phone number, or “please do not contact me”."
            value={contact}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setContact(e.target.value)}
            placeholder="Only if you want us to follow up"
            className="min-h-[44px] px-3"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="touch" loading={step === 'sending'} onClick={() => void send()}>
              Yes, withdraw my recording
            </Button>
            <Button variant="secondary" size="touch" disabled={step === 'sending'} onClick={() => setStep('idle')}>
              Not now
            </Button>
          </div>
          {message && <Notice tone="error">{message}</Notice>}
        </div>
      )}
      {step === 'sent' && (
        <p className="studio-type-body text-lane-cohost-2" role="status">
          Your request was sent. The episode is on hold until our team has reviewed it. Thank you for telling us.
        </p>
      )}
      <p className={HINT}>
        You can also email{' '}
        <a className="text-ice underline" href={`mailto:${ORG.email}?subject=${subject}`}>
          {ORG.email}
        </a>{' '}
        {referenceCode ? 'with your reference code' : ''} or call {ORG.phone}.
      </p>
    </Panel>
  )
}

function PermissionHelp() {
  return (
    <Panel elevation="flat" className="space-y-2 p-4">
      <p className="studio-type-body font-medium text-white">How to allow your microphone or camera</p>
      <ul className="studio-type-body list-disc space-y-1 pl-5 text-[13px] text-silver-body">
        <li>
          <strong className="text-white">Computer (Chrome, Edge, Firefox):</strong> click the lock or camera icon at the left of the web
          address, set Microphone (and Camera, if you want it) to Allow, then press the test button again.
        </li>
        <li>
          <strong className="text-white">Mac Safari:</strong> Safari menu → Settings for This Website → Microphone → Allow.
        </li>
        <li>
          <strong className="text-white">iPhone or iPad:</strong> tap “aA” in the address bar → Website Settings → Microphone → Allow. Or
          open Settings → Safari → Microphone.
        </li>
        <li>
          <strong className="text-white">Android:</strong> tap the lock icon next to the address → Permissions → Microphone → Allow.
        </li>
      </ul>
      <p className={HINT}>If it still does not work, reload this page. Your link stays the same.</p>
    </Panel>
  )
}

function Meter({ label, peak, clip }: { label: string; peak: number; clip: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="studio-type-label w-10 text-silver">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={`h-full transition-[width] duration-75 ${clip ? 'bg-heart' : 'bg-forged'}`}
          style={{ width: `${Math.min(100, peak * 140)}%` }}
        />
      </div>
      <span className={`studio-type-timecode ${clip ? 'text-heart' : 'text-silver'}`}>{clip ? 'LOUD' : 'live'}</span>
    </div>
  )
}
