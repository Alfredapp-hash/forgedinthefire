'use client'

import { useEffect, useRef, useState } from 'react'
import {
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
import { createGuestHeadphoneMix, type GuestHeadphoneMix } from '@/lib/podcast/guest-cue'
import { CameraPreview } from '@/components/podcast/camera-preview'
import { openCameraStream, startCameraCapture, type CameraCapture } from '@/lib/podcast/camera'
import { attachInputMeter } from '@/lib/podcast/record-session'
import {
  openInputStream,
  recorderMime,
  startLaneCapture,
  stopLaneCapture,
  stopStreams,
  type LaneCapture,
} from '@/lib/podcast/capture'
import {
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
  finalizeGuestTake,
  postGuestSession,
  pullGuestSignals,
  pushGuestSignal,
  requestGuestTakeUpload,
} from '@/lib/podcast/guest-signal'
import {
  addIce,
  applyAnswer,
  attachLocalAudio,
  attachLocalVideo,
  closePeer,
  createStudioPeer,
  detachLocalVideo,
  ensureCueRecvTransceiver,
  ensureVideoTransceiver,
  guestConnectionHelp,
  loadStudioIceServers,
  makeOffer,
  makeRestartOffer,
  newPeerGeneration,
  remoteAudioByRole,
  type StudioIceConfig,
} from '@/lib/podcast/webrtc'

type Phase = 'loading' | 'blocked' | 'consent' | 'lobby' | 'booth' | 'left'

/** Automatic ICE restarts per peer before we ask the guest to press Try again. */
const MAX_AUTO_RESTARTS = 3
/** How long "disconnected" may last before we restart ICE ourselves. */
const DISCONNECT_GRACE_MS = 4000
/** Host signals that still matter if they were sent before this join. */
const STATE_KINDS = new Set(['mute', 'camera', 'tally', 'talkback', 'cue'])

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
  const [uploading, setUploading] = useState(false)
  const [backupUrl, setBackupUrl] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [turnConfigured, setTurnConfigured] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const genRef = useRef<string>('')
  const afterRef = useRef(0)
  const joinCursorRef = useRef(0)
  const captureRef = useRef<LaneCapture | null>(null)
  const captureStartRef = useRef<Promise<LaneCapture> | null>(null)
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const camCaptureRef = useRef<CameraCapture | null>(null)
  const stopMeterRef = useRef<(() => void) | null>(null)
  const stopHostMeterRef = useRef<(() => void) | null>(null)
  const backupUrlRef = useRef<string | null>(null)
  const mutedRef = useRef(false)
  const muteLockedRef = useRef(false)
  const camLockedRef = useRef(false)
  const talkbackRef = useRef(false)
  const cueLiveRef = useRef(false)
  const audioOnlyRef = useRef(true)
  const phonesRef = useRef<GuestHeadphoneMix | null>(null)
  const startingPeerRef = useRef(false)
  const restartAttemptsRef = useRef(0)
  const restartingRef = useRef(false)
  const disconnectTimerRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>(phase)
  mutedRef.current = muted
  muteLockedRef.current = muteLocked
  camLockedRef.current = camLocked
  talkbackRef.current = talkback
  cueLiveRef.current = cueLive
  audioOnlyRef.current = audioOnly
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
      if (backupUrlRef.current) URL.revokeObjectURL(backupUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tell the host we left if the tab is closed mid-session (keepalive fetch).
  useEffect(() => {
    if (phase !== 'booth') return
    const onHide = (event: PageTransitionEvent) => {
      if (event.persisted) return
      void pushGuestSignal(token, 'hangup', {}).catch(() => {})
      void postGuestSession(token, { action: 'leave' }).catch(() => {})
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [phase, token])

  // Network came back (Wi-Fi switch, phone woke up): restart ICE right away.
  useEffect(() => {
    if (phase !== 'booth') return
    const onOnline = () => {
      restartAttemptsRef.current = 0
      void restartIce()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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
    setMicReady(true)
    await refreshDevices()
    stopMeterRef.current = attachInputMeter(stream, (level) => {
      setPeak(level)
      if (level >= 0.98) {
        setClip(true)
        window.setTimeout(() => setClip(false), 1200)
      }
    })
    if (peerRef.current) attachLocalAudio(peerRef.current, stream)
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
      await pushGuestSignal(token, 'camera', { on: true }).catch(() => {})
    }
    return stream
  }

  async function closeGuestCamera() {
    if (peerRef.current) detachLocalVideo(peerRef.current)
    stopStreams([camStreamRef.current])
    camStreamRef.current = null
    setCamStream(null)
    setCamOn(false)
    if (peerRef.current) {
      await pushGuestSignal(token, 'camera', { on: false }).catch(() => {})
    }
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
    if (camOn) await closeGuestCamera()
  }

  function toggleMute() {
    if (muteLockedRef.current) return
    setMuted((v) => !v)
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
    setPhase('lobby')
  }

  async function joinBooth() {
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
        const mix = createGuestHeadphoneMix()
        mix.setCueVolume(cueVolume)
        phonesRef.current = mix
      }
      // Inside the Join tap: lets iOS/Safari start sound later without another gesture.
      await phonesRef.current.resume?.()
      const next = await postGuestSession(token, {
        action: 'join',
        name: display,
        consent: true,
        audioOnly: audioOnlyRef.current,
      })
      setSession(next)
      joinCursorRef.current = Number(next.signalCursor || 0)
      afterRef.current = 0
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
      const offer = await makeRestartOffer(peer)
      if (offer && peerRef.current === peer) {
        await pushGuestSignal(token, 'offer', { type: offer.type, sdp: offer.sdp, gen: genRef.current, restart: true })
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
      closePeer(peerRef.current, false)
      const cfg = iceCfgRef.current || (await loadStudioIceServers(token))
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
      const peer = createStudioPeer(cfg.iceServers)
      const gen = newPeerGeneration()
      genRef.current = gen
      peerRef.current = peer
      restartAttemptsRef.current = 0
      ensureVideoTransceiver(peer, 'sendonly')
      if (streamRef.current) {
        attachLocalAudio(peer, streamRef.current)
        const track = streamRef.current.getAudioTracks()[0]
        if (track) track.enabled = !mutedRef.current
      }
      ensureCueRecvTransceiver(peer)
      if (camStreamRef.current && !camLockedRef.current && !audioOnlyRef.current) {
        attachLocalVideo(peer, camStreamRef.current)
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
        stopHostMeterRef.current = meterStream ? attachInputMeter(meterStream, setHostPeak) : null
      }
      const markLive = () => {
        clearDisconnectTimer()
        restartAttemptsRef.current = 0
        setRestarting(false)
        void postGuestSession(token, { action: 'connected' }).catch(() => {})
        if (camStreamRef.current && !camLockedRef.current && !audioOnlyRef.current) {
          void pushGuestSignal(token, 'camera', { on: true }).catch(() => {})
        }
        void pushGuestSignal(token, 'mute', { on: mutedRef.current }).catch(() => {})
        setError(null)
        setReconnecting(false)
        setOk(null)
      }
      peer.oniceconnectionstatechange = () => {
        if (peerRef.current !== peer) return
        const state = peer.iceConnectionState
        setIce(state)
        if (state === 'connected' || state === 'completed') markLive()
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

  useEffect(() => {
    if (phase !== 'booth') return
    let cancelled = false
    let timer: number | null = null
    let delay = 900

    const handle = async (signal: { id: number; kind: string; payload: Record<string, unknown> }) => {
      const historic = signal.id <= joinCursorRef.current
      if (historic && !STATE_KINDS.has(signal.kind)) return
      const signalGen = typeof signal.payload.gen === 'string' ? signal.payload.gen : null
      const staleGen = Boolean(signalGen && signalGen !== genRef.current)
      if (signal.kind === 'answer' && signal.payload.sdp && peerRef.current && !staleGen) {
        await applyAnswer(peerRef.current, {
          type: 'answer',
          sdp: String(signal.payload.sdp),
        })
      }
      if (signal.kind === 'ice' && peerRef.current && !staleGen) {
        await addIce(peerRef.current, (signal.payload.candidate as RTCIceCandidateInit) || null)
      }
      if (signal.kind === 'record') {
        const on = Boolean(signal.payload.on)
        setRecording(on)
        const tallyPhase = parseTallyPhase(signal.payload.phase)
        setTally(tallyPhase || (on ? 'rec' : 'stopped'))
        if (on) void startLocalTake()
        else void stopLocalTake()
      }
      if (signal.kind === 'tally') {
        const tallyPhase = parseTallyPhase(signal.payload.phase)
        if (tallyPhase) setTally(tallyPhase)
      }
      if (signal.kind === 'talkback') {
        const on = Boolean(signal.payload.on)
        setTalkback(on)
        phonesRef.current?.setTalkbackOn(on)
      }
      if (signal.kind === 'cue') {
        const on = Boolean(signal.payload.on)
        const live = Boolean(signal.payload.live)
        setCueOn(on)
        setCueLive(live)
        cueLiveRef.current = live
        phonesRef.current?.setCueLive(live)
      }
      if (signal.kind === 'mute') {
        const on = Boolean(signal.payload.on)
        setMuteLocked(on)
        setMuted(on)
      }
      if (signal.kind === 'camera') {
        if (signal.payload.on) {
          setCamLocked(false)
        } else {
          setCamLocked(true)
          await closeGuestCamera()
        }
      }
      if (signal.kind === 'reconnect') {
        setOk('The host asked to reconnect…')
        void retryPeer()
      }
      if (signal.kind === 'hangup') {
        setTalkback(false)
        setCueOn(false)
        setCueLive(false)
        cueLiveRef.current = false
        phonesRef.current?.setTalkbackOn(false)
        phonesRef.current?.setCueLive(false)
        setTally('stopped')
        await stopLocalTake()
        teardown(true)
        clearGuestSession(token)
        setError('The host ended the session. Thank you for joining. You can close this tab.')
        setPhase('blocked')
      }
    }

    const tick = async () => {
      try {
        const data = await pullGuestSignals(token, afterRef.current)
        if (cancelled) return
        delay = 900
        setSession(data.session)
        setRecording(data.session.recording)
        for (const signal of data.signals) {
          afterRef.current = Math.max(afterRef.current, signal.id)
          await handle(signal)
          if (cancelled || phaseRef.current !== 'booth') return
        }
      } catch (err) {
        const message = (err as Error).message || ''
        if (/revoked|expired|not valid|another device|join the booth/i.test(message)) {
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
        // Network hiccup or rate limit: back off, keep the call up.
        delay = Math.min(5000, delay * 2)
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay)
    }
    void tick()
    const beat = window.setInterval(() => {
      void postGuestSession(token, { action: 'heartbeat' }).catch(() => {})
    }, 15000)
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
      window.clearInterval(beat)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, token])

  useEffect(() => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (track) track.enabled = !muted
    if (phase === 'booth') {
      void pushGuestSignal(token, 'mute', { on: muted }).catch(() => {})
    }
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
    const mix = phonesRef.current || createGuestHeadphoneMix()
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

  async function enableSound() {
    await phonesRef.current?.resume?.()
    void hostAudioRef.current?.play().catch(() => {})
    setSoundBlocked(Boolean(phonesRef.current?.running && !phonesRef.current.running()))
  }

  async function startLocalTake() {
    const stream = streamRef.current
    if (stream && !captureRef.current && !captureStartRef.current) {
      captureStartRef.current = startLaneCapture('guest', stream)
      captureRef.current = await captureStartRef.current
      captureStartRef.current = null
    }
    const cam = audioOnlyRef.current ? null : camStreamRef.current
    if (cam && !camCaptureRef.current) {
      camCaptureRef.current = startCameraCapture('guest', cam)
    }
    setOk(
      cam
        ? 'Recording. A backup of your audio and camera is kept in this tab and sent only to the host.'
        : 'Recording. A backup of your audio is kept in this tab and sent only to the host.',
    )
  }

  async function uploadBlob(blob: Blob, kind: 'audio' | 'camera', filename: string) {
    if (blob.size < 64) return false
    const fullMime = blob.type || (kind === 'camera' ? 'video/webm' : recorderMime() || 'audio/webm')
    const mime = fullMime.split(';')[0].trim()
    const file = new File([blob], filename, { type: mime })
    const signed = await requestGuestTakeUpload(token, mime, file.size, kind)
    const put = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: file,
      referrerPolicy: 'no-referrer',
    })
    if (!put.ok) throw new Error(kind === 'camera' ? 'Could not send the camera backup' : 'Could not send your audio backup')
    await finalizeGuestTake(token, signed.path, signed.publicUrl, mime, kind)
    return true
  }

  async function stopLocalTake() {
    if (captureStartRef.current) {
      captureRef.current = await captureStartRef.current.catch(() => null)
      captureStartRef.current = null
    }
    const capture = captureRef.current
    const camCapture = camCaptureRef.current
    captureRef.current = null
    camCaptureRef.current = null
    if (capture) stopLaneCapture(capture)
    if (camCapture && camCapture.recorder.state !== 'inactive') camCapture.recorder.stop()
    if (!capture && !camCapture) return
    setUploading(true)
    try {
      const audioBlob = capture ? await capture.done : null
      const camBlob = camCapture ? await camCapture.done.catch(() => new Blob()) : null
      if (camBlob && camBlob.size >= 64) {
        if (backupUrlRef.current) URL.revokeObjectURL(backupUrlRef.current)
        const url = URL.createObjectURL(camBlob)
        backupUrlRef.current = url
        setBackupUrl(url)
      }
      if (audioBlob) await uploadBlob(audioBlob, 'audio', 'guest-take.webm')
      if (camBlob && camBlob.size >= 64) await uploadBlob(camBlob, 'camera', 'guest-camera.webm')
      setOk(
        camBlob && camBlob.size >= 64
          ? 'Your audio and camera backup were sent privately to the host.'
          : 'Your audio backup was sent privately to the host.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your backup')
    } finally {
      setUploading(false)
    }
  }

  function teardown(stopMic: boolean) {
    clearDisconnectTimer()
    stopMeterRef.current?.()
    stopHostMeterRef.current?.()
    if (captureRef.current) stopLaneCapture(captureRef.current)
    if (camCaptureRef.current && camCaptureRef.current.recorder.state !== 'inactive') {
      camCaptureRef.current.recorder.stop()
    }
    captureRef.current = null
    camCaptureRef.current = null
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
    phonesRef.current?.stop()
    phonesRef.current = null
    if (hostAudioRef.current) hostAudioRef.current.srcObject = null
  }

  /** Always available. Stops mic/camera at once; tells the host if we were in the booth. */
  async function leave() {
    const wasInBooth = phase === 'booth'
    teardown(true)
    setPhase('left')
    setError(null)
    setOk(null)
    setPermissionHelp(false)
    if (wasInBooth) {
      await pushGuestSignal(token, 'hangup', {}).catch(() => {})
      await postGuestSession(token, { action: 'leave' }).catch(() => {})
    }
    clearGuestSession(token)
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
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#FF7A9A]/60 text-sm text-[#FFB3C3] hover:bg-[#2A1014]"
            >
              <LogOut size={14} /> Leave
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
            <p className="text-[#A9B8C6]">Leaving is always okay. You can close this tab now.</p>
            <button
              type="button"
              onClick={rejoin}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            >
              I want to rejoin
            </button>
          </div>
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
              <li>
                <strong>Who is recording:</strong> the Forged in the Fire host who sent you this link. Only the
                host can start or stop recording. You will see a clear “Recording” sign when it is on.
              </li>
              <li>
                <strong>What happens to it:</strong> the conversation is recorded. It may be edited and published as
                a public podcast episode.
              </li>
              <li>
                <strong>You choose what to share.</strong> A first name or a nickname is fine. You do not have to
                answer every question. You can ask the host to take a break or to leave something out.
              </li>
              <li>
                <strong>Your microphone</strong> turns on only after you press Join. <strong>Your camera</strong>{' '}
                stays off unless you choose it and turn it on yourself.
              </li>
              <li>
                While recording, a backup of your audio is kept in this browser tab and sent only to the host.
              </li>
              <li>
                <strong>You can leave at any time</strong> with the Leave button at the top. Leaving is always
                okay.
              </li>
            </ul>
            <fieldset className="space-y-2">
              <legend className="text-xs text-[#A9B8C6] mb-1">How do you want to join?</legend>
              <label className="flex items-start gap-2 text-sm text-[#D5DEE6]">
                <input
                  type="radio"
                  name="media-mode"
                  checked={audioOnly}
                  onChange={() => setAudioOnly(true)}
                  className="mt-1"
                />
                <span>
                  <strong>Audio only</strong> — my camera stays off the whole time.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[#D5DEE6]">
                <input
                  type="radio"
                  name="media-mode"
                  checked={!audioOnly}
                  onChange={() => setAudioOnly(false)}
                  className="mt-1"
                />
                <span>
                  <strong>I may use my camera</strong> — it still stays off until I turn it on.
                </span>
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={acceptConsent}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium"
              >
                I understand — continue
              </button>
              <button
                type="button"
                onClick={() => void leave()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
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
                className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#F6FAFC]"
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
                className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#B8C4CF]"
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
                  className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#B8C4CF]"
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
              <button
                type="button"
                onClick={() => void prepareMic().catch((err) => showMediaProblem(err, 'microphone'))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              >
                <Mic2 size={14} /> {micReady ? 'Microphone on — test again' : 'Test my microphone'}
              </button>
              {!audioOnly && (
                <button
                  type="button"
                  onClick={() => void toggleCamera()}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
                    camOn ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'
                  }`}
                >
                  {camOn ? <Video size={14} /> : <VideoOff size={14} />}
                  {camOn ? 'Camera on — turn off' : 'Turn camera on'}
                </button>
              )}
              {!audioOnly && (
                <button
                  type="button"
                  onClick={() => void switchToAudioOnly()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
                >
                  Switch to audio only
                </button>
              )}
            </div>
            {camStream && <CameraPreview stream={camStream} label="You · only you see this" />}
            {micReady && <Meter label="You" peak={peak} clip={clip} />}
            <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
              <input type="checkbox" checked={phones} onChange={(e) => setPhones(e.target.checked)} className="mt-1" />
              <span className="flex gap-2">
                <Headphones size={16} className="text-[#8DEBFF] shrink-0 mt-0.5" />
                I am wearing headphones or earbuds (so the host’s voice does not echo into my microphone).
              </span>
            </label>
            <button
              type="button"
              onClick={() => void joinBooth()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium"
            >
              Join — turn on my microphone
            </button>
          </div>
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
                  {tally === 'rec' ? '● Recording' : tally === 'count-in' ? 'Recording is about to start' : 'Not recording'}
                </p>
                <p className={`text-[12px] mt-0.5 ${labelTone}`}>{plainStatus(presence.phase, turnConfigured, restarting)}</p>
              </div>
              <p className="text-[10px] font-mono text-[#5F6E7A] shrink-0" aria-hidden>
                {ice || '…'}
              </p>
            </div>

            {soundBlocked && (
              <button
                type="button"
                onClick={() => void enableSound()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#FFB86B] text-[#1A1206] text-sm font-medium"
              >
                <Volume2 size={14} /> Tap here to hear the host
              </button>
            )}

            {showTryAgain && (
              <div className="rounded-xl border border-[#FF7A9A]/70 bg-[#2A1014] px-4 py-3 text-sm text-[#FFB3C3] space-y-2" role="alert">
                <p>{guestConnectionHelp(turnConfigured)}</p>
                <p className="text-[12px] text-[#A9B8C6]">
                  You do not need a new link. If recording is on, your backup keeps going in this tab.
                </p>
                <button
                  type="button"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
                >
                  <RefreshCw size={14} /> {reconnecting ? 'Trying again…' : 'Try again'}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 bg-[#7CFFB2]" />
                  {name || 'You'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!audioOnly && (
                    <button
                      type="button"
                      disabled={recording || (camLocked && !camOn)}
                      onClick={() => void toggleCamera()}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                        camLocked
                          ? 'border border-[#FF7A9A]/50 text-[#FF7A9A]'
                          : camOn
                            ? 'bg-[#53D6FF] text-[#061016]'
                            : 'border border-[#27313B] text-[#B8C4CF]'
                      }`}
                    >
                      {camOn ? <Video size={14} /> : <VideoOff size={14} />}
                      {camLocked ? 'Camera off (host)' : camOn ? 'Camera on' : 'Camera off'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={muteLocked}
                    onClick={() => toggleMute()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                      muted ? 'bg-red-500/90 text-white' : 'border border-[#27313B] text-[#B8C4CF]'
                    }`}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
                  className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-sm text-[#B8C4CF]"
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
              <Meter label="You" peak={muted ? 0 : peak} clip={clip} />
              {!audioOnly && !recording && (
                <button
                  type="button"
                  onClick={() => void switchToAudioOnly()}
                  className="text-[12px] text-[#8DEBFF] underline underline-offset-2"
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
                <label className="flex items-center gap-3 text-xs text-[#A9B8C6]">
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

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => void leave()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#FF7A9A]"
              >
                <PhoneOff size={14} /> Leave
              </button>
              {backupUrl && (
                <a
                  href={backupUrl}
                  download="guest-camera.webm"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
                >
                  <Download size={14} /> Save my camera backup
                </a>
              )}
              {uploading && <span className="text-xs text-[#FFB86B]">Sending your backup to the host…</span>}
            </div>
          </div>
        )}

        {permissionHelp && phase !== 'blocked' && phase !== 'left' && <PermissionHelp />}
        {ok && phase !== 'blocked' && phase !== 'left' && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
        {error && phase !== 'blocked' && (
          <p className="text-sm text-[#FF7A9A]" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
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
