'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Headphones, Link2, MicOff, Music2, Radio, RefreshCw, UserX, Video, VideoOff, Volume2 } from 'lucide-react'
import { openInputStream, stopStreams } from '@/lib/podcast/capture'
import { createHostFallbackSendMix, type HostFallbackSendMix } from '@/lib/podcast/guest-cue'
import {
  describeGuestSession,
  describeGuestTally,
  type GuestInviteAdmin,
  type GuestTallyPhase,
} from '@/lib/podcast/guest-types'
import {
  createAdminInvite,
  listAdminInvites,
  pullAdminSignals,
  pushAdminSignal,
  revokeAdminInvite,
  setAdminInviteState,
} from '@/lib/podcast/guest-signal'
import {
  addIce,
  answerOffer,
  applyProgramCue,
  applyTalkback,
  closePeer,
  collectRemoteStream,
  createStudioPeer,
  iceFailedHint,
  loadStudioIceServers,
  programCueSender,
  type StudioIceConfig,
} from '@/lib/podcast/webrtc'

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
}

const TONE_CLASS: Record<string, string> = {
  live: 'text-[#7CFFB2]',
  rec: 'text-[#FF7A9A]',
  wait: 'text-[#FFB86B]',
  warn: 'text-[#FFB86B]',
  fail: 'text-[#FF7A9A]',
  idle: 'text-[#A9B8C6]',
}

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
  const iceCfgRef = useRef<StudioIceConfig | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const afterRef = useRef(0)
  const hostRef = useRef<MediaStream | null>(null)
  const talkbackRef = useRef(false)
  const talkbackMicRef = useRef<MediaStream | null>(null)
  const cueToGuestRef = useRef(false)
  const cueStreamRef = useRef<MediaStream | null>(null)
  const fallbackMixRef = useRef<HostFallbackSendMix | null>(null)
  hostRef.current = hostStream
  talkbackRef.current = talkback
  cueToGuestRef.current = cueToGuest
  cueStreamRef.current = cueStream
  const cueLive = cueToGuest && Boolean(cueStream?.getAudioTracks().some((t) => t.readyState === 'live'))
  const liveId = invites.find((i) => !i.revoked && !i.expired)?.id || null
  const live = invites.find((i) => i.id === liveId) || null
  const tally = describeGuestTally(recTally)

  useEffect(() => {
    void loadStudioIceServers().then((cfg) => {
      iceCfgRef.current = cfg
      setTurnConfigured(cfg.turnConfigured)
    })
  }, [])

  async function readyIce() {
    if (iceCfgRef.current) return iceCfgRef.current
    const cfg = await loadStudioIceServers()
    iceCfgRef.current = cfg
    setTurnConfigured(cfg.turnConfigured)
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

  useEffect(() => {
    if (!liveId) return
    let cancelled = false
    const tick = async () => {
      try {
        const data = await pullAdminSignals(liveId, afterRef.current)
        if (cancelled) return
        setInvites((prev) => prev.map((i) => (i.id === data.invite.id ? { ...i, ...data.invite } : i)))
        for (const signal of data.signals) {
          afterRef.current = Math.max(afterRef.current, signal.id)
          await handleSignal(liveId, signal.kind, signal.payload)
        }
      } catch {
        /* poll again */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 900)
    return () => {
      cancelled = true
      window.clearInterval(id)
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
    const live = cueToGuestRef.current && Boolean(cueStreamRef.current?.getAudioTracks().some((t) => t.readyState === 'live'))
    void pushAdminSignal(inviteId, 'cue', { on: cueToGuestRef.current, live }).catch(() => {})
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
  }, [hostStream, talkback, cueToGuest, cueStream])

  useEffect(() => {
    onCueToGuest?.(cueToGuest)
  }, [cueToGuest, onCueToGuest])

  useEffect(() => {
    signalCue()
  }, [cueToGuest, cueLive, liveId])

  const recordingRef = useRef(recording)
  useEffect(() => {
    if (!liveId || recordingRef.current === recording) {
      recordingRef.current = recording
      return
    }
    recordingRef.current = recording
    void pushAdminSignal(liveId, 'record', {
      on: recording,
      phase: recording ? recTally : 'stopped',
    }).catch(() => {})
  }, [recording, liveId, recTally])

  const tallyRef = useRef(recTally)
  useEffect(() => {
    if (!liveId || tallyRef.current === recTally) {
      tallyRef.current = recTally
      return
    }
    tallyRef.current = recTally
    void pushAdminSignal(liveId, 'tally', { phase: recTally }).catch(() => {})
  }, [recTally, liveId])

  useEffect(() => {
    return () => {
      closePeer(peerRef.current, false)
      peerRef.current = null
      releaseTalkbackMic()
      stopFallbackMix()
      onRemoteStream(null)
      onRemoteVideo?.(false)
    }
  }, [onRemoteStream, onRemoteVideo])

  async function handleSignal(inviteId: string, kind: string, payload: Record<string, unknown>) {
    if (kind === 'offer' && payload.sdp) {
      const cfg = await readyIce()
      resetPeer(inviteId, cfg.iceServers)
      const peer = peerRef.current
      if (!peer) return
      const desc = await answerOffer(peer, payload as unknown as RTCSessionDescriptionInit)
      if (desc) await pushAdminSignal(inviteId, 'answer', { type: desc.type, sdp: desc.sdp })
      pushHeadphonesToPeer()
      void pushAdminSignal(inviteId, 'tally', { phase: tallyRef.current }).catch(() => {})
      if (talkbackRef.current) void pushAdminSignal(inviteId, 'talkback', { on: true }).catch(() => {})
      if (cueToGuestRef.current) signalCue(inviteId)
      if (recordingRef.current) {
        void pushAdminSignal(inviteId, 'record', { on: true, phase: tallyRef.current }).catch(() => {})
      }
      setReconnecting(false)
      return
    }
    if (kind === 'ice') {
      const peer = peerRef.current
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
    if (kind === 'reconnect') {
      const cfg = await readyIce()
      resetPeer(inviteId, cfg.iceServers)
      return
    }
    if (kind === 'hangup') {
      closePeer(peerRef.current, false)
      peerRef.current = null
      setIce('')
      setGuestMuted(false)
      setGuestCamOn(false)
      setTalkback(false)
      setCueToGuest(false)
      releaseTalkbackMic()
      stopFallbackMix()
      onRemoteStream(null)
      onRemoteVideo?.(false)
    }
  }

  function resetPeer(inviteId: string, iceServers?: RTCIceServer[]) {
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
      if (event.candidate) {
        void pushAdminSignal(inviteId, 'ice', { candidate: event.candidate.toJSON() })
      }
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
      setIce(peer.iceConnectionState)
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        setReconnecting(false)
        void setAdminInviteState(inviteId, 'connected').catch(() => {})
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
    await pushAdminSignal(liveId, 'mute', { on }).catch((err) => {
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
    await pushAdminSignal(liveId, 'camera', { on }).catch((err) => {
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
      const peer = peerRef.current
      talkbackRef.current = on
      setTalkback(on)
      pushHeadphonesToPeer()
      await pushAdminSignal(liveId, 'talkback', { on })
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
      await pushAdminSignal(liveId, 'reconnect', {})
      if (talkbackRef.current) await pushAdminSignal(liveId, 'talkback', { on: true }).catch(() => {})
      if (cueToGuestRef.current) signalCue(liveId)
    } catch (err) {
      setReconnecting(false)
      setError(err instanceof Error ? err.message : 'Could not reconnect')
    }
  }

  async function createLink() {
    if (!episodeId) return
    setBusy(true)
    setError(null)
    try {
      const data = await createAdminInvite(episodeId, hours)
      setInvites((prev) => [data.invite, ...prev.filter((i) => i.id !== data.invite.id)])
      setFreshUrl(data.invite.url || null)
      afterRef.current = 0
      setCopied(false)
      setGuestMuted(false)
      setMuteLocked(false)
      setGuestCamOn(false)
      setCamLocked(false)
      setTalkback(false)
      setCueToGuest(false)
      releaseTalkbackMic()
      stopFallbackMix()
      setIce('')
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
    setBusy(true)
    try {
      await pushAdminSignal(liveId, 'hangup', {}).catch(() => {})
      const data = await revokeAdminInvite(liveId)
      setInvites((prev) => prev.map((i) => (i.id === data.invite.id ? data.invite : i)))
      setFreshUrl(null)
      closePeer(peerRef.current, false)
      peerRef.current = null
      setGuestMuted(false)
      setMuteLocked(false)
      setGuestCamOn(false)
      setCamLocked(false)
      setTalkback(false)
      setCueToGuest(false)
      releaseTalkbackMic()
      stopFallbackMix()
      setIce('')
      onRemoteStream(null)
      onRemoteVideo?.(false)
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
        {liveInvite && (
          <span className={`text-[11px] font-mono ${TONE_CLASS[tally.tone] || TONE_CLASS.idle}`}>
            {tally.label}
          </span>
        )}
      </div>
      {live && !live.revoked && !live.expired && (
        <p className="text-[11px] text-[#7C8B97]">
          Mic {muteLocked ? 'host muted' : guestMuted ? 'guest muted' : 'live'}
          {' · '}
          Cam {camLocked ? 'host off' : guestCamOn ? 'on' : 'off'}
          {talkback ? ' · talkback on' : ' · talkback off'}
          {cueLive ? ' · cue live' : cueToGuest ? ' · cue armed' : ' · cue off'}
          {recording ? ` · host ${tally.label}` : ''}
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
            onClick={() => void createLink()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40"
          >
            <Radio size={14} /> {live && !live.revoked && !live.expired ? 'New link' : 'Create invite'}
          </button>
          {freshUrl && (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
            </button>
          )}
          {live && !live.revoked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void revokeLive()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#FF7A9A]"
            >
              <UserX size={14} /> Revoke
            </button>
          )}
        </div>
      )}
      {liveInvite && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void setGuestMute(!muteLocked)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              muteLocked
                ? 'bg-red-500/90 text-white'
                : 'border border-[#27313B] text-[#B8C4CF]'
            }`}
          >
            {muteLocked ? <Volume2 size={14} /> : <MicOff size={14} />}
            {muteLocked ? 'Unmute guest' : 'Mute guest'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setGuestCamera(camLocked)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              camLocked
                ? 'border border-[#FF7A9A]/50 text-[#FF7A9A]'
                : 'border border-[#27313B] text-[#B8C4CF]'
            }`}
          >
            {camLocked ? <Video size={14} /> : <VideoOff size={14} />}
            {camLocked ? 'Allow camera' : 'Camera off'}
          </button>
          <button
            type="button"
            disabled={busy || !guestInBooth}
            onClick={() => void setTalkbackOn(!talkback)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              talkback
                ? 'bg-[#53D6FF] text-[#061016]'
                : 'border border-[#27313B] text-[#B8C4CF]'
            } disabled:opacity-40`}
          >
            <Headphones size={14} /> {talkback ? 'Talkback on' : 'Talkback'}
          </button>
          <button
            type="button"
            disabled={busy || !guestInBooth}
            onClick={() => setCueToGuestOn(!cueToGuest)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
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
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              canRetry
                ? 'bg-[#53D6FF] text-[#061016]'
                : 'border border-[#27313B] text-[#B8C4CF]'
            } disabled:opacity-40`}
          >
            <RefreshCw size={14} /> {reconnecting ? 'Reconnecting…' : canRetry ? 'Retry' : 'Reconnect'}
          </button>
        </div>
      )}
      {freshUrl && (
        <p className="text-[11px] font-mono text-[#8DEBFF] break-all">{freshUrl}</p>
      )}
      {!turnConfigured && (
        <div className="rounded-lg border border-[#E8B84B]/50 bg-[#221B0A] px-3 py-2 text-xs text-[#F2D68A]">
          Relay (TURN) not configured. Guests on strict or office networks may fail to connect — set
          TURN_URL, TURN_USERNAME, and TURN_CREDENTIAL, or have the guest use a phone hotspot.
        </div>
      )}
      <p className="text-[11px] text-[#7C8B97]">
        Talkback is your mic in their phones. Cue to guest sends the live mix (other lanes, beds,
        SFX — not the Guest take being recorded) on a second audio line. Neither is laid on the
        Guest take or their local backup. Mute, camera-off, and Retry are unchanged. You keep
        Record, punch, FX, mix, and export.{' '}
        {turnConfigured
          ? 'TURN is on for this site.'
          : 'ICE is STUN-only until TURN_URL, TURN_USERNAME, and TURN_CREDENTIAL are set on Netlify.'}{' '}
        Retry uses the same invite — no new token. If the peer fails, their booth can still upload a
        camera file.
      </p>
      {canRetry && (
        <div className="rounded-lg border border-[#FF7A9A]/60 bg-[#2A1014] px-3 py-2 text-xs text-[#FFB3C3] space-y-2">
          <p>{iceFailedHint(turnConfigured)}</p>
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
      {error && <p className="text-xs text-[#FF7A9A]">{error}</p>}
    </div>
  )
}
