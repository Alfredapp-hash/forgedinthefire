'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyGainAndFades,
  decodeUrl,
  encodeMp3,
  encodeWav,
  formatClock,
  parseClock,
  sliceBuffer,
} from '@/lib/podcast/audio'
import {
  EFFECT_META,
  applyEffect,
  bufferFromBlob,
  cloneBuffer,
  type EffectId,
} from '@/lib/podcast/effects'
import {
  INSERT_FX,
  RENDER_ONLY_FX,
  VOICE_CLEANUP_INSERTS,
  invalidateInsertCache,
  isInsertFx,
  tracksWithInserts,
} from '@/lib/podcast/inserts'
import {
  DEFAULT_PEOPLE,
  TRACK_COLORS,
  cloneAudioBuffer,
  clipsOf,
  createEmptyTrack,
  dbFromLinear,
  defaultSessionTracks,
  emptyTakeForPerson,
  emptyTakesForPerson,
  ensurePersonLanes,
  mixdownTracks,
  newClipId,
  newPersonId,
  nextTakeNumber,
  peakMeter,
  roleForPerson,
  sessionDuration,
  assignCompRange,
  clearCompRanges,
  isVoiceRole,
  withListenTake,
  type SessionPerson,
  type StudioTrack,
  type TrackClip,
} from '@/lib/podcast/multitrack'
import {
  clearAutomation,
  cropToRange,
  deleteRange,
  duplicateClipAt,
  fullClipForBuffer,
  joinAdjacentClips,
  mapTrack,
  moveClip,
  muteRange,
  pasteClip,
  setClipFades,
  setVolumeInRange,
  splitRange,
  splitTrackAt,
  trimClip,
} from '@/lib/podcast/edit'
import {
  REC_MODE_META,
  attachInputMeter,
  computePunchAlignmentOffset,
  decodePunchAlignment,
  playCountIn,
  punchInTime,
  sharedPunchInTime,
  sleep,
  startLiveMix,
  waitUntilContextTime,
  type CueHandle,
  type RecMode,
} from '@/lib/podcast/record-session'
import {
  checkStorageQuota,
  clearRecoverableTakes,
  clearSession,
  loadRecoverableTakes,
  loadSession,
  peekRecoverableTakes,
  peekSession,
  saveSession,
  type CheckpointMeta,
  type SessionPeek,
} from '@/lib/podcast/session-store'
import {
  createWatchdog,
  makeCheckpointSink,
  openInputStreams,
  startLaneCapture,
  stopLaneCapture,
  stopStreams,
  type CaptureWatchdog,
  type LaneCapture,
} from '@/lib/podcast/capture'
import { renderPictureMix, type PictureMode, type PictureScene } from '@/lib/podcast/picture'
import type { PodcastChapter } from '@/lib/studio/types'
import { applyFollowTalker } from '@/lib/podcast/auto-mix'
import { gainForTargetLufs, measureLoudness, PODCAST_LUFS } from '@/lib/podcast/lufs'
import { slugFile, zipStore } from '@/lib/podcast/zip'
import { renderSfx, SFX_META, type SfxId } from '@/lib/podcast/sfx'
import { SfxPad } from '@/components/podcast/sfx-pad'
import { SessionTimeline } from '@/components/podcast/session-timeline'
import { GuestInvitePanel } from '@/components/podcast/guest-invite-panel'
import type { GuestTallyPhase } from '@/lib/podcast/guest-types'
import { CameraClipReview, CameraLane } from '@/components/podcast/camera-lane'
import { CameraPreview } from '@/components/podcast/camera-preview'
import { ProgramMonitor, ProgramSwitcher } from '@/components/podcast/program-monitor'
import {
  CAMERA_ARM_WARNING,
  CAMERA_MB_PER_MIN,
  cameraClipEnd,
  cameraLayer,
  cameraStorageHint,
  formatBytes,
  measureVideoDuration,
  newBrollClip,
  newCameraClipId,
  newStingerClip,
  newSyncGroupId,
  newTitleClip,
  normalizeCameraClip,
  openCameraStream,
  pictureEnd,
  startCameraCapture,
  streamHasLiveVideo,
  type CameraCapture,
  type CameraClip,
} from '@/lib/podcast/camera'
import {
  addKeyframeAt,
  deleteCameraRange,
  dissolveCameraPair,
  joinAdjacentCamera,
  moveCameraClip,
  removeKeyframe,
  seedCameraKeyframes,
  setCameraFades,
  setCameraFilter,
  setStingerStyle,
  slipCameraClip,
  splitCameraAt,
  toggleCameraMute,
  trimCameraClip,
  updateKeyframe,
} from '@/lib/podcast/camera-edit'
import {
  avBroken,
  avDriftForPerson,
  nudgeAudioWithCamera,
  nudgeCamerasWithAudio,
  personAvLinked,
} from '@/lib/podcast/av-sync'

const REMOTE_GUEST_KEY = 'remote:guest'
import {
  BookmarkPlus,
  CopyPlus,
  Headphones,
  Mic2,
  Minus,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Undo2,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react'

type Props = {
  episodeId?: string | null
  audioUrl?: string | null
  title: string
  onExported: (file: File, durationSeconds: number) => Promise<void>
  onPublished?: () => Promise<void>
  onMarkChapter?: (seconds: number) => void
  chapters?: PodcastChapter[]
}

type Snapshot = {
  tracks: StudioTrack[]
  cameras: CameraClip[]
  selectedId: string | null
  selectedCamClipId: string | null
}

/** Best-guess capture sample rate for worklet PCM checkpoints (before capture opens). */
function sampleRateProbe(): number {
  try {
    if (typeof AudioContext === 'undefined') return 48000
    const ctx = new AudioContext()
    const rate = ctx.sampleRate
    void ctx.close()
    return rate || 48000
  } catch {
    return 48000
  }
}

function snapshotTracks(tracks: StudioTrack[]): StudioTrack[] {
  return tracks.map((t) => ({
    ...t,
    clips: (t.clips || []).map((c) => ({ ...c })),
    automation: (t.automation || []).map((p) => ({ ...p })),
    compRanges: (t.compRanges || []).map((r) => ({ ...r })),
    buffer: t.buffer,
  }))
}

export function PodcastAudioEditor({ episodeId, audioUrl, title, onExported, onPublished, onMarkChapter, chapters }: Props) {
  const [tracks, setTracks] = useState<StudioTrack[]>(() => defaultSessionTracks())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [sectionLevel, setSectionLevel] = useState(0.25)
  const [applyRangeAll, setApplyRangeAll] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [range, setRange] = useState({ start: 0, end: 0, total: 0 })
  const rangeRef = useRef({ start: 0, end: 0, total: 0 })
  rangeRef.current = range
  const [masterGain, setMasterGain] = useState(1)
  const [masterFadeIn, setMasterFadeIn] = useState(0.15)
  const [masterFadeOut, setMasterFadeOut] = useState(0.4)
  const [zoom, setZoom] = useState(48)
  const [timelineScroll, setTimelineScroll] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [applied, setApplied] = useState<EffectId[]>([])
  const [meter, setMeter] = useState<{ peak: number; rms: number } | null>(null)
  const [loop, setLoop] = useState(false)
  const [metronome, setMetronome] = useState(false)
  const [bpm, setBpm] = useState(90)
  const [people, setPeople] = useState<SessionPerson[]>(() => DEFAULT_PEOPLE)
  const [recMode, setRecMode] = useState<RecMode>('after_mix')
  const [preroll, setPreroll] = useState(3)
  const [countInBeats, setCountInBeats] = useState(0)
  const [cueEnabled, setCueEnabled] = useState(true)
  const [cueGain, setCueGain] = useState(0.85)
  const [cueToGuest, setCueToGuest] = useState(false)
  const [guestCueStream, setGuestCueStream] = useState<MediaStream | null>(null)
  const [replaceArmed, setReplaceArmed] = useState(false)
  const [rawInput, setRawInput] = useState(false)
  const [autoMuteQuiet, setAutoMuteQuiet] = useState(true)
  const [voiceIsolate, setVoiceIsolate] = useState(true)
  const [micId, setMicId] = useState('')
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [cameraStreams, setCameraStreams] = useState<Record<string, MediaStream>>({})
  const [cameraClips, setCameraClips] = useState<CameraClip[]>([])
  const [selectedCamClipId, setSelectedCamClipId] = useState<string | null>(null)
  const [pictureMode, setPictureMode] = useState<PictureMode>('a-roll')
  const [pvwScene, setPvwScene] = useState<PictureScene>('host')
  const [pgmScene, setPgmScene] = useState<PictureScene>('host')
  const [pgmFrom, setPgmFrom] = useState<PictureScene>('host')
  const [pgmMix, setPgmMix] = useState(1)
  const [fadeNext, setFadeNext] = useState(false)
  const fadeAnimRef = useRef(0)
  const [camWarnFor, setCamWarnFor] = useState<string | null>(null)
  const [camStorageHint, setCamStorageHint] = useState<string | null>(null)
  const camWarnedRef = useRef(false)
  const [inputPeaks, setInputPeaks] = useState<Record<string, number>>({})
  const [clipHolds, setClipHolds] = useState<Record<string, boolean>>({})
  const [matchLufs, setMatchLufs] = useState(true)
  const [loudness, setLoudness] = useState<{ lufs: number; peakDb: number } | null>(null)
  const [recClock, setRecClock] = useState(0)
  const [personDraft, setPersonDraft] = useState('')
  const [playhead, setPlayhead] = useState(0)
  const [recover, setRecover] = useState<SessionPeek | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'offer' | 'open'>(
    episodeId ? 'checking' : 'open',
  )
  /** Crash survivors: checkpointed-but-unfinalized takes from a previous tab. */
  const [crashTakes, setCrashTakes] = useState<CheckpointMeta[]>([])
  /** Recording watchdog — updated by capture ticks; UI reads via recWatchdogRef. */
  const [recFlowStalled, setRecFlowStalled] = useState(false)

  const recorderRef = useRef<LaneCapture[]>([])
  const capturesRef = useRef<LaneCapture[]>([])
  /** Watchdogs for the lanes recording this take (samples-flowing signal). */
  const watchdogsRef = useRef<CaptureWatchdog[]>([])
  const watchdogRafRef = useRef<number | null>(null)
  const cameraCapturesRef = useRef<CameraCapture[]>([])
  const cameraStreamsRef = useRef<Record<string, MediaStream>>({})
  const streamRef = useRef<MediaStream[]>([])
  const clipClipboardRef = useRef<TrackClip | null>(null)
  const historyRef = useRef<Snapshot[]>([])
  const [historyLen, setHistoryLen] = useState(0)
  const metroRef = useRef<number | null>(null)
  const metroCtxRef = useRef<AudioContext | null>(null)
  const seededRef = useRef(false)
  const recordingRef = useRef(false)
  const cueRef = useRef<CueHandle | null>(null)
  const mixRef = useRef<CueHandle | null>(null)
  const cueToGuestRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const punchRef = useRef(0)
  const recStartedAtRef = useRef(0)
  // T5 shared punch clock: wall-clock epoch (ms) at punch. The guest reports its
  // own capture-start epoch on the take URL; the delta (RTT-corrected) is the
  // offset we shift an uploaded guest take by so it lines up with the host punch.
  const recPunchEpochRef = useRef(0)
  const stopMeterRef = useRef<Array<() => void>>([])
  const recRafRef = useRef<number | null>(null)
  const playheadRef = useRef(0)
  const playRafRef = useRef<number | null>(null)
  const recLiveRef = useRef(false)
  const idleStreamRef = useRef<MediaStream[]>([])
  const idleStopRef = useRef<Array<() => void>>([])
  const clipTimerRef = useRef<Record<string, number>>({})
  const remoteGuestRef = useRef<MediaStream | null>(null)
  const [remoteGuest, setRemoteGuest] = useState<MediaStream | null>(null)
  const [remoteGuestVideo, setRemoteGuestVideo] = useState(false)
  const [hostTalkStream, setHostTalkStream] = useState<MediaStream | null>(null)
  const [guestTakeUrl, setGuestTakeUrl] = useState<string | null>(null)
  const [guestCameraUrl, setGuestCameraUrl] = useState<string | null>(null)
  const [recTally, setRecTally] = useState<GuestTallyPhase>('waiting')

  const selected = useMemo(
    () => tracks.find((t) => t.id === selectedId) || tracks[0] || null,
    [tracks, selectedId],
  )
  const pictureMarkers = useMemo(
    () =>
      (chapters || []).map((ch) => ({
        time: Math.max(0, (ch.start_ms || 0) / 1000),
        label: ch.title || 'Chapter',
      })),
    [chapters],
  )

  const hasAudio = tracks.some((t) => Boolean(t.buffer))
  const sessionLen = Math.max(sessionDuration(tracks), pictureEnd(cameraClips))
  const ready = hasAudio
  const anyArmed = tracks.some((t) => t.armed)
  const personIdsArmed = new Set(tracks.filter((t) => t.armed).map((t) => t.personId)).size
  const armedDeviceCount = new Set(
    tracks
      .filter((t) => t.armed)
      .map((t) => people.find((p) => p.id === t.personId)?.inputDeviceId || micId || ''),
  ).size

  const setHead = useCallback((sec: number) => {
    const next = Math.max(0, sec)
    playheadRef.current = next
    setPlayhead(next)
  }, [])

  cueToGuestRef.current = cueToGuest

  const publishGuestCue = useCallback((handle: CueHandle | null) => {
    setGuestCueStream(handle?.stream ?? null)
  }, [])

  const stopMix = useCallback(() => {
    mixRef.current?.stop()
    mixRef.current = null
    if (playRafRef.current) cancelAnimationFrame(playRafRef.current)
    playRafRef.current = null
    setPlaying(false)
    if (!cueRef.current) publishGuestCue(null)
  }, [publishGuestCue])

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      tracks: snapshotTracks(tracks),
      cameras: cameraClips.map((c) => ({ ...c })),
      selectedId,
      selectedCamClipId,
    })
    if (historyRef.current.length > 20) historyRef.current.shift()
    setHistoryLen(historyRef.current.length)
  }, [tracks, cameraClips, selectedId, selectedCamClipId])

  const onRemoteGuestStream = useCallback((stream: MediaStream | null) => {
    remoteGuestRef.current = stream
    setRemoteGuest(stream)
    if (!stream) return
    const guestCam = cameraStreamsRef.current.guest
    if (guestCam) {
      stopStreams([guestCam])
      setCameraStreams((prev) => {
        const next = { ...prev }
        delete next.guest
        return next
      })
    }
    setTracks((prev) => {
      const guest = emptyTakeForPerson(prev, 'guest') || prev.find((t) => t.personId === 'guest')
      if (!guest) return prev
      return prev.map((t) => (t.personId === 'guest' ? { ...t, armed: t.id === guest.id } : t))
    })
    setOk(
      streamHasLiveVideo(stream)
        ? 'Remote guest is live — Guest lane records their booth. Camera file writes if their cam is on.'
        : 'Remote guest is live — Guest lane records their booth. Waiting for their camera.',
    )
  }, [])

  const onRemoteGuestName = useCallback((name: string | null) => {
    if (!name) return
    setPeople((prev) => prev.map((p) => (p.id === 'guest' ? { ...p, name } : p)))
  }, [])

  cameraStreamsRef.current = cameraStreams

  useEffect(() => {
    if (!camWarnFor) {
      setCamStorageHint(null)
      return
    }
    void cameraStorageHint().then(setCamStorageHint)
  }, [camWarnFor])

  const revokeUrl = (url: string | null) => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const bufferToUrl = (buffer: AudioBuffer) => URL.createObjectURL(encodeWav(buffer))

  const updateTrack = useCallback((id: string, patch: Partial<StudioTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const assignBufferToTrack = useCallback(
    (id: string, buffer: AudioBuffer, label?: string) => {
      const url = bufferToUrl(buffer)
      invalidateInsertCache(id)
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          revokeUrl(t.url)
          return {
            ...t,
            buffer: cloneAudioBuffer(buffer),
            url,
            clips: [fullClipForBuffer(buffer, t.offset, t.fadeIn, t.fadeOut)],
          }
        }),
      )
      setSelectedId(id)
      if (label) setOk(label)
    },
    [],
  )

  const rebuildMasterPreview = useCallback(async () => {
    if (recordingRef.current) return
    if (!tracks.some((t) => t.buffer)) {
      setMeter(null)
      setLoudness(null)
      return
    }
    try {
      const mixed = mixdownTracks(await tracksWithInserts(tracks))
      const shaped = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      setMeter(peakMeter(shaped))
      const loud = measureLoudness(shaped)
      setLoudness(Number.isFinite(loud.lufs) ? { lufs: loud.lufs, peakDb: loud.peakDb } : null)
    } catch {
      /* preview meter is optional */
    }
  }, [tracks, masterGain, masterFadeIn, masterFadeOut])

  useEffect(() => {
    if (!episodeId) {
      setSessionStatus('open')
      return
    }
    let cancelled = false
    void Promise.all([
      peekSession(episodeId).catch(() => null),
      peekRecoverableTakes(episodeId).catch(() => [] as CheckpointMeta[]),
    ]).then(([peek, takes]) => {
      if (cancelled) return
      if (takes.length > 0) setCrashTakes(takes)
      if ((peek && (peek.takeCount > 0 || peek.cameraCount > 0)) || takes.length > 0) {
        if (peek) setRecover(peek)
        setSessionStatus('offer')
      } else {
        setSessionStatus('open')
      }
    }).catch(() => {
      if (!cancelled) setSessionStatus('open')
    })
    return () => {
      cancelled = true
    }
  }, [episodeId])

  // Seed first vocal track from existing episode audio once — skipped if a local session can be recovered
  useEffect(() => {
    if (sessionStatus !== 'open') return
    if (!audioUrl || seededRef.current) return
    seededRef.current = true
    void (async () => {
      setBusy('Loading episode audio…')
      try {
        const sourceUrl = `/api/admin/media/file?url=${encodeURIComponent(audioUrl)}`
        const buffer = await decodeUrl(sourceUrl)
        const blobUrl = bufferToUrl(buffer)
        let vocalId: string | null = null
        setTracks((prev) => {
          const vocal = prev.find((t) => t.role === 'vocal') || prev[0]
          if (!vocal) return prev
          vocalId = vocal.id
          revokeUrl(vocal.url)
          return prev.map((t) =>
            t.id === vocal.id
              ? {
                  ...t,
                  buffer: cloneAudioBuffer(buffer),
                  url: blobUrl,
                  armed: true,
                }
              : { ...t, armed: false },
          )
        })
        if (vocalId) setSelectedId(vocalId)
        setOk('Episode audio loaded on Vocal track')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load audio')
      } finally {
        setBusy(null)
      }
    })()
  }, [audioUrl, sessionStatus])

  useEffect(() => {
    if (!episodeId || recording || sessionStatus !== 'open') return
    if (!tracks.some((t) => t.buffer)) return
    const t = window.setTimeout(() => {
      void saveSession(episodeId, people, tracks, cameraClips).catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not autosave takes on this computer')
      })
    }, 1600)
    return () => window.clearTimeout(t)
  }, [episodeId, people, tracks, cameraClips, recording, sessionStatus])

  useEffect(() => {
    return () => {
      if (fadeAnimRef.current) cancelAnimationFrame(fadeAnimRef.current)
    }
  }, [])

  useEffect(() => {
    setRange((prev) => {
      const total = sessionLen
      if (total <= 0) return { start: 0, end: 0, total: 0 }
      const start = Math.min(prev.start, total)
      const end = prev.end <= 0 || prev.end >= prev.total - 0.05 ? total : Math.min(prev.end, total)
      return { start, end, total }
    })
  }, [sessionLen])

  useEffect(() => {
    if (recordingRef.current) return
    const t = window.setTimeout(() => void rebuildMasterPreview(), 1200)
    return () => window.clearTimeout(t)
  }, [rebuildMasterPreview])

  useEffect(() => {
    return () => {
      tracks.forEach((t) => revokeUrl(t.url))
      cameraClips.forEach((clip) => revokeUrl(clip.url))
      stopMetronome()
      stopMix()
      stopStreams(streamRef.current)
      stopStreams(idleStreamRef.current)
      stopStreams(Object.values(cameraStreamsRef.current))
      cameraCapturesRef.current.forEach((c) => {
        if (c.recorder.state !== 'inactive') c.recorder.stop()
      })
      cueRef.current?.stop()
      stopMeterRef.current.forEach((fn) => fn())
      idleStopRef.current.forEach((fn) => fn())
      abortRef.current?.abort()
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
      if (watchdogRafRef.current) window.clearInterval(watchdogRafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopMetronome() {
    if (metroRef.current != null) {
      window.clearInterval(metroRef.current)
      metroRef.current = null
    }
    void metroCtxRef.current?.close()
    metroCtxRef.current = null
  }

  function clickMetronome() {
    const ctx = metroCtxRef.current || new AudioContext()
    metroCtxRef.current = ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    osc.start(now)
    osc.stop(now + 0.06)
  }

  useEffect(() => {
    stopMetronome()
    if (!metronome) return
    const ms = Math.max(200, Math.round(60000 / bpm))
    clickMetronome()
    metroRef.current = window.setInterval(clickMetronome, ms)
    return () => stopMetronome()
  }, [metronome, bpm])

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        setMics(list.filter((d) => d.kind === 'audioinput'))
        setCams(list.filter((d) => d.kind === 'videoinput'))
      } catch {
        /* permission comes on first record */
      }
    }
    void load()
    navigator.mediaDevices.addEventListener?.('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', load)
  }, [])

  useEffect(() => {
    if (recording || !anyArmed || !navigator.mediaDevices?.getUserMedia) return
    let cancelled = false
    const armed = tracks.filter((t) => t.armed)
    const keys = [
      ...new Set(
        (armed.length ? armed : []).map((t) => deviceKey(t.personId)).filter((key) => key !== REMOTE_GUEST_KEY),
      ),
    ]
    if (keys.length === 0 && !remoteGuest) keys.push(micId || '')
    void (async () => {
      try {
        const streams = keys.length ? await openInputStreams(keys, rawInput) : new Map<string, MediaStream>()
        if (cancelled || recordingRef.current) {
          stopStreams(streams.values())
          return
        }
        if (remoteGuest) streams.set(REMOTE_GUEST_KEY, remoteGuest)
        idleStreamRef.current = [...streams.values()].filter((stream) => stream !== remoteGuest)
        const hostKey = people.find((p) => p.id === 'host')?.inputDeviceId || micId || ''
        setHostTalkStream(streams.get(hostKey) || [...streams.values()].find((s) => s !== remoteGuest) || null)
        try {
          const list = await navigator.mediaDevices.enumerateDevices()
          if (!cancelled) {
            setMics(list.filter((d) => d.kind === 'audioinput'))
            setCams(list.filter((d) => d.kind === 'videoinput'))
          }
        } catch {
          /* labels appear after permission */
        }
        idleStopRef.current = [...streams.entries()].map(([key, stream]) => {
          if (!stream) return () => {}
          const names = [
            ...new Set(
              (armed.length ? armed : []).map((lane) => {
                const laneKey = deviceKey(lane.personId)
                if (laneKey !== key) return null
                return people.find((p) => p.id === lane.personId)?.name || null
              }).filter((n): n is string => Boolean(n)),
            ),
          ]
          const meterKey = names.join(' + ') || (key === REMOTE_GUEST_KEY ? 'Guest' : 'Mic')
          return attachInputMeter(stream, (peak) => {
            setInputPeaks((prev) => ({ ...prev, [meterKey]: peak }))
            if (peak >= 0.98) {
              setClipHolds((prev) => ({ ...prev, [meterKey]: true }))
              const timers = clipTimerRef.current
              if (timers[meterKey]) window.clearTimeout(timers[meterKey])
              timers[meterKey] = window.setTimeout(() => {
                setClipHolds((prev) => ({ ...prev, [meterKey]: false }))
              }, 1600)
            }
          })
        })
      } catch {
        /* permission comes on Record */
      }
    })()
    return () => {
      cancelled = true
      idleStopRef.current.forEach((fn) => fn())
      idleStopRef.current = []
      stopStreams(idleStreamRef.current)
      idleStreamRef.current = []
    }
  }, [recording, anyArmed, rawInput, micId, remoteGuest, people, tracks.map((t) => `${t.id}:${t.armed}:${t.personId}`).join('|')])

  useEffect(() => {
    if (!recording && (recTally === 'count-in' || recTally === 'rec')) {
      setRecTally('stopped')
    }
  }, [recording, recTally])

  // Recording watchdog: if no capture lane has delivered samples recently while
  // live, flag a stall so the UI can warn the host their recorder went silent.
  useEffect(() => {
    if (!recording) {
      setRecFlowStalled(false)
      if (watchdogRafRef.current) window.clearInterval(watchdogRafRef.current)
      watchdogRafRef.current = null
      return
    }
    const STALL_MS = 3000
    const id = window.setInterval(() => {
      if (!recLiveRef.current) return
      const dogs = watchdogsRef.current
      if (dogs.length === 0) return
      const now = performance.now()
      // Flowing if ANY lane ticked within the window (a muted guest can be silent).
      const flowing = dogs.some((d) => {
        const { lastTickAt } = d.read()
        return lastTickAt > 0 && now - lastTickAt < STALL_MS
      })
      setRecFlowStalled(!flowing)
    }, 1000)
    watchdogRafRef.current = id
    return () => {
      window.clearInterval(id)
      watchdogRafRef.current = null
    }
  }, [recording])

  useEffect(() => {
    if (!recording) {
      setRecClock(punchRef.current)
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
      recRafRef.current = null
      return
    }
    const tick = () => {
      const elapsed = (performance.now() - recStartedAtRef.current) / 1000
      const t = punchRef.current + Math.max(0, elapsed)
      setRecClock(t)
      setHead(t)
      recRafRef.current = requestAnimationFrame(tick)
    }
    recRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
    }
  }, [recording, setHead])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!recording) void togglePlay()
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        void toggleRecord()
      }
      if (event.key >= '1' && event.key <= '9') {
        const sfx = SFX_META[Number(event.key) - 1]
        if (sfx && !recording) {
          event.preventDefault()
          void dropSfx(sfx.id)
        }
      }
      if (event.key === '0' && !recording) {
        const sfx = SFX_META[9]
        if (sfx) {
          event.preventDefault()
          void dropSfx(sfx.id)
        }
      }
      if ((event.key === 'c' || event.key === 'C') && onMarkChapter) {
        event.preventDefault()
        onMarkChapter(playheadRef.current)
      }
      if ((event.key === 's' || event.key === 'S') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        splitSelectedAtPlayhead()
      }
      if ((event.key === 'v' || event.key === 'V') && !event.metaKey && !event.ctrlKey && !recording) {
        event.preventDefault()
        splitSelectedCameraAtPlayhead()
      }
      if ((event.key === 'j' || event.key === 'J') && !recording) {
        event.preventDefault()
        if (playing) stopMix()
        nudge(event.shiftKey ? -5 : -1)
      }
      if ((event.key === 'k' || event.key === 'K') && !recording) {
        event.preventDefault()
        if (playing) stopMix()
      }
      if ((event.key === 'l' || event.key === 'L') && !recording) {
        event.preventDefault()
        if (!playing) void togglePlay()
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && !recording) {
        event.preventDefault()
        editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, event.shiftKey), event.shiftKey ? 'Ripple-deleted range' : 'Cut hole in lane')
      }
      if ((event.key === 'm' || event.key === 'M') && !recording && event.shiftKey) {
        event.preventDefault()
        editRange((t) => muteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Muted range on this lane')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, tracks, recMode, preroll, cueEnabled, selectedId, playing])

  function setBound(which: 'start' | 'end') {
    const t = playheadRef.current
    setRange((prev) => {
      if (which === 'start') return { ...prev, start: Math.min(t, Math.max(0, prev.end - 0.05)) }
      return { ...prev, end: Math.max(t, prev.start + 0.05) }
    })
  }

  function nudge(seconds: number) {
    const total = Math.max(sessionLen, playheadRef.current)
    setHead(Math.max(0, Math.min(total, playheadRef.current + seconds)))
  }

  async function togglePlay() {
    if (recordingRef.current) return
    if (playing || mixRef.current) {
      const t = mixRef.current?.sessionTime() ?? playheadRef.current
      stopMix()
      setHead(t)
      return
    }
    if (!hasAudio) return
    const from = loop ? range.start : playheadRef.current
    const prepared = await tracksWithInserts(tracks)
    const handle = startLiveMix(prepared, { fromSec: from, gain: masterGain * cueGain })
    if (!handle) {
      setError('Nothing audible to play — unmute a take')
      return
    }
    mixRef.current = handle
    publishGuestCue(handle)
    setPlaying(true)
    const tick = () => {
      const live = mixRef.current
      if (!live) return
      const now = live.sessionTime()
      setHead(now)
      const end = loop ? range.end || sessionLen : sessionLen
      if (now >= end - 0.02) {
        if (loop && range.end > range.start) {
          live.stop()
          void tracksWithInserts(tracks).then((againTracks) => {
            const again = startLiveMix(againTracks, { fromSec: range.start, gain: masterGain * cueGain })
            mixRef.current = again
            publishGuestCue(again)
            if (!again) {
              stopMix()
              return
            }
            void again.ctx.resume()
            playRafRef.current = requestAnimationFrame(tick)
          })
          return
        }
        stopMix()
        setHead(end)
        return
      }
      playRafRef.current = requestAnimationFrame(tick)
    }
    playRafRef.current = requestAnimationFrame(tick)
  }

  async function undo() {
    const prev = historyRef.current.pop()
    setHistoryLen(historyRef.current.length)
    if (!prev) return
    tracks.forEach((t) => revokeUrl(t.url))
    setTracks(
      prev.tracks.map((t) => ({
        ...t,
        url: t.buffer ? bufferToUrl(t.buffer) : null,
      })),
    )
    setCameraClips(prev.cameras.map((c) => normalizeCameraClip({ ...c })))
    setSelectedId(prev.selectedId)
    setSelectedCamClipId(prev.selectedCamClipId)
    setApplied([])
    setOk('Undid last change')
  }

  async function restoreSavedSession() {
    if (!episodeId || !recover) return
    setBusy('Restoring takes from this computer…')
    setError(null)
    try {
      const saved = await loadSession(episodeId)
      if (!saved) {
        setError('No saved takes found')
        setRecover(null)
        setSessionStatus('open')
        return
      }
      tracks.forEach((t) => revokeUrl(t.url))
      cameraClips.forEach((clip) => revokeUrl(clip.url))
      setPeople(saved.people)
      setTracks(ensurePersonLanes(saved.tracks, saved.people))
      setCameraClips(saved.cameras.map(normalizeCameraClip))
      setSelectedCamClipId(saved.cameras[0]?.id || null)
      setSelectedId(saved.tracks.find((t) => t.armed)?.id || saved.tracks.find((t) => t.buffer)?.id || null)
      seededRef.current = true
      setRecover(null)
      setSessionStatus('open')
      const camNote = saved.cameras.length
        ? ` + ${saved.cameras.length} camera file${saved.cameras.length === 1 ? '' : 's'}`
        : ''
      setOk(
        `Restored ${saved.tracks.filter((t) => t.buffer).length} takes${camNote} from ${new Date(recover.savedAt).toLocaleTimeString()}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore session')
      setSessionStatus('open')
    } finally {
      setBusy(null)
    }
  }

  /** Lay checkpointed-but-unfinalized takes (crash survivors) onto the timeline. */
  async function restoreCrashTakes() {
    if (!episodeId || crashTakes.length === 0) return
    setBusy('Recovering an in-progress take…')
    setError(null)
    try {
      const recovered = await loadRecoverableTakes(episodeId)
      const audioTakes = recovered.filter((r) => r.meta.kind !== 'camera')
      if (audioTakes.length === 0) {
        setError('No recoverable take data was found')
        await clearRecoverableTakes(episodeId)
        setCrashTakes([])
        setSessionStatus('open')
        return
      }
      pushHistory()
      const laid: string[] = []
      for (const { meta, blob } of audioTakes) {
        let buffer = await bufferFromBlob(blob)
        if (meta.recTrim > 0.04 && buffer.duration > meta.recTrim + 0.08) {
          buffer = sliceBuffer(buffer, meta.recTrim, buffer.duration)
        }
        const personId = meta.personId
        const laneId = meta.laneKey
        setTracks((prev) => {
          const person = people.find((p) => p.id === personId)
          const existing = prev.find((t) => t.id === laneId && !t.buffer)
          const target =
            existing || emptyTakeForPerson(prev, personId) || prev.find((t) => t.personId === personId && !t.buffer)
          const syncGroup = newSyncGroupId()
          if (target) {
            revokeUrl(target.url)
            laid.push(target.id)
            return withListenTake(
              prev.map((t) =>
                t.id === target.id
                  ? {
                      ...t,
                      buffer: cloneAudioBuffer(buffer),
                      url: bufferToUrl(buffer),
                      offset: meta.offset,
                      clips: [fullClipForBuffer(buffer, meta.offset, t.fadeIn, t.fadeOut, syncGroup)],
                      armed: true,
                      listen: true,
                    }
                  : t,
              ),
              target.id,
            )
          }
          const take = nextTakeNumber(prev, personId)
          const made = createEmptyTrack({
            name: `${person?.name || 'Voice'} · recovered take ${take}`,
            role: person ? roleForPerson(person) : 'vocal',
            personId,
            take,
            color: person?.color,
            offset: meta.offset,
            armed: true,
            volume: 1,
            listen: true,
            clips: [fullClipForBuffer(buffer, meta.offset, 0.05, 0.15, syncGroup)],
          })
          made.buffer = cloneAudioBuffer(buffer)
          made.url = bufferToUrl(buffer)
          laid.push(made.id)
          return prev
            .map((t) => ({ ...t, listen: t.personId === personId && !t.layered ? false : t.listen }))
            .concat(made)
        })
      }
      setSelectedId(laid[0] || null)
      seededRef.current = true
      await clearRecoverableTakes(episodeId)
      setCrashTakes([])
      setRecover(null)
      setSessionStatus('open')
      setOk(
        `Recovered ${audioTakes.length} in-progress take${audioTakes.length === 1 ? '' : 's'} from the crashed session — review, then export`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not recover the in-progress take')
      setSessionStatus('open')
    } finally {
      setBusy(null)
    }
  }

  function dismissRecover(discard = false) {
    if (discard && episodeId) {
      void clearSession(episodeId)
      void clearRecoverableTakes(episodeId)
    }
    setCrashTakes([])
    setRecover(null)
    setSessionStatus('open')
  }

  async function runEffect(id: EffectId, mode: 'insert' | 'render' = isInsertFx(id) ? 'insert' : 'render') {
    if (!selected?.buffer) {
      setError('Select a track with audio first')
      return
    }
    if (mode === 'insert') {
      pushHistory()
      const slot = { id, bypass: false, wet: 1 }
      setTracks((prev) =>
        prev.map((t) => (t.id === selected.id ? { ...t, inserts: [...(t.inserts || []), slot] } : t)),
      )
      invalidateInsertCache(selected.id)
      setApplied((prev) => [...prev, id])
      setOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} on insert rack · ${selected.name}`)
      return
    }
    pushHistory()
    setBusy(`Rendering ${id.replace('_', ' ')} on ${selected.name}…`)
    setError(null)
    try {
      const next = await applyEffect(cloneBuffer(selected.buffer), id)
      assignBufferToTrack(selected.id, next)
      setApplied((prev) => [...prev, id])
      setOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} baked into ${selected.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Effect failed')
    } finally {
      setBusy(null)
    }
  }

  function deviceKey(personId: string) {
    if (personId === 'guest' && remoteGuestRef.current) return REMOTE_GUEST_KEY
    return people.find((p) => p.id === personId)?.inputDeviceId || micId || ''
  }

  function stopLocalRecordStreams() {
    stopStreams(streamRef.current.filter((stream) => stream !== remoteGuestRef.current))
    streamRef.current = []
  }

  function stopCameraRecorders() {
    cameraCapturesRef.current.forEach((c) => {
      if (c.recorder.state !== 'inactive') c.recorder.stop()
    })
  }

  function liveCameraJobs() {
    const jobs = people
      .filter((p) => p.kind === 'voice' && cameraStreamsRef.current[p.id])
      .map((p) => ({ person: p, stream: cameraStreamsRef.current[p.id]! }))
    const remote = remoteGuestRef.current
    const guestPerson = people.find((p) => p.id === 'guest')
    if (guestPerson && remote && streamHasLiveVideo(remote)) {
      const job = { person: guestPerson, stream: remote }
      const idx = jobs.findIndex((j) => j.person.id === 'guest')
      if (idx >= 0) jobs[idx] = job
      else jobs.push(job)
    }
    return jobs
  }

  async function refreshMediaDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setMics(list.filter((d) => d.kind === 'audioinput'))
      setCams(list.filter((d) => d.kind === 'videoinput'))
    } catch {
      /* labels appear after permission */
    }
  }

  function closeCamera(personId: string) {
    const stream = cameraStreamsRef.current[personId]
    if (stream) stopStreams([stream])
    setCameraStreams((prev) => {
      const next = { ...prev }
      delete next[personId]
      return next
    })
  }

  async function openPersonCamera(personId: string) {
    const person = people.find((p) => p.id === personId)
    setError(null)
    try {
      const stream = await openCameraStream(person?.videoDeviceId)
      setCameraStreams((prev) => {
        const old = prev[personId]
        if (old && old !== stream) stopStreams([old])
        return { ...prev, [personId]: stream }
      })
      await refreshMediaDevices()
      setOk(
        `${person?.name || 'Camera'} preview is live · 720p cap · ~${CAMERA_MB_PER_MIN} MB/min · Record writes a separate camera file`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access was blocked')
    }
  }

  async function toggleCamera(personId: string) {
    if (cameraStreams[personId]) {
      closeCamera(personId)
      setCamWarnFor((id) => (id === personId ? null : id))
      return
    }
    if (!camWarnedRef.current) {
      setCamWarnFor(personId)
      return
    }
    await openPersonCamera(personId)
  }

  function confirmArmCamera() {
    const personId = camWarnFor
    camWarnedRef.current = true
    setCamWarnFor(null)
    if (personId) void openPersonCamera(personId)
  }

  async function changeCameraDevice(personId: string, deviceId: string) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, videoDeviceId: deviceId } : p)))
    if (!cameraStreams[personId]) return
    setError(null)
    try {
      const stream = await openCameraStream(deviceId || undefined)
      setCameraStreams((prev) => {
        const old = prev[personId]
        if (old && old !== stream) stopStreams([old])
        return { ...prev, [personId]: stream }
      })
      await refreshMediaDevices()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch camera')
    }
  }

  function discardCameraClip(id: string) {
    pushHistory()
    setCameraClips((prev) => prev.filter((c) => c.id !== id))
    if (selectedCamClipId === id) setSelectedCamClipId(null)
    setOk('Removed camera take from the lane — file bytes were not rewritten')
  }

  function addLowerThird(personId: string) {
    const person = people.find((p) => p.id === personId)
    pushHistory()
    const clip = newTitleClip({
      personId,
      offset: playheadRef.current,
      label: person?.name || 'Title',
      sublabel: person?.id === 'guest' ? 'Guest' : person?.id === 'host' ? 'Host' : '',
      duration: 5,
    })
    setCameraClips((prev) => [...prev, clip])
    setSelectedCamClipId(clip.id)
    setOk(`Lower third at ${formatClock(clip.offset)} — Program overlay, not RSS`)
  }

  function addStinger(personId: string, where: 'playhead' | 'cut' | 'chapters', style: 'black' | 'title' = 'black') {
    const person = people.find((p) => p.id === personId)
    const label = style === 'title' ? title || person?.name || 'Title' : ''
    const sublabel = style === 'title' ? person?.name || '' : ''
    const times: number[] = []
    if (where === 'playhead') times.push(playheadRef.current)
    if (where === 'cut') {
      const selected = cameraClips.find((c) => c.id === selectedCamClipId && c.personId === personId)
      times.push(selected ? cameraClipEnd(selected) : playheadRef.current)
    }
    if (where === 'chapters') {
      for (const mark of pictureMarkers) times.push(mark.time)
    }
    const unique = [...new Set(times.map((t) => Math.max(0, t)))]
    if (unique.length === 0) return
    pushHistory()
    const laid = unique.map((offset) =>
      newStingerClip({
        personId,
        offset,
        style,
        label,
        sublabel,
        duration: style === 'title' ? 0.7 : 0.4,
      }),
    )
    setCameraClips((prev) => [...prev, ...laid])
    setSelectedCamClipId(laid[0].id)
    setOk(
      where === 'chapters'
        ? `Stingers at ${laid.length} chapter${laid.length === 1 ? '' : 's'} — Program only`
        : `Stinger at ${formatClock(laid[0].offset)} — Program flash, not RSS`,
    )
  }

  function cancelPgmFade() {
    if (fadeAnimRef.current) {
      cancelAnimationFrame(fadeAnimRef.current)
      fadeAnimRef.current = 0
    }
  }

  function takeProgram(scene: PictureScene, fade: boolean) {
    cancelPgmFade()
    setPictureMode(scene === 'pip' ? 'pip' : 'a-roll')
    if (!fade || scene === pgmScene) {
      setPgmFrom(scene)
      setPgmScene(scene)
      setPgmMix(1)
      return
    }
    const from = pgmScene
    setPgmFrom(from)
    setPgmScene(scene)
    setPgmMix(0)
    const started = performance.now()
    const dur = 450
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / dur)
      setPgmMix(t)
      if (t < 1) fadeAnimRef.current = requestAnimationFrame(tick)
      else fadeAnimRef.current = 0
    }
    fadeAnimRef.current = requestAnimationFrame(tick)
  }

  async function importBroll(personId: string, file: File | null) {
    if (!file) return
    setBusy('Loading B-roll…')
    setError(null)
    try {
      const url = URL.createObjectURL(file)
      const fullDur = await measureVideoDuration(url)
      const duration = Math.max(0.1, Number.isFinite(fullDur) && fullDur > 0 ? fullDur : 5)
      pushHistory()
      const clip = newBrollClip({
        personId,
        url,
        mime: file.type || 'video/webm',
        offset: playheadRef.current,
        duration,
        bytes: file.size,
        overlayFit: 'cover',
      })
      setCameraClips((prev) => [...prev, clip])
      setSelectedCamClipId(clip.id)
      setOk(`B-roll at ${formatClock(clip.offset)} — covers A-roll picture, audio mix unchanged`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load B-roll')
    } finally {
      setBusy(null)
    }
  }

  async function applyGuestCamera(url: string) {
    setBusy('Loading guest camera backup…')
    try {
      const sourceUrl = `/api/admin/media/file?url=${encodeURIComponent(url)}`
      const res = await fetch(sourceUrl)
      if (!res.ok) throw new Error('Could not load guest camera backup')
      const blob = await res.blob()
      if (blob.size < 64) throw new Error('Guest camera backup was empty')
      const objectUrl = URL.createObjectURL(blob)
      const fullDur = await measureVideoDuration(objectUrl)
      const full = Math.max(0.1, Number.isFinite(fullDur) && fullDur > 0 ? fullDur : 0.1)
      const clip: CameraClip = {
        id: newCameraClipId(),
        personId: 'guest',
        url: objectUrl,
        mime: blob.type || 'video/webm',
        offset: playheadRef.current,
        duration: full,
        trimStart: 0,
        sourceStart: 0,
        sourceDuration: full,
        bytes: blob.size,
      }
      setCameraClips((prev) => [...prev, clip])
      setSelectedCamClipId(clip.id)
      setOk('Guest camera backup laid on the Guest camera lane — not in the RSS mix')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load guest camera')
    } finally {
      setBusy(null)
    }
  }

  async function applyGuestTake(url: string) {
    const guest = emptyTakeForPerson(tracks, 'guest') || tracks.find((t) => t.personId === 'guest')
    if (!guest) return
    setBusy('Loading guest take…')
    try {
      pushHistory()
      // T5 shared punch clock: the guest rides its capture-start epoch + one-way
      // latency on the take URL fragment. Strip it before hitting the media proxy,
      // then shift the guest take by the RTT-corrected start delay so it lines up
      // with the host punch instead of assuming both started at the same instant.
      const { url: cleanUrl, guestCaptureEpochMs, oneWayLatencySec } = decodePunchAlignment(url)
      const align =
        guestCaptureEpochMs != null && recPunchEpochRef.current > 0
          ? computePunchAlignmentOffset({
              hostPunchEpochMs: recPunchEpochRef.current,
              guestCaptureEpochMs,
              oneWayLatencySec,
            })
          : null
      const sourceUrl = `/api/admin/media/file?url=${encodeURIComponent(cleanUrl)}`
      const buffer = await decodeUrl(sourceUrl)
      // Shift the lane before laying the buffer so assignBufferToTrack rebuilds the
      // clip at the aligned offset. Fall back to the raw punch offset when there is
      // no usable stamp — the av-sync drift badge + manual nudge remain the net.
      if (align != null && Math.abs(align) > 0.0005) {
        setTracks((prev) =>
          prev.map((t) =>
            t.id === guest.id ? { ...t, offset: Math.max(0, t.offset + align) } : t,
          ),
        )
      }
      const note =
        align != null && Math.abs(align) > 0.0005
          ? `Remote guest take laid on ${guest.name} · auto-synced ${align >= 0 ? '+' : ''}${Math.round(align * 1000)} ms`
          : `Remote guest take laid on ${guest.name}`
      assignBufferToTrack(guest.id, buffer, note)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load guest take')
    } finally {
      setBusy(null)
    }
  }

  function personName(personId: string) {
    return people.find((p) => p.id === personId)?.name || personId
  }

  /** One capture per unique input. Voices on the same mic share that take. */
  function captureJobs(lanes: StudioTrack[]) {
    const groups = new Map<string, StudioTrack[]>()
    for (const lane of lanes) {
      const key = deviceKey(lane.personId)
      const list = groups.get(key) || []
      list.push(lane)
      groups.set(key, list)
    }
    return [...groups.entries()].map(([key, group]) => {
      const lane = group.find((t) => t.id === selectedId) || group[0]
      const sharedNames = [...new Set(group.map((t) => personName(t.personId)))]
      return { key, lane, group, sharedNames }
    })
  }

  async function toggleRecord() {
    if (recordingRef.current) {
      if (!recLiveRef.current) {
        abortRef.current?.abort()
        capturesRef.current.forEach(stopLaneCapture)
        stopCameraRecorders()
        cameraCapturesRef.current = []
        finishRecCleanup()
        stopLocalRecordStreams()
        recordingRef.current = false
        setRecording(false)
        setOk('Record cancelled')
        return
      }
      capturesRef.current.forEach(stopLaneCapture)
      stopCameraRecorders()
      return
    }

    const lanes = (() => {
      const armed = tracks.filter((t) => t.armed)
      if (armed.length) return armed
      const fallback = selected || tracks.find((t) => t.role === 'vocal') || tracks[0]
      return fallback ? [fallback] : []
    })()
    if (lanes.length === 0) {
      setError('Add a person and arm a take before recording')
      return
    }

    const jobs = captureJobs(lanes)
    if (jobs.length === 0) {
      setError('Add a person and arm a take before recording')
      return
    }

    const playheadNow = playheadRef.current
    const punch =
      jobs.length === 1
        ? punchInTime(recMode, playheadNow, tracks, jobs[0].lane.personId)
        : sharedPunchInTime(
            recMode,
            playheadNow,
            tracks,
            jobs.map((j) => j.lane.personId),
          )
    const cueStart = Math.max(0, punch - preroll)
    const excludeIds = jobs.map((j) => j.lane.id)
    const recLabel = jobs
      .map((j) =>
        j.sharedNames.length > 1 ? `${j.sharedNames.join(' + ')} (shared mic)` : j.sharedNames[0],
      )
      .join(' · ')

    const ac = new AbortController()
    abortRef.current = ac
    punchRef.current = punch
    recLiveRef.current = false
    recStartedAtRef.current = performance.now()
    // Stamp the shared-punch epoch at the record-on instant. The `record` signal
    // that starts the guest's local capture is pushed off this same `recording`
    // flip, so this is the host anchor the guest's capture-start epoch is measured
    // against (see computePunchAlignmentOffset).
    recPunchEpochRef.current = Date.now()
    recordingRef.current = true
    setSelectedId(jobs[0].lane.id)
    setRecording(true)
    setRecTally(countInBeats > 0 ? 'count-in' : 'rec')
    setError(null)
    setOk(null)
    setInputPeaks({})
    stopMix()

    try {
      idleStopRef.current.forEach((fn) => fn())
      idleStopRef.current = []
      stopStreams(idleStreamRef.current)
      idleStreamRef.current = []
      // Storage-quota preflight — crash-safe autosave needs room to checkpoint.
      if (episodeId) {
        const quota = await checkStorageQuota()
        if (quota.supported && quota.low) {
          setError(
            `Low browser storage — only ${formatBytes(quota.free)} free. Crash-safe autosave may fail on a long take; free disk or download earlier takes.`,
          )
        }
      }
      await sleep(40, ac.signal)
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const uniqueDevices = jobs.map((j) => j.key)
      const localKeys = uniqueDevices.filter((key) => key !== REMOTE_GUEST_KEY)
      const streams = localKeys.length
        ? await openInputStreams(localKeys, rawInput)
        : new Map<string, MediaStream>()
      if (uniqueDevices.includes(REMOTE_GUEST_KEY)) {
        const remote = remoteGuestRef.current
        if (!remote) throw new Error('Guest is not connected. Wait for them to join, or un-arm Guest.')
        streams.set(REMOTE_GUEST_KEY, remote)
      }
      if (ac.signal.aborted) {
        stopStreams([...streams.values()].filter((stream) => stream !== remoteGuestRef.current))
        finishRecCleanup()
        recordingRef.current = false
        setRecording(false)
        return
      }
      streamRef.current = [...streams.values()].filter((stream) => stream !== remoteGuestRef.current)
      const hostKey = people.find((p) => p.id === 'host')?.inputDeviceId || micId || ''
      setHostTalkStream(streams.get(hostKey) || [...streams.values()].find((s) => s !== remoteGuestRef.current) || null)
      stopMeterRef.current = jobs.map((job) => {
        const stream = streams.get(job.key)
        if (!stream) return () => {}
        const meterKey = job.sharedNames.join(' + ') || 'mic'
        return attachInputMeter(stream, (peak) => {
          setInputPeaks((prev) => ({ ...prev, [meterKey]: peak }))
          if (peak >= 0.98) {
            setClipHolds((prev) => ({ ...prev, [meterKey]: true }))
            const timers = clipTimerRef.current
            if (timers[meterKey]) window.clearTimeout(timers[meterKey])
            timers[meterKey] = window.setTimeout(() => {
              setClipHolds((prev) => ({ ...prev, [meterKey]: false }))
            }, 1600)
          }
        })
      })

      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        setMics(list.filter((d) => d.kind === 'audioinput'))
        setCams(list.filter((d) => d.kind === 'videoinput'))
      } catch {
        /* ignore */
      }

      if (countInBeats > 0) {
        setRecTally('count-in')
        setOk('Count-in…')
        await playCountIn(countInBeats, bpm, ac.signal)
      }

      setRecTally('rec')

      if (cueEnabled || cueToGuestRef.current) {
        const prepared = await tracksWithInserts(tracks)
        const cue = startLiveMix(prepared, {
          fromSec: cueStart,
          excludeIds,
          gain: cueGain,
          monitor: cueEnabled,
        })
        cueRef.current = cue
        publishGuestCue(cue)
        if (cue) await cue.ctx.resume()
      }

      const prerollSec = punch - cueStart
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      const recTrim = Math.max(0, prerollSec)
      const captureRate = cueRef.current?.ctx.sampleRate || sampleRateProbe()
      watchdogsRef.current = []
      const captures = await Promise.all(
        jobs.map(async (job) => {
          const stream = streams.get(job.key)
          if (!stream) {
            throw new Error(`No microphone stream for ${job.sharedNames.join(' + ') || 'this voice'}`)
          }
          const watchdog = createWatchdog()
          watchdogsRef.current.push(watchdog)
          // Crash-safe checkpointing needs a stable episode + lane key.
          const checkpoint = episodeId
            ? await makeCheckpointSink({
                episodeId,
                laneKey: job.lane.id,
                kind: 'media-recorder', // refined by startLaneCapture (worklet flips this in the sink meta below)
                mime: 'audio/webm',
                sampleRate: captureRate,
                offset: punch,
                recTrim,
                label: job.sharedNames.join(' + ') || 'Voice',
                personId: job.lane.personId,
                onError: (err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Crash-safe autosave hit a storage error — the take is still recording.',
                  )
                },
              }).catch(() => undefined)
            : undefined
          return {
            job,
            checkpoint,
            capture: await startLaneCapture(job.lane.id, stream, { checkpoint, watchdog }),
          }
        }),
      )
      capturesRef.current = captures.map((c) => c.capture)
      recorderRef.current = captures.map((c) => c.capture)
      const camJobs = liveCameraJobs()
      const camCaptures = camJobs.map((job) => startCameraCapture(job.person.id, job.stream))
      cameraCapturesRef.current = camCaptures

      void Promise.all([
        Promise.all(captures.map((c) => c.capture.done)),
        Promise.all(camCaptures.map((c) => c.done.catch(() => new Blob()))),
      ]).then(async ([blobs, camBlobs]) => {
        finishRecCleanup()
        stopLocalRecordStreams()
        recorderRef.current = []
        capturesRef.current = []
        cameraCapturesRef.current = []
        watchdogsRef.current = []
        recordingRef.current = false
        recLiveRef.current = false
        setRecording(false)
        if (ac.signal.aborted) return
        const shared = jobs.some((j) => j.sharedNames.length > 1)
        setBusy(
          jobs.length > 1
            ? 'Laying Host + Guest onto the timeline…'
            : shared
              ? 'Laying shared-mic take onto the timeline…'
              : 'Laying take onto the timeline…',
        )
        try {
          pushHistory()
          const decoded: { lane: StudioTrack; buffer: AudioBuffer; sharedNames: string[] }[] = []
          for (let i = 0; i < captures.length; i++) {
            const blob = blobs[i]
            if (!blob || blob.size < 64) continue
            let buffer = await bufferFromBlob(blob)
            if (recTrim > 0.04) {
              if (buffer.duration <= recTrim + 0.08) continue
              buffer = sliceBuffer(buffer, recTrim, buffer.duration)
            }
            decoded.push({
              lane: captures[i].job.lane,
              buffer,
              sharedNames: captures[i].job.sharedNames,
            })
          }
          if (decoded.length === 0 && camCaptures.length === 0) {
            setError('Recording was empty — keep rolling through the preroll')
            return
          }
          if (decoded.length === 0) {
            setError('Audio take was empty — keep rolling through the preroll. Camera file may still land.')
          }
          const punchSync: Record<string, string> = {}
          if (decoded.length > 0) setTracks((prev) => {
            let next = prev
            const laidIds: string[] = []
            const cleanup = voiceIsolate ? VOICE_CLEANUP_INSERTS.map((s) => ({ ...s })) : null
            for (const { lane, buffer, sharedNames } of decoded) {
              const person = people.find((p) => p.id === lane.personId)
              const reuse =
                replaceArmed && lane.buffer
                  ? next.find((t) => t.id === lane.id)
                  : emptyTakeForPerson(next, lane.personId) || (lane.buffer ? null : next.find((t) => t.id === lane.id))
              const offset = replaceArmed && reuse?.buffer ? reuse.offset : punch
              const syncGroup = newSyncGroupId()
              const takeLabel =
                sharedNames.length > 1
                  ? `${sharedNames.join(' + ')} · take`
                  : `${person?.name || 'Voice'} · take`
              if (reuse) {
                revokeUrl(reuse.url)
                const url = bufferToUrl(buffer)
                laidIds.push(reuse.id)
                next = withListenTake(
                  next.map((t) =>
                    t.id === reuse.id
                      ? {
                          ...t,
                          name:
                            sharedNames.length > 1
                              ? `${sharedNames.join(' + ')} · take ${t.take}`
                              : t.name,
                          buffer: cloneAudioBuffer(buffer),
                          url,
                          offset,
                          clips: [fullClipForBuffer(buffer, offset, t.fadeIn, t.fadeOut, syncGroup)],
                          inserts: cleanup || t.inserts,
                          armed: true,
                          listen: true,
                        }
                      : t,
                  ),
                  reuse.id,
                )
                punchSync[lane.personId] = syncGroup
              } else {
                const take = nextTakeNumber(next, lane.personId)
                punchSync[lane.personId] = syncGroup
                const made = createEmptyTrack({
                  name: `${takeLabel} ${take}`,
                  role: person ? roleForPerson(person) : lane.role,
                  personId: lane.personId,
                  take,
                  color: person?.color || lane.color,
                  offset: punch,
                  armed: true,
                  volume: 1,
                  listen: true,
                  inserts: cleanup || [],
                  clips: [fullClipForBuffer(buffer, punch, 0.05, 0.15, syncGroup)],
                })
                made.buffer = cloneAudioBuffer(buffer)
                made.url = bufferToUrl(buffer)
                laidIds.push(made.id)
                next = next
                  .map((t) => ({
                    ...t,
                    listen: t.personId === lane.personId && !t.layered ? false : t.listen,
                  }))
                  .concat(made)
              }
            }
            if (autoMuteQuiet && laidIds.length >= 2) {
              next = applyFollowTalker(next, laidIds[0], laidIds[1]).tracks
            }
            return next
          })
          setSelectedId(decoded[0]?.lane.id || jobs[0].lane.id)
          setApplied([])
          const laidCams: CameraClip[] = []
          for (let i = 0; i < camCaptures.length; i++) {
            const blob = camBlobs[i]
            if (!blob || blob.size < 64) continue
            const url = URL.createObjectURL(blob)
            const fullDur = await measureVideoDuration(url)
            const fallback = Math.max(0.1, (performance.now() - recStartedAtRef.current) / 1000)
            const rawDur = Number.isFinite(fullDur) && fullDur > 0 ? fullDur : fallback + recTrim
            const personId = camCaptures[i].key
            laidCams.push({
              id: newCameraClipId(),
              personId,
              url,
              mime: blob.type || 'video/webm',
              offset: punch,
              duration: Math.max(0.1, rawDur - recTrim),
              trimStart: recTrim,
              sourceStart: recTrim,
              sourceDuration: rawDur,
              syncGroup: punchSync[personId] || newSyncGroupId(),
              bytes: blob.size,
            })
          }
          if (laidCams.length) {
            setCameraClips((prev) => [...prev, ...laidCams])
            setSelectedCamClipId(laidCams[0].id)
          }
          const punchedPeople = new Set(decoded.map((d) => d.lane.personId))
          const pictureHeld = cameraClips.some((c) => punchedPeople.has(c.personId)) && laidCams.length === 0
          const camNote = laidCams.length
            ? ` · ${laidCams.length} camera file${laidCams.length === 1 ? '' : 's'} (${laidCams.map((c) => formatBytes(c.bytes)).join(', ')}, not in RSS)`
            : pictureHeld
              ? ' · punch under picture (existing camera stays on the clock)'
              : ''
          if (decoded.length > 0) {
            setOk(
              decoded.length > 1
                ? `Host + Guest takes at ${formatClock(punch)} — two mics, one punch${autoMuteQuiet ? ' · quieter mic muted on the timeline' : ''}${voiceIsolate ? ' · isolate on the insert rack' : ''}${camNote}`
                : decoded[0]?.sharedNames.length > 1
                  ? `Shared mic — ${decoded[0].sharedNames.join(' + ')} on one take at ${formatClock(punch)}${camNote}`
                  : `Take at ${formatClock(punch)}${camNote}`,
            )
          } else if (laidCams.length) {
            setOk(`Camera file at ${formatClock(punch)}${camNote}`)
          }
          // Take is safely on the timeline — drop its crash-safe checkpoints.
          const laidLaneIds = new Set(decoded.map((d) => d.lane.id))
          await Promise.all(
            captures
              .filter((c) => c.checkpoint && laidLaneIds.has(c.job.lane.id))
              .map((c) => c.checkpoint!.discard().catch(() => {})),
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not decode recording')
        } finally {
          setBusy(null)
        }
      })

      if (prerollSec > 0.04) {
        setOk(`Preroll ${preroll.toFixed(0)}s — keep rolling; come in at ${formatClock(punch)}`)
        const cueCtx = cueRef.current?.ctx
        if (cueCtx) {
          await waitUntilContextTime(cueCtx, cueCtx.currentTime + prerollSec, ac.signal)
        } else {
          await sleep(prerollSec * 1000, ac.signal)
        }
      }
      recLiveRef.current = true
      recStartedAtRef.current = performance.now()
      const camCount = cameraCapturesRef.current.length
      const punchKind = captures.some((c) => c.capture.kind === 'worklet')
        ? ' · AudioWorklet punch'
        : ' · MediaRecorder punch'
      setOk(
        `● REC ${recLabel} at ${formatClock(punch)}${cueEnabled ? ' · mix in headphones' : ''}${
          cueToGuestRef.current ? ' · cue to guest' : ''
        }${
          camCount ? ` · ${camCount} camera${camCount === 1 ? '' : 's'}` : ''
        }${punchKind}`,
      )
    } catch (err) {
      finishRecCleanup()
      stopCameraRecorders()
      cameraCapturesRef.current = []
      stopLocalRecordStreams()
      recordingRef.current = false
      recLiveRef.current = false
      setRecording(false)
      if (err instanceof DOMException && err.name === 'AbortError') {
        setOk('Record cancelled')
        return
      }
      setError(err instanceof Error ? err.message : 'Microphone access was blocked')
    }
  }

  function finishRecCleanup() {
    cueRef.current?.stop()
    cueRef.current = null
    publishGuestCue(mixRef.current)
    stopMeterRef.current.forEach((fn) => fn())
    stopMeterRef.current = []
  }

  async function onUploadPick(file: File | null) {
    if (!file) return
    const target = selected || tracks[0]
    if (!target) return
    setBusy('Loading file…')
    setError(null)
    try {
      pushHistory()
      const buffer = await bufferFromBlob(file)
      assignBufferToTrack(target.id, buffer, `Loaded ${file.name} → ${target.name}`)
      setApplied([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load file')
    } finally {
      setBusy(null)
    }
  }

  async function onImportBed(file: File | null) {
    if (!file) return
    setBusy('Loading music bed…')
    setError(null)
    try {
      pushHistory()
      const buffer = await bufferFromBlob(file)
      const url = bufferToUrl(buffer)
      setTracks((prev) => {
        const empty = prev.find((t) => (t.role === 'bed' || t.role === 'music') && !t.buffer)
        if (empty) {
          revokeUrl(empty.url)
          return prev.map((t) =>
            t.id === empty.id
              ? {
                  ...t,
                  buffer: cloneAudioBuffer(buffer),
                  url,
                  offset: 0,
                  clips: [fullClipForBuffer(buffer, 0, t.fadeIn, t.fadeOut)],
                }
              : t,
          )
        }
        const next = createEmptyTrack({
          name: file.name.replace(/\.[^.]+$/, '') || 'Music bed',
          role: 'bed',
          personId: 'beds',
          take: nextTakeNumber(prev, 'beds'),
          color: '#FFB86B',
          volume: 0.35,
          offset: 0,
          clips: [fullClipForBuffer(buffer, 0, 0.05, 0.2)],
        })
        next.buffer = cloneAudioBuffer(buffer)
        next.url = url
        return [...prev, next]
      })
      setOk(`Music bed from ${file.name} — select a range and duck under speech`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load music')
    } finally {
      setBusy(null)
    }
  }

  function addTrack(role: StudioTrack['role'] = 'custom') {
    const person =
      people.find((p) =>
        role === 'guest'
          ? p.id === 'guest'
          : role === 'sfx'
            ? p.kind === 'sfx'
            : role === 'bed' || role === 'music'
              ? p.kind === 'bed'
              : p.kind === 'voice' && p.id === 'host',
      ) || people[0]
    if (!person) return
    addTake(person.id, role)
  }

  function addTake(personId: string, roleOverride?: StudioTrack['role']) {
    const person = people.find((p) => p.id === personId)
    if (!person) return
    pushHistory()
    const take = nextTakeNumber(tracks, personId)
    const role = roleOverride || roleForPerson(person)
    const track = createEmptyTrack({
      name: person.kind === 'voice' ? `${person.name} · take ${take}` : `${person.name} ${take}`,
      role,
      personId,
      take,
      color: person.color,
      armed: person.kind === 'voice',
      volume: person.kind === 'bed' ? 0.35 : 1,
      listen: true,
    })
    setTracks((prev) => {
      const rest =
        person.kind === 'voice'
          ? prev.map((t) => ({
              ...t,
              armed: false,
              listen: t.personId === personId && !t.layered ? false : t.listen,
            }))
          : prev
      return [...rest, track]
    })
    setSelectedId(track.id)
    setOk(`Added ${track.name}`)
  }

  function addPerson() {
    const name = personDraft.trim() || `Voice ${people.filter((p) => p.kind === 'voice').length + 1}`
    pushHistory()
    const person: SessionPerson = {
      id: newPersonId(),
      name,
      color: TRACK_COLORS[people.length % TRACK_COLORS.length],
      kind: 'voice',
    }
    setPeople((prev) => {
      const beds = prev.filter((p) => p.kind !== 'voice')
      const voices = prev.filter((p) => p.kind === 'voice')
      return [...voices, person, ...beds]
    })
    const lanes = emptyTakesForPerson(person).map((t, i) => ({ ...t, armed: i === 0 }))
    setTracks((prev) => prev.map((t) => ({ ...t, armed: false })).concat(lanes))
    setSelectedId(lanes[0]?.id || null)
    setPersonDraft('')
    setOk(`${name} is in the session — three tracks ready, arm and record`)
  }

  async function dropSfx(id: SfxId) {
    const playheadNow = playheadRef.current
    const sfxPerson = people.find((p) => p.kind === 'sfx') || people[people.length - 1]
    if (!sfxPerson) return
    setBusy('Rendering SFX…')
    try {
      pushHistory()
      const buffer = await renderSfx(id)
      const take = nextTakeNumber(tracks, sfxPerson.id)
      const metaLabel = SFX_META.find((s) => s.id === id)?.label || id
      const track = createEmptyTrack({
        name: metaLabel,
        role: 'sfx',
        personId: sfxPerson.id,
        take,
        color: sfxPerson.color,
        offset: playheadNow,
        volume: 0.9,
        fadeIn: 0.01,
        fadeOut: 0.05,
      })
      track.buffer = cloneAudioBuffer(buffer)
      track.url = bufferToUrl(buffer)
      track.clips = [fullClipForBuffer(buffer, playheadNow, 0.01, 0.05)]
      setTracks((prev) => [...prev, track])
      setSelectedId(track.id)
      setOk(`Dropped ${id} at ${formatClock(playheadNow)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SFX failed')
    } finally {
      setBusy(null)
    }
  }

  function removeTrack(id: string) {
    if (tracks.length <= 1) {
      setError('Keep at least one track')
      return
    }
    pushHistory()
    setTracks((prev) => {
      const doomed = prev.find((t) => t.id === id)
      revokeUrl(doomed?.url || null)
      invalidateInsertCache(id)
      const next = prev.filter((t) => t.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id || null)
      return next
    })
  }

  function duplicateTrack(id: string) {
    const src = tracks.find((t) => t.id === id)
    if (!src) return
    pushHistory()
    const copy = createEmptyTrack({
      name: `${src.name} copy`,
      role: src.role,
      personId: src.personId,
      take: nextTakeNumber(tracks, src.personId),
      color: src.color,
      volume: src.volume,
      pan: src.pan,
      offset: src.offset,
      fadeIn: src.fadeIn,
      fadeOut: src.fadeOut,
      inserts: src.inserts,
      listen: isVoiceRole(src.role) ? false : src.listen,
      layered: false,
    })
    if (src.buffer) {
      copy.buffer = cloneAudioBuffer(src.buffer)
      copy.url = bufferToUrl(src.buffer)
      copy.clips = clipsOf(src).map((c) => ({ ...c, id: newClipId() }))
      copy.automation = (src.automation || []).map((p) => ({ ...p }))
      copy.compRanges = (src.compRanges || []).map((r) => ({ ...r }))
    }
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setSelectedId(copy.id)
  }

  function clearTrack(id: string) {
    pushHistory()
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        revokeUrl(t.url)
        return { ...t, buffer: null, url: null, clips: [], automation: [] }
      }),
    )
  }

  function armTrack(id: string) {
    const track = tracks.find((t) => t.id === id)
    if (!track) return
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === id) return { ...t, armed: !t.armed }
        if (t.personId === track.personId) return { ...t, armed: false }
        return t
      }),
    )
    setSelectedId(id)
  }

  function armHostAndGuest() {
    const host = emptyTakeForPerson(tracks, 'host') || tracks.find((t) => t.personId === 'host')
    const guest = emptyTakeForPerson(tracks, 'guest') || tracks.find((t) => t.personId === 'guest')
    if (!host || !guest) {
      setError('Need Host and Guest lanes')
      return
    }
    setTracks((prev) => prev.map((t) => ({ ...t, armed: t.id === host.id || t.id === guest.id })))
    setSelectedId(host.id)
    setOk('Host + Guest armed. Same mic = one take. Two mics = two takes, one punch.')
  }

  function followTalkerNow() {
    const armed = tracks.filter((t) => t.armed && t.buffer)
    if (armed.length < 2) {
      setError('Arm two recorded takes, then Follow talker. Recordings stay; only clips mute.')
      return
    }
    pushHistory()
    const result = applyFollowTalker(tracks, armed[0].id, armed[1].id)
    setTracks(result.tracks)
    setOk(
      `Quieter mic muted on the timeline (${formatClock(result.mutedA)} / ${formatClock(result.mutedB)}). Both recordings kept.`,
    )
  }

  function editRange(fn: (track: StudioTrack) => StudioTrack, label: string) {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    if (b - a < 0.05) {
      setError('Drag a range on the timeline (empty lane or ruler), then use the lane tools')
      return
    }
    const ids = applyRangeAll
      ? tracks.filter((t) => t.buffer).map((t) => t.id)
      : selected
        ? [selected.id]
        : []
    if (ids.length === 0) {
      setError('Select a lane first')
      return
    }
    pushHistory()
    setTracks((prev) => prev.map((t) => (ids.includes(t.id) ? fn(t) : t)))
    setOk(label)
  }

  function splitSelectedAtPlayhead() {
    const target = selected
    if (!target?.buffer) return
    pushHistory()
    setTracks((prev) => mapTrack(prev, target.id, (t) => splitTrackAt(t, playheadRef.current)))
    setOk('Split on this lane — both pieces stay on the same track')
  }

  function splitSelectedCameraAtPlayhead() {
    const personId = cameraClips.find((c) => c.id === selectedCamClipId)?.personId
    if (!personId && cameraClips.length === 0) return
    pushHistory()
    setCameraClips((prev) => splitCameraAt(prev, playheadRef.current, personId))
    setOk('Split picture at playhead — audio clips unchanged')
  }

  function editCameraRange(ripple: boolean) {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    const personId =
      cameraClips.find((c) => c.id === selectedCamClipId)?.personId ||
      people.find((p) => p.kind === 'voice' && cameraClips.some((c) => c.personId === p.id))?.id
    if (b - a < 0.05) {
      setError('Drag a range on the camera lane (shift-drag), then Cut hole / Ripple')
      return
    }
    pushHistory()
    setCameraClips((prev) => deleteCameraRange(prev, a, b, personId, ripple))
    setOk(ripple ? 'Ripple-deleted picture (audio unchanged)' : 'Cut hole in picture (audio unchanged)')
  }

  function moveSelectedCamera(clipId: string, offset: number) {
    const clip = cameraClips.find((c) => c.id === clipId)
    if (!clip) return
    const linked = personAvLinked(people.find((p) => p.id === clip.personId))
    setCameraClips((prev) => moveCameraClip(prev, clipId, offset))
    if (linked) {
      setTracks((prev) => nudgeAudioWithCamera(prev, clip, clip.offset, offset, true))
    }
  }

  function bounceSelectedToStem() {
    if (!selected?.buffer) return
    pushHistory()
    const bounced = applyGainAndFades(
      cloneAudioBuffer(selected.buffer),
      selected.volume,
      selected.fadeIn,
      selected.fadeOut,
    )
    const stem = createEmptyTrack({
      name: `${selected.name} bounce`,
      role: 'custom',
      personId: selected.personId,
      take: nextTakeNumber(tracks, selected.personId),
      color: TRACK_COLORS[(tracks.length + 1) % TRACK_COLORS.length],
      offset: selected.offset,
    })
    stem.buffer = bounced
    stem.url = bufferToUrl(bounced)
    stem.clips = [fullClipForBuffer(bounced, selected.offset, 0.05, 0.15)]
    setTracks((prev) => [...prev, stem])
    setSelectedId(stem.id)
    setOk('Bounced track to new stem')
  }

  async function applyMasterBus(ids: EffectId[], mode: 'keep' | 'replace' = 'keep') {
    if (!hasAudio) return
    if (mode === 'replace') {
      const confirmed = window.confirm(
        'Replace this session with a single Master mix? All takes will be removed. Undo can bring them back until you leave the page.',
      )
      if (!confirmed) return
    }
    pushHistory()
    setBusy(mode === 'keep' ? 'Bouncing mix (keeping takes)…' : 'Replacing session with master…')
    try {
      let mixed = mixdownTracks(await tracksWithInserts(tracks))
      mixed = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      for (const id of ids) mixed = await applyEffect(mixed, id)
      const master = createEmptyTrack({
        name: 'Master mix',
        role: 'master',
        personId: 'beds',
        take: nextTakeNumber(tracks, 'beds'),
        color: '#53D6FF',
        armed: false,
        muted: mode === 'keep',
      })
      master.buffer = mixed
      master.url = bufferToUrl(mixed)
      if (mode === 'replace') {
        tracks.forEach((t) => revokeUrl(t.url))
        setTracks([master, ...ensurePersonLanes(defaultSessionTracks(), DEFAULT_PEOPLE)])
        setOk('Session replaced with Master mix')
      } else {
        setTracks((prev) => [...prev, master])
        setOk('Bounced mix to a Master lane — source takes are still here')
      }
      setSelectedId(master.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master bus failed')
    } finally {
      setBusy(null)
    }
  }

  async function downloadPicture(mode: PictureMode) {
    const host = cameraClips.filter((c) => c.personId === 'host')
    const guest = cameraClips.filter((c) => c.personId === 'guest')
    const lead = host[0] || guest[0] || cameraClips[0] || null
    if (!lead) {
      setError('Record a camera file first — picture export is a local canvas mix, not the RSS')
      return
    }
    setBusy(mode === 'pip' ? 'Encoding Host + Guest PIP…' : 'Encoding A-roll…')
    setError(null)
    try {
      const prepared = await tracksWithInserts(tracks)
      let mixed = mixdownTracks(prepared)
      mixed = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      if (matchLufs) mixed = applyGainAndFades(mixed, gainForTargetLufs(measureLoudness(mixed).lufs, PODCAST_LUFS), 0, 0)
      const overlays = cameraClips.filter((c) => cameraLayer(c) === 'overlay')
      const { blob, realtime: usedRealtime } = await renderPictureMix({
        mode,
        host: [...(host.length ? host : cameraClips.filter((c) => c.personId === lead.personId)), ...overlays],
        guest: mode === 'pip' ? guest : [],
        audio: mixed,
        onProgress: (ratio, info) => {
          const label = mode === 'pip' ? 'Encoding PIP' : 'Encoding A-roll'
          setBusy(
            info?.realtime
              ? `${label} ${Math.round(ratio * 100)}% — keep this tab open`
              : `${label} ${Math.round(ratio * 100)}%`,
          )
        },
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugFile(title)}-${mode === 'pip' ? 'pip' : 'a-roll'}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      setOk(
        usedRealtime
          ? `${mode === 'pip' ? 'PIP' : 'A-roll'} downloaded (realtime encode) — public RSS is still the audio mix`
          : `${mode === 'pip' ? 'PIP' : 'A-roll'} downloaded locally — public RSS is still the audio mix`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Picture export failed')
    } finally {
      setBusy(null)
    }
  }

  async function downloadStems() {
    if (!hasAudio) return
    setBusy('Packing stems zip…')
    setError(null)
    try {
      const prepared = await tracksWithInserts(tracks)
      const files: { name: string; data: Uint8Array }[] = []
      let mixed = mixdownTracks(prepared)
      mixed = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      if (matchLufs) mixed = applyGainAndFades(mixed, gainForTargetLufs(measureLoudness(mixed).lufs, PODCAST_LUFS), 0, 0)
      const mixBytes = new Uint8Array(await (await encodeMp3(mixed)).arrayBuffer())
      files.push({ name: `${slugFile(title)}-mix.mp3`, data: mixBytes })
      for (const track of prepared) {
        if (!track.buffer) continue
        const wav = encodeWav(track.buffer)
        files.push({
          name: `stems/${slugFile(track.name)}.wav`,
          data: new Uint8Array(await wav.arrayBuffer()),
        })
      }
      const zip = zipStore(files)
      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugFile(title)}-stems.zip`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      setOk(`Downloaded ${files.length - 1} stems + mix`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stems zip failed')
    } finally {
      setBusy(null)
    }
  }

  async function exportAudio(kind: 'wav' | 'mp3', thenPublish = false) {
    if (!hasAudio) {
      setError('Nothing to export — record or import onto a track first')
      return
    }
    setBusy(thenPublish ? 'Mixing, saving & preparing publish…' : kind === 'wav' ? 'Mixing WAV…' : 'Mixing MP3…')
    setError(null)
    setOk(null)
    try {
      const prepared = await tracksWithInserts(tracks)
      const mixedRaw =
        range.end > range.start + 0.05 && range.end < sessionLen - 0.05
          ? mixdownTracks(prepared, {
              startSec: range.start,
              endSec: range.end,
            })
          : mixdownTracks(prepared)
      let mixed = applyGainAndFades(mixedRaw, masterGain, masterFadeIn, masterFadeOut)
      if (matchLufs) {
        const loud = measureLoudness(mixed)
        mixed = applyGainAndFades(mixed, gainForTargetLufs(loud.lufs, PODCAST_LUFS), 0, 0)
      }
      mixed = await applyEffect(mixed, 'limit')
      const after = measureLoudness(mixed)
      if (Number.isFinite(after.lufs)) setLoudness({ lufs: after.lufs, peakDb: after.peakDb })
      const blob = kind === 'wav' ? encodeWav(mixed) : await encodeMp3(mixed)
      const ext = kind === 'wav' ? 'wav' : 'mp3'
      const file = new File(
        [blob],
        `${title.replace(/[^\w]+/g, '-').slice(0, 48) || 'episode'}-mix.${ext}`,
        { type: blob.type },
      )
      await onExported(file, mixed.duration)
      setOk(thenPublish ? 'Mix saved to site host' : `Saved ${ext.toUpperCase()} mix to episode`)
      if (thenPublish && onPublished) await onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const durationLabel = formatClock(sessionDuration(tracks))
  const peakDb = meter ? dbFromLinear(meter.peak) : null
  const rmsDb = meter ? dbFromLinear(meter.rms) : null
  const recHint = REC_MODE_META.find((m) => m.id === recMode)?.hint
  const boardDuration = Math.max(30, playhead + 8, sessionLen) + 4
  const timelineBoard = {
    people,
    tracks,
    playhead,
    pxPerSec: zoom,
    selectedId: selected?.id || null,
    selectedClipId,
    range,
    durationSec: boardDuration,
    scrollLeft: timelineScroll,
    onScrollLeft: setTimelineScroll,
    onSelect: (id: string, clipId: string | null) => {
      setSelectedId(id)
      setSelectedClipId(clipId)
    },
    onPlayhead: setHead,
    onMoveClip: (id: string, clipId: string, offset: number) => {
      const track = tracks.find((t) => t.id === id)
      const clip = track ? clipsOf(track).find((c) => c.id === clipId) : null
      setTracks((prev) => mapTrack(prev, id, (t) => moveClip(t, clipId, offset)))
      if (track && clip && personAvLinked(people.find((p) => p.id === track.personId))) {
        setCameraClips((prev) => nudgeCamerasWithAudio(prev, clip, track.personId, clip.offset, offset, true))
      }
    },
    onTrimClip: (id: string, clipId: string, edge: 'in' | 'out', time: number) => {
      setTracks((prev) => mapTrack(prev, id, (t) => trimClip(t, clipId, edge, time)))
    },
    onRange: (start: number, end: number, trackId: string) => {
      setSelectedId(trackId)
      setRange((prev) => ({ ...prev, start, end }))
    },
  }

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#0C141C] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#27313B] flex flex-wrap items-center justify-between gap-3 bg-[#11161C]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Podcast production room</p>
          <p className="text-sm text-[#B8C4CF]">
            One lane per person. After the mix puts the guest after the host. Takes autosave on this computer.
          </p>
        </div>
        <div className="text-right text-xs font-mono text-[#A9B8C6] space-y-0.5">
          <p>
            {recording ? `● REC ${formatClock(recClock)}` : busy || (ready ? `${formatClock(playhead)} / ${durationLabel}` : 'Idle')}
          </p>
          {peakDb != null && Number.isFinite(peakDb) && (
            <p>
              Peak {peakDb.toFixed(1)} dB · RMS {rmsDb != null && Number.isFinite(rmsDb) ? rmsDb.toFixed(1) : '—'} dB
            </p>
          )}
          {loudness && Number.isFinite(loudness.lufs) && (
            <p className={loudness.lufs > PODCAST_LUFS + 2 ? 'text-[#FFB86B]' : 'text-[#8DEBFF]'}>
              LUFS {loudness.lufs.toFixed(1)} · target {PODCAST_LUFS}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {(recover || crashTakes.length > 0) && sessionStatus === 'offer' && (
          <div className="rounded-xl border border-[#53D6FF]/40 bg-[#0A1820] px-4 py-3 flex flex-wrap items-center gap-3">
            {crashTakes.length > 0 && (
              <p className="text-sm text-[#FFB86B] flex-1 min-w-[12rem] w-full">
                A previous session ended mid-take. {crashTakes.length} in-progress recording
                {crashTakes.length === 1 ? '' : 's'} ({crashTakes.map((t) => t.label).join(', ')}) were
                checkpointed and can be recovered.
              </p>
            )}
            {recover && (
              <p className="text-sm text-[#F6FAFC] flex-1 min-w-[12rem]">
                Recover {recover.takeCount} take{recover.takeCount === 1 ? '' : 's'}
                {recover.cameraCount
                  ? ` + ${recover.cameraCount} camera file${recover.cameraCount === 1 ? '' : 's'}`
                  : ''}{' '}
                ({formatClock(recover.durationSec)}) saved {new Date(recover.savedAt).toLocaleTimeString()} on
                this computer.
              </p>
            )}
            {crashTakes.length > 0 && (
              <button type="button" className={primary} onClick={() => void restoreCrashTakes()}>
                Recover in-progress take
              </button>
            )}
            {recover && (
              <button type="button" className={primary} onClick={() => void restoreSavedSession()}>
                Restore
              </button>
            )}
            <button type="button" className={btn} onClick={() => dismissRecover(false)}>
              Keep empty
            </button>
            <button type="button" className={btn} onClick={() => dismissRecover(true)}>
              Discard saved
            </button>
          </div>
        )}

        {recording && recFlowStalled && (
          <div className="rounded-xl border border-[#FF7A9A]/60 bg-[#20101A] px-4 py-3">
            <p className="text-sm text-[#FF7A9A]">
              No samples are reaching the recorder — the capture may have stalled. Check the mic / guest
              connection; the last checkpoint is safe on this computer.
            </p>
          </div>
        )}

        {camWarnFor && (
          <div className="rounded-xl border border-[#FFB86B]/50 bg-[#20180C] px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[#F6FAFC] flex-1 min-w-[12rem]">
              {CAMERA_ARM_WARNING}
              {camStorageHint ? ` ${camStorageHint}.` : ''}
            </p>
            <button type="button" className={primary} onClick={confirmArmCamera}>
              Arm camera
            </button>
            <button type="button" className={btn} onClick={() => setCamWarnFor(null)}>
              Cancel
            </button>
          </div>
        )}

        {/* Transport */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#0C141C]/95 border-b border-[#1A232C] flex flex-wrap gap-3 items-start">
          <div className="flex flex-wrap gap-2 items-center flex-1 min-w-[12rem]">
          <button type="button" className={recording ? danger : primary} onClick={() => void toggleRecord()}>
            {recording ? (
              <>
                <Square size={14} /> Stop
              </>
            ) : (
              <>
                <Mic2 size={14} /> Record new take
              </>
            )}
          </button>
          <select
            className={select}
            value={recMode}
            disabled={recording}
            title={recHint}
            onChange={(e) => setRecMode(e.target.value as RecMode)}
          >
            {REC_MODE_META.map((mode) => (
              <option key={mode.id} value={mode.id}>{mode.label}</option>
            ))}
          </select>
          <label className="text-xs text-[#A9B8C6] flex items-center gap-2">
            Preroll
            <select
              className={select}
              value={preroll}
              disabled={recording}
              onChange={(e) => setPreroll(Number(e.target.value))}
            >
              <option value={0}>0s</option>
              <option value={1}>1s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
            </select>
          </label>
          <label className="text-xs text-[#A9B8C6] flex items-center gap-2">
            Count-in
            <select
              className={select}
              value={countInBeats}
              disabled={recording}
              onChange={(e) => setCountInBeats(Number(e.target.value))}
            >
              <option value={0}>Off</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
          <button
            type="button"
            className={btn}
            disabled={!onMarkChapter}
            onClick={() => {
              if (onMarkChapter) onMarkChapter(playheadRef.current)
            }}
            title="Mark a chapter at the playhead (C)"
          >
            <BookmarkPlus size={14} /> Chapter here
          </button>
          <button type="button" className={btn} disabled={!ready || recording} onClick={() => togglePlay()}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? 'Pause' : 'Play mix'}
          </button>
          <button type="button" className={btn} disabled={!ready || recording} onClick={() => nudge(-5)}>
            <SkipBack size={14} /> 5s
          </button>
          <button type="button" className={btn} disabled={!ready || recording} onClick={() => nudge(5)}>
            5s <SkipForward size={14} />
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => setBound('start')}>
            In
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => setBound('end')}>
            Out
          </button>
          <button type="button" className={btn} disabled={historyLen === 0} onClick={() => void undo()}>
            <Undo2 size={14} /> Undo
          </button>
          <label className={btn + ' cursor-pointer'}>
            Import → selected
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              className="hidden"
              onChange={(e) => void onUploadPick(e.target.files?.[0] || null)}
            />
          </label>
          <label className={btn + ' cursor-pointer'}>
            Add music bed
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              className="hidden"
              onChange={(e) => void onImportBed(e.target.files?.[0] || null)}
            />
          </label>
          <button
            type="button"
            className={loop ? primary : btn}
            onClick={() => setLoop((v) => !v)}
          >
            Loop region
          </button>
          <button
            type="button"
            className={metronome ? primary : btn}
            onClick={() => setMetronome((v) => !v)}
          >
            Metronome
          </button>
          {metronome && (
            <label className="text-xs text-[#A9B8C6] flex items-center gap-2">
              BPM
              <input
                type="number"
                min={40}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className="w-16 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[#F6FAFC]"
              />
            </label>
          )}
          </div>
          {(Object.keys(cameraStreams).length > 0 ||
            (remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest))) ||
            cameraClips.length > 0) && (
            <div className="flex items-start gap-2 shrink-0">
              {cameraStreams.host ? (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Preview</p>
                  <CameraPreview
                    stream={cameraStreams.host}
                    label={people.find((p) => p.id === 'host')?.name || 'Host'}
                    live={recording}
                    compact
                    role="preview"
                  />
                </div>
              ) : remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)) ? (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Preview</p>
                  <CameraPreview
                    stream={remoteGuest}
                    label={people.find((p) => p.id === 'guest')?.name || 'Guest'}
                    live={recording}
                    compact
                    role="preview"
                  />
                </div>
              ) : (
                Object.entries(cameraStreams)
                  .slice(0, 1)
                  .map(([id, stream]) => (
                    <div key={id} className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Preview</p>
                      <CameraPreview
                        stream={stream}
                        label={people.find((p) => p.id === id)?.name || 'Camera'}
                        live={recording}
                        compact
                        role="preview"
                      />
                    </div>
                  ))
              )}
              {cameraStreams.host && remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)) ? (
                <div className="space-y-1 pt-4">
                  <CameraPreview
                    stream={remoteGuest}
                    label={people.find((p) => p.id === 'guest')?.name || 'Guest'}
                    live={recording}
                    compact
                    role="preview"
                  />
                </div>
              ) : (
                Object.entries(cameraStreams)
                  .filter(([id]) => {
                    if (remoteGuest && id === 'guest') return false
                    return cameraStreams.host ? id !== 'host' : id !== Object.keys(cameraStreams)[0]
                  })
                  .map(([id, stream]) => (
                    <div key={id} className="space-y-1 pt-4">
                      <CameraPreview
                        stream={stream}
                        label={people.find((p) => p.id === id)?.name || 'Camera'}
                        live={recording}
                        compact
                        role="preview"
                      />
                    </div>
                  ))
              )}
              <ProgramMonitor
                clips={cameraClips}
                playhead={playhead}
                mode={pictureMode}
                scene={pgmScene}
                fromScene={pgmFrom}
                mix={pgmMix}
                recording={recording}
                liveStream={
                  recording
                    ? cameraStreams.host ||
                      (remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)) ? remoteGuest : null) ||
                      Object.values(cameraStreams)[0] ||
                      null
                    : null
                }
                livePersonId={recording && !cameraStreams.host && remoteGuest ? 'guest' : 'host'}
              />
              <div className="space-y-1 pt-4">
                <ProgramSwitcher
                  pvw={pvwScene}
                  pgm={pgmScene}
                  fading={pgmMix < 0.999 && pgmFrom !== pgmScene}
                  fadeArmed={fadeNext}
                  onPvw={(scene) => {
                    setPvwScene(scene)
                    takeProgram(scene, fadeNext)
                    setFadeNext(false)
                  }}
                  onCut={() => {
                    setFadeNext(false)
                    takeProgram(pvwScene, false)
                  }}
                  onFade={() => {
                    if (pvwScene !== pgmScene) {
                      setFadeNext(false)
                      takeProgram(pvwScene, true)
                    } else {
                      setFadeNext((v) => !v)
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <GuestInvitePanel
          episodeId={episodeId}
          recording={recording}
          recTally={recTally}
          hostStream={hostTalkStream}
          cueStream={guestCueStream}
          onCueToGuest={setCueToGuest}
          onRemoteStream={onRemoteGuestStream}
          onRemoteVideo={setRemoteGuestVideo}
          onGuestName={onRemoteGuestName}
          onTakeUrl={setGuestTakeUrl}
          onCameraUrl={setGuestCameraUrl}
        />
        <div className="flex flex-wrap gap-2">
          {guestTakeUrl && (
            <button
              type="button"
              className={btn}
              onClick={() => void applyGuestTake(guestTakeUrl)}
            >
              Lay uploaded guest take
            </button>
          )}
          {guestCameraUrl && (
            <button
              type="button"
              className={btn}
              onClick={() => void applyGuestCamera(guestCameraUrl)}
            >
              Lay uploaded guest camera
            </button>
          )}
        </div>
        {remoteGuest && (
          <p className="text-[11px] text-[#7CFFB2]">
            Remote guest mic is the Guest lane input.
            {remoteGuestVideo || streamHasLiveVideo(remoteGuest)
              ? ' Their camera is live on the Guest card — Record writes a parallel camera file.'
              : ' Waiting for their camera. Local Guest Cam stays hidden while they are connected.'}
          </p>
        )}

        <div className="rounded-xl border border-[#1A232C] bg-[#0A1016] p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#A9B8C6]">
            <Headphones size={14} className="text-[#8DEBFF]" />
            <span>
              Use headphones so the cue mix does not leak into either mic.
              {Object.keys(cameraStreams).length > 0 || remoteGuestVideo
                ? ' Camera is preview (720p). Record still leaks if speakers are on.'
                : ''}
            </span>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={cueEnabled} onChange={(e) => setCueEnabled(e.target.checked)} />
              Play mix while recording
            </label>
            {cueEnabled && (
              <label className="inline-flex items-center gap-2">
                Cue {cueGain.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cueGain}
                  onChange={(e) => setCueGain(Number(e.target.value))}
                  className="w-24 accent-[#53D6FF]"
                />
              </label>
            )}
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={replaceArmed} onChange={(e) => setReplaceArmed(e.target.checked)} />
              Replace armed clip
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={rawInput} onChange={(e) => setRawInput(e.target.checked)} />
              Raw input (no Chrome AGC)
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={autoMuteQuiet} onChange={(e) => setAutoMuteQuiet(e.target.checked)} />
              Auto-mute quieter mic
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={voiceIsolate} onChange={(e) => setVoiceIsolate(e.target.checked)} />
              Isolate (RNNoise)
            </label>
            {mics.length > 0 && (
              <label className="inline-flex items-center gap-2">
                Fallback mic
                <select className={select} value={micId} onChange={(e) => setMicId(e.target.value)}>
                  <option value="">Default</option>
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || 'Microphone'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className={btn} onClick={armHostAndGuest}>
              Arm Host + Guest
            </button>
            <button type="button" className={btn} onClick={followTalkerNow}>
              Follow talker
            </button>
          </div>
          {(recording || anyArmed) && (
            <div className="space-y-1.5">
              {Object.keys(inputPeaks).length === 0 && (
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-[#151B22] overflow-hidden">
                    <div className="h-full bg-[#53D6FF] transition-[width] duration-75" style={{ width: '0%' }} />
                  </div>
                  <span className="text-xs font-mono text-[#A9B8C6]">{recording ? `in ${formatClock(recClock)}` : 'idle'}</span>
                </div>
              )}
              {Object.entries(inputPeaks).map(([key, peak]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-16 truncate text-[10px] uppercase tracking-wider text-[#7C8B97]">{key}</span>
                  <div className="h-2 flex-1 rounded-full bg-[#151B22] overflow-hidden">
                    <div
                      className={`h-full transition-[width] duration-75 ${clipHolds[key] ? 'bg-[#FF5B73]' : 'bg-[#53D6FF]'}`}
                      style={{ width: `${Math.min(100, peak * 140)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono ${clipHolds[key] ? 'text-[#FF7A9A]' : 'text-[#A9B8C6]'}`}>
                    {clipHolds[key] ? 'CLIP' : recording ? `in ${formatClock(recClock)}` : 'idle'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {recHint && (
            <p className="text-[11px] text-[#7C8B97]">
              {recHint}
              {personIdsArmed > 1
                ? remoteGuest
                  ? ' Remote guest is a second input — Host local, Guest booth, one punch.'
                  : armedDeviceCount > 1
                    ? ' Two mics, one punch — quieter lane mutes while the other person talks. Both recordings keep rolling.'
                    : ' Shared mic — Host and Guest record onto one take.'
                : ''}{' '}
              Space / L plays. J / K / L is the playhead. R records. S splits audio. V splits picture. Delete cuts a hole. 1–0 drops SFX. C marks a chapter.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[#1A232C] bg-[#080C10] px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Lane tools — same track</p>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-[#A9B8C6]">
              <input type="checkbox" checked={applyRangeAll} onChange={(e) => setApplyRangeAll(e.target.checked)} />
              Apply range to every track
            </label>
          </div>
          <p className="text-[11px] text-[#7C8B97]">
            Drag on that person's tracks (under their mixer) to select a section. Duck a bed, or Comp a voice take for that range (take 2 for the flub, take 1 for the rest). S splits. Delete cuts a hole.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-[#B8C4CF]">
              Section {Math.round(sectionLevel * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sectionLevel}
                onChange={(e) => setSectionLevel(Number(e.target.value))}
                className="w-28"
              />
            </label>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() =>
                editRange((t) => setVolumeInRange(t, rangeRef.current.start, rangeRef.current.end, sectionLevel), `Section volume ${Math.round(sectionLevel * 100)}% on this lane`)
              }
            >
              Set section volume
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !isVoiceRole(selected.role)}
              onClick={() => {
                if (!selected) return
                const cur = rangeRef.current
                if (cur.end - cur.start < 0.05) {
                  setError('Drag a range, then Comp this take')
                  return
                }
                pushHistory()
                setTracks((prev) => assignCompRange(prev, selected.id, cur.start, cur.end))
                setOk(`${selected.name} covers ${formatClock(cur.start)}–${formatClock(cur.end)}`)
              }}
            >
              Comp this take
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => setVolumeInRange(t, rangeRef.current.start, rangeRef.current.end, 0), 'Ducked section to silence (automation)')}
            >
              <VolumeX size={12} /> Mute section
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => {
                if (!selected) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, (t) => splitTrackAt(t, playheadRef.current)))
                setOk('Split at playhead')
              }}
            >
              <Scissors size={12} /> Split
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => splitRange(t, rangeRef.current.start, rangeRef.current.end), 'Split at selection edges')}
            >
              Split selection
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => cropToRange(t, rangeRef.current.start, rangeRef.current.end), 'Cropped to selection')}
            >
              Crop to selection
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, false), 'Cut hole (gap stays)')}
            >
              Cut hole
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Ripple delete')}
            >
              Ripple delete
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => {
                if (!selected) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, (t) => joinAdjacentClips(t, playheadRef.current)))
                setOk('Joined adjacent clips')
              }}
            >
              Join
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !selectedClipId}
              onClick={() => {
                if (!selected || !selectedClipId) return
                const clip = clipsOf(selected).find((c) => c.id === selectedClipId) || clipsOf(selected)[0]
                if (clip) clipClipboardRef.current = { ...clip }
                setOk('Copied clip')
              }}
            >
              Copy clip
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !clipClipboardRef.current}
              onClick={() => {
                const clip = clipClipboardRef.current
                if (!selected || !clip) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, (t) => pasteClip(t, clip, playheadRef.current)))
                setOk('Pasted clip at playhead')
              }}
            >
              Paste at playhead
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !selectedClipId}
              onClick={() => {
                if (!selected || !selectedClipId) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, (t) => duplicateClipAt(t, selectedClipId)))
                setOk('Repeated clip after itself')
              }}
            >
              Repeat clip
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !selectedClipId}
              onClick={() => {
                if (!selected || !selectedClipId) return
                pushHistory()
                setTracks((prev) =>
                  mapTrack(prev, selected.id, (t) => setClipFades(t, selectedClipId, 0.15, 0.25)),
                )
                setOk('Fades on selected clip')
              }}
            >
              Fade clip
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !(selected.automation || []).length}
              onClick={() => {
                if (!selected) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, clearAutomation))
                setOk('Cleared volume automation')
              }}
            >
              Clear automation
            </button>
          </div>
        </div>

        <SfxPad compact disabled={Boolean(busy) || recording} onDrop={(id) => void dropSfx(id)} />

        {/* People / takes */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">People & takes</p>
              <p className="text-[11px] font-mono text-[#A9B8C6]">
                {formatClock(playhead)}
                {range.end - range.start > 0.05
                  ? ` · sel ${formatClock(Math.min(range.start, range.end))}–${formatClock(Math.max(range.start, range.end))}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <input
                value={personDraft}
                onChange={(e) => setPersonDraft(e.target.value)}
                placeholder="Add a person"
                className="w-36 rounded-lg border border-[#27313B] bg-[#151B22] px-2 py-1.5 text-sm text-[#F6FAFC]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addPerson()
                }}
              />
              <button type="button" className={btn} onClick={addPerson}>
                <Plus size={14} /> Person
              </button>
              <button type="button" className={btn} onClick={() => addTrack('bed')}>
                <Plus size={14} /> Bed
              </button>
              <button type="button" className={btn} onClick={() => addTrack('sfx')}>
                <Plus size={14} /> SFX lane
              </button>
            </div>
          </div>
          <SessionTimeline {...timelineBoard} rulerOnly showRuler />

          {people.map((person) => {
            const lane = tracks.filter((t) => t.personId === person.id).sort((a, b) => a.take - b.take)
            const mixerTrack = lane.find((t) => t.id === selected?.id) || lane.find((t) => t.armed) || lane[0] || null
            return (
              <div key={person.id} className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: person.color }} />
                  <input
                    value={person.name}
                    onChange={(e) =>
                      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, name: e.target.value } : p)))
                    }
                    className="min-w-[7rem] rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-sm font-medium text-[#F6FAFC]"
                  />
                  <span className="text-[11px] text-[#A9B8C6]">
                    {lane.filter((t) => t.buffer).length} take{lane.filter((t) => t.buffer).length === 1 ? '' : 's'}
                    {` · ${lane.length} track${lane.length === 1 ? '' : 's'}`}
                  </span>
                  <button type="button" className={btn} onClick={() => addTake(person.id)}>
                    <Plus size={14} /> Take
                  </button>
                  {person.kind === 'voice' && person.id === 'guest' && remoteGuest ? (
                    <span className="text-[11px] text-[#7CFFB2]">
                      {remoteGuestVideo || streamHasLiveVideo(remoteGuest)
                        ? 'Remote booth · live camera'
                        : 'Remote booth · waiting for camera'}
                    </span>
                  ) : person.kind === 'voice' ? (
                    <>
                    <select
                      className={select}
                      value={person.inputDeviceId || ''}
                      onChange={(e) =>
                        setPeople((prev) =>
                          prev.map((p) => (p.id === person.id ? { ...p, inputDeviceId: e.target.value } : p)),
                        )
                      }
                      title="Microphone for this person"
                    >
                      <option value="">Fallback mic</option>
                      {mics.map((mic, idx) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {idx === 0 ? 'Mic 1 · ' : idx === 1 ? 'Mic 2 · ' : ''}
                          {mic.label || `Input ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <select
                      className={select}
                      value={person.videoDeviceId || ''}
                      disabled={recording}
                      onChange={(e) => void changeCameraDevice(person.id, e.target.value)}
                      title="Camera for this person"
                    >
                      <option value="">Default camera</option>
                      {cams.map((cam, idx) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          {cam.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={cameraStreams[person.id] ? primary : camWarnFor === person.id ? danger : chip}
                      disabled={recording}
                      title={
                        cameraStreams[person.id]
                          ? 'Turn camera off'
                          : camWarnFor === person.id
                            ? `Confirm camera — ~${CAMERA_MB_PER_MIN} MB/min at 720p`
                            : 'Open a real local camera preview (warns once about file size)'
                      }
                      onClick={() => void toggleCamera(person.id)}
                    >
                      {cameraStreams[person.id] ? <Video size={12} /> : <VideoOff size={12} />}
                      {cameraStreams[person.id] ? 'Cam on' : camWarnFor === person.id ? 'Confirm' : 'Cam'}
                    </button>
                    <button
                      type="button"
                      className={chip}
                      disabled={recording}
                      title="Kdenlive-style title clip on the picture clock at the playhead"
                      onClick={() => addLowerThird(person.id)}
                    >
                      Lower third
                    </button>
                    <label className={`${chip} cursor-pointer`} title="Import a B-roll movie onto this picture lane">
                      B-roll
                      <input
                        type="file"
                        accept="video/*,.mp4,.webm,.mov"
                        className="hidden"
                        disabled={recording}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          e.target.value = ''
                          void importBroll(person.id, file)
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={chip}
                      disabled={recording}
                      title="OBS-style black flash at the playhead — canvas, not a plugin"
                      onClick={() => addStinger(person.id, 'playhead')}
                    >
                      Stinger
                    </button>
                    {cameraClips.some((c) => c.personId === person.id) && (
                      <button
                        type="button"
                        className={personAvLinked(person) ? chip : btn}
                        title={
                          personAvLinked(person)
                            ? 'Linked: moving a take can nudge this camera. Trim/split/cut stay independent.'
                            : 'Unlinked: audio and picture edit on their own. Same playhead.'
                        }
                        onClick={() =>
                          setPeople((prev) =>
                            prev.map((p) => (p.id === person.id ? { ...p, avLinked: !personAvLinked(p) } : p)),
                          )
                        }
                      >
                        {personAvLinked(person)
                          ? avBroken(tracks, cameraClips, person)
                            ? 'Linked · sync off'
                            : 'Linked'
                          : 'Unlinked'}
                      </button>
                    )}
                    </>
                  ) : null}
                  {person.kind === 'voice' && (
                    <button
                      type="button"
                      className={lane.some((t) => t.armed) ? danger : chip}
                      onClick={() => {
                        const empty = emptyTakeForPerson(tracks, person.id)
                        const last = lane[lane.length - 1]
                        if (empty) armTrack(empty.id)
                        else if (last) armTrack(last.id)
                      }}
                    >
                      Arm
                    </button>
                  )}
                  {person.kind === 'voice' && lane.some((t) => (t.compRanges || []).length > 0) && (
                    <button
                      type="button"
                      className={chip}
                      onClick={() => {
                        pushHistory()
                        setTracks((prev) => clearCompRanges(prev, person.id))
                        setOk(`Cleared comps for ${person.name} — A take is the default again`)
                      }}
                    >
                      Clear comps
                    </button>
                  )}
                </div>
                {mixerTrack && (
                  <div
                    className={`rounded-xl border p-2.5 space-y-2 ${
                      selected?.id === mixerTrack.id ? 'border-[#53D6FF]/60 bg-[#121A22]' : 'border-[#1A232C] bg-[#0A1016]'
                    }`}
                    onClick={() => setSelectedId(mixerTrack.id)}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {lane.map((track) => {
                        const active = mixerTrack.id === track.id
                        return (
                          <button
                            key={track.id}
                            type="button"
                            className={active ? primary : chip}
                            title={track.buffer ? track.name : `${track.name} · empty — arm to record`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedId(track.id)
                            }}
                          >
                            take {track.take}
                            {track.armed ? ' · R' : ''}
                            {!track.buffer ? ' · empty' : ''}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={mixerTrack.name}
                        onChange={(e) => updateTrack(mixerTrack.id, { name: e.target.value })}
                        className="min-w-[7rem] flex-1 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-sm text-[#F6FAFC]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        className={mixerTrack.muted ? danger : chip}
                        title="Mute"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateTrack(mixerTrack.id, { muted: !mixerTrack.muted })
                        }}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        className={mixerTrack.solo ? primary : chip}
                        title="Solo"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateTrack(mixerTrack.id, { solo: !mixerTrack.solo })
                        }}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        className={mixerTrack.armed ? danger : chip}
                        title="Arm for record"
                        onClick={(e) => {
                          e.stopPropagation()
                          armTrack(mixerTrack.id)
                        }}
                      >
                        R
                      </button>
                      {isVoiceRole(mixerTrack.role) && (
                        <>
                          <button
                            type="button"
                            className={mixerTrack.listen ? primary : chip}
                            title="Audible take — other takes for this person stay out of the mix"
                            onClick={(e) => {
                              e.stopPropagation()
                              pushHistory()
                              setTracks((prev) => withListenTake(prev, mixerTrack.id))
                            }}
                          >
                            A
                          </button>
                          <button
                            type="button"
                            className={mixerTrack.layered ? primary : chip}
                            title="Layer this take with the audible take"
                            onClick={(e) => {
                              e.stopPropagation()
                              updateTrack(mixerTrack.id, { layered: !mixerTrack.layered })
                            }}
                          >
                            L
                          </button>
                          <button
                            type="button"
                            className={(mixerTrack.compRanges || []).length ? primary : chip}
                            title="Use this take for the selected range (other takes yield)"
                            onClick={(e) => {
                              e.stopPropagation()
                              const cur = rangeRef.current
                              if (cur.end - cur.start < 0.05) {
                                setError('Drag a range on the timeline, then Comp')
                                return
                              }
                              pushHistory()
                              setTracks((prev) => assignCompRange(prev, mixerTrack.id, cur.start, cur.end))
                              setOk(`${mixerTrack.name} is the audible take ${formatClock(cur.start)}–${formatClock(cur.end)}`)
                            }}
                          >
                            Comp
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={chip}
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateTrack(mixerTrack.id)
                        }}
                      >
                        <CopyPlus size={12} />
                      </button>
                      <button
                        type="button"
                        className={chip}
                        title="Clear audio"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearTrack(mixerTrack.id)
                        }}
                      >
                        <Minus size={12} />
                      </button>
                      <button
                        type="button"
                        className={chip}
                        title="Remove track"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTrack(mixerTrack.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[#A9B8C6]">
                      <label>
                        Vol {mixerTrack.volume.toFixed(2)}
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.02}
                          value={mixerTrack.volume}
                          onChange={(e) => updateTrack(mixerTrack.id, { volume: Number(e.target.value) })}
                          className="w-full accent-[#53D6FF]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <label>
                        Pan {mixerTrack.pan.toFixed(2)}
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={mixerTrack.pan}
                          onChange={(e) => updateTrack(mixerTrack.id, { pan: Number(e.target.value) })}
                          className="w-full accent-[#53D6FF]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <label>
                        Start
                        <input
                          defaultValue={formatClock(mixerTrack.offset)}
                          key={`${mixerTrack.id}-${mixerTrack.offset.toFixed(2)}`}
                          placeholder="1:30"
                          className="mt-1 w-full rounded border border-[#27313B] bg-[#151B22] px-2 py-0.5 text-[11px] text-[#F6FAFC]"
                          onBlur={(e) => {
                            const parsed = parseClock(e.target.value)
                            if (parsed != null) updateTrack(mixerTrack.id, { offset: parsed })
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <label>
                        Fade {mixerTrack.fadeIn.toFixed(1)}/{mixerTrack.fadeOut.toFixed(1)}s
                        <div className="flex gap-1">
                          <input
                            type="range"
                            min={0}
                            max={4}
                            step={0.05}
                            value={mixerTrack.fadeIn}
                            onChange={(e) => updateTrack(mixerTrack.id, { fadeIn: Number(e.target.value) })}
                            className="w-1/2 accent-[#53D6FF]"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <input
                            type="range"
                            min={0}
                            max={4}
                            step={0.05}
                            value={mixerTrack.fadeOut}
                            onChange={(e) => updateTrack(mixerTrack.id, { fadeOut: Number(e.target.value) })}
                            className="w-1/2 accent-[#53D6FF]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                )}
                <SessionTimeline {...timelineBoard} personId={person.id} embedded showRuler={false} />
                {person.kind === 'voice' && person.id === 'guest' && remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)) ? (
                  <div className="flex flex-wrap items-start gap-3 pt-1">
                    <CameraPreview
                      stream={remoteGuest}
                      label={`${person.name} camera (live)`}
                      live={recording}
                      role="preview"
                    />
                    <p className="max-w-xs text-[11px] text-[#7C8B97]">
                      Inbound guest camera on the same WebRTC peer. Record writes a separate camera file
                      on the same punch — not muxed into the take. Cam off punches audio under existing
                      picture. Not written to the RSS mix.
                    </p>
                  </div>
                ) : person.kind === 'voice' && cameraStreams[person.id] ? (
                  <div className="flex flex-wrap items-start gap-3 pt-1">
                    <CameraPreview
                      stream={cameraStreams[person.id]}
                      label={`${person.name} camera`}
                      live={recording}
                      role="preview"
                    />
                    <p className="max-w-xs text-[11px] text-[#7C8B97]">
                      Local preview, capped ~720p. Record writes a separate camera file on the same punch.
                      Cam off + Record is punch-under-picture — new audio, same video. Not muxed, not RSS.
                    </p>
                  </div>
                ) : null}
                {person.kind === 'voice' && (
                  <CameraLane
                    clips={cameraClips.filter((c) => c.personId === person.id)}
                    playhead={playhead}
                    pxPerSec={zoom}
                    durationSec={boardDuration}
                    scrollLeft={timelineScroll}
                    onScrollLeft={setTimelineScroll}
                    color={person.color}
                    selectedId={selectedCamClipId}
                    onSelect={setSelectedCamClipId}
                    onPlayhead={setHead}
                    onMoveClip={moveSelectedCamera}
                    onTrimClip={(clipId, edge, time) => {
                      setCameraClips((prev) => trimCameraClip(prev, clipId, edge, time))
                    }}
                    onRange={(start, end) => setRange((prev) => ({ ...prev, start, end }))}
                    range={range}
                    linked={personAvLinked(person)}
                    onLinkedChange={(next) =>
                      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, avLinked: next } : p)))
                    }
                    drift={avDriftForPerson(tracks, cameraClips, person.id)}
                    broken={avBroken(tracks, cameraClips, person)}
                    disabled={Boolean(busy) || recording}
                    onSplit={splitSelectedCameraAtPlayhead}
                    onCutHole={(ripple) => editCameraRange(ripple)}
                    onTrimEdge={(edge) => {
                      if (!selectedCamClipId) return
                      pushHistory()
                      setCameraClips((prev) => trimCameraClip(prev, selectedCamClipId, edge, playheadRef.current))
                      setOk(edge === 'in' ? 'Trimmed picture in at playhead' : 'Trimmed picture out at playhead')
                    }}
                    onSlip={(delta) => {
                      if (!selectedCamClipId) return
                      pushHistory()
                      setCameraClips((prev) => slipCameraClip(prev, selectedCamClipId, delta))
                      setOk('Slipped picture (timeline seat stays)')
                    }}
                    onMute={() => {
                      if (!selectedCamClipId) return
                      pushHistory()
                      setCameraClips((prev) => toggleCameraMute(prev, selectedCamClipId))
                      setOk('Toggled picture mute — audio unchanged')
                    }}
                    onJoin={() => {
                      pushHistory()
                      setCameraClips((prev) => joinAdjacentCamera(prev, playheadRef.current, person.id))
                      setOk('Joined adjacent picture clips')
                    }}
                    onDissolve={() => {
                      if (!selectedCamClipId) return
                      pushHistory()
                      setCameraClips((prev) => dissolveCameraPair(prev, selectedCamClipId, 0.5))
                      setOk('Dissolved into the next picture clip — audio unchanged')
                    }}
                    onStinger={(where) => addStinger(person.id, where)}
                    markers={pictureMarkers}
                  />
                )}
                {person.kind === 'voice' &&
                  cameraClips
                    .filter((c) => c.personId === person.id && c.id === selectedCamClipId)
                    .map((clip) => (
                      <CameraClipReview
                        key={clip.id}
                        clip={clip}
                        label={person.name}
                        onDiscard={() => discardCameraClip(clip.id)}
                        onFilter={(filter) => setCameraClips((prev) => setCameraFilter(prev, clip.id, filter))}
                        onFades={(fadeIn, fadeOut) =>
                          setCameraClips((prev) => setCameraFades(prev, clip.id, fadeIn, fadeOut))
                        }
                        onTitle={(name, sub) =>
                          setCameraClips((prev) =>
                            prev.map((c) => (c.id === clip.id ? { ...c, label: name, sublabel: sub } : c)),
                          )
                        }
                        onOverlayFit={(fit) =>
                          setCameraClips((prev) =>
                            prev.map((c) => (c.id === clip.id ? { ...c, overlayFit: fit } : c)),
                          )
                        }
                        onStingerStyle={(style) =>
                          setCameraClips((prev) => setStingerStyle(prev, clip.id, style))
                        }
                        onSeedKeyframes={() =>
                          setCameraClips((prev) => seedCameraKeyframes(prev, clip.id))
                        }
                        onAddKeyframe={() =>
                          setCameraClips((prev) => addKeyframeAt(prev, clip.id, playheadRef.current))
                        }
                        onUpdateKeyframe={(index, patch) =>
                          setCameraClips((prev) => updateKeyframe(prev, clip.id, index, patch))
                        }
                        onRemoveKeyframe={(index) =>
                          setCameraClips((prev) => removeKeyframe(prev, clip.id, index))
                        }
                      />
                    ))}
              </div>
            )
          })}
        </div>

        {tracks.some((t) => !people.some((p) => p.id === t.personId)) && (
            <div className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-2.5 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Other clips</p>
              {tracks.filter((t) => !people.some((p) => p.id === t.personId)).map((track) => (
                <p key={track.id} className="text-sm text-[#B8C4CF]">{track.name}</p>
              ))}
              <SessionTimeline
                {...timelineBoard}
                people={[]}
                tracks={tracks.filter((t) => !people.some((p) => p.id === t.personId))}
                embedded
                showRuler
              />
            </div>
          )}

        {/* Master bus / playhead */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
            Playhead {formatClock(playhead)} · export {formatClock(range.start)} – {formatClock(range.end)}
          </p>
          <button
            type="button"
            className="relative w-full h-16 rounded-xl bg-[#05070A] border border-[#1A232C] overflow-hidden"
            onClick={(e) => {
              if (sessionLen <= 0) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              setHead(x * sessionLen)
            }}
          >
            <div
              className="absolute inset-y-0 bg-[#53D6FF]/15"
              style={{
                left: sessionLen > 0 ? `${(range.start / sessionLen) * 100}%` : 0,
                width: sessionLen > 0 ? `${((range.end - range.start) / sessionLen) * 100}%` : 0,
              }}
            />
            {hasAudio && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#8DEBFF]"
                style={{ left: sessionLen > 0 ? `${(playhead / sessionLen) * 100}%` : 0 }}
              />
            )}
            {!hasAudio && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-[#A9B8C6]">
                Record a take — playhead and cue mix run live, without bouncing a WAV first
              </p>
            )}
          </button>
          <div className="mt-3 grid sm:grid-cols-4 gap-3 text-xs text-[#A9B8C6]">
            <label>
              Zoom {zoom}px/s
              <input
                type="range"
                min={20}
                max={200}
                step={5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master vol {masterGain.toFixed(2)}
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.05}
                value={masterGain}
                onChange={(e) => setMasterGain(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master fade in {masterFadeIn.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeIn}
                onChange={(e) => setMasterFadeIn(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master fade out {masterFadeOut.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeOut}
                onChange={(e) => setMasterFadeOut(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
          </div>
        </div>

        {/* Effects + clip tools */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
            Insert rack {selected ? `· ${selected.name}` : ''} · bypass / wet-dry · not baked in
          </p>
          <div className="flex flex-wrap gap-2">
            {INSERT_FX.map((id) => {
              const fx = EFFECT_META.find((e) => e.id === id)!
              return (
                <button
                  key={id}
                  type="button"
                  title={fx.hint}
                  disabled={!selected?.buffer || Boolean(busy)}
                  onClick={() => void runEffect(id, 'insert')}
                  className="px-3 py-2 rounded-lg border border-[#27313B] bg-[#151B22] text-sm text-[#F6FAFC] hover:border-[#53D6FF]/50 disabled:opacity-40"
                >
                  {fx.label}
                </button>
              )
            })}
          </div>
          {(selected?.inserts || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(selected.inserts || []).map((slot, idx) => (
                <li key={`${slot.id}-${idx}`} className="flex flex-wrap items-center gap-2 text-xs text-[#B8C4CF]">
                  <span className="min-w-[5.5rem]">{EFFECT_META.find((e) => e.id === slot.id)?.label || slot.id}</span>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!slot.bypass}
                      onChange={(e) => {
                        const inserts = (selected.inserts || []).map((s, i) =>
                          i === idx ? { ...s, bypass: !e.target.checked } : s,
                        )
                        invalidateInsertCache(selected.id)
                        updateTrack(selected.id, { inserts })
                      }}
                    />
                    on
                  </label>
                  <label className="inline-flex items-center gap-1">
                    wet {slot.wet.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={slot.wet}
                      onChange={(e) => {
                        const inserts = (selected.inserts || []).map((s, i) =>
                          i === idx ? { ...s, wet: Number(e.target.value) } : s,
                        )
                        invalidateInsertCache(selected.id)
                        updateTrack(selected.id, { inserts })
                      }}
                      className="w-20 accent-[#53D6FF]"
                    />
                  </label>
                  <button
                    type="button"
                    className={chip}
                    onClick={() => {
                      const inserts = (selected.inserts || []).filter((_, i) => i !== idx)
                      invalidateInsertCache(selected.id)
                      updateTrack(selected.id, { inserts })
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Render to take (destructive)</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {RENDER_ONLY_FX.map((id) => {
              const fx = EFFECT_META.find((e) => e.id === id)!
              return (
                <button
                  key={id}
                  type="button"
                  title={fx.hint}
                  disabled={!selected?.buffer || Boolean(busy)}
                  onClick={() => void runEffect(id, 'render')}
                  className="px-3 py-2 rounded-lg border border-[#27313B] bg-[#151B22] text-sm text-[#F6FAFC] hover:border-[#53D6FF]/50 disabled:opacity-40"
                >
                  {fx.label}
                </button>
              )
            })}
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer || !(selected.inserts || []).length || Boolean(busy)}
              onClick={async () => {
                if (!selected?.buffer) return
                const baked = await tracksWithInserts([selected])
                const next = baked[0]?.buffer
                if (!next) return
                pushHistory()
                assignBufferToTrack(selected.id, next, `Rendered inserts into ${selected.name}`)
                updateTrack(selected.id, { inserts: [] })
                invalidateInsertCache(selected.id)
              }}
            >
              Render inserts to take
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={splitSelectedAtPlayhead}>
              Split at playhead (same lane)
            </button>
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={bounceSelectedToStem}>
              Bounce track → stem
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'], 'keep')}
            >
              Bounce mix (keeps takes)
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'limit'], 'keep')}
            >
              Normalize + limit (keeps takes)
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'], 'replace')}
            >
              Replace session
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1 border-t border-[#27313B]">
          <button
            type="button"
            className={primary}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('mp3')}
          >
            {busy?.includes('MP3') ? busy : 'Save mix MP3 (hosted)'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('wav')}
          >
            {busy?.includes('WAV') ? busy : 'Save mix WAV'}
          </button>
          {onPublished && (
            <button
              type="button"
              className={primary}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void exportAudio('mp3', true)}
            >
              Save mix + publish to site / RSS
            </button>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs text-[#A9B8C6]">
            <input type="checkbox" checked={matchLufs} onChange={(e) => setMatchLufs(e.target.checked)} />
            Match {PODCAST_LUFS} LUFS
          </label>
          <button
            type="button"
            className={btn}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void downloadStems()}
          >
            {busy?.includes('stems') ? busy : 'Download stems zip'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!cameraClips.length || Boolean(busy)}
            title="Host camera + audio mix, encoded as fast as this computer can. Local file — RSS stays the mix."
            onClick={() => void downloadPicture('a-roll')}
          >
            {busy?.includes('A-roll') ? busy : 'Download A-roll'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!cameraClips.some((c) => c.personId === 'guest') || Boolean(busy)}
            title="Host full frame, guest PIP, encoded as fast as this computer can. Local file — audio_url stays the mix."
            onClick={() => void downloadPicture('pip')}
          >
            {busy?.includes('PIP') ? busy : 'Download PIP'}
          </button>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
        <p className="text-[11px] text-[#A9B8C6]">
          After the mix lays the next person at the end of the session. After my last take is a pickup. Cue mix plays live from the other lanes — no bounce before Record. Record capture starts with preroll and trims to punch. Two mics auto-mute the quieter lane (recordings keep rolling). Isolate uses RNNoise on the insert rack. Cam on a voice card is a real local preview; Record also writes a parallel camera file on the same clock (autosaved in this browser, not episode audio_url). Linked moves can nudge picture; Unlinked edits audio and video apart. A broken-sync badge shows if in-points drift. Punch with Cam off lays new audio under existing picture. Preview is live cameras; Program is punched/edited output (titles, B-roll, stingers, keyframes, dissolves, color). Host / Guest / PIP is the Program scene — Cut or Fade takes Preview to Program. Stinger is a black or title flash on the picture clock. Keyframes move opacity and position on the selected clip. Lower third and B-roll sit on the picture lane. Dissolve overlaps the next clip. Color is a non-destructive insert. Chapters (C) tick on the camera lane. V splits picture; J/K/L is the playhead. If this browser runs out of space, takes still save and you are told to download the camera files. Remote guest can send live camera on the same WebRTC peer, plus a local camera backup if the peer is thin. Download A-roll / PIP follows edited clip offsets and encodes as fast as this computer can (WebCodecs); the public feed stays audio. A picks the default audible take; Comp assigns a range to another take; L layers. Drag a range on the music lane to duck without a second track. Export can match −16 LUFS; stems zip is a local download. Mix is hosted on your site (Supabase media). Public feed{' '}
          <code className="text-[#8DEBFF]">/podcast/rss.xml</code> powers Apple Podcasts, Spotify for
          Podcasters, and Amazon Music — submit that URL once; new published mixes appear automatically.
        </p>
      </div>
    </div>
  )
}

const btn =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40'
const chip =
  'inline-flex items-center justify-center h-7 min-w-[1.75rem] px-1.5 rounded border border-[#27313B] text-xs text-[#B8C4CF]'
const primary =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40'
const danger =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/90 text-white text-sm font-medium'
const select =
  'rounded-lg border border-[#27313B] bg-[#151B22] px-2 py-1.5 text-sm text-[#B8C4CF]'
