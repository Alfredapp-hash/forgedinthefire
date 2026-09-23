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
import { LiveCompositor } from '@/lib/podcast/live/compositor'
import { LiveAudioMix, type LiveLevels } from '@/lib/podcast/live/audio-mix'
import { WhipPublisher } from '@/lib/podcast/live/whip-client'
import { LiveRecorder, extensionFor, type LiveRecording } from '@/lib/podcast/live/recorder'
import {
  createDraftEpisode,
  createLiveSession,
  deleteLiveSession,
  fetchLiveProvider,
  listLiveSessions,
  patchLiveSession,
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
const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#27313B] px-3 py-1.5 text-sm text-[#B8C4CF] hover:border-[#53D6FF] disabled:opacity-40 disabled:pointer-events-none'

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
  const [levels, setLevels] = useState<LiveLevels>({ host: 0, guest: 0, program: 0 })

  // On air
  const [phase, setPhase] = useState<Phase>('off')
  const [health, setHealth] = useState<LiveHealth>(EMPTY_HEALTH)
  const [onAirAt, setOnAirAt] = useState<number | null>(null)
  const [clock, setClock] = useState(0)
  const [recording, setRecording] = useState<LiveRecording | null>(null)
  const [savedEpisodeId, setSavedEpisodeId] = useState<string | null>(null)

  const previewRef = useRef<HTMLDivElement | null>(null)
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
    compositor.canvas.setAttribute('aria-label', 'Program preview')
    previewRef.current?.appendChild(compositor.canvas)
    const meter = window.setInterval(() => setLevels(mix.levels()), 150)
    return () => {
      window.clearInterval(meter)
      if (countdownTimerRef.current != null) window.clearTimeout(countdownTimerRef.current)
      if (heartbeatRef.current != null) window.clearInterval(heartbeatRef.current)
      void publisherRef.current?.stop()
      publisherRef.current = null
      void recorderRef.current?.stop()
      compositor.canvas.remove()
      compositor.destroy()
      void mix.close()
      stopStreams([hostStreamRef.current])
    }
  }, [])

  useEffect(() => {
    if (!onAir) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.clearInterval(tick)
    }
  }, [onAir])

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
  function engageSafeSlate() {
    if (countdownTimerRef.current != null) {
      window.clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    mixRef.current?.setGuestMuted(true)
    compositorRef.current?.setScene('slate')
    setSceneState('slate')
    setSafe(true)
  }

  function releaseSafeSlate() {
    setSafe(false)
    mixRef.current?.setGuestMuted(guestMuted)
    putScene(lastCamera)
  }

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

  // ---------- go live / end ----------
  async function goLive() {
    const compositor = compositorRef.current
    const mix = mixRef.current
    if (!active || !compositor || !mix) return
    if (!provider?.configured) {
      setError('Set LIVE_WHIP_URL on the server first (see docs/podcast-live.md).')
      return
    }
    if (!hostStream) {
      setError('Open your camera and mic first.')
      return
    }
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
      const program = new MediaStream([
        ...compositor.captureStream().getVideoTracks(),
        ...mix.stream.getAudioTracks(),
      ])
      const ice = await loadStudioIceServers()
      const publisher = new WhipPublisher({ iceServers: ice.iceServers, onHealth: setHealth })
      publisherRef.current = publisher
      await publisher.start(program)
      const { session } = await patchLiveSession(active.id, { action: 'start' })
      upsertSession(session)
      recorderRef.current?.start(program, mix.stream, recordVideo)
      setOnAirAt(Date.now())
      setPhase('live')
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
      setPhase('off')
      setError(err instanceof Error ? err.message : 'Could not go live')
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
    await new Promise((r) => window.setTimeout(r, END_SLATE_MS))
    await publisherRef.current?.stop().catch(() => {})
    publisherRef.current = null
    const rec = (await recorderRef.current?.stop()) || null
    setRecording(rec)
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
  const playbackMissing =
    active && !active.playback_hls_url && !active.playback_whep_url && !provider?.defaultHlsUrl && !provider?.defaultWhepUrl
  const elapsed = onAirAt && clock ? Math.max(0, Math.round((clock - onAirAt) / 1000)) : 0

  return (
    <div className="space-y-4">
      {(error || notice) && (
        <div className="space-y-1" role="status">
          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-[#8DEBFF]">{notice}</p>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Program + switcher */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={label}>Program</p>
            <div className="flex items-center gap-2 text-xs">
              {phase === 'live' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FF3B5C] px-2 py-0.5 font-bold uppercase tracking-widest text-white">
                  <Radio size={12} /> On air {fmtDuration(elapsed)}
                </span>
              )}
              {phase === 'connecting' && <span className="text-[#FFB86B]">Connecting to ingest…</span>}
              {phase === 'ending' && <span className="text-[#FFB86B]">Ending…</span>}
              {safe && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFB86B] px-2 py-0.5 font-bold uppercase tracking-widest text-[#061016]">
                  Safe slate
                </span>
              )}
            </div>
          </div>
          <div ref={previewRef} className="relative" />

          <div className="flex flex-wrap items-center gap-2">
            {(['host', 'guest', 'pip'] as const).map((id) => (
              <button
                key={id}
                type="button"
                disabled={safe}
                onClick={() => takeCamera(id)}
                className={`${btn} ${scene === id ? 'border-[#53D6FF] text-[#8DEBFF]' : ''}`}
              >
                {id === 'pip' ? 'PIP' : id === 'host' ? 'Host' : 'Guest'}
              </button>
            ))}
            <button
              type="button"
              disabled={safe}
              onClick={() => putScene('starting')}
              className={`${btn} ${scene === 'starting' ? 'border-[#53D6FF] text-[#8DEBFF]' : ''}`}
            >
              Starting soon
            </button>
            <label className="inline-flex items-center gap-1.5 text-xs text-[#A9B8C6]">
              <input type="checkbox" checked={lowerThird} onChange={(e) => setLowerThird(e.target.checked)} />
              Title lower third
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!safe ? (
              <button
                type="button"
                onClick={engageSafeSlate}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFB86B] px-5 py-3 text-base font-bold text-[#061016] hover:bg-[#FFC98A]"
                title="Instantly cut Program to the branded slate and remove guest audio"
              >
                <ShieldAlert size={18} /> SAFE SLATE
              </button>
            ) : (
              <button
                type="button"
                onClick={releaseSafeSlate}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#FFB86B] px-5 py-3 text-base font-bold text-[#FFB86B]"
              >
                Release safe slate → {lastCamera.toUpperCase()}
              </button>
            )}
            {phase === 'off' || phase === 'ended' ? (
              <button
                type="button"
                onClick={() => void goLive()}
                disabled={!active || active.status === 'ended' || !hostStream || !provider?.configured}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF3B5C] px-5 py-3 text-base font-bold text-white disabled:opacity-40"
              >
                <Radio size={18} /> Go live
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void endShow()}
                disabled={phase !== 'live'}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#FF3B5C] px-5 py-3 text-base font-bold text-[#FF7A9A] disabled:opacity-40"
              >
                <Square size={16} /> End show
              </button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-[#A9B8C6]">
              Countdown
              <select
                value={countdownSec}
                disabled={onAir}
                onChange={(e) => setCountdownSec(Number(e.target.value))}
                className="rounded border border-[#27313B] bg-[#05070A] px-1 py-0.5 text-xs text-[#F6FAFC]"
              >
                {[0, 10, 30, 60, 120, 300].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? 'none' : s < 60 ? `${s}s` : `${s / 60}m`}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-[#A9B8C6]">
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
            Safe slate is an instant cut (no fade) and hard-mutes guest audio in Program. It works before, during and
            after going live. Keep this browser tab in the foreground and stay on this Live show tab while on air — switching console tabs stops the stream.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Meter name="Host" value={levels.host} />
              <Meter name="Guest" value={levels.guest} />
              <Meter name="Program" value={levels.program} />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <button type="button" className={btn} onClick={() => setHostMuted((v) => !v)}>
                {hostMuted ? <MicOff size={14} /> : <Mic size={14} />} Host {hostMuted ? 'muted' : 'on'}
              </button>
              <button type="button" className={btn} disabled={safe} onClick={() => setGuestMuted((v) => !v)}>
                {guestMuted || safe ? <MicOff size={14} /> : <Mic size={14} />} Guest{' '}
                {guestMuted || safe ? 'muted' : 'on'}
              </button>
              <button type="button" className={btn} onClick={() => setMonitor((v) => !v)}>
                <Headphones size={14} /> Monitor {monitor ? 'on' : 'off'}
              </button>
            </div>
          </div>
          <SfxPad compact disabled={!hostStream} onDrop={(id) => void mixRef.current?.playSfx(id)} />
        </section>

        {/* Right column: health, provider, devices */}
        <div className="space-y-4">
          <section className={card}>
            <p className={label}>Stream health</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-[#A9B8C6]">Ingest</dt>
              <dd className="text-[#F6FAFC]">{health.state}</dd>
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
