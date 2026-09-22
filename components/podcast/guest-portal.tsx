'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Headphones, Mic2, PhoneOff, RefreshCw, Video, VideoOff, Volume2, VolumeX } from 'lucide-react'
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
import { describeGuestSession, type GuestInvitePublic } from '@/lib/podcast/guest-types'
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
  ensureVideoTransceiver,
  iceFailedHint,
  loadStudioIceServers,
  type StudioIceConfig,
  makeOffer,
} from '@/lib/podcast/webrtc'

type Phase = 'loading' | 'blocked' | 'lobby' | 'booth'

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
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [backupUrl, setBackupUrl] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const hostStreamRef = useRef<MediaStream | null>(null)
  const hostAudioRef = useRef<HTMLAudioElement | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const afterRef = useRef(0)
  const captureRef = useRef<LaneCapture | null>(null)
  const captureStartRef = useRef<Promise<LaneCapture> | null>(null)
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const [turnConfigured, setTurnConfigured] = useState(false)
  const camCaptureRef = useRef<CameraCapture | null>(null)
  const stopMeterRef = useRef<(() => void) | null>(null)
  const stopHostMeterRef = useRef<(() => void) | null>(null)
  const backupUrlRef = useRef<string | null>(null)
  const mutedRef = useRef(false)
  const muteLockedRef = useRef(false)
  const camLockedRef = useRef(false)
  const startingPeerRef = useRef(false)
  mutedRef.current = muted
  muteLockedRef.current = muteLocked
  camLockedRef.current = camLocked

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
      const next = await postGuestSession(token, { action: 'join', name: display })
      setSession(next)
      setPhase('booth')
      await startPeer()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    }
  }

  async function startPeer() {
    if (startingPeerRef.current) return
    startingPeerRef.current = true
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
      if (camStreamRef.current && !camLockedRef.current) attachLocalVideo(peer, camStreamRef.current)
      peer.onicecandidate = (event) => {
        if (event.candidate) void pushGuestSignal(token, 'ice', { candidate: event.candidate.toJSON() })
      }
      peer.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track])
        hostStreamRef.current = stream
        const audio = hostAudioRef.current
        if (audio) {
          audio.srcObject = stream
          void audio.play().catch(() => {})
        }
        stopHostMeterRef.current?.()
        stopHostMeterRef.current = attachInputMeter(stream, setHostPeak)
      }
      const markLive = () => {
        void postGuestSession(token, { action: 'connected' }).catch(() => {})
        if (camStreamRef.current && !camLockedRef.current) {
          void pushGuestSignal(token, 'camera', { on: true }).catch(() => {})
        }
        void pushGuestSignal(token, 'mute', { on: mutedRef.current }).catch(() => {})
        setError(null)
        setReconnecting(false)
      }
      peer.oniceconnectionstatechange = () => {
        setIce(peer.iceConnectionState)
        if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') markLive()
        if (peer.iceConnectionState === 'failed') {
          setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
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
          if (signal.kind === 'answer' && signal.payload.sdp && peerRef.current) {
            await applyAnswer(peerRef.current, signal.payload as unknown as RTCSessionDescriptionInit)
          }
          if (signal.kind === 'ice' && peerRef.current) {
            await addIce(peerRef.current, (signal.payload.candidate as RTCIceCandidateInit) || null)
          }
          if (signal.kind === 'record') {
            const on = Boolean(signal.payload.on)
            setRecording(on)
            if (on) void startLocalTake()
            else void stopLocalTake()
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

  async function startLocalTake() {
    const stream = streamRef.current
    if (stream && !captureRef.current && !captureStartRef.current) {
      captureStartRef.current = startLaneCapture('guest', stream)
      captureRef.current = await captureStartRef.current
      captureStartRef.current = null
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

  async function uploadBlob(blob: Blob, kind: 'audio' | 'camera', filename: string) {
    if (blob.size < 64) return false
    const mime = blob.type || (kind === 'camera' ? 'video/webm' : recorderMime() || 'audio/webm')
    const file = new File([blob], filename, { type: mime })
    const signed = await requestGuestTakeUpload(token, mime, file.size, kind)
    const put = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: file })
    if (!put.ok) throw new Error(kind === 'camera' ? 'Could not upload camera backup' : 'Could not upload your take')
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
          ? 'Take + camera backup sent to the host. You can also download the camera file.'
          : 'Take sent to the host booth',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send take')
    } finally {
      setUploading(false)
    }
  }

  function teardown(stopMic: boolean) {
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
  const iceFailed = presence.phase === 'failed'
  const canRetry = presence.phase === 'failed' || presence.phase === 'dropped'
  const toneClass =
    presence.tone === 'rec'
      ? 'border-red-500/70 bg-[#2A1014]'
      : presence.tone === 'fail'
        ? 'border-[#FF7A9A] bg-[#2A1014]'
        : presence.tone === 'warn'
          ? 'border-[#FFB86B]/70 bg-[#24180C]'
          : presence.tone === 'live'
            ? 'border-[#7CFFB2]/40 bg-[#0C1814]'
            : 'border-[#27313B] bg-[#11161C]'
  const labelTone =
    presence.tone === 'live'
      ? 'text-[#7CFFB2]'
      : presence.tone === 'rec' || presence.tone === 'fail'
        ? 'text-[#FF7A9A]'
        : presence.tone === 'wait' || presence.tone === 'warn'
          ? 'text-[#FFB86B]'
          : 'text-[#A9B8C6]'

  return (
    <div className="fixed inset-0 z-[80] bg-[#0C141C] text-[#F6FAFC] overflow-auto">
      <audio ref={hostAudioRef} autoPlay playsInline className="hidden" />
      <div className="mx-auto max-w-xl min-h-full px-4 py-8 space-y-5">
        <header className="border-b border-[#27313B] pb-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Forged in the Fire · Guest booth</p>
          <h1 className="text-xl font-medium mt-1">{session?.episodeTitle || 'Production room'}</h1>
          <p className="text-sm text-[#A9B8C6] mt-1">
            Mic, camera, mute, and a local backup. The host owns Record, punch, FX, and export.
          </p>
        </header>

        {phase === 'loading' && <p className="text-sm text-[#A9B8C6]">Checking invite…</p>}

        {phase === 'blocked' && (
          <div className="rounded-xl border border-[#27313B] bg-[#11161C] p-4 text-sm text-[#FF7A9A]">
            {error || 'This invite is closed'}
          </div>
        )}

        {phase === 'lobby' && (
          <div className="rounded-2xl border border-[#27313B] bg-[#11161C] p-4 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Green room</p>
            <label className="block space-y-1.5">
              <span className="text-xs text-[#A9B8C6]">Display name</span>
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#27313B] bg-[#151B22] px-3 py-2 text-[#F6FAFC]"
                placeholder="How the host should see you"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-[#A9B8C6]">Microphone</span>
              <select
                value={micId}
                onChange={(e) => {
                  setMicId(e.target.value)
                  void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))
                }}
                onFocus={() => {
                  if (!streamRef.current) void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))
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
            <label className="block space-y-1.5">
              <span className="text-xs text-[#A9B8C6]">Camera</span>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void prepareMic().catch((err) => setError(err instanceof Error ? err.message : 'Mic blocked'))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
              >
                <Mic2 size={14} /> Test microphone
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
                  camOn ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'
                }`}
              >
                {camOn ? <Video size={14} /> : <VideoOff size={14} />}
                {camOn ? 'Cam on' : 'Test camera'}
              </button>
            </div>
            {camStream && <CameraPreview stream={camStream} label="You · self-view" />}
            <Meter label="You" peak={peak} clip={clip} />
            <label className="flex items-start gap-2 text-sm text-[#B8C4CF]">
              <input type="checkbox" checked={phones} onChange={(e) => setPhones(e.target.checked)} className="mt-1" />
              <span className="flex gap-2">
                <Headphones size={16} className="text-[#8DEBFF] shrink-0 mt-0.5" />
                I am wearing headphones. Speakers will echo into the recording.
              </span>
            </label>
            <button
              type="button"
              onClick={() => void joinBooth()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium"
            >
              Join booth
            </button>
            {session && (
              <p className="text-[11px] text-[#7C8B97]">
                Link expires {mounted ? new Date(session.expiresAt).toLocaleString() : session.expiresAt}. Camera is
                ~720p. Host still punches Record.
              </p>
            )}
          </div>
        )}

        {phase === 'booth' && (
          <div className="space-y-4">
            <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${toneClass}`}>
              <div>
                <p className={`text-sm font-medium ${labelTone}`}>{presence.label}</p>
                <p className="text-[11px] text-[#7C8B97] mt-0.5">
                  {recording ? 'Host Record is on. Keep this tab open.' : 'Host still owns Record, punch, and export.'}
                </p>
              </div>
              <p className="text-[11px] font-mono text-[#A9B8C6] shrink-0">{ice || 'waiting'}</p>
            </div>
            {(iceFailed || presence.phase === 'dropped') && (
              <div className="rounded-xl border border-[#FF7A9A]/70 bg-[#2A1014] px-4 py-3 text-sm text-[#FFB3C3] space-y-2">
                <p>{iceFailedHint(turnConfigured)}</p>
                <p className="text-[11px] text-[#A9B8C6]">
                  Same invite — no new link. Keep this tab open. When the host punches Record your
                  local camera backup still uploads.
                </p>
                <button
                  type="button"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
                >
                  <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry connection'}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 bg-[#7CFFB2]" />
                  {name || 'Guest'}
                </p>
                <div className="flex flex-wrap gap-2">
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
                    {camLocked ? 'Host cam off' : camOn ? 'Cam on' : 'Cam'}
                  </button>
                  <button
                    type="button"
                    disabled={muteLocked}
                    onClick={() => toggleMute()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                      muted ? 'bg-red-500/90 text-white' : 'border border-[#27313B] text-[#B8C4CF]'
                    }`}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {muteLocked ? 'Host muted you' : muted ? 'Muted' : 'Mute'}
                  </button>
                </div>
              </div>
              {(muteLocked || camLocked) && (
                <p className="text-[11px] text-[#FFB86B]">
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
              {camStream && <CameraPreview stream={camStream} label="You · self-view" live={recording} />}
              <Meter label="You" peak={muted ? 0 : peak} clip={clip} />
              <p className="text-[11px] text-[#7C8B97]">
                Self-view only. Host sees your camera on their Guest card if the peer is up. ~720p cap.
              </p>
            </div>

            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-4 space-y-3">
              <p className="text-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 bg-[#53D6FF]" />
                Host
              </p>
              <Meter label="Host" peak={hostPeak} clip={false} />
              <p className="text-[11px] text-[#7C8B97]">
                You hear the host through this tab. They punch Record on their side.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canRetry && (
                <button
                  type="button"
                  disabled={reconnecting}
                  onClick={() => void retryPeer()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40"
                >
                  <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry'}
                </button>
              )}
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
                  <Download size={14} /> Download camera take
                </a>
              )}
              {uploading && <span className="text-xs text-[#FFB86B] self-center">Sending take…</span>}
            </div>
          </div>
        )}

        {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
        {error && phase !== 'blocked' && <p className="text-sm text-[#FF7A9A]">{error}</p>}
      </div>
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
      <span className={`text-xs font-mono ${clip ? 'text-[#FF7A9A]' : 'text-[#A9B8C6]'}`}>
        {clip ? 'CLIP' : 'live'}
      </span>
    </div>
  )
}
