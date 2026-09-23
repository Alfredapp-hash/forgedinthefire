'use client'

import { useEffect, useRef, useState } from 'react'
import {
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
} from 'lucide-react'
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
  parseTallyPhase,
  type GuestInvitePublic,
  type GuestTallyPhase,
  type GuestUiPhase,
} from '@/lib/podcast/guest-types'
import {
  clearGuestSession,
  fetchGuestSession,
  postGuestSession,
  pullGuestSignals,
  pushGuestSignal,
  withdrawGuestRecording,
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
import { startGuestBackup, type BackupStatus, type GuestBackup } from '@/lib/podcast/upload/guest-backup'

type Phase = 'loading' | 'blocked' | 'consent' | 'lobby' | 'booth' | 'left'

/** Automatic ICE restarts per peer before we ask the guest to press Try again. */
const MAX_AUTO_RESTARTS = 3
/** How long "disconnected" may last before we restart ICE ourselves. */
const DISCONNECT_GRACE_MS = 4000
/** Host signals that still matter if they were sent before this join. */
const STATE_KINDS = new Set(['mute', 'camera', 'tally', 'talkback', 'cue', 'pause'])

type MediaProblem = { message: string; help: boolean }

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
function plainStatus(phase: GuestUiPhase, turnConfigured: boolean, restarting: boolean) {
  switch (phase) {
    case 'recording':
      return 'Recording is on. The host is recording this conversation.'
    case 'connected':
      return 'You are connected. The host can hear you.'
    case 'linking':
      return 'Connecting you to the host…'
    case 'dropped':
      return restarting ? 'Connection lost. Reconnecting automatically…' : 'Connection lost. Reconnecting…'
    case 'failed':
      return guestConnectionHelp(turnConfigured)
    case 'left':
      return 'You left the booth.'
    default:
      return 'Waiting for the host to connect. This can take a minute.'
  }
}

type BackupEntry = { key: string; backup: GuestBackup; status: BackupStatus }

const BIG_BTN = 'min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm'

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

  const streamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
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
      void restartIce()
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
    const onChannel = controlRef.current?.send(kind, stamped) ?? false
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
    return stream
  }

  async function closeGuestCamera() {
    if (peerRef.current) detachLocalVideo(peerRef.current)
    stopStreams([camStreamRef.current])
    camStreamRef.current = null
    setCamStream(null)
    setCamOn(false)
    if (peerRef.current) await sendControl('camera', { on: false })
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

  /** "I need a pause": mic off locally at once, then tell the host. */
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
      setPhase('booth')
      await startPeer()
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
    if (!peer || restartingRef.current || startingPeerRef.current) return
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
        const talkLive = talk.getAudioTracks().length ? talk : null
        const cueLiveStream = cue.getAudioTracks().length ? cue : null
        hostStreamRef.current = talkLive || cueLiveStream
        const mix = phonesRef.current
        mix?.attach(talkLive, cueLiveStream)
        mix?.setTalkbackOn(talkbackRef.current)
        mix?.setCueLive(cueLiveRef.current)
        setSoundBlocked(Boolean(mix?.running && !mix.running()))
        const audio = hostAudioRef.current
        if (audio) {
          // Chrome only feeds remote WebRTC audio into Web Audio if a media element holds it.
          audio.srcObject = talkLive || cueLiveStream
          audio.muted = true
          void audio.play().catch(() => {})
        }
        stopHostMeterRef.current?.()
        const meterStream = talkLive || cueLiveStream
        stopHostMeterRef.current = meterStream ? meter(meterStream, setHostPeak) : null
      }
      const markLive = () => {
        clearDisconnectTimer()
        restartAttemptsRef.current = 0
        setRestarting(false)
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
          clearDisconnectTimer()
          disconnectTimerRef.current = window.setTimeout(() => {
            if (peerRef.current === peer && peer.iceConnectionState === 'disconnected') void restartIce()
          }, DISCONNECT_GRACE_MS)
        }
        if (state === 'failed') {
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
      await startPeer()
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
      const channelUp = Boolean(up && controlRef.current?.isOpen())
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
    void hostAudioRef.current?.play().catch(() => {})
    window.setTimeout(() => setSoundBlocked(Boolean(phonesRef.current?.running && !phonesRef.current.running())), 300)
  }

  function trackBackup(backup: GuestBackup) {
    const key = `${backup.kind}-${++backupSeqRef.current}`
    const entry: BackupEntry = { key, backup, status: backup.status() }
    setBackups((prev) => [...prev, entry].slice(-8))
    return (status: BackupStatus) =>
      setBackups((prev) => prev.map((b) => (b.key === key ? { ...b, status } : b)))
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
      clock: () => ({ offsetMs: controlRef.current?.offsetMs() ?? null, rttMs: controlRef.current?.rttMs() ?? null }),
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
    const phones = phonesRef.current
    phonesRef.current = null
    phones?.stop()
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
  const outOfRestarts = restartAttemptsRef.current >= MAX_AUTO_RESTARTS
  const showTryAgain = presence.phase === 'failed' || (presence.phase === 'dropped' && (outOfRestarts || !restarting))
  const tallyToneClass =
    tallyUi.tone === 'rec'
      ? 'border-red-500/70 bg-[#2A1014]'
      : tallyUi.tone === 'wait'
        ? 'border-[#FFB86B]/70 bg-[#24180C]'
        : 'border-[#27313B] bg-[#11161C]'
  const tallyLabelTone =
    tallyUi.tone === 'rec' ? 'text-[#FF7A9A]' : tallyUi.tone === 'wait' ? 'text-[#FFB86B]' : 'text-[#A9B8C6]'
  const labelTone =
    presence.tone === 'live'
      ? 'text-[#7CFFB2]'
      : presence.tone === 'rec' || presence.tone === 'fail'
        ? 'text-[#FF7A9A]'
        : presence.tone === 'wait' || presence.tone === 'warn'
          ? 'text-[#FFB86B]'
          : 'text-[#A9B8C6]'
  const canLeave = phase === 'consent' || phase === 'lobby' || phase === 'booth'
  const paused = Boolean(hostPause) || pauseRequested
  const referenceCode = session?.id ? guestReferenceCode(session.id) : null

  return (
    // z-40 keeps the site's Quick Exit button (z-50) visible above the booth.
    <div className="fixed inset-0 z-40 bg-[#0C141C] text-[#F6FAFC] overflow-auto">
      <audio ref={hostAudioRef} autoPlay playsInline muted className="hidden" />
      <div className="mx-auto max-w-xl min-h-full px-4 py-8 pb-28 space-y-5">
        <header className="border-b border-[#27313B] pb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Forged in the Fire · Guest booth</p>
            <h1 className="text-xl font-medium mt-1">{session?.episodeTitle || 'Podcast recording'}</h1>
          </div>
          {canLeave && (
            <button
              type="button"
              onClick={() => void leave()}
              className={`${BIG_BTN} shrink-0 border border-[#FF7A9A]/60 text-[#FFB3C3] hover:bg-[#2A1014]`}
            >
              <LogOut size={16} /> Leave
            </button>
          )}
        </header>

        {phase === 'loading' && <p className="text-sm text-[#A9B8C6]">Checking your invite…</p>}

        {phase === 'blocked' && (
          <div className="rounded-xl border border-[#27313B] bg-[#11161C] p-4 text-sm text-[#FFB3C3]" role="alert">
            {error || 'This invite is closed.'}
          </div>
        )}

        {phase === 'left' && (
          <div className="rounded-xl border border-[#27313B] bg-[#11161C] p-4 space-y-3 text-sm">
            <p className="text-[#F6FAFC]">You have left. Your microphone and camera are off.</p>
            <p className="text-[#A9B8C6]">Leaving is always okay.</p>
            <button
              type="button"
              onClick={rejoin}
              className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}
            >
              I want to rejoin
            </button>
          </div>
        )}

        {(phase === 'left' || phase === 'blocked') && backups.length > 0 && (
          <BackupPanel backups={backups} onDownload={downloadBackup} />
        )}

        {(phase === 'left' || (phase === 'blocked' && hostEnded)) && (
          <Aftercare token={token} referenceCode={referenceCode} />
        )}

        {phase === 'consent' && (
          <section className="rounded-2xl border border-[#27313B] bg-[#11161C] p-5 space-y-4" aria-labelledby="consent-title">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#8DEBFF]" />
              <h2 id="consent-title" className="text-base font-medium">
                Before we start
              </h2>
            </div>
            <p className="text-sm text-[#B8C4CF]">
              You have been invited to talk with the Forged in the Fire podcast host. Please read this first.
              Nothing turns on until you choose to.
            </p>
            <ul className="space-y-2 text-sm text-[#D5DEE6] list-disc pl-5">
              {CONSENT_POINTS.map((point) => (
                <li key={point.title}>
                  <strong>{point.title}:</strong> {point.body}
                </li>
              ))}
            </ul>
            <fieldset className="space-y-2">
              <legend className="text-xs text-[#A9B8C6] mb-1">How do you want to join?</legend>
              <label className="flex items-start gap-3 text-sm text-[#D5DEE6] min-h-[44px] py-1">
                <input
                  type="radio"
                  name="media-mode"
                  checked={audioOnly}
                  onChange={() => setAudioOnly(true)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <strong>Audio only</strong> — my camera stays off the whole time.
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-[#D5DEE6] min-h-[44px] py-1">
                <input
                  type="radio"
                  name="media-mode"
                  checked={!audioOnly}
                  onChange={() => setAudioOnly(false)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <strong>I may use my camera</strong> — it still stays off until I turn it on.
                </span>
              </label>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-xs text-[#A9B8C6] mb-1">Your privacy choices (you can pick any, or none)</legend>
              <Choice
                checked={choices.voice_altered}
                onChange={(v) => setChoices((c) => ({ ...c, voice_altered: v }))}
                label="Please change my voice"
                hint="We alter your voice in the published episode so it is harder to recognise."
              />
              {!audioOnly && (
                <Choice
                  checked={choices.face_blurred}
                  onChange={(v) => setChoices((c) => ({ ...c, face_blurred: v }))}
                  label="Please blur my face"
                  hint="Any video we publish will have your face blurred."
                />
              )}
              <Choice
                checked={choices.first_name_only}
                onChange={(v) => setChoices((c) => ({ ...c, first_name_only: v }))}
                label="Use my first name only (or a nickname)"
                hint="We will not use your full name anywhere."
              />
              <Choice
                checked={!choices.may_publish}
                onChange={(v) => setChoices((c) => ({ ...c, may_publish: !v }))}
                label="I want to hear the final cut before it is published"
                hint="We will not publish the episode until you have heard it."
              />
            </fieldset>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={acceptConsent}
                className={`${BIG_BTN} bg-[#53D6FF] text-[#061016] font-medium`}
              >
                I understand — continue
              </button>
              <button
                type="button"
                onClick={() => void leave()}
                className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}
              >
                No thanks, leave
              </button>
            </div>
            {session && (
              <p className="text-[11px] text-[#7C8B97]">
                This link is private to you and stops working{' '}
                {mounted ? new Date(session.expiresAt).toLocaleString() : 'soon'}. Please do not share it.
              </p>
            )}
          </section>
        )}

        {phase === 'lobby' && (
          <div className="rounded-2xl border border-[#27313B] bg-[#11161C] p-4 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Get ready</p>
            <label className="block space-y-1.5">
              <span className="text-xs text-[#A9B8C6]">Your name for the host (first name or nickname is fine)</span>
              <input
                value={name}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#F6FAFC]"
                placeholder="First name or nickname"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-[#A9B8C6]">Microphone</span>
              <select
                value={micId}
                onChange={(e) => {
                  const id = e.target.value
                  setMicId(id)
                  if (micReady) void prepareMic(id).catch((err) => showMediaProblem(err, 'microphone'))
                }}
                className="w-full min-h-[44px] rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#B8C4CF]"
              >
                <option value="">Default</option>
                {mics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || 'Microphone'}
                  </option>
                ))}
              </select>
            </label>
            {!audioOnly && (
              <label className="block space-y-1.5">
                <span className="text-xs text-[#A9B8C6]">Camera (off until you turn it on)</span>
                <select
                  value={camId}
                  disabled={recording}
                  onChange={(e) => void changeCameraDevice(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#B8C4CF]"
                >
                  <option value="">Default camera</option>
                  {cams.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || 'Camera'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={testMic} className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}>
                <Mic2 size={16} /> {micReady ? 'Microphone on — test again' : 'Test my microphone'}
              </button>
              {!audioOnly && (
                <button
                  type="button"
                  aria-pressed={camOn}
                  onClick={() => void toggleCamera()}
                  className={`${BIG_BTN} ${camOn ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'}`}
                >
                  {camOn ? <Video size={16} /> : <VideoOff size={16} />}
                  {camOn ? 'Camera on — turn off' : 'Turn camera on'}
                </button>
              )}
              {!audioOnly && (
                <button
                  type="button"
                  onClick={() => void switchToAudioOnly()}
                  className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}
                >
                  Switch to audio only
                </button>
              )}
            </div>
            {camStream && <CameraPreview stream={camStream} label="You · only you see this" />}
            {micReady && <Meter label="You" peak={peak} clip={clip} />}
            <label className="flex items-start gap-3 text-sm text-[#B8C4CF] min-h-[44px]">
              <input type="checkbox" checked={phones} onChange={(e) => setPhones(e.target.checked)} className="mt-1 h-5 w-5" />
              <span className="flex gap-2">
                <Headphones size={16} className="text-[#8DEBFF] shrink-0 mt-0.5" />
                I am wearing headphones or earbuds (so the host’s voice does not echo into my microphone).
              </span>
            </label>
            <button
              type="button"
              onClick={() => void joinBooth()}
              className={`${BIG_BTN} w-full bg-[#53D6FF] text-[#061016] font-medium`}
            >
              Join — turn on my microphone
            </button>
          </div>
        )}

        {phase === 'booth' && paused && (
          <section
            className="rounded-3xl border border-[#3B5B4F] bg-[#0F1D19] p-6 space-y-4 text-center"
            role="status"
            aria-live="assertive"
          >
            <Coffee size={28} className="mx-auto text-[#9FE3C4]" aria-hidden />
            {hostPause ? (
              <>
                <h2 className="text-lg font-medium text-[#E6FFF4]">Paused — you’re off the recording</h2>
                <p className="text-sm text-[#BFD9CE]">
                  Your microphone is off{camOn ? ' and your camera is hidden from the show' : ''}. Nothing you say now
                  is recorded. Take a breath — the host will continue when you are both ready.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium text-[#E6FFF4]">You asked for a pause</h2>
                <p className="text-sm text-[#BFD9CE]">
                  Your microphone is off and the host has been told. Take all the time you need. You can also leave —
                  that is always okay.
                </p>
              </>
            )}
            {pauseRequested && (
              <button
                type="button"
                onClick={() => requestPause(false)}
                className={`${BIG_BTN} w-full bg-[#9FE3C4] text-[#06140E] font-medium text-base`}
              >
                I’m ready to continue
              </button>
            )}
            {hostPause && !pauseRequested && (
              <p className="text-[12px] text-[#8FB5A6]">You do not need to do anything. This screen will change when the pause ends.</p>
            )}
          </section>
        )}

        {phase === 'booth' && (
          <div className="space-y-4">
            <div
              className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${tallyToneClass}`}
              role="status"
              aria-live="polite"
            >
              <div>
                <p className={`text-sm font-medium ${tallyLabelTone}`}>
                  {paused
                    ? 'Paused — not recording you'
                    : tally === 'rec'
                      ? '● Recording'
                      : tally === 'count-in'
                        ? 'Recording is about to start'
                        : 'Not recording'}
                </p>
                <p className={`text-[12px] mt-0.5 ${labelTone}`}>{plainStatus(presence.phase, turnConfigured, restarting)}</p>
              </div>
              <p className="text-[10px] font-mono text-[#5F6E7A] shrink-0" aria-hidden>
                {ice || '…'}
              </p>
            </div>

            {!pauseRequested && (
              <button
                type="button"
                onClick={() => requestPause(true)}
                className={`${BIG_BTN} w-full border-2 border-[#FFB86B]/70 bg-[#24180C] text-[#FFD9A8] font-medium text-base`}
              >
                <Coffee size={18} /> I need a pause
              </button>
            )}

            {soundBlocked && (
              <button
                type="button"
                onClick={enableSound}
                className={`${BIG_BTN} w-full bg-[#FFB86B] text-[#1A1206] font-medium`}
              >
                <Volume2 size={16} /> Tap here to hear the host
              </button>
            )}

            {showTryAgain && (
              <div className="rounded-xl border border-[#FF7A9A]/70 bg-[#2A1014] px-4 py-3 text-sm text-[#FFB3C3] space-y-2" role="alert">
                <p>{guestConnectionHelp(turnConfigured)}</p>
                <p className="text-[12px] text-[#A9B8C6]">
                  You do not need a new link. If recording is on, your backup keeps saving in this tab.
                </p>
                <button
                  type="button"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                  className={`${BIG_BTN} bg-[#53D6FF] text-[#061016] font-medium disabled:opacity-40`}
                >
                  <RefreshCw size={16} /> {reconnecting ? 'Trying again…' : 'Try again'}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 bg-[#7CFFB2]" />
                  {name || 'You'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!audioOnly && (
                    <button
                      type="button"
                      aria-pressed={camOn}
                      disabled={recording || (camLocked && !camOn)}
                      onClick={() => void toggleCamera()}
                      className={`${BIG_BTN} ${
                        camLocked
                          ? 'border border-[#FF7A9A]/50 text-[#FF7A9A]'
                          : camOn
                            ? 'bg-[#53D6FF] text-[#061016]'
                            : 'border border-[#27313B] text-[#B8C4CF]'
                      }`}
                    >
                      {camOn ? <Video size={16} /> : <VideoOff size={16} />}
                      {camLocked ? 'Camera off (host)' : camOn ? 'Camera on' : 'Camera off'}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={muted}
                    aria-label={muteLocked ? 'Muted by host' : muted ? 'Unmute my microphone' : 'Mute my microphone'}
                    disabled={muteLocked}
                    onClick={() => toggleMute()}
                    className={`${BIG_BTN} ${muted ? 'bg-red-500/90 text-white' : 'border border-[#27313B] text-[#B8C4CF]'}`}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    {muteLocked ? 'Muted by host' : muted ? 'Muted — tap to unmute' : 'Mute me'}
                  </button>
                </div>
              </div>
              {(muteLocked || camLocked) && (
                <p className="text-[12px] text-[#FFB86B]">
                  {muteLocked && camLocked
                    ? 'The host muted you and turned your camera off for now.'
                    : muteLocked
                      ? 'The host muted you for now. They will unmute you when it is your turn.'
                      : 'The host turned your camera off for now.'}
                </p>
              )}
              {!audioOnly && camOn && (
                <select
                  value={camId}
                  disabled={recording || camLocked}
                  onChange={(e) => void changeCameraDevice(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#B8C4CF]"
                >
                  <option value="">Default camera</option>
                  {cams.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || 'Camera'}
                    </option>
                  ))}
                </select>
              )}
              {camStream && <CameraPreview stream={camStream} label="You · only you see this preview" live={recording} />}
              <Meter label="You" peak={muted || paused ? 0 : peak} clip={clip} />
              {!audioOnly && !recording && (
                <button
                  type="button"
                  onClick={() => void switchToAudioOnly()}
                  className="min-h-[44px] text-[13px] text-[#8DEBFF] underline underline-offset-2"
                >
                  Switch to audio only
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3">
              <p className="text-sm">
                <span className={`inline-block h-2.5 w-2.5 rounded-full mr-2 ${talkback ? 'bg-[#53D6FF]' : 'bg-[#27313B]'}`} />
                Host{talkback ? ' · you can hear them' : ''}
              </p>
              <Meter label="Host" peak={talkback ? hostPeak : 0} clip={false} />
              <p className="text-[12px] text-[#7C8B97]">
                {talkback
                  ? 'The host’s voice is in your headphones.'
                  : 'You will hear the host in your headphones when they turn on their microphone to you.'}
              </p>
            </div>

            {(cueOn || cueLive) && (
              <div className={`rounded-2xl border p-4 space-y-3 ${cueLive ? 'border-[#53D6FF]/50 bg-[#0A161C]' : 'border-[#1A232C] bg-[#080C10]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full mr-2 ${cueLive ? 'bg-[#53D6FF]' : 'bg-[#FFB86B]'}`} />
                    Show audio{cueLive ? ' · playing' : ' · ready'}
                  </p>
                  {cueLive && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#8DEBFF]">
                      <Music2 size={12} /> LIVE
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-3 text-xs text-[#A9B8C6] min-h-[44px]">
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cueVolume}
                    onChange={(e) => setCueVolume(Number(e.target.value))}
                    className="flex-1 accent-[#53D6FF]"
                    aria-label="Show audio volume"
                  />
                </label>
                <p className="text-[12px] text-[#7C8B97]">
                  Music or clips the host is playing. Only you hear this, in your headphones.
                </p>
              </div>
            )}

            {backups.length > 0 && <BackupPanel backups={backups} onDownload={downloadBackup} />}

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => void leave()}
                className={`${BIG_BTN} border border-[#27313B] text-[#FF7A9A]`}
              >
                <PhoneOff size={16} /> Leave
              </button>
            </div>
          </div>
        )}

        {permissionHelp && phase !== 'blocked' && phase !== 'left' && <PermissionHelp />}
        {ok && phase !== 'blocked' && phase !== 'left' && (
          <p className="text-sm text-[#8DEBFF]" role="status">
            {ok}
          </p>
        )}
        {error && phase !== 'blocked' && (
          <p className="text-sm text-[#FF7A9A]" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

function Choice({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex items-start gap-3 text-sm text-[#D5DEE6] min-h-[44px] py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
      <span>
        <strong className="font-medium">{label}</strong>
        <span className="block text-[12px] text-[#8C9BA8]">{hint}</span>
      </span>
    </label>
  )
}

function backupLine(status: BackupStatus) {
  const what = status.kind === 'camera' ? 'Camera backup' : 'Audio backup'
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
      return `${what}: could not be sent. Please download it and keep it safe, or try again.`
    case 'local-only':
      return `${what}: kept in this tab only. Please download it before closing.`
  }
}

function BackupPanel({ backups, onDownload }: { backups: BackupEntry[]; onDownload: (entry: BackupEntry) => void }) {
  return (
    <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3" aria-live="polite">
      <p className="text-sm flex items-center gap-2">
        <CloudUpload size={16} className="text-[#8DEBFF]" /> Your backup
      </p>
      <ul className="space-y-3">
        {backups.map((entry) => {
          const s = entry.status
          const pct = s.chunksRecorded ? Math.round((s.chunksUploaded / s.chunksRecorded) * 100) : 0
          const problem = s.state === 'failed' || s.state === 'local-only'
          return (
            <li key={entry.key} className="space-y-2">
              <p className={`text-[13px] ${problem ? 'text-[#FFB86B]' : 'text-[#B8C4CF]'}`}>{backupLine(s)}</p>
              {(s.state === 'recording' || s.state === 'finishing') && s.chunksRecorded > 0 && (
                <div
                  className="h-2 rounded-full bg-[#151B22] overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${s.kind} backup upload`}
                >
                  <div className="h-full bg-[#53D6FF] transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              )}
              {problem && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onDownload(entry)}
                    className={`${BIG_BTN} bg-[#FFB86B] text-[#1A1206] font-medium`}
                  >
                    <Download size={16} /> Download my backup
                  </button>
                  <button
                    type="button"
                    onClick={() => void entry.backup.retry()}
                    className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}
                  >
                    <RefreshCw size={16} /> Try sending again
                  </button>
                </div>
              )}
              {s.state === 'done' && entry.backup.kind === 'camera' && (
                <button
                  type="button"
                  onClick={() => onDownload(entry)}
                  className="min-h-[44px] text-[13px] text-[#8DEBFF] underline underline-offset-2"
                >
                  Save a copy of my camera backup
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** After the session: how to ask for the recording to be withdrawn. */
function Aftercare({ token, referenceCode }: { token: string; referenceCode: string | null }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'sending' | 'sent' | 'error'>('idle')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const subject = encodeURIComponent(`Podcast recording withdrawal${referenceCode ? ` — ${referenceCode}` : ''}`)

  async function send() {
    setStep('sending')
    setMessage(null)
    try {
      await withdrawGuestRecording(token, reason)
      setStep('sent')
    } catch (err) {
      setStep('error')
      setMessage(err instanceof Error ? err.message : 'We could not send your request.')
    }
  }

  return (
    <section className="rounded-xl border border-[#27313B] bg-[#11161C] p-4 space-y-3 text-sm" aria-labelledby="aftercare-title">
      <h2 id="aftercare-title" className="text-[#F6FAFC] font-medium">
        Changed your mind?
      </h2>
      <p className="text-[#B8C4CF]">
        You can ask us not to use your recording — today or later. You do not have to give a reason. Nothing is published
        until a person on our team has checked your request.
      </p>
      {referenceCode && (
        <p className="text-[#B8C4CF]">
          Your reference code: <strong className="font-mono text-[#F6FAFC] select-all">{referenceCode}</strong>
          <span className="block text-[12px] text-[#7C8B97]">
            Keep it somewhere safe. It lets us find your recording without your name.
          </span>
        </p>
      )}
      {step === 'idle' && (
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className={`${BIG_BTN} border border-[#FFB86B]/60 text-[#FFD9A8]`}
        >
          Ask to withdraw my recording
        </button>
      )}
      {(step === 'confirm' || step === 'sending' || step === 'error') && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs text-[#A9B8C6]">Anything you want us to know (optional)</span>
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#F6FAFC]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={step === 'sending'}
              onClick={() => void send()}
              className={`${BIG_BTN} bg-[#FFB86B] text-[#1A1206] font-medium disabled:opacity-50`}
            >
              {step === 'sending' ? 'Sending…' : 'Yes, withdraw my recording'}
            </button>
            <button
              type="button"
              disabled={step === 'sending'}
              onClick={() => setStep('idle')}
              className={`${BIG_BTN} border border-[#27313B] text-[#B8C4CF]`}
            >
              Not now
            </button>
          </div>
          {message && (
            <p className="text-[#FF7A9A]" role="alert">
              {message}
            </p>
          )}
        </div>
      )}
      {step === 'sent' && (
        <p className="text-[#9FE3C4]" role="status">
          Your request was sent. The episode is on hold until our team has reviewed it. Thank you for telling us.
        </p>
      )}
      <p className="text-[12px] text-[#7C8B97]">
        You can also email{' '}
        <a className="underline text-[#8DEBFF]" href={`mailto:${ORG.email}?subject=${subject}`}>
          {ORG.email}
        </a>{' '}
        {referenceCode ? 'with your reference code' : ''} or call {ORG.phone}.
      </p>
    </section>
  )
}

function PermissionHelp() {
  return (
    <div className="rounded-xl border border-[#27313B] bg-[#11161C] p-4 text-sm text-[#B8C4CF] space-y-2">
      <p className="font-medium text-[#F6FAFC]">How to allow your microphone or camera</p>
      <ul className="list-disc pl-5 space-y-1 text-[13px]">
        <li>
          <strong>Computer (Chrome, Edge, Firefox):</strong> click the lock or camera icon at the left of the web
          address, set Microphone (and Camera, if you want it) to Allow, then press the test button again.
        </li>
        <li>
          <strong>Mac Safari:</strong> Safari menu → Settings for This Website → Microphone → Allow.
        </li>
        <li>
          <strong>iPhone or iPad:</strong> tap “aA” in the address bar → Website Settings → Microphone → Allow. Or
          open Settings → Safari → Microphone.
        </li>
        <li>
          <strong>Android:</strong> tap the lock icon next to the address → Permissions → Microphone → Allow.
        </li>
      </ul>
      <p className="text-[12px] text-[#7C8B97]">If it still does not work, reload this page. Your link stays the same.</p>
    </div>
  )
}

function Meter({ label, peak, clip }: { label: string; peak: number; clip: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-[10px] uppercase tracking-wider text-[#7C8B97]">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-[#151B22] overflow-hidden">
        <div
          className={`h-full transition-[width] duration-75 ${clip ? 'bg-[#FF5B73]' : 'bg-[#53D6FF]'}`}
          style={{ width: `${Math.min(100, peak * 140)}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${clip ? 'text-[#FF7A9A]' : 'text-[#A9B8C6]'}`}>{clip ? 'LOUD' : 'live'}</span>
    </div>
  )
}
