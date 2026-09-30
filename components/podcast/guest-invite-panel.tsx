'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CloudDownload,
  Coffee,
  Copy,
  Download,
  Headphones,
  Link2,
  MicOff,
  Music2,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserX,
  Video,
  VideoOff,
  Volume2,
  WifiOff,
} from 'lucide-react'
import { Button, Chip, Select, toast } from '@/components/studio-ui'
import { openInputStream, stopStreams } from '@/lib/podcast/capture'
import { createHostFallbackSendMix, type HostFallbackSendMix } from '@/lib/podcast/guest-cue'
import {
  GUEST_DURABLE_KINDS,
  GUEST_STALE_MS,
  describeGuestSession,
  describeGuestTally,
  describeIceProgress,
  guestLooksStale,
  type GuestInviteAdmin,
  type GuestRoomPublic,
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
  reanswerOffer,
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
import { assembleGuestTake, listGuestTakes, type GuestTakeManifest } from '@/lib/podcast/upload/guest-take-client'
import { GuestRoomPanel, type RemoteGuestLane } from '@/components/podcast/guest-room-panel'
import type { InviteCapacity } from '@/lib/podcast/rooms/types'

export type { RemoteGuestLane }

export type GuestInvitePanelProps = {
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
  /** Guest pressed "I need a moment" (requested) or asked to withdraw (withdrawn). */
  onGuestPause?: (state: { requested: boolean; withdrawn: boolean }) => void
  /** Panel shows (2+ guests): one lane per guest, in invite order. Empty on the one-guest P2P path. */
  onRemoteGuests?: (lanes: RemoteGuestLane[]) => void
  /** Live room: fold every guest's audio into onRemoteStream (one Program guest bus). */
  mergeGuestAudio?: boolean
}

type P2PProps = Omit<GuestInvitePanelProps, 'onRemoteGuests' | 'mergeGuestAudio'> & {
  capacity?: InviteCapacity | null
  onAddGuest?: () => Promise<void>
}

type Loaded = { invites: GuestInviteAdmin[]; capacity: InviteCapacity | null; room: GuestRoomPublic | null }

/**
 * Remote guests. One guest: the free peer-to-peer call (GuestInvitePanelP2P).
 * From the second live invite the episode has a room (SFU) and everyone —
 * including the first guest — goes through GuestRoomPanel.
 */
export function GuestInvitePanel({ onRemoteGuests, mergeGuestAudio, ...props }: GuestInvitePanelProps) {
  const { episodeId } = props
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [initialUrl, setInitialUrl] = useState<string | null>(null)

  const onInvites = useCallback((invites: GuestInviteAdmin[], capacity?: InviteCapacity | null, room?: GuestRoomPublic | null) => {
    setLoaded((prev) => ({
      invites,
      capacity: capacity === undefined ? prev?.capacity ?? null : capacity,
      room: room === undefined ? prev?.room ?? null : room,
    }))
  }, [])

  useEffect(() => {
    setLoaded(null)
    setInitialUrl(null)
    if (!episodeId) return
    let cancelled = false
    void listAdminInvites(episodeId)
      .then((data) => {
        if (!cancelled) onInvites(data.invites, data.capacity ?? null, data.room ?? null)
      })
      .catch(() => {
        if (!cancelled) onInvites([], null, null)
      })
    return () => {
      cancelled = true
    }
  }, [episodeId, onInvites])

  const addGuest = useCallback(async () => {
    if (!episodeId) return
    const data = await createAdminInvite(episodeId, 24, undefined, true)
    setInitialUrl(data.invite.url || null)
    setLoaded((prev) => ({
      invites: [data.invite, ...(prev?.invites || []).filter((i) => i.id !== data.invite.id)],
      capacity: data.capacity ?? prev?.capacity ?? null,
      room: data.room ?? prev?.room ?? null,
    }))
  }, [episodeId])

  const liveCount = loaded ? loaded.invites.filter((i) => !i.revoked && !i.expired).length : 0
  const roomMode = Boolean(episodeId && loaded?.room && liveCount >= 1)

  useEffect(() => {
    if (!roomMode) onRemoteGuests?.([])
  }, [roomMode, onRemoteGuests])

  if (roomMode && episodeId && loaded?.room) {
    return (
      <GuestRoomPanel
        {...props}
        episodeId={episodeId}
        room={loaded.room}
        invites={loaded.invites}
        capacity={loaded.capacity}
        onInvites={onInvites}
        onRemoteGuests={onRemoteGuests}
        mergeGuestAudio={mergeGuestAudio}
        initialFreshUrl={initialUrl}
      />
    )
  }
  return <GuestInvitePanelP2P {...props} capacity={loaded?.capacity ?? null} onAddGuest={loaded ? addGuest : undefined} />
}

const TONE_CLASS: Record<string, string> = {
  live: 'text-lane-cohost-2',
  rec: 'text-heart',
  wait: 'text-lane-cohost-1',
  warn: 'text-lane-cohost-1',
  fail: 'text-heart',
  idle: 'text-silver',
}

const HINT = 'studio-type-label normal-case tracking-normal text-silver'

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function GuestInvitePanelP2P({
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
  capacity = null,
  onAddGuest,
}: P2PProps) {
  const [adding, setAdding] = useState(false)
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
  // Presentational: elapsed offset at the moment a drop/fail was detected, for
  // the reassuring "disconnected at MM:SS" copy.
  const connectedAtRef = useRef<number | null>(null)
  const [dropAtSec, setDropAtSec] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
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

  // Tick a clock while an invite is live so staleness (last_seen_at age) is
  // recomputed on render even when no signals arrive.
  useEffect(() => {
    if (!liveId) return
    const id = window.setInterval(() => setNowTick(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [liveId])

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

  // Freeze the "disconnected at MM:SS" offset once per drop so the banner reads a
  // stable timestamp. Presentational only — the reconnect logic is untouched.
  function noteDrop() {
    setDropAtSec((prev) => {
      if (prev != null) return prev
      const startedAt = connectedAtRef.current
      const at = startedAt != null ? (Date.now() - startedAt) / 1000 : 0
      toast({ title: `Guest disconnected at ${mmss(at)}`, description: 'Their audio so far is safe.', tone: 'error' })
      return at
    })
  }

  async function handleSignal(inviteId: string, kind: string, payload: Record<string, unknown>) {
    if (!dedupeRef.current.accept(kind, payload)) return
    const gen = typeof payload.gen === 'string' ? payload.gen : null
    if (kind === 'offer' && payload.sdp) {
      const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: String(payload.sdp) }
      const current = peerRef.current
      // ICE restart from the same guest peer: renegotiate in place (keeps DTLS + tracks + data channel).
      if (payload.restart && current && gen && gen === peerGenRef.current && current.connectionState !== 'closed') {
        try {
          await readyIce()
          const desc = await reanswerOffer(current, offer)
          if (desc) {
            await pushAdminSignal(inviteId, 'answer', { type: desc.type, sdp: desc.sdp, gen })
            pushHeadphonesToPeer()
            return
          }
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
      if (payload.withdrawn) {
        setGuestWithdrew(true)
        toast({ title: `${guestName} asked to withdraw their recording`, description: 'The episode is flagged for review.', tone: 'error', duration: 0 })
      } else {
        const on = Boolean(payload.on)
        setGuestPauseAsk(on)
        if (on) toast({ title: `${guestName} needs a moment`, description: 'Their mic is off on their side.', tone: 'neutral' })
      }
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
      setDropAtSec(null)
      connectedAtRef.current = null
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
        const wasDown = connectedAtRef.current == null
        connectedAtRef.current = Date.now()
        setDropAtSec(null)
        setReconnecting(false)
        void setAdminInviteState(inviteId, 'connected').catch(() => {})
        if (wasDown) toast({ title: 'Guest connected', tone: 'success' })
      } else {
        // Restart offers/candidates come over HTTP: poll fast until ICE is back.
        wakePollRef.current()
      }
      if (peer.iceConnectionState === 'failed') {
        noteDrop()
        setError(iceFailedHint(iceCfgRef.current?.turnConfigured || false))
        onRemoteStream(null)
        onRemoteVideo?.(false)
      }
      if (peer.iceConnectionState === 'disconnected') {
        noteDrop()
        onRemoteStream(null)
        onRemoteVideo?.(false)
      }
    }
    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return
      if (peer.connectionState === 'failed') {
        noteDrop()
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

  // Dismiss the drop banner and carry on without the guest. Non-destructive: the
  // invite stays live so the guest can still reopen the same link and auto-sync.
  function continueSolo() {
    setDropAtSec(null)
    setReconnecting(false)
    setError(null)
    onRemoteStream(null)
    onRemoteVideo?.(false)
    toast({ title: 'Continuing solo', description: 'Guest can rejoin on the same link anytime.', tone: 'success' })
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
    setDropAtSec(null)
    connectedAtRef.current = null
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
      toast({ title: 'Guest link copied', description: 'Send it only to your guest.', tone: 'success' })
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

  // Guest heartbeats every 15 s; if last_seen_at is older than ~3 beats while the
  // peer still reads connected, the tab is almost certainly gone.
  const guestActive = Boolean(live) && live?.state !== 'pending' && live?.state !== 'left'
  const stale = guestActive && guestLooksStale(live?.lastSeenAt, nowTick)
  const presence = describeGuestSession({
    side: 'admin',
    hasInvite: Boolean(live),
    state: live?.state,
    revoked: live?.revoked,
    expired: live?.expired,
    ice,
    recording: recording || live?.state === 'recording',
    stale,
  })
  const conn = describeIceProgress(ice, { reconnecting })
  const liveInvite = Boolean(live) && !live?.revoked && !live?.expired
  const guestInBooth = liveInvite && live?.state !== 'pending' && live?.state !== 'left'
  const canRetry = presence.phase === 'failed' || presence.phase === 'dropped'
  const showDropBanner = liveInvite && (canRetry || dropAtSec != null)
  const consentNotes = consent
    ? [
        consent.choices.voice_altered && 'alter voice',
        consent.choices.face_blurred && 'blur face',
        consent.choices.first_name_only && 'first name only',
        !consent.choices.may_publish && 'wants to hear final cut',
        consent.choices.audio_only && 'audio only',
        consent.withdrawnAt && 'CONSENT WITHDRAWN',
        consent.withdrawnAt && consent.withdrawContact && `reach them: ${consent.withdrawContact}`,
      ].filter(Boolean)
    : []

  /**
   * Both actions kill the guest's link, so both ask first whenever a link is live.
   * (Creating the very first invite, or replacing an expired/revoked one, needs no confirmation.)
   */
  function askFirst(action: 'new' | 'revoke') {
    if (liveInvite) setConfirming(action)
    else if (action === 'new') void createLink()
    else void revokeLive()
  }

  return (
    <div className="space-y-2 rounded-panel border border-divider bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 size={14} className="text-ice" />
        <p className="studio-type-label text-ice">Remote guest</p>
        <span className={`studio-type-timecode ${TONE_CLASS[presence.tone] || TONE_CLASS.idle}`}>{presence.label}</span>
        {live?.guestName && <span className="studio-type-body text-white">{live.guestName}</span>}
        {ice && <span className={`studio-type-timecode ${TONE_CLASS[conn.tone] || TONE_CLASS.idle}`}>{conn.label}</span>}
        {channelUp && (
          <Chip tone="success" dot title="Control runs on the data channel">
            ctl
          </Chip>
        )}
        {liveInvite && <span className={`studio-type-timecode ${TONE_CLASS[tally.tone] || TONE_CLASS.idle}`}>{tally.label}</span>}
        {live?.referenceCode && (
          <span className="studio-type-timecode text-silver" title="Reference code the guest sees">
            {live.referenceCode}
          </span>
        )}
      </div>

      {(guestPauseAsk || guestWithdrew) && liveInvite && (
        <div className="space-y-2 rounded-panel border-2 border-lane-cohost-1 bg-lane-cohost-1/10 px-3 py-3" role="alert">
          <p className="studio-type-body flex items-center gap-2 font-medium text-lane-cohost-1">
            <Coffee size={16} />
            {guestWithdrew
              ? `${guestName} asked to withdraw their recording. The episode is flagged for review.`
              : `${guestName} needs a moment. Their mic is off on their side.`}
          </p>
          {!guestWithdrew && (
            <div className="flex flex-wrap gap-2">
              {!pauseOn && (
                <Button variant="primary" size="compact" onClick={() => setHostPause(true)}>
                  <ShieldCheck size={14} /> Safe pause (off the recording)
                </Button>
              )}
              <Button variant="secondary" size="compact" onClick={() => setGuestPauseAsk(false)}>
                Acknowledge
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Guest-drop recovery — prominent + reassuring. Retry reuses the same invite. */}
      {showDropBanner && (
        <div className="space-y-2.5 rounded-panel border border-heart/60 bg-heart/10 p-3">
          <div className="flex items-start gap-2.5">
            <WifiOff size={18} className="mt-0.5 shrink-0 text-heart" />
            <div className="space-y-1">
              <p className="studio-type-body font-medium text-white">
                {dropAtSec != null
                  ? `Guest disconnected at ${mmss(dropAtSec)} — your audio so far is safe.`
                  : 'Guest disconnected — your audio so far is safe.'}
              </p>
              <p className="studio-type-label inline-flex items-center gap-1.5 normal-case tracking-normal text-silver-body">
                <ShieldCheck size={13} className="text-lane-cohost-2" />
                Reconnecting auto-syncs on the same invite — no new link. Their backup keeps uploading in 10 s parts.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="compact" disabled={busy || reconnecting || !guestInBooth} onClick={() => void retryPeer()}>
              <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : 'Retry connection'}
            </Button>
            <Button variant="secondary" size="compact" disabled={busy} onClick={continueSolo}>
              Continue solo
            </Button>
          </div>
        </div>
      )}
      {stale && !showDropBanner && (
        <div className="rounded-panel border border-lane-cohost-1/50 bg-lane-cohost-1/10 px-3 py-2">
          <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-lane-cohost-1">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Guest not responding — no heartbeat for {Math.round(GUEST_STALE_MS / 1000)}s+. Their tab may be closed, asleep, or
              offline. Try Retry, or ask them to reopen the same invite link.
            </span>
          </p>
        </div>
      )}

      {liveInvite && (
        <p className={HINT}>
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
        <p className={`${HINT} text-lane-cohost-1`}>
          <ShieldCheck size={12} className="-mt-0.5 mr-1 inline" />
          Guest consent: {consentNotes.join(' · ')}
        </p>
      )}

      {!episodeId ? (
        <p className="studio-type-body text-silver">Open an episode to send a guest link.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="studio-type-body flex items-center gap-2 text-silver">
            Expires
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-control-compact w-auto px-2 py-0 text-sm">
              <option value={4}>4 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </Select>
          </label>
          <Button variant="primary" size="compact" disabled={busy} onClick={() => askFirst('new')}>
            <Radio size={14} /> {liveInvite ? 'New link' : 'Create invite'}
          </Button>
          {freshUrl && (
            <Button variant="secondary" size="compact" onClick={() => void copyLink()}>
              <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
            </Button>
          )}
          {live && !live.revoked && (
            <Button variant="danger" size="compact" disabled={busy} onClick={() => askFirst('revoke')}>
              <UserX size={14} /> Revoke
            </Button>
          )}
          {liveInvite && onAddGuest && (
            <Button
              variant="secondary"
              size="compact"
              loading={adding}
              disabled={busy || Boolean(capacity && capacity.remaining <= 0)}
              title={capacity?.reason || 'Keep this guest and add a second one: everyone moves to the panel room'}
              onClick={() => {
                setAdding(true)
                setError(null)
                void onAddGuest()
                  .catch((err) => setError(err instanceof Error ? err.message : 'Could not add a guest'))
                  .finally(() => setAdding(false))
              }}
            >
              <UserPlus size={14} /> Add another guest
            </Button>
          )}
        </div>
      )}
      {liveInvite && capacity && capacity.remaining <= 0 && capacity.reason && (
        <p className={`${HINT} text-lane-cohost-1`}>{capacity.reason}</p>
      )}

      {confirming && (
        <div
          className="space-y-2 rounded-panel border border-heart/70 bg-heart/10 px-3 py-3"
          role="alertdialog"
          aria-labelledby="guest-confirm-title"
        >
          <p id="guest-confirm-title" className="studio-type-body font-medium text-white">
            {guestInBooth
              ? `${guestName} is in the booth. Disconnect ${live?.guestName ? 'them' : 'the guest'}?`
              : confirming === 'new'
                ? 'Replace the current guest link?'
                : 'Revoke the current guest link?'}
          </p>
          <p className="studio-type-label normal-case tracking-normal text-silver-body">
            {guestInBooth
              ? confirming === 'new'
                ? 'A new link ends their session at once and their old link stops working. '
                : 'Revoking ends their session at once. A backup still uploading from their tab will stop; it stays saved on their device and they will be offered a download. '
              : 'The link you already sent stops working for joining. Backups already uploaded are kept, and the guest can still use the old link to ask for a withdrawal. '}
            {guestInBooth ? 'Consider telling them first (talkback) so it does not feel abrupt.' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="compact" disabled={busy} onClick={() => void (confirming === 'new' ? createLink() : revokeLive())}>
              {confirming === 'new' ? 'Disconnect and make a new link' : 'Disconnect and revoke'}
            </Button>
            <Button variant="secondary" size="compact" autoFocus onClick={() => setConfirming(null)}>
              Keep them connected
            </Button>
          </div>
        </div>
      )}

      {liveInvite && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={muteLocked ? 'danger' : 'secondary'} size="compact" aria-pressed={muteLocked} disabled={busy} onClick={() => void setGuestMute(!muteLocked)}>
            {muteLocked ? <Volume2 size={14} /> : <MicOff size={14} />}
            {muteLocked ? 'Unmute guest' : 'Mute guest'}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            aria-pressed={camLocked}
            disabled={busy}
            onClick={() => void setGuestCamera(camLocked)}
            className={camLocked ? 'border-heart/50 text-heart' : undefined}
          >
            {camLocked ? <Video size={14} /> : <VideoOff size={14} />}
            {camLocked ? 'Allow camera' : 'Camera off'}
          </Button>
          <Button
            variant={pauseOn ? 'primary' : 'secondary'}
            size="compact"
            aria-pressed={pauseOn}
            disabled={busy || !guestInBooth || safePause}
            onClick={() => setHostPause((v) => !v)}
            title={
              safePause
                ? 'Safe pause is on for the whole session — turn it off from the main Safe pause / safe slate control'
                : 'Guest sees a calm pause screen and their mic is off'
            }
            className={!pauseOn ? 'border-lane-cohost-1/50 text-lane-cohost-1' : undefined}
          >
            <Coffee size={14} /> {safePause ? 'Safe pause on' : pauseOn ? 'End safe pause' : 'Safe pause'}
          </Button>
          <Button variant={talkback ? 'primary' : 'secondary'} size="compact" aria-pressed={talkback} disabled={busy || !guestInBooth} onClick={() => void setTalkbackOn(!talkback)}>
            <Headphones size={14} /> {talkback ? 'Talkback on' : 'Talkback'}
          </Button>
          <Button
            variant={cueLive ? 'primary' : 'secondary'}
            size="compact"
            aria-pressed={cueToGuest}
            disabled={busy || !guestInBooth}
            onClick={() => setCueToGuestOn(!cueToGuest)}
            className={!cueLive && cueToGuest ? 'border-forged/70 text-ice' : undefined}
          >
            <Music2 size={14} /> {cueLive ? 'Cue live' : cueToGuest ? 'Cue armed' : 'Cue to guest'}
          </Button>
          <Button variant={canRetry ? 'primary' : 'secondary'} size="compact" disabled={busy || reconnecting || !guestInBooth} onClick={() => void retryPeer()}>
            <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : canRetry ? 'Retry' : 'Reconnect'}
          </Button>
        </div>
      )}

      {freshUrl && (
        <div className="space-y-1">
          <p className="studio-type-timecode break-all text-ice">{freshUrl}</p>
          <p className={HINT}>
            Private link: send it only to your guest, by a channel they chose. It is shown once — it cannot be recovered later
            (only a hash is stored). Revoke it if it goes to the wrong person.
          </p>
        </div>
      )}
      {!turnConfigured && (
        <div className="rounded-panel border border-lane-cohost-1/50 bg-lane-cohost-1/10 px-3 py-2">
          <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-lane-cohost-1">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Relay server not set up yet — ask your admin. Guests on strict office or school networks may not connect;
              a phone hotspot usually works meanwhile.
            </span>
          </p>
          <details className="mt-1">
            <summary className="studio-type-label cursor-pointer normal-case tracking-normal text-silver-label">For your admin</summary>
            <p className="studio-type-label mt-1 normal-case tracking-normal text-silver-label">
              Set <code>TURN_URL</code> + <code>TURN_SECRET</code> (or <code>TURN_USERNAME</code> + <code>TURN_CREDENTIAL</code>) in the
              site’s environment, then redeploy.
            </p>
          </details>
        </div>
      )}
      <details>
        <summary className={`${HINT} cursor-pointer hover:text-white`}>How talkback, cue and the guest backup work</summary>
        <p className={`${HINT} mt-1`}>
          Talkback is your mic in their phones. Cue to guest sends the live mix (other lanes, beds, SFX — not the Guest take) on a
          second audio line. Neither is laid on the Guest take or their backup. Safe pause mutes them on their side and shows a calm
          pause screen. Their backup uploads in 10-second parts while you record; Retry uses the same invite — no new token.
        </p>
      </details>
      {error && (
        <div className="rounded-control border border-heart/50 bg-heart/10 px-3 py-2" role="alert">
          <p className="studio-type-label inline-flex items-start gap-2 normal-case tracking-normal text-heart">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        </div>
      )}
      {(live || invites[0]) && <GuestTakesPanel invite={live || invites[0]} />}
    </div>
  )
}

function fmtDuration(sec: number | null) {
  if (sec == null || !Number.isFinite(sec)) return null
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtBytes(n: number) {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * The guest's backup takes for the host: listen or save without leaving the
 * room. Chunks are fetched through 10-minute signed URLs from the private
 * bucket and stitched in the browser; nothing here is a public URL.
 */
export function GuestTakesPanel({ invite }: { invite: GuestInviteAdmin }) {
  const [open, setOpen] = useState(false)
  const [takes, setTakes] = useState<GuestTakeManifest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ takeId: string; url: string; mime: string; kind: 'audio' | 'camera' } | null>(null)
  const previewRef = useRef<string | null>(null)

  const refreshKey = `${invite.id}|${invite.takeUrl || ''}|${invite.cameraUrl || ''}`
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void listGuestTakes(invite.id)
      .then((list) => {
        if (!cancelled) setTakes(list)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load guest takes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey])

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  async function assemble(take: GuestTakeManifest) {
    setBusy(take.takeId)
    setError(null)
    try {
      const blob = await assembleGuestTake(take, {
        onProgress: (done, total) => setBusy(`${take.takeId}:${total ? Math.round((done / total) * 100) : 0}`),
      })
      return blob
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch the take')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function listen(take: GuestTakeManifest) {
    const blob = await assemble(take)
    if (!blob) return
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(blob)
    previewRef.current = url
    setPreview({ takeId: take.takeId, url, mime: take.mime, kind: take.kind })
  }

  async function save(take: GuestTakeManifest) {
    const blob = await assemble(take)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `guest-${take.kind}-${take.takeId.slice(0, 8)}.${take.ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const busyPct = (id: string) => {
    if (!busy || !busy.startsWith(id)) return null
    const pct = busy.split(':')[1]
    return pct ? `${pct}%` : '…'
  }

  return (
    <div className="space-y-2 border-t border-divider pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="studio-type-label inline-flex min-h-[32px] items-center gap-1.5 text-ice"
      >
        <CloudDownload size={12} /> Guest backups {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="space-y-2">
          {loading && <p className={HINT}>Loading…</p>}
          {!loading && !takes.length && (
            <p className={HINT}>No backup parts yet. They appear while you record (about one part every 10 seconds).</p>
          )}
          {takes.map((t) => {
            const pct = busyPct(t.takeId)
            const problem = t.status === 'recording' || t.missing.length > 0
            return (
              <div key={t.takeId} className="space-y-1.5 rounded-panel border border-divider bg-surface px-3 py-2">
                <p className="studio-type-label flex flex-wrap items-center gap-x-2 gap-y-0.5 normal-case tracking-normal">
                  <span className="text-white">{t.kind === 'camera' ? 'Camera' : 'Audio'}</span>
                  <span className="studio-type-timecode text-silver">{t.ext.toUpperCase()}</span>
                  <span className={problem ? 'text-lane-cohost-1' : 'text-lane-cohost-2'}>
                    {t.status === 'complete' ? 'complete' : 'still arriving / unfinished'}
                  </span>
                  <span className="text-silver">
                    {t.chunkCount} parts · {fmtBytes(t.bytes)}
                    {fmtDuration(t.durationSec) ? ` · ${fmtDuration(t.durationSec)}` : ''}
                    {t.startedAtSessionSec != null ? ` · starts at ${fmtDuration(t.startedAtSessionSec)}` : ''}
                  </span>
                  {t.missing.length > 0 && <span className="text-heart">{t.missing.length} missing</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="dense" disabled={Boolean(busy) || !t.chunks.length} onClick={() => void listen(t)}>
                    <Play size={12} /> {pct ? `Fetching ${pct}` : t.kind === 'camera' ? 'Watch' : 'Listen'}
                  </Button>
                  <Button variant="secondary" size="dense" disabled={Boolean(busy) || !t.chunks.length} onClick={() => void save(t)}>
                    <Download size={12} /> Save file
                  </Button>
                </div>
                {preview?.takeId === t.takeId &&
                  (preview.kind === 'camera' ? (
                    <video controls src={preview.url} className="w-full rounded-control bg-black" preload="metadata" />
                  ) : (
                    <audio controls src={preview.url} className="w-full" preload="metadata" />
                  ))}
              </div>
            )
          })}
          {error && <p className="studio-type-label normal-case tracking-normal text-heart" role="alert">{error}</p>}
          <p className={HINT}>
            Files stay in the private bucket; links used here expire in 10 minutes. “Lay uploaded guest take” in the editor places
            the same audio on the timeline at its start time.
          </p>
        </div>
      )}
    </div>
  )
}
