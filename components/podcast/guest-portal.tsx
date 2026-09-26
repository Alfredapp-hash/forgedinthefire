'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Headphones,
  Mic2,
  Music2,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import { Button, toast } from '@/components/studio-ui'
import { createGuestHeadphoneMix, type GuestHeadphoneMix } from '@/lib/podcast/guest-cue'
import { CameraPreview } from '@/components/podcast/camera-preview'
import { resilientUpload, type SignedTarget } from '@/lib/podcast/resumable-upload'
import { openCameraStream, startCameraCapture, type CameraCapture } from '@/lib/podcast/camera'
import { attachInputMeter, encodePunchAlignment } from '@/lib/podcast/record-session'
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
  describeIceProgress,
  parseTallyPhase,
  type GuestInvitePublic,
  type GuestTallyPhase,
} from '@/lib/podcast/guest-types'
import {
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
  estimateOneWayLatency,
  iceFailedHint,
  loadStudioIceServers,
  type StudioIceConfig,
  makeOffer,
  remoteAudioByRole,
  restartIceOffer,
} from '@/lib/podcast/webrtc'

type Phase = 'loading' | 'blocked' | 'lobby' | 'booth'

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
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
  const [phase, setPhase] = useState<Phase>(initialError ? 'blocked' : initialSession ? 'lobby' : 'loading')
  const [session, setSession] = useState<GuestInvitePublic | null>(initialSession || null)
  const [error, setError] = useState<string | null>(initialError || null)
  const [name, setName] = useState('')
  const [phones, setPhones] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState('')
  const [camId, setCamId] = useState('')
  const [camOn, setCamOn] = useState(false)
  const [camStream, setCamStream] = useState<MediaStream | null>(null)
  const [camLocked, setCamLocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [muteLocked, setMuteLocked] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [peak, setPeak] = useState(0)
  const [clip, setClip] = useState(false)
  const [hostPeak, setHostPeak] = useState(0)
  const [ice, setIce] = useState<RTCIceConnectionState | ''>('')
  const [captureFlowing, setCaptureFlowing] = useState<boolean | null>(null)
  const [recording, setRecording] = useState(false)
  const [tally, setTally] = useState<GuestTallyPhase>('waiting')
  const [talkback, setTalkback] = useState(false)
  const [cueOn, setCueOn] = useState(false)
  const [cueLive, setCueLive] = useState(false)
  const [cueVolume, setCueVolume] = useState(0.85)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [uploadFailed, setUploadFailed] = useState(false)
  const [backupUrl, setBackupUrl] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  // Presentational only: wall-clock of the last successful connect + the elapsed
  // offset frozen at the moment a drop was detected, for the reassuring
  // "disconnected at MM:SS" banner. The reconnect state machine is untouched.
  const [dropAtSec, setDropAtSec] = useState<number | null>(null)
  const connectedAtRef = useRef<number | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const afterRef = useRef(0)
  const captureRef = useRef<LaneCapture | null>(null)
  const captureStartRef = useRef<Promise<LaneCapture> | null>(null)
  // T5 shared punch clock: the wall-clock epoch (ms) at which this guest's local
  // capture actually started, plus the one-way transport latency sampled off the
  // peer at that instant. Reported to the host on the finalized take URL so the
  // host can shift the take onto the same clock as its own punch.
  const captureStartEpochRef = useRef<number | null>(null)
  const captureLatencyRef = useRef<number | null>(null)
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const [turnConfigured, setTurnConfigured] = useState(false)
  const camCaptureRef = useRef<CameraCapture | null>(null)
  const stopMeterRef = useRef<(() => void) | null>(null)
  const stopHostMeterRef = useRef<(() => void) | null>(null)
  const backupUrlRef = useRef<string | null>(null)
  // T4: hold the recorded take(s) in memory until the server `finalize` confirms.
  // A pending item is only cleared once its finalize resolves, so a flaky network
  // (or a page-visible "retry upload") never discards the blob.
  const pendingTakesRef = useRef<{ blob: Blob; kind: 'audio' | 'camera' }[]>([])
  const uploadAbortRef = useRef<AbortController | null>(null)
  const mutedRef = useRef(false)
  const muteLockedRef = useRef(false)
  const camLockedRef = useRef(false)
  const talkbackRef = useRef(false)
  const cueLiveRef = useRef(false)
  const phonesRef = useRef<GuestHeadphoneMix | null>(null)
  const startingPeerRef = useRef(false)
  // Reconnection state machine (T1): a light ICE restart on the existing peer
  // first, a full rebuild only if the restart doesn't recover in time.
  const restartingRef = useRef(false)
  const restartGraceRef = useRef<number | null>(null)
  const restartFallbackRef = useRef<number | null>(null)
  const appliedAnswerRef = useRef<string | null>(null)
  const seenSignalRef = useRef<Set<number>>(new Set())
  const captureTickRef = useRef(0)
  mutedRef.current = muted
  muteLockedRef.current = muteLocked
  camLockedRef.current = camLocked
  talkbackRef.current = talkback
  cueLiveRef.current = cueLive

  useEffect(() => {
    setMounted(true)
    void loadStudioIceServers().then((cfg) => {
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
    })
  }, [])

  useEffect(() => {
    if (initialError || initialSession) return
    let cancelled = false
    void fetchGuestSession(token)
      .then((data) => {
        if (cancelled) return
        setSession(data)
        if (data.guestName) setName(data.guestName)
        setPhase('lobby')
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
  }, [])

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const list = await navigator.mediaDevices.enumerateDevices()
    setMics(list.filter((d) => d.kind === 'audioinput'))
    setCams(list.filter((d) => d.kind === 'videoinput'))
  }

  async function prepareMic() {
    setError(null)
    stopMeterRef.current?.()
    stopStreams([streamRef.current])
    const stream = await openInputStream(micId || undefined, false)
    streamRef.current = stream
    await refreshDevices()
    stopMeterRef.current = attachInputMeter(stream, (level) => {
      setPeak(level)
      if (level >= 0.98) {
        setClip(true)
        window.setTimeout(() => setClip(false), 1200)
      }
    })
  }

  async function openGuestCamera(deviceId?: string) {
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
    if (camLockedRef.current && !camOn) return
    setError(null)
    try {
      if (camOn) await closeGuestCamera()
      else await openGuestCamera(camId || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access was blocked')
    }
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
      setError(err instanceof Error ? err.message : 'Could not switch camera')
    }
  }

  async function joinBooth() {
    const display = name.trim()
    if (display.length < 2) {
      setError('Enter the name the host should see')
      return
    }
    if (!phones) {
      setError('Confirm you are wearing headphones so the host mix does not loop into your mic')
      return
    }
    setError(null)
    try {
      if (!streamRef.current) await prepareMic()
      if (!phonesRef.current) {
        const mix = createGuestHeadphoneMix()
        mix.setCueVolume(cueVolume)
        phonesRef.current = mix
      }
      const next = await postGuestSession(token, { action: 'join', name: display })
      setSession(next)
      setPhase('booth')
      await startPeer()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
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

  function clearRestartTimers() {
    if (restartGraceRef.current != null) {
      window.clearTimeout(restartGraceRef.current)
      restartGraceRef.current = null
    }
    if (restartFallbackRef.current != null) {
      window.clearTimeout(restartFallbackRef.current)
      restartFallbackRef.current = null
    }
  }

  /**
   * Lighter-weight recovery than a full rebuild: re-offer with an ICE restart on
   * the SAME peer (local tracks stay attached, no new m-lines). The admin
   * re-answers on its existing peer. If ICE hasn't recovered within a few
   * seconds, fall back to `retryPeer()` (full rebuild on the same invite).
   */
  async function attemptIceRestart(peer: RTCPeerConnection) {
    if (restartingRef.current) return
    if (peerRef.current !== peer) return
    restartingRef.current = true
    setReconnecting(true)
    setOk('Reconnecting on this invite…')
    try {
      const offer = await restartIceOffer(peer)
      if (!offer) {
        // Mid-negotiation — can't restart cleanly. Let the fallback rebuild.
        restartingRef.current = false
      } else {
        await pushGuestSignal(token, 'offer', {
          type: offer.type,
          sdp: offer.sdp,
          restart: true,
        }).catch(() => {})
      }
    } catch {
      restartingRef.current = false
    }
    // Arm a single fallback rebuild if the restart doesn't take.
    if (restartFallbackRef.current == null) {
      restartFallbackRef.current = window.setTimeout(() => {
        restartFallbackRef.current = null
        const p = peerRef.current
        const recovered =
          p && (p.iceConnectionState === 'connected' || p.iceConnectionState === 'completed')
        if (!recovered) {
          restartingRef.current = false
          void retryPeer()
        }
      }, 4000)
    }
  }

  async function startPeer() {
    if (startingPeerRef.current) return
    startingPeerRef.current = true
    clearRestartTimers()
    restartingRef.current = false
    appliedAnswerRef.current = null
    try {
      closePeer(peerRef.current, false)
      const cfg = iceCfgRef.current || (await loadStudioIceServers())
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
      const peer = createStudioPeer(cfg.iceServers)
      peerRef.current = peer
      ensureVideoTransceiver(peer, 'sendonly')
      if (streamRef.current) {
        attachLocalAudio(peer, streamRef.current)
        const track = streamRef.current.getAudioTracks()[0]
        if (track) track.enabled = !mutedRef.current
      }
      ensureCueRecvTransceiver(peer)
      if (camStreamRef.current && !camLockedRef.current) attachLocalVideo(peer, camStreamRef.current)
      peer.onicecandidate = (event) => {
        if (event.candidate) void pushGuestSignal(token, 'ice', { candidate: event.candidate.toJSON() })
      }
      peer.ontrack = (event) => {
        if (event.track.kind !== 'audio') return
        const { talk, cue } = remoteAudioByRole(peer)
        const talkLive = talk.getAudioTracks().length ? talk : null
        const cueLiveStream = cue.getAudioTracks().length ? cue : null
        hostStreamRef.current = talkLive || cueLiveStream
        const phones = phonesRef.current
        phones?.attach(talkLive, cueLiveStream)
        phones?.setTalkbackOn(talkbackRef.current)
        phones?.setCueLive(cueLiveRef.current)
        const audio = hostAudioRef.current
        if (audio) {
          audio.srcObject = talkLive || cueLiveStream
          audio.muted = true
          void audio.play().catch(() => {})
        }
        stopHostMeterRef.current?.()
        const meterStream = talkLive || cueLiveStream
        stopHostMeterRef.current = meterStream ? attachInputMeter(meterStream, setHostPeak) : null
      }
      const markLive = () => {
        clearRestartTimers()
        restartingRef.current = false
        const wasDown = connectedAtRef.current == null
        connectedAtRef.current = Date.now()
        setDropAtSec(null)
        void postGuestSession(token, { action: 'connected' }).catch(() => {})
        if (camStreamRef.current && !camLockedRef.current) {
          void pushGuestSignal(token, 'camera', { on: true }).catch(() => {})
        }
        void pushGuestSignal(token, 'mute', { on: mutedRef.current }).catch(() => {})
        setError(null)
        setReconnecting(false)
        if (wasDown) toast({ title: 'Connected to the host booth', tone: 'success' })
      }
      peer.oniceconnectionstatechange = () => {
        setIce(peer.iceConnectionState)
        const state = peer.iceConnectionState
        if (state === 'connected' || state === 'completed') markLive()
        // `disconnected` often self-heals — give it a short grace, then try an ICE
        // restart (keeps local tracks) before any full rebuild.
        if (state === 'disconnected') {
          noteDrop()
          setReconnecting(true)
          if (restartGraceRef.current == null && !restartingRef.current) {
            restartGraceRef.current = window.setTimeout(() => {
              restartGraceRef.current = null
              if (peerRef.current === peer && peer.iceConnectionState === 'disconnected') {
                void attemptIceRestart(peer)
              }
            }, 1200)
          }
        }
        // `failed` won't recover on its own — restart ICE immediately.
        if (state === 'failed') {
          noteDrop()
          setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
          if (peerRef.current === peer) void attemptIceRestart(peer)
        }
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
        }
      }
      const offer = await makeOffer(peer, false)
      if (offer) await pushGuestSignal(token, 'offer', { type: offer.type, sdp: offer.sdp })
    } finally {
      startingPeerRef.current = false
    }
  }

  async function retryPeer() {
    setError(null)
    setReconnecting(true)
    setOk('Reconnecting on this invite…')
    try {
      await startPeer()
    } catch (err) {
      setReconnecting(false)
      setError(err instanceof Error ? err.message : 'Could not reconnect')
    }
  }

  useEffect(() => {
    if (phase !== 'booth') return
    let cancelled = false
    const tick = async () => {
      try {
        const data = await pullGuestSignals(token, afterRef.current)
        if (cancelled) return
        setSession(data.session)
        if (data.session.recording !== recording) setRecording(data.session.recording)
        for (const signal of data.signals) {
          afterRef.current = Math.max(afterRef.current, signal.id)
          // Dedupe: the poll can redeliver a signal across overlapping ticks.
          if (seenSignalRef.current.has(signal.id)) continue
          seenSignalRef.current.add(signal.id)
          if (signal.kind === 'answer' && signal.payload.sdp && peerRef.current) {
            const sdp = String(signal.payload.sdp)
            // Skip a duplicate answer for the offer we already applied.
            if (appliedAnswerRef.current !== sdp) {
              const applied = await applyAnswer(
                peerRef.current,
                signal.payload as unknown as RTCSessionDescriptionInit,
              )
              if (applied) appliedAnswerRef.current = sdp
            }
          }
          if (signal.kind === 'ice' && peerRef.current) {
            await addIce(peerRef.current, (signal.payload.candidate as RTCIceCandidateInit) || null)
          }
          if (signal.kind === 'record') {
            const on = Boolean(signal.payload.on)
            setRecording(on)
            const phase = parseTallyPhase(signal.payload.phase)
            setTally(phase || (on ? 'rec' : 'stopped'))
            if (on) void startLocalTake()
            else void stopLocalTake()
          }
          if (signal.kind === 'tally') {
            const phase = parseTallyPhase(signal.payload.phase)
            if (phase) setTally(phase)
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
            if (Boolean(signal.payload.on)) {
              setCamLocked(false)
            } else {
              setCamLocked(true)
              await closeGuestCamera()
            }
          }
          if (signal.kind === 'reconnect') {
            setOk('Host asked to reconnect')
            void retryPeer()
          }
          if (signal.kind === 'hangup') {
            setError('The host ended this invite')
            setTalkback(false)
            setCueOn(false)
            setCueLive(false)
            cueLiveRef.current = false
            phonesRef.current?.setTalkbackOn(false)
            phonesRef.current?.setCueLive(false)
            setTally('stopped')
            teardown(false)
            setPhase('blocked')
          }
        }
      } catch (err) {
        if ((err as Error).message?.includes('revoked') || (err as Error).message?.includes('expired')) {
          setError((err as Error).message)
          setPhase('blocked')
        }
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 900)
    const beat = window.setInterval(() => {
      void postGuestSession(token, { action: 'heartbeat' }).catch(() => {})
    }, 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.clearInterval(beat)
    }
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

  // Recording watchdog: surface whether capture samples are actually flowing so a
  // silently-failed recorder is visible instead of a false "recording" badge.
  //
  // INTEGRATION POINT (capture engineer): the authoritative signal is a
  // sample/chunk tick from the capture engine (LaneCapture). Until that value is
  // exposed, this proxies flow from the live capturing MediaRecorder (state +
  // its `ondataavailable` bump via captureTickRef) and the mic track health.
  // Wire the real tick into captureTickRef.current to make this exact.
  useEffect(() => {
    if (!recording) {
      setCaptureFlowing(null)
      return
    }
    let lastTick = captureTickRef.current
    const evaluate = () => {
      const capture = captureRef.current
      const track = streamRef.current?.getAudioTracks()[0]
      const micLive = Boolean(track && track.readyState === 'live' && !track.muted)
      const recorder = capture?.recorder ?? null
      // MediaRecorder path: `ondataavailable` bumps captureTickRef; compare it.
      const recorderFlowing = recorder
        ? recorder.state === 'recording' && captureTickRef.current !== lastTick
        : capture?.kind === 'worklet'
          ? micLive
          : null
      lastTick = captureTickRef.current
      if (!capture) {
        // Recording flagged but no local capture started yet — treat as pending.
        setCaptureFlowing(null)
        return
      }
      setCaptureFlowing(recorderFlowing == null ? micLive : recorderFlowing && micLive)
    }
    evaluate()
    const id = window.setInterval(evaluate, 1500)
    return () => window.clearInterval(id)
  }, [recording])

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
  }, [phase])

  async function startLocalTake() {
    const stream = streamRef.current
    if (stream && !captureRef.current && !captureStartRef.current) {
      // T5: stamp the shared-punch clock at the instant capture is triggered by
      // the host's record-on, and sample one-way transport latency off the peer.
      // Both ride the finalized take URL to the host; a failed sample just yields
      // null and the host falls back to placing the take at the raw punch point.
      captureStartEpochRef.current = Date.now()
      void estimateOneWayLatency(peerRef.current)
        .then((latency) => {
          captureLatencyRef.current = latency
        })
        .catch(() => {
          captureLatencyRef.current = null
        })
      captureStartRef.current = startLaneCapture('guest', stream)
      captureRef.current = await captureStartRef.current
      captureStartRef.current = null
      // Non-invasive flow tap for the recording watchdog: bump a tick whenever the
      // MediaRecorder emits a chunk. Chained after the engine's own handler so we
      // don't disturb capture. Worklet captures have no recorder — the watchdog
      // falls back to mic-track health for those.
      const recorder = captureRef.current?.recorder
      if (recorder) {
        const prior = recorder.ondataavailable
        recorder.ondataavailable = (event) => {
          if (event.data?.size) captureTickRef.current += 1
          prior?.call(recorder, event)
        }
      }
    }
    const cam = camStreamRef.current
    if (cam && !camCaptureRef.current) {
      camCaptureRef.current = startCameraCapture('guest', cam)
    }
    setOk(
      cam
        ? 'Recording on this computer (audio + camera backup) — keep this tab open'
        : 'Recording on this computer — keep this tab open',
    )
  }

  /**
   * Upload one recorded blob with bounded retry + signed-URL refresh (T4).
   * The blob is NOT released here — it stays in `pendingTakesRef` until this
   * resolves (i.e. the server `finalize` confirmed). On failure it throws and
   * the blob is left in place for a manual "Retry upload".
   */
  async function uploadBlob(blob: Blob, kind: 'audio' | 'camera') {
    if (blob.size < 64) return false
    const mime = blob.type || (kind === 'camera' ? 'video/webm' : recorderMime() || 'audio/webm')
    await resilientUpload(blob, mime, {
      // Refresh = re-request a fresh signed URL from the take route. Called on the
      // first attempt and whenever the current URL is rejected/expired (403).
      refreshSignedUrl: async (): Promise<SignedTarget> => {
        const signed = await requestGuestTakeUpload(token, mime, blob.size, kind)
        return { signedUrl: signed.signedUrl, path: signed.path, publicUrl: signed.publicUrl }
      },
      // Only after finalize resolves is the take considered safely delivered.
      finalize: async (target) => {
        // T5: ride the guest's capture-start epoch + one-way latency to the host
        // on the audio take URL (the camera take inherits the same clock via its
        // syncGroup). The PUT validates `path`, not the URL fragment, so this is
        // stored verbatim and parsed back off when the host lays the take.
        const stampedUrl =
          kind === 'audio' && captureStartEpochRef.current != null
            ? encodePunchAlignment(target.publicUrl, {
                guestCaptureEpochMs: captureStartEpochRef.current,
                oneWayLatencySec: captureLatencyRef.current,
              })
            : target.publicUrl
        await finalizeGuestTake(token, target.path, stampedUrl, mime, kind)
      },
      onProgress: (fraction) => setUploadProgress(fraction),
      onStatus: (message) => setUploadStatus(message),
      signal: uploadAbortRef.current?.signal,
    })
    return true
  }

  /**
   * Send everything still pending (each take is removed only after its own upload
   * + finalize succeed). Used by `stopLocalTake` and the "Retry upload" button.
   */
  async function flushPendingTakes() {
    if (!pendingTakesRef.current.length) return
    if (!uploadAbortRef.current || uploadAbortRef.current.signal.aborted) {
      uploadAbortRef.current = new AbortController()
    }
    setUploading(true)
    setUploadFailed(false)
    setError(null)
    try {
      // Iterate over a snapshot; drop each item from the ref only on its success.
      for (const item of [...pendingTakesRef.current]) {
        setUploadProgress(0)
        await uploadBlob(item.blob, item.kind)
        pendingTakesRef.current = pendingTakesRef.current.filter((p) => p !== item)
      }
      setUploadStatus(null)
      setUploadProgress(0)
      setOk(
        backupUrlRef.current
          ? 'Take + camera backup sent to the host. You can also download the camera file.'
          : 'Take sent to the host booth',
      )
      toast({ title: 'Take uploaded to the host', tone: 'success' })
    } catch (err) {
      // Blob(s) remain in pendingTakesRef — nothing was discarded.
      setUploadFailed(true)
      setUploadStatus(null)
      setError(
        err instanceof Error
          ? `${err.message}. Your take is saved on this device — tap “Retry upload”.`
          : 'Upload failed. Your take is saved — tap “Retry upload”.',
      )
      toast({
        title: 'Upload paused',
        description: 'Your take is saved on this device — tap Retry upload.',
        tone: 'error',
      })
    } finally {
      setUploading(false)
    }
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
    setUploadStatus('Preparing take…')
    let audioBlob: Blob | null = null
    let camBlob: Blob | null = null
    try {
      audioBlob = capture ? await capture.done : null
      camBlob = camCapture ? await camCapture.done.catch(() => new Blob()) : null
    } catch (err) {
      setUploading(false)
      setError(err instanceof Error ? err.message : 'Could not finish the recording')
      return
    }
    // Camera-backup download fallback stays intact: always mint a local object URL
    // for the camera take so the guest can download it even if upload fails.
    if (camBlob && camBlob.size >= 64) {
      if (backupUrlRef.current) URL.revokeObjectURL(backupUrlRef.current)
      const url = URL.createObjectURL(camBlob)
      backupUrlRef.current = url
      setBackupUrl(url)
    }
    // Stage blobs as pending BEFORE any network work. They are held in memory
    // until each one's finalize confirms, so a mid-upload network kill can never
    // discard the take — it stays queued for retry.
    const staged: { blob: Blob; kind: 'audio' | 'camera' }[] = []
    if (audioBlob && audioBlob.size >= 64) staged.push({ blob: audioBlob, kind: 'audio' })
    if (camBlob && camBlob.size >= 64) staged.push({ blob: camBlob, kind: 'camera' })
    pendingTakesRef.current = [...pendingTakesRef.current, ...staged]
    await flushPendingTakes()
  }

  function teardown(stopMic: boolean) {
    clearRestartTimers()
    restartingRef.current = false
    // Abort any in-flight upload XHR. The pending blob(s) stay in pendingTakesRef
    // so nothing is discarded; if the session is truly over the ref is GC'd, but
    // the camera-backup download URL survives for manual recovery.
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
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
    if (stopMic) {
      stopStreams([streamRef.current, camStreamRef.current])
      streamRef.current = null
      camStreamRef.current = null
      setCamStream(null)
      setCamOn(false)
    }
    phonesRef.current?.stop()
    phonesRef.current = null
    if (hostAudioRef.current) hostAudioRef.current.srcObject = null
  }

  async function leave() {
    try {
      await pushGuestSignal(token, 'hangup', {})
      await postGuestSession(token, { action: 'leave' })
    } catch {
      /* still leave */
    }
    teardown(true)
    setPhase('blocked')
    setError('You left the booth')
  }

  const presence = describeGuestSession({
    side: 'guest',
    hasInvite: Boolean(session),
    state: session?.state,
    ice,
    recording,
  })
  const tallyUi = describeGuestTally(tally)
  const conn = describeIceProgress(ice, { reconnecting })
  const connToneClass =
    conn.tone === 'live'
      ? 'text-lane-cohost-2'
      : conn.tone === 'fail'
        ? 'text-heart'
        : conn.tone === 'warn'
          ? 'text-lane-cohost-1'
          : 'text-silver'
  const canRetry = presence.phase === 'failed' || presence.phase === 'dropped'
  const showDropBanner = phase === 'booth' && (canRetry || dropAtSec != null)
  const tallyToneClass =
    tallyUi.tone === 'rec'
      ? 'border-heart/70 bg-heart/10'
      : tallyUi.tone === 'wait'
        ? 'border-lane-cohost-1/70 bg-lane-cohost-1/10'
        : 'border-divider bg-surface'
  const tallyLabelTone =
    tallyUi.tone === 'rec' ? 'text-heart' : tallyUi.tone === 'wait' ? 'text-lane-cohost-1' : 'text-silver'
  const labelTone =
    presence.tone === 'live'
      ? 'text-lane-cohost-2'
      : presence.tone === 'rec' || presence.tone === 'fail'
        ? 'text-heart'
        : presence.tone === 'wait' || presence.tone === 'warn'
          ? 'text-lane-cohost-1'
          : 'text-silver'

  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-obsidian text-white">
      <audio ref={hostAudioRef} autoPlay playsInline muted className="hidden" />
      <div className="mx-auto min-h-full max-w-xl space-y-5 px-4 py-8">
        <header className="border-b border-divider pb-4">
          <p className="studio-type-label text-ice">Forged in the Fire · Guest booth</p>
          <h1 className="mt-1 text-xl font-medium">{session?.episodeTitle || 'Production room'}</h1>
          <p className="studio-type-body mt-1 text-silver">
            Mic, camera, mute, and a local backup. The host owns Record, talkback, cue mix, punch, FX, and export.
          </p>
        </header>

        {phase === 'loading' && <p className="studio-type-body text-silver">Checking invite…</p>}

        {phase === 'blocked' && (
          <div className="rounded-panel border border-heart/50 bg-heart/10 p-4">
            <p className="studio-type-body inline-flex items-start gap-2 text-heart">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error || 'This invite is closed'}</span>
            </p>
          </div>
        )}

        {phase === 'lobby' && (
          <div className="space-y-4 rounded-panel border border-divider bg-surface p-4">
            <p className="studio-type-label text-ice">Green room</p>
            {!turnConfigured && (
              <div className="rounded-panel border border-lane-cohost-1/50 bg-lane-cohost-1/10 px-3 py-2">
                <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-lane-cohost-1">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Relay server isn’t configured for this booth. If you can’t connect from your
                    current network, join from a phone hotspot.
                  </span>
                </p>
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="studio-type-label normal-case tracking-normal text-silver">Display name</span>
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-control border border-divider bg-surface-raised px-3 py-2 text-white"
                placeholder="How the host should see you"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="studio-type-label normal-case tracking-normal text-silver">Microphone</span>
              <select
                value={micId}
                onChange={(e) => {
                  setMicId(e.target.value)
                  void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))
                }}
                onFocus={() => {
                  if (!streamRef.current) void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))
                }}
                className="w-full rounded-control border border-divider bg-surface-raised px-3 py-2 text-silver-body"
              >
                <option value="">Default</option>
                {mics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || 'Microphone'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="studio-type-label normal-case tracking-normal text-silver">Camera</span>
              <select
                value={camId}
                disabled={recording}
                onChange={(e) => void changeCameraDevice(e.target.value)}
                className="w-full rounded-control border border-divider bg-surface-raised px-3 py-2 text-silver-body"
              >
                <option value="">Default camera</option>
                {cams.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || 'Camera'}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="touch"
                onClick={() => void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))}
              >
                <Mic2 size={14} /> Test microphone
              </Button>
              <Button
                variant={camOn ? 'primary' : 'secondary'}
                size="touch"
                onClick={() => void toggleCamera()}
              >
                {camOn ? <Video size={14} /> : <VideoOff size={14} />}
                {camOn ? 'Cam on' : 'Test camera'}
              </Button>
            </div>
            {camStream && <CameraPreview stream={camStream} label="You · self-view" />}
            <Meter label="You" peak={peak} clip={clip} />
            <label className="studio-type-body flex items-start gap-2 text-silver-body">
              <input type="checkbox" checked={phones} onChange={(e) => setPhones(e.target.checked)} className="mt-1" />
              <span className="flex gap-2">
                <Headphones size={16} className="mt-0.5 shrink-0 text-ice" />
                I am wearing headphones. Talkback and the host mix will leak into your take if you use speakers.
              </span>
            </label>
            <Button
              variant="primary"
              size="touch"
              onClick={() => void joinBooth()}
              className="w-full"
            >
              Join booth
            </Button>
            {session && (
              <p className="studio-type-label normal-case tracking-normal text-silver">
                Link expires {mounted ? new Date(session.expiresAt).toLocaleString() : session.expiresAt}. Camera is
                ~720p. Host still punches Record.
              </p>
            )}
          </div>
        )}

        {phase === 'booth' && (
          <div className="space-y-4">
            <div className={`flex items-center justify-between gap-3 rounded-panel border px-4 py-3 ${tallyToneClass}`}>
              <div>
                <p className={`studio-type-body font-medium ${tallyLabelTone}`}>{tallyUi.label}</p>
                <p className={`studio-type-label mt-0.5 normal-case tracking-normal ${labelTone}`}>{presence.label}</p>
                <p className="studio-type-label mt-0.5 normal-case tracking-normal text-silver">
                  {tally === 'count-in'
                    ? 'Count-in — stay ready. Host still owns Record.'
                    : tally === 'rec'
                      ? 'Host is rolling. Keep this tab open for the local backup.'
                      : tally === 'stopped'
                        ? 'Record stopped. Wait for the host.'
                        : 'Waiting for the host to record. You do not punch Record from here.'}
                </p>
              </div>
              <p className={`studio-type-timecode shrink-0 ${connToneClass}`}>{conn.label}</p>
            </div>
            {recording && captureFlowing === false && (
              <div className="rounded-panel border border-heart/70 bg-heart/10 px-4 py-2.5">
                <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-heart">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Local backup may not be recording — no samples detected. Check the mic isn’t muted
                    or unplugged and keep this tab focused. Your take could be silent.
                  </span>
                </p>
              </div>
            )}
            {recording && captureFlowing === true && (
              <p className="studio-type-label inline-flex items-center gap-1.5 normal-case tracking-normal text-lane-cohost-2">
                <ShieldCheck size={13} className="shrink-0" />
                Local backup capturing — samples flowing.
              </p>
            )}
            {/* Guest-drop recovery — prominent + reassuring. Retry reuses the same
                invite (ICE restart / rebuild), no new link. */}
            {showDropBanner && (
              <div className="space-y-2.5 rounded-panel border border-heart/60 bg-heart/10 p-4">
                <div className="flex items-start gap-2.5">
                  <WifiOff size={18} className="mt-0.5 shrink-0 text-heart" />
                  <div className="space-y-1">
                    <p className="studio-type-body font-medium text-white">
                      {dropAtSec != null
                        ? `Disconnected at ${mmss(dropAtSec)} — your audio so far is safe.`
                        : 'Disconnected — your audio so far is safe.'}
                    </p>
                    <p className="studio-type-label normal-case tracking-normal text-silver-body">
                      {iceFailedHint(turnConfigured)}
                    </p>
                    <p className="studio-type-label inline-flex items-center gap-1.5 normal-case tracking-normal text-silver-body">
                      <ShieldCheck size={13} className="shrink-0 text-lane-cohost-2" />
                      Reconnecting auto-syncs on the same invite — no new link. Keep this tab open; your
                      local camera backup still uploads.
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="compact"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                >
                  <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry'}
                </Button>
              </div>
            )}

            <div className="space-y-3 rounded-panel border border-divider bg-surface-sunken p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="studio-type-body text-white">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-lane-cohost-2" />
                  {name || 'Guest'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={camOn && !camLocked ? 'primary' : 'secondary'}
                    size="compact"
                    disabled={recording || (camLocked && !camOn)}
                    onClick={() => void toggleCamera()}
                    className={camLocked ? 'border-heart/50 text-heart' : undefined}
                  >
                    {camOn ? <Video size={14} /> : <VideoOff size={14} />}
                    {camLocked ? 'Host cam off' : camOn ? 'Cam on' : 'Cam'}
                  </Button>
                  <Button
                    variant={muted ? 'danger' : 'secondary'}
                    size="compact"
                    disabled={muteLocked}
                    onClick={() => toggleMute()}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {muteLocked ? 'Host muted you' : muted ? 'Muted' : 'Mute'}
                  </Button>
                </div>
              </div>
              {(muteLocked || camLocked) && (
                <p className="studio-type-label normal-case tracking-normal text-lane-cohost-1">
                  {muteLocked && camLocked
                    ? 'Host muted you and turned the camera off. You cannot override until they unmute or allow camera.'
                    : muteLocked
                      ? 'Host muted you. Wait for them to unmute — you cannot unmute from here.'
                      : 'Host turned your camera off. Wait for them to allow camera.'}
                </p>
              )}
              {camOn && (
                <select
                  value={camId}
                  disabled={recording || camLocked}
                  onChange={(e) => void changeCameraDevice(e.target.value)}
                  className="w-full rounded-control border border-divider bg-surface-raised px-3 py-2 text-sm text-silver-body"
                >
                  <option value="">Default camera</option>
                  {cams.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || 'Camera'}
                    </option>
                  ))}
                </select>
              )}
              {camStream && <CameraPreview stream={camStream} label="You · self-view" live={recording} />}
              <Meter label="You" peak={muted ? 0 : peak} clip={clip} />
              <p className="studio-type-label normal-case tracking-normal text-silver">
                Self-view only. Host sees your camera on their Guest card if the peer is up. ~720p cap.
              </p>
            </div>

            <div className="space-y-3 rounded-panel border border-divider bg-surface-sunken p-4">
              <p className="studio-type-body text-white">
                <span
                  className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                    talkback ? 'bg-forged' : 'bg-divider'
                  }`}
                />
                Host{talkback ? ' · talkback' : ''}
              </p>
              <Meter label="Host" peak={talkback ? hostPeak : 0} clip={false} />
              <p className="studio-type-label normal-case tracking-normal text-silver">
                {talkback
                  ? 'Host talkback is in your headphones. It is not recorded on your take.'
                  : 'Talkback is off. You will hear the host when they toggle Talkback — not when they hit Record.'}
              </p>
            </div>

            <div
              className={`space-y-3 rounded-panel border p-4 ${
                cueLive
                  ? 'border-forged/50 bg-forged/5'
                  : 'border-divider bg-surface-sunken'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="studio-type-body text-white">
                  <span
                    className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                      cueLive ? 'bg-forged' : cueOn ? 'bg-lane-cohost-1' : 'bg-divider'
                    }`}
                  />
                  Cue{cueLive ? ' · live' : cueOn ? ' · standing by' : ''}
                </p>
                {cueLive && (
                  <span className="studio-type-timecode inline-flex items-center gap-1 text-ice">
                    <Music2 size={12} /> LIVE
                  </span>
                )}
              </div>
              <label className="studio-type-body flex items-center gap-3 text-silver">
                Volume {cueVolume.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cueVolume}
                  onChange={(e) => setCueVolume(Number(e.target.value))}
                  className="flex-1 accent-forged"
                />
              </label>
              <p className="studio-type-label flex items-start gap-2 normal-case tracking-normal text-silver">
                <Headphones size={14} className="mt-0.5 shrink-0 text-ice" />
                <span>
                  {cueLive
                    ? 'Program mix is in your headphones — other lanes, beds, SFX. It is not recorded on your take. Keep phones on so it does not leak into your mic.'
                    : cueOn
                      ? 'Cue is armed. You will hear the mix when the host plays or records it. Headphones only.'
                      : 'Cue is off. When the host sends the program mix it will appear here. Wear headphones so speakers do not loop into your take.'}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canRetry && (
                <Button
                  variant="secondary"
                  size="touch"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                >
                  <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry'}
                </Button>
              )}
              <Button variant="danger" size="touch" onClick={() => void leave()}>
                <PhoneOff size={14} /> Leave
              </Button>
              {/* When there's nothing wrong with the upload, keep the camera-backup
                  download here; on failure it moves into the prominent card below. */}
              {backupUrl && !uploadFailed && (
                <a
                  href={backupUrl}
                  download="guest-camera.webm"
                  className="studio-type-button inline-flex h-control-touch select-none items-center gap-2 rounded-control border border-divider bg-surface-raised px-4 text-white shadow-inset-top transition-colors duration-150 ease-calm hover:border-forged/60"
                >
                  <Download size={14} /> Download camera take
                </a>
              )}
            </div>

            {/* Upload-failure prominence: a clear, reassuring card with Retry +
                Download backup. The resilient-upload retry logic is unchanged. */}
            {uploadFailed && !uploading && (
              <div className="space-y-3 rounded-panel border border-heart/60 bg-heart/10 p-4">
                <div className="flex items-start gap-2.5">
                  <UploadCloud size={18} className="mt-0.5 shrink-0 text-heart" />
                  <div className="space-y-1">
                    <p className="studio-type-body font-medium text-white">
                      Take not uploaded yet — it’s saved on this device.
                    </p>
                    <p className="studio-type-label normal-case tracking-normal text-silver-body">
                      The take is held in memory until the host confirms it, and it also survives as
                      the downloadable camera backup. Reconnect and tap Retry upload — nothing is lost.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="touch" onClick={() => void flushPendingTakes()}>
                    <RefreshCw size={14} /> Retry upload
                  </Button>
                  {backupUrl && (
                    <a
                      href={backupUrl}
                      download="guest-camera.webm"
                      className="studio-type-button inline-flex h-control-touch select-none items-center gap-2 rounded-control border border-divider bg-surface-raised px-4 text-white shadow-inset-top transition-colors duration-150 ease-calm hover:border-forged/60"
                    >
                      <Download size={14} /> Download backup
                    </a>
                  )}
                </div>
              </div>
            )}

            {(uploading || uploadFailed) && (
              <div className="space-y-2 rounded-panel border border-divider bg-surface-sunken p-4">
                <div className="flex items-center justify-between">
                  <span className={`studio-type-label normal-case tracking-normal ${uploadFailed ? 'text-heart' : 'text-ice'}`}>
                    {uploadFailed ? 'Upload paused — your take is saved on this device' : uploadStatus || 'Uploading take…'}
                  </span>
                  <span className="studio-type-timecode text-silver">{Math.round(uploadProgress * 100)}%</span>
                </div>
                {/* Distinct paused/failed (heart red) vs uploading (forged blue). */}
                <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className={`h-full transition-[width] duration-150 ease-calm ${uploadFailed ? 'bg-heart' : 'bg-forged'}`}
                    style={{ width: `${Math.min(100, uploadProgress * 100)}%` }}
                  />
                </div>
                <p className="studio-type-label normal-case tracking-normal text-silver">
                  {uploadFailed
                    ? 'Reconnect and tap Retry upload above. The take also survives as the downloadable camera backup.'
                    : 'Keep this tab open. If the network drops the upload retries automatically and resumes when you’re back online.'}
                </p>
              </div>
            )}
          </div>
        )}

        {ok && <p className="studio-type-body text-ice">{ok}</p>}
        {error && phase !== 'blocked' && !showDropBanner && !uploadFailed && (
          <div className="rounded-control border border-heart/50 bg-heart/10 px-3 py-2">
            <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-heart">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          </div>
        )}
      </div>
    </div>
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
      <span className={`studio-type-timecode ${clip ? 'text-heart' : 'text-silver'}`}>
        {clip ? 'CLIP' : 'live'}
      </span>
    </div>
  )
}
