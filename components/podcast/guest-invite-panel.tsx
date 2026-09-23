'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Coffee,
  Copy,
  Headphones,
  Link2,
  MicOff,
  Music2,
  Radio,
  RefreshCw,
  ShieldCheck,
  UserX,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react'
import { openInputStream, stopStreams } from '@/lib/podcast/capture'
import { createHostFallbackSendMix, type HostFallbackSendMix } from '@/lib/podcast/guest-cue'
import {
  GUEST_DURABLE_KINDS,
  describeGuestSession,
  describeGuestTally,
  type GuestInviteAdmin,
  type GuestTallyPhase,
} from '@/lib/podcast/guest-types'
import {
  createAdminInvite,
  fetchInviteConsent,
  listAdminInvites,
  pullAdminSignals,
  pushAdminSignal,
  revokeAdminInvite,
  setAdminInviteState,
  type AdminConsentRecord,
} from '@/lib/podcast/guest-signal'
import {
  addIce,
  answerOffer,
  applyIceServers,
  applyProgramCue,
  applyTalkback,
  closePeer,
  collectRemoteStream,
  createStudioPeer,
  iceConfigStale,
  iceFailedHint,
  iceRefreshDelay,
  loadStudioIceServers,
  programCueSender,
  type StudioIceConfig,
} from '@/lib/podcast/webrtc'
import {
  CONTROL_CHANNEL_LABEL,
  SignalDeduper,
  errorPollDelay,
  nextPollDelay,
  stampControl,
  wireControlChannel,
  type ControlChannel,
} from '@/lib/podcast/guest/control-channel'

type Props = {
  episodeId?: string | null
  recording: boolean
  recTally?: GuestTallyPhase
  hostStream: MediaStream | null
  cueStream?: MediaStream | null
  onCueToGuest?: (on: boolean) => void
  onRemoteStream: (stream: MediaStream | null) => void
  onRemoteVideo?: (live: boolean) => void
  onGuestName: (name: string | null) => void
  onTakeUrl: (url: string | null) => void
  onCameraUrl?: (url: string | null) => void
  /**
   * Host session clock (seconds) where the current recording starts (e.g. the punch-in time).
   * Sent with record-on so the guest backup can be placed on the timeline (startedAtSessionSec).
   */
  recordStartSessionSec?: number | null
  /** Host wall clock (epoch ms) at recordStartSessionSec. Defaults to the moment `recording` turns true. */
  recordStartedAt?: number | null
  /** Live room Safe slate: while true the guest sees "Paused — you're off the recording" and their mic is off. */
  safePause?: boolean
  /** Guest pressed "I need a pause" (requested) or asked to withdraw (withdrawn). */
  onGuestPause?: (state: { requested: boolean; withdrawn: boolean }) => void
}

const TONE_CLASS: Record<string, string> = {
  live: 'text-[#7CFFB2]',
  rec: 'text-[#FF7A9A]',
  wait: 'text-[#FFB86B]',
  warn: 'text-[#FFB86B]',
  fail: 'text-[#FF7A9A]',
  idle: 'text-[#A9B8C6]',
}

const BTN = 'min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm'

export function GuestInvitePanel({
  episodeId,
  recording,
  recTally = 'waiting',
  hostStream,
  cueStream = null,
  onCueToGuest,
  onRemoteStream,
  onRemoteVideo,
  onGuestName,
  onTakeUrl,
  onCameraUrl,
  recordStartSessionSec = null,
  recordStartedAt = null,
  safePause = false,
  onGuestPause,
}: Props) {
  const [hours, setHours] = useState(24)
  const [invites, setInvites] = useState<GuestInviteAdmin[]>([])
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ice, setIce] = useState<RTCIceConnectionState | ''>('')
  const [turnConfigured, setTurnConfigured] = useState(false)
  const [guestMuted, setGuestMuted] = useState(false)
  const [muteLocked, setMuteLocked] = useState(false)
  const [guestCamOn, setGuestCamOn] = useState(false)
  const [camLocked, setCamLocked] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [talkback, setTalkback] = useState(false)
  const [cueToGuest, setCueToGuest] = useState(false)
  const [channelUp, setChannelUp] = useState(false)
  const [guestPauseAsk, setGuestPauseAsk] = useState(false)
  const [guestWithdrew, setGuestWithdrew] = useState(false)
  const [hostPause, setHostPause] = useState(false)
  const [confirming, setConfirming] = useState<null | 'new' | 'revoke'>(null)
  const [consent, setConsent] = useState<AdminConsentRecord | null>(null)
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  /** Generation tag of the guest peer we are answering; drops stale answers/candidates. */
  const peerGenRef = useRef<string | null>(null)
  const afterRef = useRef(0)
  const hostRef = useRef<MediaStream | null>(null)
  const talkbackRef = useRef(false)
  const talkbackMicRef = useRef<MediaStream | null>(null)
  const cueToGuestRef = useRef(false)
  const cueStreamRef = useRef<MediaStream | null>(null)
  const fallbackMixRef = useRef<HostFallbackSendMix | null>(null)
  const controlRef = useRef<ControlChannel | null>(null)
  const dedupeRef = useRef(new SignalDeduper())
  const wakePollRef = useRef<() => void>(() => {})
  const muteLockedRef = useRef(false)
  const camLockedRef = useRef(false)
  const pauseOnRef = useRef(false)
  const safePauseRef = useRef(false)
  /** Clock sent with record-on (kept so a reconnecting guest gets the same start). */
  const recordClockRef = useRef<{ sessionSec: number | null; hostAt: number | null }>({ sessionSec: null, hostAt: null })
  const handleSignalRef = useRef<(inviteId: string, kind: string, payload: Record<string, unknown>) => Promise<void>>(
    async () => {},
  )
  hostRef.current = hostStream
  talkbackRef.current = talkback
  cueToGuestRef.current = cueToGuest
  cueStreamRef.current = cueStream
  muteLockedRef.current = muteLocked
  camLockedRef.current = camLocked
  pauseOnRef.current = hostPause || safePause
  safePauseRef.current = safePause
  const cueLive = cueToGuest && Boolean(cueStream?.getAudioTracks().some((t) => t.readyState === 'live'))
  const liveId = invites.find((i) => !i.revoked && !i.expired)?.id || null
  const live = invites.find((i) => i.id === liveId) || null
  const tally = describeGuestTally(recTally)
  const guestName = live?.guestName || 'The guest'

  useEffect(() => {
    void loadStudioIceServers().then((cfg) => {
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
    })
  }, [])

  // Refresh short-lived TURN credentials on the live peer before they lapse.
  useEffect(() => {
    let timer: number | null = null
    let cancelled = false
    const schedule = () => {
      const cfg = iceCfgRef.current
      timer = window.setTimeout(async () => {
        const next = await loadStudioIceServers()
        if (cancelled) return
        iceCfgRef.current = next
        setTurnConfigured(next.turnConfigured)
        applyIceServers(peerRef.current, next)
        schedule()
      }, cfg ? iceRefreshDelay(cfg) : 5 * 60_000)
    }
    schedule()
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  async function readyIce() {
    if (iceCfgRef.current && !iceConfigStale(iceCfgRef.current)) return iceCfgRef.current
    const cfg = await loadStudioIceServers()
    iceCfgRef.current = cfg
    setTurnConfigured(cfg.turnConfigured)
    applyIceServers(peerRef.current, cfg)
    return cfg
  }

  useEffect(() => {
    if (!episodeId) return
    let cancelled = false
    void listAdminInvites(episodeId)
      .then((data) => {
        if (!cancelled) setInvites(data.invites)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load invites')
      })
    return () => {
      cancelled = true
    }
  }, [episodeId])

  useEffect(() => {
    onGuestName(live?.guestName || null)
    onTakeUrl(live?.takeUrl || null)
    onCameraUrl?.(live?.cameraUrl || null)
  }, [live?.guestName, live?.takeUrl, live?.cameraUrl, onGuestName, onTakeUrl, onCameraUrl])

  // Consent choices (voice/face/name/final cut) the host must honour, once the guest has joined.
  const consentKey = `${liveId || ''}|${live?.consentAt || ''}|${live?.state === 'pending' ? 'p' : 'j'}`
  useEffect(() => {
    if (!liveId || live?.state === 'pending') {
      setConsent(null)
      return
    }
    let cancelled = false
    void fetchInviteConsent(liveId)
      .then((data) => {
        if (!cancelled) setConsent(data.consents[0] || null)
      })
      .catch(() => {
        /* older DB: consent v2 not applied */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentKey])

  useEffect(() => {
    onGuestPause?.({ requested: guestPauseAsk, withdrawn: guestWithdrew })
  }, [guestPauseAsk, guestWithdrew, onGuestPause])

  /** Control signal to the guest: data channel when open; signal table as fallback and for durable kinds. */
  function sendControl(inviteId: string | null, kind: string, payload: Record<string, unknown> = {}) {
    if (!inviteId) return Promise.resolve()
    const stamped = stampControl(payload)
    const onChannel = controlRef.current?.send(kind, stamped) ?? false
    if (!onChannel || GUEST_DURABLE_KINDS.has(kind)) return pushAdminSignal(inviteId, kind, stamped).then(() => undefined)
    return Promise.resolve()
  }

  // Signal poll: setTimeout chain, never overlapping. Fast while negotiating,
  // slow (~10 s) once the data channel carries control, backoff when idle/failing.
  useEffect(() => {
    if (!liveId) return
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
        const data = await pullAdminSignals(liveId, afterRef.current)
        if (cancelled) return
        errDelay = 0
        setInvites((prev) => prev.map((i) => (i.id === data.invite.id ? { ...i, ...data.invite } : i)))
        const fresh = data.signals.filter((s) => s.id > afterRef.current)
        // Only the newest fresh offer in a batch matters (e.g. after the host tab reloads).
        let lastOffer = -1
        fresh.forEach((signal, index) => {
          if (signal.kind === 'offer' && !signal.payload.restart) lastOffer = index
        })
        for (const [index, signal] of fresh.entries()) {
          afterRef.current = Math.max(afterRef.current, signal.id)
          if (signal.kind === 'offer' && !signal.payload.restart && index < lastOffer) continue
          await handleSignalRef.current(liveId, signal.kind, signal.payload || {})
          if (cancelled) return
        }
        got = fresh.length > 0
      } catch {
        errDelay = errorPollDelay(errDelay || 1000)
      } finally {
        inFlight = false
      }
      if (cancelled) return
      idleTicks = got ? 0 : idleTicks + 1
      const peer = peerRef.current
      const up = peer ? peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed' : false
      const delay = errDelay || nextPollDelay({ channelUp: Boolean(up && controlRef.current?.isOpen()), gotSignals: got, idleTicks })
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
    return () => {
      cancelled = true
      wakePollRef.current = () => {}
      if (timer != null) window.clearTimeout(timer)
    }
  }, [liveId])

  function talkbackSource() {
    return hostRef.current || talkbackMicRef.current
  }

  function stopFallbackMix() {
    fallbackMixRef.current?.stop()
    fallbackMixRef.current = null
  }

  function pushHeadphonesToPeer() {
    const peer = peerRef.current
    if (!peer) return
    const talkOn = talkbackRef.current
    const talk = talkOn ? talkbackSource() : null
    const cueOn = cueToGuestRef.current
    const cue = cueOn ? cueStreamRef.current : null
    const cueReady = Boolean(cue?.getAudioTracks().some((t) => t.readyState === 'live'))

    if (programCueSender(peer) || applyProgramCue(peer, cueReady ? cue : null, cueReady)) {
      stopFallbackMix()
      applyTalkback(peer, talk, talkOn)
      applyProgramCue(peer, cueReady ? cue : null, cueReady)
      return
    }

    if (cueReady && talkOn && talk) {
      const mix = fallbackMixRef.current || createHostFallbackSendMix()
      fallbackMixRef.current = mix
      mix.update(talk, cue, true, true)
      applyTalkback(peer, mix.stream, true)
      return
    }

    stopFallbackMix()
    if (cueReady) applyTalkback(peer, cue, true)
    else applyTalkback(peer, talk, talkOn)
  }

  function signalCue(inviteId: string | null = liveId) {
    if (!inviteId) return
    const on = cueToGuestRef.current && Boolean(cueStreamRef.current?.getAudioTracks().some((t) => t.readyState === 'live'))
    void sendControl(inviteId, 'cue', { on: cueToGuestRef.current, live: on }).catch(() => {})
  }

  function releaseTalkbackMic() {
    const dedicated = talkbackMicRef.current
    if (!dedicated || dedicated === hostRef.current) {
      talkbackMicRef.current = null
      return
    }
    stopStreams([dedicated])
    talkbackMicRef.current = null
  }

  useEffect(() => {
    if (hostStream && talkbackMicRef.current && talkbackMicRef.current !== hostStream) {
      stopStreams([talkbackMicRef.current])
      talkbackMicRef.current = null
    }
    pushHeadphonesToPeer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostStream, talkback, cueToGuest, cueStream])

  useEffect(() => {
    onCueToGuest?.(cueToGuest)
  }, [cueToGuest, onCueToGuest])

  useEffect(() => {
    signalCue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueToGuest, cueLive, liveId])

  function recordPayload(on: boolean, phase: GuestTallyPhase) {
    const clock = recordClockRef.current
    return on ? { on, phase, sessionSec: clock.sessionSec, hostAt: clock.hostAt } : { on, phase }
  }

  const recordingRef = useRef(recording)
  const tallyRef = useRef(recTally)
  useEffect(() => {
    if (!liveId || recordingRef.current === recording) {
      recordingRef.current = recording
      return
    }
    recordingRef.current = recording
    if (recording) {
      const sessionSec =
        typeof recordStartSessionSec === 'number' && Number.isFinite(recordStartSessionSec) ? Math.max(0, recordStartSessionSec) : null
      recordClockRef.current = { sessionSec, hostAt: recordStartedAt || Date.now() }
    }
    void sendControl(liveId, 'record', recordPayload(recording, recording ? recTally : 'stopped')).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, liveId, recTally])

  useEffect(() => {
    if (!liveId || tallyRef.current === recTally) {
      tallyRef.current = recTally
      return
    }
    tallyRef.current = recTally
    void sendControl(liveId, 'tally', { phase: recTally }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recTally, liveId])

  // Safe slate (live room) or the Safe pause button: guest is told, and their mic goes off on their side.
  const pauseOn = hostPause || safePause
  const pauseSentRef = useRef(false)
  useEffect(() => {
    if (!liveId || pauseSentRef.current === pauseOn) return
    pauseSentRef.current = pauseOn
    void sendControl(liveId, 'pause', { on: pauseOn, slate: safePause }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseOn, safePause, liveId])

  useEffect(() => {
    return () => {
      controlRef.current?.close()
      controlRef.current = null
      closePeer(peerRef.current, false)
      peerRef.current = null
      releaseTalkbackMic()
      stopFallbackMix()
      onRemoteStream(null)
      onRemoteVideo?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRemoteStream, onRemoteVideo])

  /** Everything the guest booth must know again after a fresh peer/channel. */
  function restateToGuest(inviteId: string) {
    void sendControl(inviteId, 'tally', { phase: tallyRef.current }).catch(() => {})
    if (talkbackRef.current) void sendControl(inviteId, 'talkback', { on: true }).catch(() => {})
    if (cueToGuestRef.current) signalCue(inviteId)
    if (recordingRef.current) void sendControl(inviteId, 'record', recordPayload(true, tallyRef.current)).catch(() => {})
    if (muteLockedRef.current) void sendControl(inviteId, 'mute', { on: true }).catch(() => {})
    if (camLockedRef.current) void sendControl(inviteId, 'camera', { on: false }).catch(() => {})
    if (pauseOnRef.current) void sendControl(inviteId, 'pause', { on: true, slate: safePauseRef.current }).catch(() => {})
  }

  async function handleSignal(inviteId: string, kind: string, payload: Record<string, unknown>) {
    if (!dedupeRef.current.accept(kind, payload)) return
    const gen = typeof payload.gen === 'string' ? payload.gen : null
    if (kind === 'offer' && payload.sdp) {
      const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: String(payload.sdp) }
      const current = peerRef.current
      // ICE restart from the same guest peer: renegotiate in place (keeps DTLS + tracks + data channel).
      if (
        payload.restart &&
        current &&
        gen &&
        gen === peerGenRef.current &&
        current.signalingState === 'stable' &&
        current.connectionState !== 'closed'
      ) {
        try {
          await readyIce()
          const desc = await answerOffer(current, offer)
          if (desc) await pushAdminSignal(inviteId, 'answer', { type: desc.type, sdp: desc.sdp, gen })
          return
        } catch {
          /* fall through to a fresh peer */
        }
      }
      const cfg = await readyIce()
      resetPeer(inviteId, cfg.iceServers)
      peerGenRef.current = gen
      const peer = peerRef.current
      if (!peer) return
      const desc = await answerOffer(peer, offer)
      if (desc) {
        await pushAdminSignal(inviteId, 'answer', gen ? { type: desc.type, sdp: desc.sdp, gen } : { type: desc.type, sdp: desc.sdp })
      }
      pushHeadphonesToPeer()
      restateToGuest(inviteId)
      setReconnecting(false)
      return
    }
    if (kind === 'ice') {
      const peer = peerRef.current
      if (gen && peerGenRef.current && gen !== peerGenRef.current) return
      if (peer) await addIce(peer, (payload.candidate as RTCIceCandidateInit) || null)
      return
    }
    if (kind === 'camera') {
      const on = Boolean(payload.on)
      setGuestCamOn(on)
      onRemoteVideo?.(on)
      return
    }
    if (kind === 'mute') {
      setGuestMuted(Boolean(payload.on))
      return
    }
    if (kind === 'pause') {
      if (payload.withdrawn) setGuestWithdrew(true)
      else setGuestPauseAsk(Boolean(payload.on))
      return
    }
    if (kind === 'reconnect') {
      const cfg = await readyIce()
      resetPeer(inviteId, cfg.iceServers)
      return
    }
    if (kind === 'hangup') {
      controlRef.current?.close()
      controlRef.current = null
      setChannelUp(false)
      closePeer(peerRef.current, false)
      peerRef.current = null
      setIce('')
      setGuestMuted(false)
      setGuestCamOn(false)
      setTalkback(false)
      setCueToGuest(false)
      setGuestPauseAsk(false)
      releaseTalkbackMic()
      stopFallbackMix()
      onRemoteStream(null)
      onRemoteVideo?.(false)
    }
  }
  handleSignalRef.current = handleSignal

  function resetPeer(inviteId: string, iceServers?: RTCIceServer[]) {
    controlRef.current?.close()
    controlRef.current = null
    setChannelUp(false)
    closePeer(peerRef.current, false)
    peerRef.current = null
    onRemoteStream(null)
    onRemoteVideo?.(false)
    const peer = createStudioPeer(iceServers || iceCfgRef.current?.iceServers)
    peerRef.current = peer
    wirePeer(inviteId, peer)
    pushHeadphonesToPeer()
  }

  function wirePeer(inviteId: string, peer: RTCPeerConnection) {
    peer.onicecandidate = (event) => {
      if (event.candidate && peerRef.current === peer) {
        const gen = peerGenRef.current
        void pushAdminSignal(
          inviteId,
          'ice',
          gen ? { candidate: event.candidate.toJSON(), gen } : { candidate: event.candidate.toJSON() },
        ).catch(() => {})
      }
    }
    peer.ondatachannel = (event) => {
      if (peerRef.current !== peer || event.channel.label !== CONTROL_CHANNEL_LABEL) return
      controlRef.current?.close()
      controlRef.current = wireControlChannel(event.channel, {
        remoteRole: 'guest',
        onSignal: (kind, payload) => void handleSignalRef.current(inviteId, kind, payload),
        onOpenChange: (open) => {
          if (peerRef.current !== peer) return
          setChannelUp(open)
          if (open) restateToGuest(inviteId)
          wakePollRef.current()
        },
      })
    }
    const pushRemote = () => {
      const stream = collectRemoteStream(peer)
      onRemoteStream(stream.getTracks().length ? stream : null)
      onRemoteVideo?.(stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted))
    }
    peer.ontrack = (event) => {
      event.track.onunmute = pushRemote
      event.track.onmute = pushRemote
      event.track.onended = pushRemote
      pushRemote()
    }
    peer.oniceconnectionstatechange = () => {
      if (peerRef.current !== peer) return
      setIce(peer.iceConnectionState)
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        setReconnecting(false)
        void setAdminInviteState(inviteId, 'connected').catch(() => {})
      } else {
        // Restart offers/candidates come over HTTP: poll fast until ICE is back.
        wakePollRef.current()
      }
      if (peer.iceConnectionState === 'failed') {
        setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
        onRemoteStream(null)
        onRemoteVideo?.(false)
      }
      if (peer.iceConnectionState === 'disconnected') {
        onRemoteStream(null)
        onRemoteVideo?.(false)
      }
    }
    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return
      if (peer.connectionState === 'failed') {
        setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
        onRemoteStream(null)
        onRemoteVideo?.(false)
      }
    }
  }

  async function setGuestMute(on: boolean) {
    if (!liveId) return
    setMuteLocked(on)
    setGuestMuted(on)
    await sendControl(liveId, 'mute', { on }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not mute guest')
    })
  }

  async function setGuestCamera(on: boolean) {
    if (!liveId) return
    setCamLocked(!on)
    if (!on) {
      setGuestCamOn(false)
      onRemoteVideo?.(false)
    }
    await sendControl(liveId, 'camera', { on }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not change guest camera')
    })
  }

  async function setTalkbackOn(on: boolean) {
    if (!liveId) return
    setError(null)
    try {
      if (on && !talkbackSource()) {
        talkbackMicRef.current = await openInputStream(undefined, false)
      }
      if (!on) releaseTalkbackMic()
      talkbackRef.current = on
      setTalkback(on)
      pushHeadphonesToPeer()
      await sendControl(liveId, 'talkback', { on })
    } catch (err) {
      if (!on) setTalkback(false)
      setError(err instanceof Error ? err.message : 'Could not start talkback')
    }
  }

  function setCueToGuestOn(on: boolean) {
    if (!liveId) return
    cueToGuestRef.current = on
    setCueToGuest(on)
    pushHeadphonesToPeer()
    signalCue(liveId)
  }

  async function retryPeer() {
    if (!liveId) return
    setError(null)
    setReconnecting(true)
    try {
      const cfg = await readyIce()
      resetPeer(liveId, cfg.iceServers)
      await pushAdminSignal(liveId, 'reconnect', stampControl())
      wakePollRef.current()
    } catch (err) {
      setReconnecting(false)
      setError(err instanceof Error ? err.message : 'Could not reconnect')
    }
  }

  function resetGuestUi() {
    controlRef.current?.close()
    controlRef.current = null
    setChannelUp(false)
    closePeer(peerRef.current, false)
    peerRef.current = null
    setGuestMuted(false)
    setMuteLocked(false)
    setGuestCamOn(false)
    setCamLocked(false)
    setTalkback(false)
    setCueToGuest(false)
    setGuestPauseAsk(false)
    setGuestWithdrew(false)
    setHostPause(false)
    pauseSentRef.current = false
    setConsent(null)
    dedupeRef.current.reset()
    releaseTalkbackMic()
    stopFallbackMix()
    setIce('')
    onRemoteStream(null)
    onRemoteVideo?.(false)
  }

  async function createLink() {
    if (!episodeId) return
    setConfirming(null)
    setBusy(true)
    setError(null)
    try {
      if (liveId && guestInBooth) await pushAdminSignal(liveId, 'hangup', stampControl()).catch(() => {})
      const data = await createAdminInvite(episodeId, hours)
      setInvites((prev) => [data.invite, ...prev.filter((i) => i.id !== data.invite.id)])
      setFreshUrl(data.invite.url || null)
      afterRef.current = 0
      setCopied(false)
      resetGuestUi()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!freshUrl) return
    try {
      await navigator.clipboard.writeText(freshUrl)
      setCopied(true)
    } catch {
      setError('Copy failed — select the link and copy it')
    }
  }

  async function revokeLive() {
    if (!liveId) return
    setConfirming(null)
    setBusy(true)
    try {
      await pushAdminSignal(liveId, 'hangup', stampControl()).catch(() => {})
      const data = await revokeAdminInvite(liveId)
      setInvites((prev) => prev.map((i) => (i.id === data.invite.id ? data.invite : i)))
      setFreshUrl(null)
      resetGuestUi()
      onGuestName(null)
      onCameraUrl?.(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke')
    } finally {
      setBusy(false)
    }
  }

  const presence = describeGuestSession({
    side: 'admin',
    hasInvite: Boolean(live),
    state: live?.state,
    revoked: live?.revoked,
    expired: live?.expired,
    ice,
    recording: recording || live?.state === 'recording',
  })
  const liveInvite = Boolean(live) && !live?.revoked && !live?.expired
  const guestInBooth = liveInvite && live?.state !== 'pending' && live?.state !== 'left'
  const canRetry = presence.phase === 'failed' || presence.phase === 'dropped'
  const consentNotes = consent
    ? [
        consent.choices.voice_altered && 'alter voice',
        consent.choices.face_blurred && 'blur face',
        consent.choices.first_name_only && 'first name only',
        !consent.choices.may_publish && 'wants to hear final cut',
        consent.choices.audio_only && 'audio only',
        consent.withdrawnAt && 'CONSENT WITHDRAWN',
      ].filter(Boolean)
    : []

  function askFirst(action: 'new' | 'revoke') {
    if (guestInBooth) setConfirming(action)
    else if (action === 'new') void createLink()
    else void revokeLive()
  }

  return (
    <div className="rounded-xl border border-[#1A232C] bg-[#0A1016] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 size={14} className="text-[#8DEBFF]" />
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Remote guest</p>
        <span className={`text-[11px] font-mono ${TONE_CLASS[presence.tone] || TONE_CLASS.idle}`}>
          {presence.label}
        </span>
        {live?.guestName && <span className="text-xs text-[#F6FAFC]">{live.guestName}</span>}
        {ice && <span className="text-[11px] font-mono text-[#7C8B97]">{ice}</span>}
        {channelUp && <span className="text-[11px] font-mono text-[#7CFFB2]" title="Control on the data channel">ctl</span>}
        {liveInvite && (
          <span className={`text-[11px] font-mono ${TONE_CLASS[tally.tone] || TONE_CLASS.idle}`}>
            {tally.label}
          </span>
        )}
        {live?.referenceCode && (
          <span className="text-[11px] font-mono text-[#7C8B97]" title="Reference code the guest sees">
            {live.referenceCode}
          </span>
        )}
      </div>

      {(guestPauseAsk || guestWithdrew) && liveInvite && (
        <div
          className="rounded-lg border-2 border-[#FFB86B] bg-[#24180C] px-3 py-3 text-sm text-[#FFD9A8] space-y-2"
          role="alert"
        >
          <p className="font-medium flex items-center gap-2">
            <Coffee size={16} />
            {guestWithdrew
              ? `${guestName} asked to withdraw their recording. The episode is flagged for review.`
              : `${guestName} asked for a pause. Their mic is off on their side.`}
          </p>
          {!guestWithdrew && (
            <div className="flex flex-wrap gap-2">
              {!pauseOn && (
                <button type="button" onClick={() => setHostPause(true)} className={`${BTN} bg-[#FFB86B] text-[#1A1206] font-medium`}>
                  <ShieldCheck size={14} /> Safe pause (off the recording)
                </button>
              )}
              <button type="button" onClick={() => setGuestPauseAsk(false)} className={`${BTN} border border-[#FFB86B]/60`}>
                Acknowledge
              </button>
            </div>
          )}
        </div>
      )}

      {live && !live.revoked && !live.expired && (
        <p className="text-[11px] text-[#7C8B97]">
          Mic {muteLocked ? 'host muted' : guestMuted ? 'guest muted' : 'live'}
          {' · '}
          Cam {camLocked ? 'host off' : guestCamOn ? 'on' : 'off'}
          {talkback ? ' · talkback on' : ' · talkback off'}
          {cueLive ? ' · cue live' : cueToGuest ? ' · cue armed' : ' · cue off'}
          {pauseOn ? ' · SAFE PAUSE' : ''}
          {recording ? ` · host ${tally.label}` : ''}
        </p>
      )}
      {consentNotes.length > 0 && (
        <p className="text-[11px] text-[#FFD9A8]">
          <ShieldCheck size={12} className="inline mr-1 -mt-0.5" />
          Guest consent: {consentNotes.join(' · ')}
        </p>
      )}
      {!episodeId ? (
        <p className="text-xs text-[#A9B8C6]">Open an episode to send a guest link.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[#A9B8C6] flex items-center gap-2">
            Expires
            <select
              className="rounded-lg border border-[#27313B] bg-[#151B22] px-2 py-1.5 text-sm text-[#B8C4CF]"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={4}>4 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => askFirst('new')}
            className={`${BTN} bg-[#53D6FF] text-[#061016] font-medium disabled:opacity-40`}
          >
            <Radio size={14} /> {live && !live.revoked && !live.expired ? 'New link' : 'Create invite'}
          </button>
          {freshUrl && (
            <button
              type="button"
              onClick={() => void copyLink()}
              className={`${BTN} border border-[#27313B] text-[#B8C4CF]`}
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
            </button>
          )}
          {live && !live.revoked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => askFirst('revoke')}
              className={`${BTN} border border-[#27313B] text-[#FF7A9A]`}
            >
              <UserX size={14} /> Revoke
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div
          className="rounded-lg border border-[#FF7A9A]/70 bg-[#2A1014] px-3 py-3 text-sm text-[#FFD1DC] space-y-2"
          role="alertdialog"
          aria-labelledby="guest-confirm-title"
        >
          <p id="guest-confirm-title" className="font-medium">
            {guestName} is in the booth. Disconnect {live?.guestName ? 'them' : 'the guest'}?
          </p>
          <p className="text-[12px] text-[#E8B3C0]">
            {confirming === 'new'
              ? 'A new link ends their session at once and their old link stops working.'
              : 'Revoking ends their session at once. A backup still uploading from their tab will stop — they will be offered a download instead.'}{' '}
            Consider telling them first (talkback) so it does not feel abrupt.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void (confirming === 'new' ? createLink() : revokeLive())}
              className={`${BTN} bg-[#FF7A9A] text-[#1A0610] font-medium`}
            >
              {confirming === 'new' ? 'Disconnect and make a new link' : 'Disconnect and revoke'}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirming(null)}
              className={`${BTN} border border-[#27313B] text-[#B8C4CF]`}
            >
              Keep them connected
            </button>
          </div>
        </div>
      )}
      {liveInvite && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={muteLocked}
            disabled={busy}
            onClick={() => void setGuestMute(!muteLocked)}
            className={`${BTN} ${muteLocked ? 'bg-red-500/90 text-white' : 'border border-[#27313B] text-[#B8C4CF]'}`}
          >
            {muteLocked ? <Volume2 size={14} /> : <MicOff size={14} />}
            {muteLocked ? 'Unmute guest' : 'Mute guest'}
          </button>
          <button
            type="button"
            aria-pressed={camLocked}
            disabled={busy}
            onClick={() => void setGuestCamera(camLocked)}
            className={`${BTN} ${camLocked ? 'border border-[#FF7A9A]/50 text-[#FF7A9A]' : 'border border-[#27313B] text-[#B8C4CF]'}`}
          >
            {camLocked ? <Video size={14} /> : <VideoOff size={14} />}
            {camLocked ? 'Allow camera' : 'Camera off'}
          </button>
          <button
            type="button"
            aria-pressed={pauseOn}
            disabled={busy || !guestInBooth || safePause}
            onClick={() => setHostPause((v) => !v)}
            title={safePause ? 'Safe slate is on in the live room' : 'Guest sees a calm pause screen and their mic is off'}
            className={`${BTN} ${pauseOn ? 'bg-[#FFB86B] text-[#1A1206] font-medium' : 'border border-[#FFB86B]/50 text-[#FFD9A8]'} disabled:opacity-40`}
          >
            <Coffee size={14} /> {safePause ? 'Safe slate on' : pauseOn ? 'End safe pause' : 'Safe pause'}
          </button>
          <button
            type="button"
            aria-pressed={talkback}
            disabled={busy || !guestInBooth}
            onClick={() => void setTalkbackOn(!talkback)}
            className={`${BTN} ${talkback ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'} disabled:opacity-40`}
          >
            <Headphones size={14} /> {talkback ? 'Talkback on' : 'Talkback'}
          </button>
          <button
            type="button"
            aria-pressed={cueToGuest}
            disabled={busy || !guestInBooth}
            onClick={() => setCueToGuestOn(!cueToGuest)}
            className={`${BTN} ${
              cueLive
                ? 'bg-[#53D6FF] text-[#061016]'
                : cueToGuest
                  ? 'border border-[#53D6FF]/70 text-[#8DEBFF]'
                  : 'border border-[#27313B] text-[#B8C4CF]'
            } disabled:opacity-40`}
          >
            <Music2 size={14} /> {cueLive ? 'Cue live' : cueToGuest ? 'Cue armed' : 'Cue to guest'}
          </button>
          <button
            type="button"
            disabled={busy || reconnecting || !guestInBooth}
            onClick={() => void retryPeer()}
            className={`${BTN} ${canRetry ? 'bg-[#53D6FF] text-[#061016]' : 'border border-[#27313B] text-[#B8C4CF]'} disabled:opacity-40`}
          >
            <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : canRetry ? 'Retry' : 'Reconnect'}
          </button>
        </div>
      )}
      {freshUrl && (
        <div className="space-y-1">
          <p className="text-[11px] font-mono text-[#8DEBFF] break-all">{freshUrl}</p>
          <p className="text-[11px] text-[#7C8B97]">
            Private link: send it only to your guest, by a channel they chose. It is shown once — it cannot be
            recovered later (only a hash is stored). Revoke it if it goes to the wrong person.
          </p>
        </div>
      )}
      <p className="text-[11px] text-[#7C8B97]">
        Talkback is your mic in their phones. Cue to guest sends the live mix (other lanes, beds,
        SFX — not the Guest take being recorded) on a second audio line. Neither is laid on the
        Guest take or their local backup. Safe pause mutes them on their side and shows a calm pause
        screen. Their backup uploads in 10-second parts while you record.{' '}
        {turnConfigured
          ? 'TURN is on for this site.'
          : 'ICE is STUN-only until TURN_URL + TURN_SECRET (or TURN_USERNAME + TURN_CREDENTIAL) are set on Netlify.'}{' '}
        Retry uses the same invite — no new token.
      </p>
      {canRetry && (
        <div className="rounded-lg border border-[#FF7A9A]/60 bg-[#2A1014] px-3 py-2 text-xs text-[#FFB3C3] space-y-2">
          <p>{iceFailedHint(turnConfigured)}</p>
          <button
            type="button"
            disabled={reconnecting}
            onClick={() => void retryPeer()}
            className={`${BTN} bg-[#53D6FF] text-[#061016] font-medium disabled:opacity-40`}
          >
            <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry connection'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-[#FF7A9A]">{error}</p>}
    </div>
  )
}
