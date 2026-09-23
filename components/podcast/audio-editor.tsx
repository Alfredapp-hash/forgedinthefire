'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  clearSession,
  loadSession,
  peekSession,
  saveSession,
  type SessionPeek,
} from '@/lib/podcast/session-store'
import {
  openInputStreams,
  startLaneCapture,
  stopLaneCapture,
  stopStreams,
  type LaneCapture,
} from '@/lib/podcast/capture'
import {
  renderPictureMix,
  renderProgramVideo,
  type PictureMode,
  type PictureRenderResult,
  type PictureScene,
  type PictureWritable,
  type VideoExportFormat,
} from '@/lib/podcast/picture'
import type { PodcastChapter } from '@/lib/studio/types'
import { applyFollowTalker } from '@/lib/podcast/auto-mix'
import { measureLoudness, PODCAST_LUFS } from '@/lib/podcast/lufs'
import { slugFile, zipStore } from '@/lib/podcast/zip'
import { renderMaster } from '@/lib/podcast/master'
import { renderSfx, SFX_META, type SfxId } from '@/lib/podcast/sfx'
import { SfxPad } from '@/components/podcast/sfx-pad'
import { setStudioGuard, useLeaveGuard } from '@/components/podcast/studio/leave-guard'
import {
  InfoTip,
  STUDIO_STEPS,
  StepNav,
  usePersistentFlag,
  type StudioStep,
} from '@/components/podcast/studio/step-nav'
import { ShortcutsOverlay } from '@/components/podcast/studio/shortcuts-overlay'
import { JournalRecoveryBanner } from '@/components/podcast/studio/recovery-banner'
import { RemoteAudioKeepAlive } from '@/components/podcast/studio/remote-audio-keepalive'
import { useWakeLock } from '@/components/podcast/studio/use-wake-lock'
import { watchInputs } from '@/components/podcast/studio/track-watchdog'
import { createLiveStore, LiveStoreContext } from '@/components/podcast/studio/live-store'
import {
  LiveClock,
  LiveMeters,
  LiveOverviewHead,
  LiveProgram,
  LiveStatusLine,
} from '@/components/podcast/studio/live-readouts'
import {
  deleteTake,
  openTakeJournal,
  requestPersistentStorage,
  type TakeJournal,
  type UnfinishedTake,
} from '@/lib/podcast/take-journal'
import { SessionTimeline } from '@/components/podcast/session-timeline'
import { GuestInvitePanel } from '@/components/podcast/guest-invite-panel'
import type { GuestTallyPhase } from '@/lib/podcast/guest-types'
import { CameraClipReview, CameraLane, ProgramCutLane } from '@/components/podcast/camera-lane'
import { CameraPreview } from '@/components/podcast/camera-preview'
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
  programStateAt,
  PROGRAM_FADE_SEC,
  startCameraCapture,
  storageBytesLeft,
  streamHasLiveVideo,
  type CameraCapture,
  type CameraClip,
  type ProgramCut,
} from '@/lib/podcast/camera'
import {
  addKeyframeAt,
  addProgramCut,
  deleteCameraRange,
  dissolveCameraPair,
  joinAdjacentCamera,
  moveCameraClip,
  moveProgramCut,
  patchCameraClip,
  removeCameraClip,
  removeKeyframe,
  removeProgramCut,
  rippleProgramCuts,
  seedCameraKeyframes,
  setCameraFades,
  setCameraFilter,
  setGraphicDuration,
  setProgramCutFade,
  setProgramCutScene,
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
  PauseCircle,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Redo2,
  Undo2,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react'

type Props = {
  episodeId?: string | null
  audioUrl?: string | null
  title: string
  /** Resolve `false` when the host declined (e.g. the person cancelled replacing live audio). */
  onExported: (file: File, durationSeconds: number) => Promise<void | false>
  onPublished?: () => Promise<void>
  onMarkChapter?: (seconds: number) => void
  chapters?: PodcastChapter[]
}

type Snapshot = {
  tracks: StudioTrack[]
  cameras: CameraClip[]
  programCuts: ProgramCut[]
  selectedId: string | null
  selectedCamClipId: string | null
}

/** Which timeline surface Delete / S act on (last one clicked). */
type EditFocus = 'audio' | 'camera' | 'program'

const HISTORY_LIMIT = 30
/** Soft RAM ceiling for in-flight camera recordings (MediaRecorder keeps chunks in memory until Stop). */
const CAMERA_RAM_WARN_BYTES = 1.5 * 1024 * 1024 * 1024

type SaveFilePicker = (opts: {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ name: string; createWritable: () => Promise<PictureWritable> }>

/** Stable callback identity that always runs the latest closure (event handlers only). */
function useStableHandler<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}

/** IndexedDB key for a session set aside by "Start fresh (keep backup)". */
function backupKey(episodeId: string) {
  return `${episodeId}::backup`
}

/** Plain-language names for the record start modes (lib labels stay for other surfaces). */
const REC_MODE_LABEL: Partial<Record<RecMode, string>> = {
  after_mix: 'After everything so far',
  after_mine: 'After my last take',
  at_playhead: 'Re-record from here',
  from_start: 'From the beginning',
}

const NEXT_STEP: Record<StudioStep, StudioStep> = {
  setup: 'record',
  record: 'edit',
  edit: 'publish',
  publish: 'publish',
}

const STEP_HINT: Record<StudioStep, string> = {
  setup: 'Invite the guest, choose each person’s microphone, and check the levels move when they talk.',
  record: 'Press Record. Safe pause (Shift+Space) silences the guest instantly if they need a moment.',
  edit: 'Drag across a lane to select a part, then remove it, lower it, or fix levels.',
  publish: 'Save the finished mix to the episode, then review it before it goes live.',
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
  const [programCuts, setProgramCuts] = useState<ProgramCut[]>([])
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null)
  const [startScene] = useState<PictureScene>('host')
  const [pvwScene, setPvwScene] = useState<PictureScene>('host')
  /** Transient Fade-to-Program animation while paused; null = follow the Program lane. */
  const [pgmAnim, setPgmAnim] = useState<{ from: PictureScene; to: PictureScene; mix: number } | null>(null)
  const [fadeNext, setFadeNext] = useState(false)
  const fadeAnimRef = useRef(0)
  const editFocusRef = useRef<EditFocus>('audio')
  const [exportFormat, setExportFormat] = useState<VideoExportFormat>('webm')
  const exportAbortRef = useRef<AbortController | null>(null)
  const [exporting, setExporting] = useState(false)
  const [recWarn, setRecWarn] = useState<string | null>(null)
  const [recCamBytes, setRecCamBytes] = useState(0)
  const [camWarnFor, setCamWarnFor] = useState<string | null>(null)
  const [camStorageHint, setCamStorageHint] = useState<string | null>(null)
  const camWarnedRef = useRef(false)
  const [liveStore] = useState(createLiveStore)
  const [matchLufs, setMatchLufs] = useState(true)
  const [loudness, setLoudness] = useState<{ lufs: number; peakDb: number } | null>(null)
  /** Tracks the loudness readout was measured on — any edit makes it stale. */
  const [loudnessFor, setLoudnessFor] = useState<StudioTrack[] | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [exportSelectionOnly, setExportSelectionOnly] = useState(false)
  /** Tracks as of the last load / restore / saved mix; unsaved = edits since then. */
  const [savedTracks, setSavedTracks] = useState<StudioTrack[] | null>(null)
  const baselinePendingRef = useRef(true)
  const [step, setStep] = useState<StudioStep>('setup')
  const [advanced, setAdvanced] = usePersistentFlag('fitf.studio.advanced', false)
  const [shortcutsOn, setShortcutsOn] = usePersistentFlag('fitf.studio.shortcuts', true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const closeShortcuts = useCallback(() => setShowShortcuts(false), [])
  /** Survivor-safety: guest silenced in the recording and every local monitor. */
  const [safePaused, setSafePaused] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const safePausedRef = useRef(false)
  /** Loud banner when an input dies mid-session. */
  const [inputLost, setInputLost] = useState<string | null>(null)
  const [rearmTick, setRearmTick] = useState(0)
  /** Polite screen-reader announcement for record start / stop. */
  const [recAnnounce, setRecAnnounce] = useState('')
  const [personDraft, setPersonDraft] = useState('')
  /** Timeline width grows in 30 s steps as the playhead runs past it (not every frame). */
  const [boardExtent, setBoardExtent] = useState(30)
  const boardExtentRef = useRef(30)
  const [recover, setRecover] = useState<SessionPeek | null>(null)
  /** Previous session set aside by "Start fresh (keep backup)" — offered, never blocking. */
  const [backupPeek, setBackupPeek] = useState<SessionPeek | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'offer' | 'open'>(
    episodeId ? 'checking' : 'open',
  )

  const recorderRef = useRef<LaneCapture[]>([])
  const capturesRef = useRef<LaneCapture[]>([])
  const cameraCapturesRef = useRef<CameraCapture[]>([])
  const cameraStreamsRef = useRef<Record<string, MediaStream>>({})
  const streamRef = useRef<MediaStream[]>([])
  const clipClipboardRef = useRef<TrackClip | null>(null)
  const historyRef = useRef<Snapshot[]>([])
  const [historyLen, setHistoryLen] = useState(0)
  const redoRef = useRef<Snapshot[]>([])
  const [redoLen, setRedoLen] = useState(0)
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
  const stopMeterRef = useRef<Array<() => void>>([])
  const recRafRef = useRef<number | null>(null)
  const recUnwatchRef = useRef<() => void>(() => {})
  /** Take journals whose audio is laid on the timeline, finished once the session autosave lands. */
  const pendingJournalsRef = useRef<TakeJournal[]>([])
  /** Recovered journal takes to delete once the session autosave holds them. */
  const restoredJournalIdsRef = useRef<string[]>([])
  /** Last opened input stream per device key (idle + record) — Safe pause targets the guest's. */
  const inputByKeyRef = useRef(new Map<string, MediaStream>())
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

  /** Latest committed values for stable callbacks, unmount cleanup and async work. */
  const latestRef = useRef({ tracks, people, cameraClips, programCuts, sessionOpen: sessionStatus === 'open' })
  useLayoutEffect(() => {
    latestRef.current = { tracks, people, cameraClips, programCuts, sessionOpen: sessionStatus === 'open' }
    rangeRef.current = range
    cueToGuestRef.current = cueToGuest
    cameraStreamsRef.current = cameraStreams
  })

  const hasAudio = tracks.some((t) => Boolean(t.buffer))
  const sessionLen = Math.max(sessionDuration(tracks), pictureEnd(cameraClips))
  const ready = hasAudio
  const selStart = Math.min(range.start, range.end)
  const selEnd = Math.max(range.start, range.end)
  /** A real drag selection — not the default whole-session range. */
  const hasSelection = selEnd - selStart >= 0.05 && !(selStart <= 0.01 && selEnd >= sessionLen - 0.05)
  const exportSelection = exportSelectionOnly && hasSelection ? { start: selStart, end: selEnd } : null
  const unsaved = hasAudio && savedTracks !== null && tracks !== savedTracks
  const loudnessStale = Boolean(loudness) && loudnessFor !== tracks
  const anyArmed = tracks.some((t) => t.armed)
  /** Unique capture devices for armed lanes — the idle meter effect keys on this, not on people. */
  const armedDeviceSig = JSON.stringify(
    [...new Set(tracks.filter((t) => t.armed).map((t) => deviceKey(t.personId)))].sort(),
  )
  const meterLabels: Record<string, string> = {}
  for (const t of tracks) {
    if (!t.armed) continue
    const key = deviceKey(t.personId)
    const name = people.find((p) => p.id === t.personId)?.name
    if (!name) continue
    meterLabels[key] = meterLabels[key] && !meterLabels[key].split(' + ').includes(name) ? `${meterLabels[key]} + ${name}` : name
  }
  const personIdsArmed = new Set(tracks.filter((t) => t.armed).map((t) => t.personId)).size
  const armedDeviceCount = new Set(
    tracks
      .filter((t) => t.armed)
      .map((t) => people.find((p) => p.id === t.personId)?.inputDeviceId || micId || ''),
  ).size

  // An episode that opens with audio already on it starts on Edit; a blank one on Set up.
  const autoStepRef = useRef(false)
  useEffect(() => {
    if (autoStepRef.current || !hasAudio) return
    autoStepRef.current = true
    if (!recordingRef.current) setStep((cur) => (cur === 'setup' ? 'edit' : cur))
  }, [hasAudio])

  useWakeLock(recording)
  useLeaveGuard({ recording, unsaved })

  const persistAskedRef = useRef(false)
  /** Ask once per visit, when the person arms or records, so takes are not evicted under pressure. */
  function ensurePersistentStorage() {
    if (persistAskedRef.current) return
    persistAskedRef.current = true
    void requestPersistentStorage().catch(() => false)
  }

  useEffect(() => {
    if (!baselinePendingRef.current) return
    baselinePendingRef.current = false
    setSavedTracks(tracks)
  }, [tracks])

  function markMixSaved(exported: StudioTrack[]) {
    setSavedTracks(exported)
    // Synchronous so a navigation right after saving (publish review) is not blocked.
    setStudioGuard({ recording: recordingRef.current, unsaved: false })
  }

  /** Move the playhead. `immediate` for user seeks; animation ticks pass false (throttled ≤15 Hz). */
  const setHead = useCallback(
    (sec: number, immediate = true) => {
      const next = Math.max(0, sec)
      playheadRef.current = next
      liveStore.set({ playhead: next }, immediate)
      if (next + 8 > boardExtentRef.current) {
        boardExtentRef.current = Math.ceil((next + 8) / 30) * 30
        setBoardExtent(boardExtentRef.current)
      }
    },
    [liveStore],
  )

  const attachMeter = useCallback(
    (key: string, stream: MediaStream) =>
      attachInputMeter(stream, (peak) => {
        liveStore.setPeak(key, peak)
        if (peak >= 0.98) {
          liveStore.setClip(key, true)
          const timers = clipTimerRef.current
          if (timers[key]) window.clearTimeout(timers[key])
          timers[key] = window.setTimeout(() => liveStore.setClip(key, false), 1600)
        }
      }),
    [liveStore],
  )

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

  const takeSnapshot = useCallback(
    (): Snapshot => ({
      tracks: snapshotTracks(tracks),
      cameras: cameraClips.map((c) => ({ ...c })),
      programCuts: programCuts.map((c) => ({ ...c })),
      selectedId,
      selectedCamClipId,
    }),
    [tracks, cameraClips, programCuts, selectedId, selectedCamClipId],
  )

  const pushHistory = useCallback(() => {
    historyRef.current.push(takeSnapshot())
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setHistoryLen(historyRef.current.length)
    if (redoRef.current.length) {
      redoRef.current = []
      setRedoLen(0)
    }
  }, [takeSnapshot])

  const onRemoteGuestStream = useCallback((stream: MediaStream | null) => {
    remoteGuestRef.current = stream
    setRemoteGuest(stream)
    if (!stream) return
    if (safePausedRef.current) stream.getAudioTracks().forEach((t) => (t.enabled = false))
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
  /**
   * Blob URLs replaced inside setState updaters are revoked after commit, never inside the
   * updater (updaters must be pure — StrictMode / concurrent renders can run them twice).
   */
  const pendingRevokeRef = useRef<string[]>([])
  const revokeLater = (url: string | null | undefined) => {
    if (url?.startsWith('blob:')) pendingRevokeRef.current.push(url)
  }
  useEffect(() => {
    if (!pendingRevokeRef.current.length) return
    const doomed = pendingRevokeRef.current
    pendingRevokeRef.current = []
    doomed.forEach(revokeUrl)
  })

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
          revokeLater(t.url)
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

  /**
   * Full-session loudness is a whole mixdown — expensive on long episodes. It runs only when the
   * person asks ("Measure loudness") or after a save, never after every edit.
   */
  async function measureMasterNow() {
    if (recordingRef.current) return
    if (!tracks.some((t) => t.buffer)) {
      setMeter(null)
      setLoudness(null)
      return
    }
    setMeasuring(true)
    try {
      const master = await renderEpisodeMaster({ matchLufs: false })
      if (!master) return
      setMeter(peakMeter(master.buffer))
      setLoudness(Number.isFinite(master.lufs) ? { lufs: master.lufs, peakDb: master.peakDb } : null)
      setLoudnessFor(tracks)
    } catch {
      /* preview meter is optional */
    } finally {
      setMeasuring(false)
    }
  }

  useEffect(() => {
    if (!episodeId) {
      setSessionStatus('open')
      return
    }
    let cancelled = false
    void peekSession(episodeId).then((peek) => {
      if (cancelled) return
      if (peek && (peek.takeCount > 0 || peek.cameraCount > 0)) {
        setRecover(peek)
        setSessionStatus('offer')
      } else {
        setSessionStatus('open')
      }
    }).catch(() => {
      if (!cancelled) setSessionStatus('open')
    })
    void peekSession(backupKey(episodeId))
      .then((peek) => {
        if (!cancelled && peek && (peek.takeCount > 0 || peek.cameraCount > 0)) setBackupPeek(peek)
      })
      .catch(() => {})
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
        baselinePendingRef.current = true
        setTracks((prev) => {
          const vocal = prev.find((t) => t.role === 'vocal') || prev[0]
          if (!vocal) return prev
          vocalId = vocal.id
          revokeLater(vocal.url)
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
    if (!tracks.some((t) => t.buffer) && cameraClips.length === 0) return
    const t = window.setTimeout(() => {
      const journals = pendingJournalsRef.current.splice(0)
      const restored = restoredJournalIdsRef.current.splice(0)
      void saveSession(episodeId, people, tracks, cameraClips, { programCuts, startScene })
        .then(() => {
          journals.forEach((j) => void j.finish().catch(() => {}))
          restored.forEach((id) => void deleteTake(id).catch(() => {}))
        })
        .catch((err) => {
          // Keep the crash journal until a save succeeds.
          pendingJournalsRef.current.push(...journals)
          restoredJournalIdsRef.current.push(...restored)
          setError(err instanceof Error ? err.message : 'Could not autosave takes on this computer')
        })
    }, 1600)
    return () => window.clearTimeout(t)
  }, [episodeId, people, tracks, cameraClips, programCuts, startScene, recording, sessionStatus])

  // Long camera takes buffer in RAM until Stop — watch size against memory and browser storage.
  useEffect(() => {
    if (!recording) {
      setRecCamBytes(0)
      setRecWarn(null)
      return
    }
    let left: number | null = null
    void storageBytesLeft().then((v) => {
      left = v
    })
    const id = window.setInterval(() => {
      const bytes = cameraCapturesRef.current.reduce((n, c) => n + (c.bytes?.() || 0), 0)
      setRecCamBytes(bytes)
      if (!bytes) return
      if (left != null && bytes > left * 0.8) {
        setRecWarn(
          `Camera files (${formatBytes(bytes)}) are close to this browser’s free space (${formatBytes(left)}). Stop soon, then download the camera files — or turn a camera off.`,
        )
      } else if (bytes > CAMERA_RAM_WARN_BYTES) {
        setRecWarn(
          `Camera recording is holding ${formatBytes(bytes)} in memory. Stop and start a new take soon to keep this tab stable.`,
        )
      }
    }, 2000)
    return () => window.clearInterval(id)
  }, [recording])

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
    return () => {
      // Read the latest committed session — the closure's first-render values are stale.
      const last = latestRef.current
      const urls = [
        ...last.tracks.map((t) => t.url),
        ...last.cameraClips.map((clip) => clip.url),
        ...pendingRevokeRef.current,
      ]
      pendingRevokeRef.current = []
      // Flush the debounced autosave so an edit made just before leaving is not lost; revoke the
      // blob URLs only after the save has read them.
      const hasContent = last.tracks.some((t) => t.buffer) || last.cameraClips.length > 0
      const flush =
        episodeId && last.sessionOpen && !recordingRef.current && hasContent
          ? saveSession(episodeId, last.people, last.tracks, last.cameraClips, {
              programCuts: last.programCuts,
              startScene: 'host',
            }).catch(() => {})
          : Promise.resolve()
      void flush.finally(() => urls.forEach((url) => revokeUrl(url ?? null)))
      recUnwatchRef.current()
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

  // Idle input meters: reopen getUserMedia only when the set of armed DEVICES changes (or the
  // person re-arms after a disconnect) — not on every rename / take / people edit.
  useEffect(() => {
    if (recording || !anyArmed || !navigator.mediaDevices?.getUserMedia) return
    let cancelled = false
    let unwatch: () => void = () => {}
    const keys = (JSON.parse(armedDeviceSig) as string[]).filter((key) => key !== REMOTE_GUEST_KEY)
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
        streams.forEach((stream, key) => inputByKeyRef.current.set(key, stream))
        applySafePause(safePausedRef.current)
        const hostKey = latestRef.current.people.find((p) => p.id === 'host')?.inputDeviceId || micId || ''
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
        if (cancelled) return
        idleStopRef.current = [...streams.entries()].map(([key, stream]) => attachMeter(key, stream))
        unwatch = watchInputs(
          [...streams.entries()].map(([key, stream]) => ({ label: meterLabelFor(key), stream })),
          (label, reason) => setInputLost(`${label} mic ${reason}`),
        )
      } catch {
        /* permission comes on Record */
      }
    })()
    return () => {
      cancelled = true
      unwatch()
      idleStopRef.current.forEach((fn) => fn())
      idleStopRef.current = []
      stopStreams(idleStreamRef.current)
      idleStreamRef.current = []
      liveStore.resetPeaks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- device signature, not people/tracks identity
  }, [recording, anyArmed, rawInput, micId, remoteGuest, armedDeviceSig, rearmTick])

  useEffect(() => {
    if (!recording && (recTally === 'count-in' || recTally === 'rec')) {
      setRecTally('stopped')
    }
  }, [recording, recTally])

  useEffect(() => {
    if (!recording) {
      liveStore.set({ recClock: punchRef.current }, true)
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
      recRafRef.current = null
      return
    }
    // Clock + playhead go to the live store (≤15 Hz to React), never to editor state.
    const tick = () => {
      const elapsed = (performance.now() - recStartedAtRef.current) / 1000
      const t = punchRef.current + Math.max(0, elapsed)
      liveStore.set({ recClock: t })
      setHead(t, false)
      recRafRef.current = requestAnimationFrame(tick)
    }
    recRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
    }
  }, [recording, setHead, liveStore])

  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (showShortcuts) return
      const el = event.target as HTMLElement | null
      const tag = el?.tagName
      const inputType = tag === 'INPUT' ? ((el as HTMLInputElement).type || 'text') : ''
      const typing =
        tag === 'TEXTAREA' ||
        Boolean(el?.isContentEditable) ||
        (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'].includes(inputType))
      // The studio stays mounted (hidden) on other desk tabs — never act on keys it cannot see.
      const visible = Boolean(rootRef.current && rootRef.current.offsetParent !== null)
      const mod = event.metaKey || event.ctrlKey
      // Safe pause works even with single-key shortcuts off and from any focused control.
      if (event.shiftKey && !mod && !event.altKey && event.code === 'Space' && !typing && (visible || recordingRef.current)) {
        event.preventDefault()
        toggleSafePause()
        return
      }
      if (!visible) return
      if (typing || tag === 'SELECT' || tag === 'INPUT') return
      if (mod && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        if (recording) return
        if (event.shiftKey) redo()
        else void undo()
        return
      }
      if (mod && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        if (!recording) redo()
        return
      }
      if (event.altKey && !mod && /^Digit[123]$/.test(event.code)) {
        event.preventDefault()
        const scene: PictureScene = event.code === 'Digit1' ? 'host' : event.code === 'Digit2' ? 'guest' : 'pip'
        switchScene(scene)
        return
      }
      if (mod || event.altKey) return
      // WCAG 2.1.4: single-key shortcuts can be switched off, and never fire on a focused control.
      if (!shortcutsOn) return
      if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || el?.closest('[role="dialog"],[role="menu"],[role="slider"]')) return
      if (event.key === '?') {
        event.preventDefault()
        setShowShortcuts(true)
        return
      }
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
      if ((event.key === 's' || event.key === 'S') && !recording) {
        event.preventDefault()
        if (editFocusRef.current === 'camera' && selectedCamClipId) splitSelectedCameraAtPlayhead()
        else splitSelectedAtPlayhead()
      }
      if ((event.key === 'v' || event.key === 'V') && !recording) {
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
        if (editFocusRef.current === 'camera' && selectedCamClipId) {
          discardCameraClip(selectedCamClipId)
          return
        }
        if (editFocusRef.current === 'program' && selectedCutId) {
          deleteProgramCut(selectedCutId)
          return
        }
        removeRange(event.shiftKey)
      }
      if ((event.key === 'm' || event.key === 'M') && !recording && event.shiftKey) {
        event.preventDefault()
        editRange((t) => muteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Muted range on this lane')
      }
    }
  })

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
      setHead(now, false)
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

  function restoreSnapshot(snap: Snapshot) {
    tracks.forEach((t) => revokeUrl(t.url))
    setTracks(
      snap.tracks.map((t) => ({
        ...t,
        url: t.buffer ? bufferToUrl(t.buffer) : null,
      })),
    )
    // Camera blob URLs are never revoked on edit, so undo can always bring a clip back.
    setCameraClips(snap.cameras.map((c) => normalizeCameraClip({ ...c })))
    setProgramCuts(snap.programCuts.map((c) => ({ ...c })))
    setSelectedId(snap.selectedId)
    setSelectedCamClipId(snap.selectedCamClipId)
    setSelectedCutId(null)
    setApplied([])
  }

  async function undo() {
    const prev = historyRef.current.pop()
    setHistoryLen(historyRef.current.length)
    if (!prev) return
    redoRef.current.push(takeSnapshot())
    if (redoRef.current.length > HISTORY_LIMIT) redoRef.current.shift()
    setRedoLen(redoRef.current.length)
    restoreSnapshot(prev)
    setOk('Undid last change')
  }

  function redo() {
    const next = redoRef.current.pop()
    setRedoLen(redoRef.current.length)
    if (!next) return
    historyRef.current.push(takeSnapshot())
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setHistoryLen(historyRef.current.length)
    restoreSnapshot(next)
    setOk('Redid change')
  }

  async function restoreSavedSession(fromBackup = false) {
    const peek = fromBackup ? backupPeek : recover
    if (!episodeId || !peek) return
    if (fromBackup && hasAudio && !window.confirm('Replace what is on the timeline now with the backup? Undo cannot bring the current session back.')) {
      return
    }
    setBusy('Restoring takes from this computer…')
    setError(null)
    try {
      const saved = await loadSession(fromBackup ? backupKey(episodeId) : episodeId)
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
      setProgramCuts(saved.programCuts || [])
      setSelectedCamClipId(saved.cameras[0]?.id || null)
      setSelectedId(saved.tracks.find((t) => t.armed)?.id || saved.tracks.find((t) => t.buffer)?.id || null)
      seededRef.current = true
      setRecover(null)
      if (fromBackup) setBackupPeek(null)
      setSessionStatus('open')
      const camNote = saved.cameras.length
        ? ` + ${saved.cameras.length} camera file${saved.cameras.length === 1 ? '' : 's'}`
        : ''
      setOk(
        `Restored ${saved.tracks.filter((t) => t.buffer).length} takes${camNote} from ${new Date(peek.savedAt).toLocaleTimeString()}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore session')
      setSessionStatus('open')
    } finally {
      setBusy(null)
    }
  }

  /** "Delete saved takes…" — permanent, so it always asks. */
  async function discardSavedSession() {
    if (!episodeId || !recover) return
    const ok = window.confirm(
      `Permanently delete ${recover.takeCount} saved take${recover.takeCount === 1 ? '' : 's'}${
        recover.cameraCount ? ` and ${recover.cameraCount} camera file${recover.cameraCount === 1 ? '' : 's'}` : ''
      } (${formatClock(recover.durationSec)}) from this computer? This cannot be undone.`,
    )
    if (!ok) return
    await clearSession(episodeId).catch(() => {})
    setRecover(null)
    setSessionStatus('open')
    setOk('Saved takes deleted from this computer')
  }

  /**
   * "Start fresh (keep backup)": set the saved session aside under a backup key first, so the
   * next autosave cannot overwrite it. Restore it later from the backup banner.
   */
  async function startFreshKeepBackup() {
    if (!episodeId || !recover) return
    const ok = window.confirm(
      'Start with an empty session? Your saved takes are kept as a backup on this computer — you can restore them later from the banner here.',
    )
    if (!ok) return
    setBusy('Keeping a backup of your saved takes…')
    try {
      const saved = await loadSession(episodeId)
      if (saved) {
        await saveSession(backupKey(episodeId), saved.people, saved.tracks, saved.cameras, {
          programCuts: saved.programCuts,
        })
        saved.tracks.forEach((t) => revokeUrl(t.url))
        saved.cameras.forEach((c) => revokeUrl(c.url))
        setBackupPeek(await peekSession(backupKey(episodeId)).catch(() => null))
      }
      setRecover(null)
      setSessionStatus('open')
      setOk('Started fresh — your earlier takes are kept as a backup on this computer')
    } catch (err) {
      setError(
        `Could not keep a backup (${err instanceof Error ? err.message : 'storage error'}). Nothing was changed — choose Restore, or try again.`,
      )
    } finally {
      setBusy(null)
    }
  }

  async function deleteBackup() {
    if (!episodeId || !backupPeek) return
    if (!window.confirm('Permanently delete the backup of your earlier takes from this computer? This cannot be undone.')) return
    await clearSession(backupKey(episodeId)).catch(() => {})
    setBackupPeek(null)
  }

  /** Lay a take recovered from the crash journal onto a new take for that person. */
  function layRecoveredTake(take: UnfinishedTake, buffer: AudioBuffer) {
    const person = people.find((p) => p.id === take.personId) || people.find((p) => p.id === 'host') || people[0]
    if (!person) return
    pushHistory()
    const url = bufferToUrl(buffer)
    const offset = Math.max(0, take.startSec || 0)
    setTracks((prev) => {
      const takeNo = nextTakeNumber(prev, person.id)
      const hasAudible = prev.some((t) => t.personId === person.id && t.buffer && t.listen)
      const made = createEmptyTrack({
        name: `${person.name} · recovered take ${takeNo}`,
        role: roleForPerson(person),
        personId: person.id,
        take: takeNo,
        color: person.color,
        offset,
        volume: 1,
        listen: !hasAudible,
        clips: [fullClipForBuffer(buffer, offset, 0.05, 0.15)],
      })
      made.buffer = cloneAudioBuffer(buffer)
      made.url = url
      return [...prev, made]
    })
    restoredJournalIdsRef.current.push(take.id)
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
      setOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} added to voice effects · ${selected.name}`)
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

  function meterLabelFor(key: string) {
    const { tracks: ts, people: ps } = latestRef.current
    const names = [
      ...new Set(
        ts
          .filter((t) => t.armed && deviceKey(t.personId) === key)
          .map((t) => ps.find((p) => p.id === t.personId)?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ]
    return names.join(' + ') || (key === REMOTE_GUEST_KEY ? 'Guest' : 'Host')
  }

  /**
   * Safe pause: silence the guest everywhere this computer hears them — the recording, the
   * meters and the host's headphones — by disabling their audio tracks. Returns how many
   * inputs were affected (0 = guest shares the host mic, cannot be separated).
   */
  function applySafePause(on: boolean) {
    const targets: MediaStream[] = []
    if (remoteGuestRef.current) targets.push(remoteGuestRef.current)
    const guestKey = deviceKey('guest')
    const hostKey = deviceKey('host')
    if (guestKey !== REMOTE_GUEST_KEY && guestKey !== hostKey) {
      const local = inputByKeyRef.current.get(guestKey)
      if (local) targets.push(local)
    }
    for (const stream of targets) stream.getAudioTracks().forEach((t) => (t.enabled = !on))
    return targets.length
  }

  function toggleSafePause() {
    const next = !safePausedRef.current
    const affected = applySafePause(next)
    if (next && affected === 0 && !remoteGuestRef.current) {
      const shared = deviceKey('guest') === deviceKey('host')
      if (shared) {
        setError('Safe pause cannot separate the guest: they share the host microphone. Stop the recording instead.')
        return
      }
    }
    safePausedRef.current = next
    setSafePaused(next)
    setRecAnnounce(next ? 'Safe pause on. The guest is silenced.' : 'Safe pause off. The guest can be heard again.')
    setOk(
      next
        ? 'Safe pause — the guest is silenced in the recording and in headphones. Press again (Shift+Space) to resume.'
        : 'Safe pause off — the guest is audible again',
    )
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
    const clip = cameraClips.find((c) => c.id === id)
    if (!clip) return
    pushHistory()
    setCameraClips((prev) => removeCameraClip(prev, id))
    if (selectedCamClipId === id) setSelectedCamClipId(null)
    setOk(`Removed ${clip.kind === 'title' ? 'title' : clip.kind === 'stinger' ? 'stinger' : clip.kind === 'broll' ? 'B-roll' : 'camera clip'} from the lane — ⌘Z brings it back`)
  }

  /** One undo step, then apply a pure camera-lane edit. */
  function editCamera(fn: (clips: CameraClip[]) => CameraClip[], label?: string) {
    pushHistory()
    setCameraClips(fn)
    if (label) setOk(label)
  }

  function deleteProgramCut(cutId: string) {
    pushHistory()
    setProgramCuts((prev) => removeProgramCut(prev, cutId, startScene))
    setSelectedCutId(null)
    setOk('Removed scene cut')
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
    setOk(`Name caption at ${formatClock(clip.offset)} — video only, not in the podcast audio`)
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
        ? `Flashes at ${laid.length} chapter${laid.length === 1 ? '' : 's'} — video only`
        : `Flash at ${formatClock(laid[0].offset)} — video only, not in the podcast audio`,
    )
  }

  function cancelPgmFade() {
    if (fadeAnimRef.current) {
      cancelAnimationFrame(fadeAnimRef.current)
      fadeAnimRef.current = 0
    }
    setPgmAnim(null)
  }

  /** Session time a Program switch lands on: the record clock while rolling, else the playhead. */
  function programClock() {
    if (!recordingRef.current) return playheadRef.current
    if (!recLiveRef.current) return punchRef.current
    return punchRef.current + Math.max(0, (performance.now() - recStartedAtRef.current) / 1000)
  }

  /** Cut / fade Program to a scene — writes a cut on the Program lane (live while recording). */
  function takeProgram(scene: PictureScene, fade: boolean) {
    cancelPgmFade()
    setPvwScene(scene)
    const live = recordingRef.current
    const at = programClock()
    const current = programStateAt(programCuts, at, startScene).scene
    if (scene === current) return
    if (!live) pushHistory()
    setProgramCuts((prev) => addProgramCut(prev, at, scene, fade ? PROGRAM_FADE_SEC : 0, startScene))
    setSelectedCutId(null)
    if (!live) setOk(`Output ${fade ? 'fades' : 'switches'} to ${scene === 'pip' ? 'Side by side' : scene === 'guest' ? 'Guest' : 'Host'} at ${formatClock(at)}`)
    if (!fade || live || playing) return
    // Paused: animate the dissolve on the monitor so Fade is visible, then follow the lane.
    const started = performance.now()
    const dur = PROGRAM_FADE_SEC * 1000
    setPgmAnim({ from: current, to: scene, mix: 0 })
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / dur)
      if (t < 1) {
        setPgmAnim({ from: current, to: scene, mix: t })
        fadeAnimRef.current = requestAnimationFrame(tick)
      } else {
        setPgmAnim(null)
        fadeAnimRef.current = 0
      }
    }
    fadeAnimRef.current = requestAnimationFrame(tick)
  }

  /** Scene button / ⌥1–3: take that scene now (dissolve if Fade is armed). */
  function switchScene(scene: PictureScene) {
    takeProgram(scene, fadeNext)
    setFadeNext(false)
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
      setOk(`Cut-away video at ${formatClock(clip.offset)} — covers the full-screen picture, audio unchanged`)
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
      const sourceUrl = `/api/admin/media/file?url=${encodeURIComponent(url)}`
      const buffer = await decodeUrl(sourceUrl)
      assignBufferToTrack(guest.id, buffer, `Remote guest take laid on ${guest.name}`)
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

    ensurePersistentStorage()
    setStep('record')
    setInputLost(null)
    const ac = new AbortController()
    abortRef.current = ac
    punchRef.current = punch
    recLiveRef.current = false
    recStartedAtRef.current = performance.now()
    recordingRef.current = true
    setSelectedId(jobs[0].lane.id)
    setRecording(true)
    setRecTally(countInBeats > 0 ? 'count-in' : 'rec')
    setError(null)
    setOk(null)
    liveStore.resetPeaks()
    stopMix()
    let openedJournals: (TakeJournal | null)[] = []
    let capturing = false

    try {
      idleStopRef.current.forEach((fn) => fn())
      idleStopRef.current = []
      stopStreams(idleStreamRef.current)
      idleStreamRef.current = []
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
      streams.forEach((stream, key) => inputByKeyRef.current.set(key, stream))
      applySafePause(safePausedRef.current)
      stopMeterRef.current = jobs.map((job) => {
        const stream = streams.get(job.key)
        if (!stream) return () => {}
        return attachMeter(job.key, stream)
      })
      recUnwatchRef.current()
      recUnwatchRef.current = watchInputs(
        jobs
          .map((job) => ({ label: job.sharedNames.join(' + ') || 'Mic', stream: streams.get(job.key) }))
          .filter((j): j is { label: string; stream: MediaStream } => Boolean(j.stream)),
        (label, reason) => setInputLost(`${label} mic ${reason} — the recording may be silent from here`),
      )

      try {
        const list = await navigator.mediaDevices.enumerateDevices()
        setMics(list.filter((d) => d.kind === 'audioinput'))
        setCams(list.filter((d) => d.kind === 'videoinput'))
      } catch {
        /* ignore */
      }
      // Opened before the cue mix starts so IndexedDB latency never shifts the punch trim.
      const laneName = (job: (typeof jobs)[number]) => job.sharedNames.join(' + ') || 'a voice'
      // Crash-safe journal per lane (Stream B). Opening never blocks recording.
      const journals = await Promise.all(
        jobs.map((job) => {
          const stream = streams.get(job.key)
          const rate = stream?.getAudioTracks()[0]?.getSettings().sampleRate || 48000
          return openTakeJournal({
            episodeId: episodeId || 'scratch',
            personId: job.lane.personId,
            label: `${laneName(job)} · take`,
            sampleRate: rate,
            channels: 1,
            startSec: punch,
          }).catch(() => null as TakeJournal | null)
        }),
      )
      openedJournals = journals

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
      // One lane failing to start must not sink the others: keep what started, say what failed.
      const started = await Promise.allSettled(
        jobs.map(async (job, i) => {
          const stream = streams.get(job.key)
          if (!stream) {
            throw new Error(`No microphone stream for ${laneName(job)}`)
          }
          // TODO(merge: Stream B): pass `{ journal: journals[i] }` through startLaneCapture →
          // startWorkletCapture so PCM frames are journaled while recording.
          return { job, journal: journals[i], capture: await startLaneCapture(job.lane.id, stream) }
        }),
      )
      const captures: { job: (typeof jobs)[number]; journal: TakeJournal | null; capture: LaneCapture }[] = []
      const failedLanes: string[] = []
      started.forEach((result, i) => {
        if (result.status === 'fulfilled') captures.push(result.value)
        else {
          failedLanes.push(
            `${laneName(jobs[i])} (${result.reason instanceof Error ? result.reason.message : 'could not start'})`,
          )
          void journals[i]?.abort().catch(() => {})
        }
      })
      if (captures.length === 0) {
        throw new Error(`Recording could not start — ${failedLanes.join('; ')}`)
      }
      if (failedLanes.length) {
        setError(`Not recording ${failedLanes.join('; ')}. The other lane${captures.length === 1 ? ' is' : 's are'} recording.`)
      }
      capturing = true
      capturesRef.current = captures.map((c) => c.capture)
      recorderRef.current = captures.map((c) => c.capture)
      const camJobs = liveCameraJobs()
      const camCaptures = camJobs.map((job) => startCameraCapture(job.person.id, job.stream))
      cameraCapturesRef.current = camCaptures

      const resetRecState = () => {
        finishRecCleanup()
        stopLocalRecordStreams()
        recorderRef.current = []
        capturesRef.current = []
        cameraCapturesRef.current = []
        recordingRef.current = false
        recLiveRef.current = false
        setRecording(false)
      }

      void Promise.all([
        Promise.allSettled(captures.map((c) => c.capture.done)),
        Promise.allSettled(camCaptures.map((c) => c.done)),
      ]).then(async ([audioSettled, camSettled]) => {
        resetRecState()
        const blobs = audioSettled.map((r) => (r.status === 'fulfilled' ? r.value : null))
        const camBlobs = camSettled.map((r) => (r.status === 'fulfilled' ? r.value : new Blob()))
        const lostLanes = audioSettled.flatMap((r, i) => (r.status === 'rejected' ? [laneName(captures[i].job)] : []))
        if (ac.signal.aborted) {
          captures.forEach((c) => void c.journal?.abort().catch(() => {}))
          return
        }
        if (lostLanes.length) {
          setError(`The ${lostLanes.join(' and ')} recording failed. Other lanes were kept.`)
        }
        // Journals are finished only after the session autosave has the take (see autosave effect).
        pendingJournalsRef.current.push(...captures.map((c) => c.journal).filter((j): j is TakeJournal => Boolean(j)))
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
                revokeLater(reuse.url)
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
              ? ' · new audio under the existing video'
              : ''
          if (decoded.length > 0) {
            setOk(
              decoded.length > 1
                ? `Host + Guest takes at ${formatClock(punch)}${autoMuteQuiet ? ' · quieter mic lowered on the timeline' : ''}${voiceIsolate ? ' · noise reduction in voice effects' : ''}${camNote}`
                : decoded[0]?.sharedNames.length > 1
                  ? `Shared mic — ${decoded[0].sharedNames.join(' + ')} on one take at ${formatClock(punch)}${camNote}`
                  : `Take at ${formatClock(punch)}${camNote}`,
            )
          } else if (laidCams.length) {
            setOk(`Camera file at ${formatClock(punch)}${camNote}`)
          }
          setRecAnnounce(
            decoded.length
              ? `Recording stopped — ${decoded.map((d) => d.sharedNames.join(' and ')).join(', ')} take saved`
              : 'Recording stopped — no audio was captured',
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not decode recording')
        } finally {
          setBusy(null)
        }
      }).catch((err) => {
        // Whatever happened, never leave the room stuck in "recording".
        resetRecState()
        setBusy(null)
        setError(err instanceof Error ? err.message : 'Recording stopped unexpectedly')
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
      setRecAnnounce(`Recording started${safePausedRef.current ? ' — safe pause is on, guest silenced' : ''}`)
      const camCount = cameraCapturesRef.current.length
      const punchKind = captures.some((c) => c.capture.kind === 'worklet')
        ? ''
        : ' · compatibility recorder'
      setOk(
        `● REC ${recLabel} at ${formatClock(punch)}${cueEnabled ? ' · mix in headphones' : ''}${
          cueToGuestRef.current ? ' · cue to guest' : ''
        }${
          camCount ? ` · ${camCount} camera${camCount === 1 ? '' : 's'}` : ''
        }${punchKind}`,
      )
    } catch (err) {
      // Nothing was captured — drop the empty journals so they never show as "unfinished".
      if (!capturing) openedJournals.forEach((j) => void j?.abort().catch(() => {}))
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
    recUnwatchRef.current()
    recUnwatchRef.current = () => {}
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
          revokeLater(empty.url)
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
    const doomed = tracks.find((t) => t.id === id)
    revokeLater(doomed?.url || null)
    invalidateInsertCache(id)
    setTracks((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(tracks.find((t) => t.id !== id)?.id || null)
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
        revokeLater(t.url)
        return { ...t, buffer: null, url: null, clips: [], automation: [] }
      }),
    )
  }

  function armTrack(id: string) {
    const track = tracks.find((t) => t.id === id)
    if (!track) return
    if (!track.armed) ensurePersistentStorage()
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
    ensurePersistentStorage()
    setTracks((prev) => prev.map((t) => ({ ...t, armed: t.id === host.id || t.id === guest.id })))
    setSelectedId(host.id)
    setOk('Host and Guest are ready to record. One shared mic makes one take; two mics make two takes that start together.')
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

  /**
   * Delete the selected range on the selected lane (or every lane). `ripple` = "Remove & close
   * gap": later audio moves left — and so do that person's camera clips, plus the Output (Program)
   * scene cuts when every voice with audio was rippled, so picture stays in sync with sound.
   */
  function removeRange(ripple: boolean) {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    const lanes = applyRangeAll ? tracks.filter((t) => t.buffer) : selected ? [selected] : []
    const done = editRange(
      (t) => deleteRange(t, a, b, ripple),
      ripple ? 'Removed the range and closed the gap' : 'Removed the range, left silence',
    )
    if (!done || !ripple) return
    const personIds = [...new Set(lanes.map((t) => t.personId))]
    const voicesWithAudio = new Set(
      tracks.filter((t) => t.buffer && isVoiceRole(t.role)).map((t) => t.personId),
    )
    const everyVoice = applyRangeAll || [...voicesWithAudio].every((id) => personIds.includes(id))
    // Picture follows for people whose audio + video are linked (the default).
    const cameraPeople = (applyRangeAll ? people.map((p) => p.id) : personIds).filter((id) =>
      personAvLinked(people.find((p) => p.id === id)),
    )
    if (cameraPeople.length) {
      setCameraClips((prev) => cameraPeople.reduce((clips, id) => deleteCameraRange(clips, a, b, id, true), prev))
    }
    if (everyVoice) setProgramCuts((prev) => rippleProgramCuts(prev, a, b, startScene))
  }

  function editRange(fn: (track: StudioTrack) => StudioTrack, label: string): boolean {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    if (b - a < 0.05) {
      setError('Drag a range on the timeline (empty lane or ruler), then use the lane tools')
      return false
    }
    const ids = applyRangeAll
      ? tracks.filter((t) => t.buffer).map((t) => t.id)
      : selected
        ? [selected.id]
        : []
    if (ids.length === 0) {
      setError('Select a lane first')
      return false
    }
    pushHistory()
    setTracks((prev) => prev.map((t) => (ids.includes(t.id) ? fn(t) : t)))
    setOk(label)
    return true
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
    // Closing a gap in picture also pulls later Output scene cuts so switching stays on the shot.
    if (ripple) setProgramCuts((prev) => rippleProgramCuts(prev, a, b, startScene))
    setOk(
      ripple
        ? 'Removed picture and closed the gap (scene cuts follow; audio unchanged)'
        : 'Removed picture, left a gap (audio unchanged)',
    )
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
      name: `${selected.name} merged`,
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
    setOk('Merged this take into a new take')
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
    setBusy(mode === 'keep' ? 'Merging the mix (keeping takes)…' : 'Replacing the session with the merged mix…')
    try {
      const rendered = await renderEpisodeMaster({ matchLufs: false })
      if (!rendered) throw new Error('Nothing audible to merge')
      let mixed = rendered.buffer
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
        setOk('Merged the mix onto its own lane (muted) — your takes are still here')
      }
      setSelectedId(master.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master bus failed')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Every export path (hosted mix, WAV/MP3, stems mix, video audio, bounce) renders through
   * lib/podcast/master.ts so gain, fades, loudness and the true-peak limiter live in one place.
   * Always the FULL session unless `selection` is passed explicitly.
   */
  async function renderEpisodeMaster(opts: { selection?: { start: number; end: number } | null; matchLufs?: boolean } = {}) {
    const prepared = await tracksWithInserts(tracks)
    if (!prepared.some((t) => t.buffer)) return null
    const result = await renderMaster(prepared, {
      startSec: opts.selection?.start,
      endSec: opts.selection?.end,
      matchLufs: opts.matchLufs ?? matchLufs,
      gainDb: masterGain > 0 ? 20 * Math.log10(masterGain) : -120,
      fadeInSec: masterFadeIn,
      fadeOutSec: masterFadeOut,
    })
    // Stream B's renderMaster reports loudness; measure here only if it did not.
    const loud = Number.isFinite(result.lufs) ? { lufs: result.lufs, peakDb: result.truePeakDb } : measureLoudness(result.buffer)
    return { buffer: result.buffer, lufs: loud.lufs, peakDb: loud.peakDb }
  }

  /** Episode audio for a picture export: same master as the RSS mix. */
  async function mixForPicture() {
    return (await renderEpisodeMaster())?.buffer ?? null
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  function pictureExt(result: PictureRenderResult) {
    return (result.mime || result.blob.type).includes('mp4') ? 'mp4' : 'webm'
  }

  function progressLabel(label: string) {
    return (ratio: number, info?: { realtime: boolean }) =>
      setBusy(
        info?.realtime
          ? `${label} ${Math.round(ratio * 100)}% — realtime, keep this tab open`
          : `${label} ${Math.round(ratio * 100)}%`,
      )
  }

  /**
   * Ask for a save location first (Chromium File System Access) so long episodes stream to disk
   * instead of holding the whole video in memory. Must run before any other await (user gesture).
   */
  async function pickVideoFile(baseName: string): Promise<{ writable?: PictureWritable; name?: string } | null> {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
    if (!picker) return {}
    const ext = exportFormat === 'mp4' ? 'mp4' : 'webm'
    try {
      const handle = await picker.call(window, {
        suggestedName: `${baseName}.${ext}`,
        types: [
          {
            description: ext === 'mp4' ? 'MP4 video' : 'WebM video',
            accept: { [ext === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${ext}`] },
          },
        ],
      })
      return { writable: await handle.createWritable(), name: handle.name }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      return {}
    }
  }

  async function runPictureExport(
    baseName: string,
    label: string,
    render: (opts: { audio: AudioBuffer | null; signal: AbortSignal; writable?: PictureWritable }) => Promise<PictureRenderResult>,
  ) {
    const target = await pickVideoFile(baseName)
    if (!target) return
    const ac = new AbortController()
    exportAbortRef.current = ac
    setExporting(true)
    setBusy(`${label}…`)
    setError(null)
    try {
      const audio = await mixForPicture()
      const result = await render({ audio, signal: ac.signal, writable: target.writable })
      const ext = pictureExt(result)
      if (!result.streamed) downloadBlob(result.blob, `${baseName}.${ext}`)
      const fellBack = exportFormat === 'mp4' && ext !== 'mp4' ? ' · this browser cannot encode MP4, so it is WebM' : ''
      setOk(
        `${label.replace(/^Encoding /, '')} ${result.streamed ? `saved to ${target.name}` : 'downloaded'}${
          result.realtime ? ' (realtime encode)' : ''
        }${fellBack} — public RSS is still the audio mix`,
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setOk(target.writable ? 'Export cancelled — delete the partial file' : 'Export cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'Picture export failed')
      }
    } finally {
      exportAbortRef.current = null
      setExporting(false)
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
    if (!hasAudio) {
      setError('Full-screen / Picture-in-picture needs an audio take — use Export video for a picture-only file')
      return
    }
    const overlays = cameraClips.filter((c) => cameraLayer(c) === 'overlay')
    await runPictureExport(
      `${slugFile(title)}-${mode === 'pip' ? 'pip' : 'full-screen'}`,
      mode === 'pip' ? 'Encoding Picture-in-picture' : 'Encoding Full-screen',
      ({ audio, signal, writable }) =>
        renderPictureMix({
          mode,
          host: [...(host.length ? host : cameraClips.filter((c) => c.personId === lead.personId)), ...overlays],
          guest: mode === 'pip' ? guest : [],
          audio: audio as AudioBuffer,
          format: exportFormat,
          signal,
          writable,
          onProgress: progressLabel(mode === 'pip' ? 'Encoding Picture-in-picture' : 'Encoding Full-screen'),
        }),
    )
  }

  /** The finished video: Program lane scene cuts + titles / B-roll / stingers + mixed episode audio. */
  async function exportProgramVideo() {
    if (!cameraClips.some((c) => !c.muted)) {
      setError('Nothing on the picture lanes yet — record with Cam on, or add a lower third / B-roll first')
      return
    }
    await runPictureExport(`${slugFile(title)}-video`, 'Encoding program video', ({ audio, signal, writable }) =>
      renderProgramVideo({
        clips: cameraClips,
        cuts: programCuts,
        startScene,
        audio,
        format: exportFormat,
        signal,
        writable,
        onProgress: progressLabel('Encoding program video'),
      }),
    )
  }

  async function downloadStems() {
    if (!hasAudio) return
    setBusy('Packing stems zip…')
    setError(null)
    try {
      const prepared = await tracksWithInserts(tracks)
      const files: { name: string; data: Uint8Array }[] = []
      const master = await renderEpisodeMaster()
      if (!master) return
      const mixBytes = new Uint8Array(await (await encodeMp3(master.buffer)).arrayBuffer())
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
    // Full session by default. A drag selection only narrows the export when the person ticks
    // "Export selection only" — a stray 2-second drag must never replace the episode.
    const selection = exportSelection ? { start: exportSelection.start, end: exportSelection.end } : null
    if (exportSelectionOnly && !selection) {
      setError('Drag a range on the timeline first, or untick “Export selection only”')
      return
    }
    if (selection) {
      const ok = window.confirm(
        `Save ONLY the selected ${formatClock(selection.end - selection.start)} (${formatClock(selection.start)}–${formatClock(selection.end)}) as this episode's audio? The rest of the session is left out.`,
      )
      if (!ok) return
    }
    setBusy(thenPublish ? 'Mixing, saving & preparing publish…' : kind === 'wav' ? 'Mixing WAV…' : 'Mixing MP3…')
    setError(null)
    setOk(null)
    const exportedTracks = tracks
    try {
      const master = await renderEpisodeMaster({ selection })
      if (!master) throw new Error('Nothing audible to export')
      const mixed = master.buffer
      if (Number.isFinite(master.lufs) && !selection) {
        setLoudness({ lufs: master.lufs, peakDb: master.peakDb })
        setLoudnessFor(exportedTracks)
      }
      const blob = kind === 'wav' ? encodeWav(mixed) : await encodeMp3(mixed)
      const ext = kind === 'wav' ? 'wav' : 'mp3'
      const file = new File(
        [blob],
        `${title.replace(/[^\w]+/g, '-').slice(0, 48) || 'episode'}-mix.${ext}`,
        { type: blob.type },
      )
      const saved = await onExported(file, mixed.duration)
      if (saved === false) {
        setOk('Mix not saved — the episode audio is unchanged')
        return
      }
      markMixSaved(exportedTracks)
      setOk(
        thenPublish
          ? `Mix saved (${formatClock(mixed.duration)}) — opening the publishing review`
          : `Saved ${ext.toUpperCase()} mix (${formatClock(mixed.duration)}) to the episode`,
      )
      if (thenPublish && onPublished) await onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const guestLiveVideo = remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)) ? remoteGuest : null
  const liveProgramStreams = {
    host: cameraStreams.host || null,
    guest: guestLiveVideo || cameraStreams.guest || null,
  }
  const showPicture =
    cameraClips.length > 0 ||
    programCuts.length > 0 ||
    Object.keys(cameraStreams).length > 0 ||
    Boolean(guestLiveVideo)
  const durationLabel = formatClock(sessionDuration(tracks))
  const exportLabel = exportSelection
    ? `Save selection only (${formatClock(exportSelection.end - exportSelection.start)})`
    : `Save full episode (${durationLabel})`
  const peakDb = meter ? dbFromLinear(meter.peak) : null
  const rmsDb = meter ? dbFromLinear(meter.rms) : null
  const recHint = REC_MODE_META.find((m) => m.id === recMode)?.hint
  const boardDuration = Math.max(30, boardExtent, sessionLen) + 4
  // Stable handlers so the memoized timeline lanes skip re-renders from unrelated editor state.
  const onTimelineSelect = useStableHandler((id: string, clipId: string | null) => {
    editFocusRef.current = 'audio'
    setSelectedId(id)
    setSelectedClipId(clipId)
  })
  const onTimelineEditStart = useStableHandler(() => pushHistory())
  const onTimelineMoveClip = useStableHandler((id: string, clipId: string, offset: number) => {
    const track = tracks.find((t) => t.id === id)
    const clip = track ? clipsOf(track).find((c) => c.id === clipId) : null
    setTracks((prev) => mapTrack(prev, id, (t) => moveClip(t, clipId, offset)))
    if (track && clip && personAvLinked(people.find((p) => p.id === track.personId))) {
      setCameraClips((prev) => nudgeCamerasWithAudio(prev, clip, track.personId, clip.offset, offset, true))
    }
  })
  const onTimelineTrimClip = useStableHandler((id: string, clipId: string, edge: 'in' | 'out', time: number) => {
    setTracks((prev) => mapTrack(prev, id, (t) => trimClip(t, clipId, edge, time)))
  })
  const onTimelineRange = useStableHandler((start: number, end: number, trackId: string) => {
    setSelectedId(trackId)
    setRange((prev) => ({ ...prev, start, end }))
  })

  const timelineBoard = {
    people,
    tracks,
    pxPerSec: zoom,
    selectedId: selected?.id || null,
    selectedClipId,
    range,
    durationSec: boardDuration,
    scrollLeft: timelineScroll,
    onScrollLeft: setTimelineScroll,
    onSelect: onTimelineSelect,
    onPlayhead: setHead,
    onEditStart: onTimelineEditStart,
    onMoveClip: onTimelineMoveClip,
    onTrimClip: onTimelineTrimClip,
    onRange: onTimelineRange,
  }

  return (
    <LiveStoreContext.Provider value={liveStore}>
    <div ref={rootRef} className="rounded-2xl border border-[#4A5968] bg-[#0C141C] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#4A5968] flex flex-wrap items-center justify-between gap-3 bg-[#11161C]">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Podcast production room</p>
            <InfoTip label="How the production room works">
              One lane per person. Record, and each take lands on that person’s lane. Takes are backed up on this
              computer as you go (even if the browser closes mid-take). Nothing reaches listeners until you save the
              mix and review it for publishing.
            </InfoTip>
          </div>
          <p className="text-sm text-[#D5DEE6]">{STEP_HINT[step]}</p>
        </div>
        <div className="text-right text-xs font-mono text-[#A9B8C6] space-y-0.5">
          <p>
            <LiveStatusLine
              recording={recording}
              busy={busy}
              ready={ready}
              durationLabel={durationLabel}
              camBytesLabel={recCamBytes ? formatBytes(recCamBytes) : null}
            />
          </p>
          {peakDb != null && Number.isFinite(peakDb) && (
            <p>
              Peak {peakDb.toFixed(1)} dB · RMS {rmsDb != null && Number.isFinite(rmsDb) ? rmsDb.toFixed(1) : '—'} dB
            </p>
          )}
          {loudness && Number.isFinite(loudness.lufs) && (
            <p className={loudness.lufs > PODCAST_LUFS + 2 ? 'text-[#FFB86B]' : 'text-[#8DEBFF]'}>
              LUFS {loudness.lufs.toFixed(1)} · target {PODCAST_LUFS}
              {loudnessStale ? ' · before latest edits' : ''}
            </p>
          )}
        </div>
      </div>
      <div className="px-4 py-2 border-b border-[#4A5968] bg-[#0E151C]">
        <StepNav
          step={step}
          onStep={setStep}
          advanced={advanced}
          onAdvanced={setAdvanced}
          shortcutsOn={shortcutsOn}
          onShortcuts={setShortcutsOn}
          onShowShortcuts={() => setShowShortcuts(true)}
        />
      </div>
      <ShortcutsOverlay open={showShortcuts} onClose={closeShortcuts} shortcutsOn={shortcutsOn} />

      <div className="p-4 space-y-4">
        <RemoteAudioKeepAlive stream={remoteGuest} />
        <p className="sr-only" role="status" aria-live="polite">
          {recAnnounce}
        </p>
        {inputLost && (
          <div
            className="rounded-xl border-2 border-[#FF5B73] bg-[#2A0C12] px-4 py-3 flex flex-wrap items-center gap-3"
            role="alert"
          >
            <p className="text-sm font-semibold text-[#FFE1E6] flex-1 min-w-[12rem]">
              {inputLost}. Check the cable or headset, then re-arm.
            </p>
            <button
              type="button"
              className={danger}
              onClick={() => {
                if (recordingRef.current) {
                  // Stop keeps what was captured; the person re-records once the mic is back.
                  void toggleRecord()
                }
                setInputLost(null)
                setRearmTick((n) => n + 1)
                void refreshMediaDevices()
              }}
            >
              {recording ? 'Stop & keep take, then re-arm' : 'Re-arm microphones'}
            </button>
            <button type="button" className={btn} onClick={() => setInputLost(null)}>
              Dismiss
            </button>
          </div>
        )}
        {recover && sessionStatus === 'offer' && (
          <div className="rounded-xl border border-[#53D6FF]/40 bg-[#0A1820] px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[#F6FAFC] flex-1 min-w-[12rem]">
              Recover {recover.takeCount} take{recover.takeCount === 1 ? '' : 's'}
              {recover.cameraCount
                ? ` + ${recover.cameraCount} camera file${recover.cameraCount === 1 ? '' : 's'}`
                : ''}{' '}
              ({formatClock(recover.durationSec)}) saved {new Date(recover.savedAt).toLocaleTimeString()} on this
              computer.
            </p>
            <button type="button" className={primary} onClick={() => void restoreSavedSession()}>
              Restore
            </button>
            <button type="button" className={btn} disabled={Boolean(busy)} onClick={() => void startFreshKeepBackup()}>
              Start fresh (keep backup)
            </button>
            <button type="button" className={btn} onClick={() => void discardSavedSession()}>
              Delete saved takes…
            </button>
          </div>
        )}
        {backupPeek && sessionStatus === 'open' && (
          <div className="rounded-xl border border-[#4A5968] bg-[#0A1016] px-4 py-2 flex flex-wrap items-center gap-3">
            <p className="text-xs text-[#D5DEE6] flex-1 min-w-[12rem]">
              Backup on this computer: {backupPeek.takeCount} take{backupPeek.takeCount === 1 ? '' : 's'} (
              {formatClock(backupPeek.durationSec)}) from {new Date(backupPeek.savedAt).toLocaleString()}.
            </p>
            <button type="button" className={btn} disabled={Boolean(busy) || recording} onClick={() => void restoreSavedSession(true)}>
              Restore backup
            </button>
            <button type="button" className={btn} onClick={() => void deleteBackup()}>
              Delete backup…
            </button>
          </div>
        )}
        <JournalRecoveryBanner
          episodeId={episodeId}
          onRestore={layRecoveredTake}
          onError={setError}
          onOk={setOk}
          btn={btn}
          primary={primary}
          danger={danger}
        />

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
          <button
            type="button"
            className={recording ? danger : primary}
            onClick={() => void toggleRecord()}
            aria-keyshortcuts={shortcutsOn ? 'R' : undefined}
          >
            {recording ? (
              <>
                <Square size={14} aria-hidden /> Stop recording
              </>
            ) : (
              <>
                <Mic2 size={14} aria-hidden /> Record new take
              </>
            )}
          </button>
          {(step === 'record' || recording || safePaused || Boolean(remoteGuest)) && (
            <button
              type="button"
              className={
                safePaused
                  ? `${danger} ring-2 ring-[#FFB86B]`
                  : `inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-[#FFB86B] text-sm font-semibold text-[#FFD9A8] ${focusRing}`
              }
              aria-pressed={safePaused}
              aria-keyshortcuts="Shift+Space"
              title="Safe pause: instantly silence the guest in the recording and in everyone's headphones on this computer. Use it whenever a guest needs a moment or says something they may not want kept. Press again to resume. (Shift+Space)"
              onClick={toggleSafePause}
            >
              <PauseCircle size={16} aria-hidden />
              {safePaused ? 'Guest silenced — resume guest' : 'Safe pause (silence guest)'}
            </button>
          )}
          <label className="text-xs text-[#D5DEE6] flex items-center gap-2">
            Start recording
            <select
              className={select}
              value={recMode}
              disabled={recording}
              title={recHint}
              onChange={(e) => setRecMode(e.target.value as RecMode)}
            >
              {REC_MODE_META.map((mode) => (
                <option key={mode.id} value={mode.id}>{REC_MODE_LABEL[mode.id] || mode.label}</option>
              ))}
            </select>
          </label>
          {advanced && (
            <>
              <label className="text-xs text-[#D5DEE6] flex items-center gap-2">
                Lead-in
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
              <label className="text-xs text-[#D5DEE6] flex items-center gap-2">
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
            </>
          )}
          <button
            type="button"
            className={btn}
            disabled={!onMarkChapter}
            onClick={() => {
              if (onMarkChapter) onMarkChapter(playheadRef.current)
            }}
            title="Mark a chapter at the playhead (C)"
          >
            <BookmarkPlus size={14} aria-hidden /> Chapter here
          </button>
          <button type="button" className={btn} disabled={!ready || recording} onClick={() => togglePlay()}>
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {playing ? 'Pause' : 'Play mix'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!ready || recording}
            onClick={() => nudge(-5)}
            aria-label="Back 5 seconds"
          >
            <SkipBack size={14} aria-hidden /> 5s
          </button>
          <button
            type="button"
            className={btn}
            disabled={!ready || recording}
            onClick={() => nudge(5)}
            aria-label="Forward 5 seconds"
          >
            5s <SkipForward size={14} aria-hidden />
          </button>
          {step === 'edit' && (
            <>
              <button
                type="button"
                className={btn}
                disabled={!ready}
                onClick={() => setBound('start')}
                title="Start the selection at the playhead"
              >
                Select from here
              </button>
              <button
                type="button"
                className={btn}
                disabled={!ready}
                onClick={() => setBound('end')}
                title="End the selection at the playhead"
              >
                Select to here
              </button>
            </>
          )}
          <button
            type="button"
            className={btn}
            disabled={historyLen === 0 || recording}
            onClick={() => void undo()}
            title="Undo (⌘Z / Ctrl+Z) — audio, camera clips and scene cuts"
          >
            <Undo2 size={14} aria-hidden /> Undo
          </button>
          <button
            type="button"
            className={btn}
            disabled={redoLen === 0 || recording}
            onClick={redo}
            title="Redo (⇧⌘Z / Ctrl+Y)"
          >
            <Redo2 size={14} aria-hidden /> Redo
          </button>
          {(step === 'setup' || step === 'edit') && (
            <>
              <label className={`${btn} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#8DEBFF]`}>
                Import audio to selected take
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.webm"
                  className="sr-only"
                  onChange={(e) => void onUploadPick(e.target.files?.[0] || null)}
                />
              </label>
              <label className={`${btn} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#8DEBFF]`}>
                Add music bed
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.webm"
                  className="sr-only"
                  onChange={(e) => void onImportBed(e.target.files?.[0] || null)}
                />
              </label>
            </>
          )}
          {step === 'edit' && (
            <button
              type="button"
              className={loop ? primary : btn}
              aria-pressed={loop}
              onClick={() => setLoop((v) => !v)}
            >
              Loop selection
            </button>
          )}
          {advanced && (
            <button
              type="button"
              className={metronome ? primary : btn}
              aria-pressed={metronome}
              onClick={() => setMetronome((v) => !v)}
            >
              Metronome
            </button>
          )}
          {advanced && metronome && (
            <label className="text-xs text-[#D5DEE6] flex items-center gap-2">
              BPM
              <input
                type="number"
                min={40}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className={`w-16 px-2 py-1 ${field}`}
              />
            </label>
          )}
          </div>
          {showPicture && (
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
              <LiveProgram
                clips={cameraClips}
                cuts={programCuts}
                startScene={startScene}
                pgmAnim={pgmAnim}
                playing={playing}
                recording={recording}
                liveStreams={liveProgramStreams}
                pvwScene={pvwScene}
                fadeNext={fadeNext}
                showSwitcher={advanced}
                onPvw={switchScene}
                onCut={() => {
                  setFadeNext(false)
                  takeProgram(pvwScene, false)
                }}
                onFade={(currentPgm) => {
                  if (pvwScene !== currentPgm) {
                    setFadeNext(false)
                    takeProgram(pvwScene, true)
                  } else {
                    setFadeNext((v) => !v)
                  }
                }}
              />
            </div>
          )}
        </div>

        {recWarn && (
          <p className="rounded-lg border border-[#FFB86B]/50 bg-[#20180C] px-3 py-2 text-sm text-[#FFD9A8]" role="status">
            {recWarn}
          </p>
        )}

        {/* Guest call stays MOUNTED on every step (hidden, not unmounted) so the WebRTC link never drops. */}
        <div hidden={!(step === 'setup' || step === 'record')} className="space-y-2">
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
        </div>
        {(guestTakeUrl || guestCameraUrl) && (
          <div className="flex flex-wrap gap-2">
            {guestTakeUrl && (
              <button type="button" className={btn} onClick={() => void applyGuestTake(guestTakeUrl)}>
                Add the guest’s uploaded recording to the timeline
              </button>
            )}
            {guestCameraUrl && (
              <button type="button" className={btn} onClick={() => void applyGuestCamera(guestCameraUrl)}>
                Add the guest’s uploaded camera file
              </button>
            )}
          </div>
        )}
        {remoteGuest && (step === 'setup' || step === 'record') && (
          <p className="text-[11px] text-[#7CFFB2]">
            The remote guest’s microphone records onto the Guest lane.
            {remoteGuestVideo || streamHasLiveVideo(remoteGuest)
              ? ' Their camera is live — recording also saves a camera file.'
              : ' Waiting for their camera.'}
          </p>
        )}

        <div
          hidden={!(step === 'setup' || step === 'record')}
          className="rounded-xl border border-[#1A232C] bg-[#0A1016] p-3 space-y-2"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#D5DEE6]">
            <Headphones size={14} className="text-[#8DEBFF]" aria-hidden />
            <span>Everyone wears headphones so the mix does not leak into the mics.</span>
            <InfoTip label="About listening while recording">
              While you record, the other lanes can play in your headphones (and the guest’s) so you can respond
              naturally. With speakers instead of headphones that sound leaks into the microphones.
              {Object.keys(cameraStreams).length > 0 || remoteGuestVideo ? ' Camera previews are 720p.' : ''}
            </InfoTip>
            <label className="inline-flex min-h-[36px] items-center gap-1.5">
              <input type="checkbox" checked={cueEnabled} onChange={(e) => setCueEnabled(e.target.checked)} />
              Play the mix in my headphones while recording
            </label>
            {cueEnabled && (
              <label className="inline-flex items-center gap-2">
                Headphone level {Math.round(cueGain * 100)}%
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
            <label className="inline-flex min-h-[36px] items-center gap-1.5">
              <input type="checkbox" checked={replaceArmed} onChange={(e) => setReplaceArmed(e.target.checked)} />
              Record over the selected take
            </label>
            <label className="inline-flex min-h-[36px] items-center gap-1.5">
              <input type="checkbox" checked={autoMuteQuiet} onChange={(e) => setAutoMuteQuiet(e.target.checked)} />
              Quiet the mic of whoever is not talking
            </label>
            <label className="inline-flex min-h-[36px] items-center gap-1.5">
              <input type="checkbox" checked={voiceIsolate} onChange={(e) => setVoiceIsolate(e.target.checked)} />
              Reduce background noise
            </label>
            {advanced && (
              <label className="inline-flex min-h-[36px] items-center gap-1.5">
                <input type="checkbox" checked={rawInput} onChange={(e) => setRawInput(e.target.checked)} />
                Raw input (no browser auto-level)
              </label>
            )}
            {mics.length > 0 && (
              <label className="inline-flex items-center gap-2">
                Default microphone
                <select className={select} value={micId} onChange={(e) => setMicId(e.target.value)}>
                  <option value="">System default</option>
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || 'Microphone'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className={btn} onClick={armHostAndGuest}>
              Get Host + Guest ready to record
            </button>
            {advanced && (
              <button type="button" className={btn} onClick={followTalkerNow}>
                Follow talker
              </button>
            )}
          </div>
          {(recording || anyArmed) && (
            <div className="space-y-1.5">
              <LiveMeters labels={meterLabels} recording={recording} />
            </div>
          )}
          {recHint && (
            <p className="flex items-start gap-2 text-[11px] text-[#A9B8C6]">
              <span>
                {recHint}
                {personIdsArmed > 1
                  ? remoteGuest
                    ? ' Host records here, the guest from their own booth — both start together.'
                    : armedDeviceCount > 1
                      ? ' Two mics start together; the quieter one is lowered while the other person talks.'
                      : ' Shared mic — Host and Guest record onto one take.'
                  : ''}
              </span>
              <button type="button" className="underline text-[#8DEBFF]" onClick={() => setShowShortcuts(true)}>
                Keyboard shortcuts
              </button>
            </p>
          )}
        </div>

        <div hidden={step !== 'edit'} className="rounded-xl border border-[#1A232C] bg-[#080C10] px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Edit the selection</p>
              <InfoTip label="How to edit">
                Drag across a person’s lane to select a part. “Remove, leave silence” keeps the timing; “Remove &amp;
                close gap” pulls everything after it earlier (camera and scene switches follow). Lower a music bed
                under speech with “Set section volume”. “Best take” uses this take for the selected part only.
              </InfoTip>
            </div>
            <label className="inline-flex min-h-[36px] items-center gap-1.5 text-[11px] text-[#D5DEE6]">
              <input type="checkbox" checked={applyRangeAll} onChange={(e) => setApplyRangeAll(e.target.checked)} />
              Apply to every lane
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {advanced && (
              <>
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
                  setError('Drag across the part first, then choose Best take')
                  return
                }
                pushHistory()
                setTracks((prev) => assignCompRange(prev, selected.id, cur.start, cur.end))
                setOk(`${selected.name} covers ${formatClock(cur.start)}–${formatClock(cur.end)}`)
              }}
            >
              Best take for this part
            </button>
              </>
            )}
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => editRange((t) => setVolumeInRange(t, rangeRef.current.start, rangeRef.current.end, 0), 'Ducked section to silence (automation)')}
            >
              <VolumeX size={12} aria-hidden /> Mute selection
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
              <Scissors size={12} aria-hidden /> Split at playhead
            </button>
            {advanced && (
              <>
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
              </>
            )}
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => removeRange(false)}
            >
              Remove, leave silence
            </button>
            <button
              type="button"
              className={btn}
              disabled={!selected?.buffer}
              onClick={() => removeRange(true)}
            >
              Remove &amp; close gap
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
            {advanced && (
              <>
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
              </>
            )}
          </div>
        </div>

        <div hidden={!(step === 'record' || step === 'edit')}>
          <SfxPad compact disabled={Boolean(busy) || recording} onDrop={(id) => void dropSfx(id)} />
        </div>

        {/* People / takes */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">People & takes</p>
              <p className="text-[11px] font-mono text-[#A9B8C6]">
                <LiveClock />
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
                aria-label="New person's name"
                className="w-36 rounded-lg border border-[#4A5968] bg-[#151B22] px-2 py-1.5 text-sm text-[#F6FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
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
          {showPicture && advanced && (
            <ProgramCutLane
              cuts={programCuts}
              startScene={startScene}
              pxPerSec={zoom}
              durationSec={boardDuration}
              scrollLeft={timelineScroll}
              onScrollLeft={setTimelineScroll}
              selectedId={selectedCutId}
              onSelect={(id) => {
                editFocusRef.current = 'program'
                setSelectedCutId(id)
              }}
              onPlayhead={setHead}
              onEditStart={pushHistory}
              onMove={(id, at) => setProgramCuts((prev) => moveProgramCut(prev, id, at, startScene))}
              onRemove={deleteProgramCut}
              onFade={(id, fade) => {
                pushHistory()
                setProgramCuts((prev) => setProgramCutFade(prev, id, fade))
              }}
              onScene={(id, scene) => {
                pushHistory()
                setProgramCuts((prev) => setProgramCutScene(prev, id, scene, startScene))
              }}
              onClear={() => {
                pushHistory()
                setProgramCuts([])
                setSelectedCutId(null)
                setOk('Cleared scene switches — the Output shows Host for the whole episode')
              }}
              disabled={recording || Boolean(exporting)}
            />
          )}

          {people.map((person) => {
            const lane = tracks.filter((t) => t.personId === person.id).sort((a, b) => a.take - b.take)
            const mixerTrack = lane.find((t) => t.id === selected?.id) || lane.find((t) => t.armed) || lane[0] || null
            return (
              <div key={person.id} className="rounded-2xl border border-[#1A232C] bg-[#080C10] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: person.color }} />
                  <input
                    aria-label={`Name for ${person.kind === 'voice' ? 'this voice' : 'this lane'}`}
                    value={person.name}
                    onChange={(e) =>
                      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, name: e.target.value } : p)))
                    }
                    className="min-w-[7rem] rounded border border-[#4A5968] bg-[#151B22] px-2 py-1 text-sm font-medium text-[#F6FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
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
                      {cameraStreams[person.id] ? <Video size={12} aria-hidden /> : <VideoOff size={12} aria-hidden />}
                      {cameraStreams[person.id] ? 'Camera on' : camWarnFor === person.id ? 'Confirm' : 'Camera'}
                    </button>
                    {advanced && (
                      <>
                    <button
                      type="button"
                      className={chip}
                      disabled={recording}
                      title="Name caption at the playhead (video only)"
                      onClick={() => addLowerThird(person.id)}
                    >
                      Lower third
                    </button>
                    <label className={`${chip} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#8DEBFF]`} title="Add a cut-away video clip on this picture lane">
                      Cut-away video
                      <input
                        type="file"
                        accept="video/*,.mp4,.webm,.mov"
                        className="sr-only"
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
                      title="Short black flash at the playhead (video only)"
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
                    )}
                    </>
                  ) : null}
                  {person.kind === 'voice' && (
                    <button
                      type="button"
                      className={lane.some((t) => t.armed) ? danger : chip}
                      aria-pressed={lane.some((t) => t.armed)}
                      title="Record this person on the next take"
                      onClick={() => {
                        const empty = emptyTakeForPerson(tracks, person.id)
                        const last = lane[lane.length - 1]
                        if (empty) armTrack(empty.id)
                        else if (last) armTrack(last.id)
                      }}
                    >
                      {lane.some((t) => t.armed) ? 'Will record' : 'Record this person'}
                    </button>
                  )}
                  {advanced && person.kind === 'voice' && lane.some((t) => (t.compRanges || []).length > 0) && (
                    <button
                      type="button"
                      className={chip}
                      onClick={() => {
                        pushHistory()
                        setTracks((prev) => clearCompRanges(prev, person.id))
                        setOk(`Cleared best-take picks for ${person.name} — the audible take plays throughout again`)
                      }}
                    >
                      Clear best-take picks
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
                            {track.armed ? ' · rec' : ''}
                            {!track.buffer ? ' · empty' : ''}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="Take name"
                        value={mixerTrack.name}
                        onChange={(e) => updateTrack(mixerTrack.id, { name: e.target.value })}
                        className="min-w-[7rem] flex-1 rounded border border-[#4A5968] bg-[#151B22] px-2 py-1 text-sm text-[#F6FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        className={mixerTrack.muted ? danger : chip}
                        title="Mute this take"
                        aria-label={`Mute ${mixerTrack.name}`}
                        aria-pressed={Boolean(mixerTrack.muted)}
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
                        title="Solo — hear only this take"
                        aria-label={`Solo ${mixerTrack.name}`}
                        aria-pressed={Boolean(mixerTrack.solo)}
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
                        title="Ready to record on this take"
                        aria-label={`Record on ${mixerTrack.name}`}
                        aria-pressed={Boolean(mixerTrack.armed)}
                        onClick={(e) => {
                          e.stopPropagation()
                          armTrack(mixerTrack.id)
                        }}
                      >
                        R
                      </button>
                      {advanced && isVoiceRole(mixerTrack.role) && (
                        <>
                          <button
                            type="button"
                            className={mixerTrack.listen ? primary : chip}
                            title="Audible take — other takes for this person stay out of the mix"
                            aria-label={`Use ${mixerTrack.name} as the audible take`}
                            aria-pressed={Boolean(mixerTrack.listen)}
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
                            aria-label={`Layer ${mixerTrack.name} with the audible take`}
                            aria-pressed={Boolean(mixerTrack.layered)}
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
                            title="Best take: use this take for the selected range (other takes yield)"
                            aria-label={`Best take: use ${mixerTrack.name} for the selected range`}
                            onClick={(e) => {
                              e.stopPropagation()
                              const cur = rangeRef.current
                              if (cur.end - cur.start < 0.05) {
                                setError('Drag across the part on the timeline first, then choose Best take')
                                return
                              }
                              pushHistory()
                              setTracks((prev) => assignCompRange(prev, mixerTrack.id, cur.start, cur.end))
                              setOk(`${mixerTrack.name} is the audible take ${formatClock(cur.start)}–${formatClock(cur.end)}`)
                            }}
                          >
                            Best take
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={chip}
                        title="Duplicate"
                        aria-label={`Duplicate ${mixerTrack.name}`}
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
                        aria-label={`Clear audio from ${mixerTrack.name}`}
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
                        aria-label={`Remove ${mixerTrack.name}`}
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
                          className="mt-1 w-full rounded border border-[#4A5968] bg-[#151B22] px-2 py-0.5 text-[11px] text-[#F6FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
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
                    <p className="max-w-xs text-[11px] text-[#A9B8C6]">
                      Guest camera (live). Recording saves a separate video file — the podcast stays audio.
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
                    <p className="max-w-xs text-[11px] text-[#A9B8C6]">
                      Camera preview (720p). Recording saves a separate video file — the podcast stays audio.
                    </p>
                  </div>
                ) : null}
                {person.kind === 'voice' && (
                  <CameraLane
                    clips={cameraClips.filter((c) => c.personId === person.id)}
                    pxPerSec={zoom}
                    durationSec={boardDuration}
                    scrollLeft={timelineScroll}
                    onScrollLeft={setTimelineScroll}
                    color={person.color}
                    selectedId={selectedCamClipId}
                    onSelect={(id) => {
                      editFocusRef.current = 'camera'
                      setSelectedCamClipId(id)
                    }}
                    onPlayhead={setHead}
                    onEditStart={pushHistory}
                    onDelete={() => {
                      if (selectedCamClipId) discardCameraClip(selectedCamClipId)
                    }}
                    cuts={programCuts}
                    emptyHint={
                      cameraStreams[person.id] || (person.id === 'guest' && guestLiveVideo)
                        ? 'Camera is on — Record writes a picture take here on the same clock as the audio.'
                        : null
                    }
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
                    onStinger={advanced ? (where) => addStinger(person.id, where) : undefined}
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
                        onEditStart={pushHistory}
                        onFilter={(filter) => setCameraClips((prev) => setCameraFilter(prev, clip.id, filter))}
                        onFades={(fadeIn, fadeOut) =>
                          setCameraClips((prev) => setCameraFades(prev, clip.id, fadeIn, fadeOut))
                        }
                        onDuration={(seconds) => setCameraClips((prev) => setGraphicDuration(prev, clip.id, seconds))}
                        onTitle={(name, sub) => {
                          if (name === (clip.label || '') && sub === (clip.sublabel || '')) return
                          editCamera((prev) => patchCameraClip(prev, clip.id, { label: name, sublabel: sub }))
                        }}
                        onOverlayFit={(fit) => editCamera((prev) => patchCameraClip(prev, clip.id, { overlayFit: fit }))}
                        onStingerStyle={(style) => editCamera((prev) => setStingerStyle(prev, clip.id, style))}
                        onSeedKeyframes={() => editCamera((prev) => seedCameraKeyframes(prev, clip.id))}
                        onAddKeyframe={() => editCamera((prev) => addKeyframeAt(prev, clip.id, playheadRef.current))}
                        onUpdateKeyframe={(index, patch) =>
                          setCameraClips((prev) => updateKeyframe(prev, clip.id, index, patch))
                        }
                        onRemoveKeyframe={(index) => editCamera((prev) => removeKeyframe(prev, clip.id, index))}
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
        <div hidden={!(step === 'edit' || step === 'publish')}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
            Playhead <LiveClock /> ·{' '}
            {exportSelection
              ? `export selection ${formatClock(exportSelection.start)} – ${formatClock(exportSelection.end)}`
              : `export full episode (${durationLabel})`}
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
            {hasAudio && <LiveOverviewHead sessionLen={sessionLen} />}
            {!hasAudio && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-[#A9B8C6]">
                Record a take to see the whole episode here
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
              Overall volume {Math.round(masterGain * 100)}%
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
              Fade in at start {masterFadeIn.toFixed(1)}s
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
              Fade out at end {masterFadeOut.toFixed(1)}s
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
        <div hidden={!(step === 'edit' && advanced)}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">
              Voice effects {selected ? `· ${selected.name}` : ''}
            </p>
            <InfoTip label="About voice effects">
              Effects added here can be switched off or turned down at any time — they do not change the recording.
              “Apply to the take permanently” below does change it (Undo still works until you leave).
            </InfoTip>
          </div>
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
                  className="px-3 py-2 rounded-lg border border-[#4A5968] bg-[#151B22] text-sm text-[#F6FAFC] hover:border-[#53D6FF]/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
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
                    On
                  </label>
                  <label className="inline-flex items-center gap-1">
                    Amount {Math.round(slot.wet * 100)}%
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
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Apply to the take permanently</p>
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
                  className="px-3 py-2 rounded-lg border border-[#4A5968] bg-[#151B22] text-sm text-[#F6FAFC] hover:border-[#53D6FF]/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
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
              Apply voice effects permanently
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={splitSelectedAtPlayhead}>
              Split at playhead
            </button>
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={bounceSelectedToStem}>
              Merge this take into a new take
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'], 'keep')}
            >
              Merge the mix to one lane (keeps takes)
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'limit'], 'keep')}
            >
              Merge &amp; even out levels (keeps takes)
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'], 'replace')}
            >
              Replace everything with the merged mix…
            </button>
          </div>
        </div>

        <div hidden={step !== 'publish'} className="space-y-2 pt-1 border-t border-[#4A5968]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primary}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('mp3')}
          >
            {busy?.includes('MP3') ? busy : exportLabel}
          </button>
          {onPublished && (
            <button
              type="button"
              className={primary}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void exportAudio('mp3', true)}
            >
              Save mix &amp; review for publishing
            </button>
          )}
          <button
            type="button"
            className={btn}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('wav')}
          >
            {busy?.includes('WAV') ? busy : 'Save as WAV instead'}
          </button>
          <label className="inline-flex min-h-[36px] items-center gap-1.5 text-xs text-[#D5DEE6]">
            <input type="checkbox" checked={matchLufs} onChange={(e) => setMatchLufs(e.target.checked)} />
            Even out loudness ({PODCAST_LUFS} LUFS)
          </label>
          <label className="inline-flex min-h-[36px] items-center gap-1.5 text-xs text-[#D5DEE6]">
            <input
              type="checkbox"
              checked={exportSelectionOnly}
              onChange={(e) => setExportSelectionOnly(e.target.checked)}
            />
            Export selection only
            {exportSelectionOnly && !hasSelection ? ' (drag a range first)' : ''}
          </label>
          <button
            type="button"
            className={btn}
            disabled={!hasAudio || Boolean(busy) || measuring || recording}
            onClick={() => void measureMasterNow()}
          >
            {measuring ? 'Measuring…' : loudness && !loudnessStale ? `Loudness ${loudness.lufs.toFixed(1)} LUFS` : 'Measure loudness'}
          </button>
          {advanced && (
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void downloadStems()}
            >
              {busy?.includes('stems') ? busy : 'Download stems zip'}
            </button>
          )}
          {unsaved && !busy && (
            <p className="basis-full text-xs text-[#FFD9A8]" role="note">
              Edits since the last saved mix — they are backed up on this computer but not in the episode yet.
            </p>
          )}
        </div>
        </div>

        <div
          hidden={!(step === 'publish' && advanced)}
          className="rounded-xl border border-[#1A232C] bg-[#080C10] px-3 py-2"
        >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mr-1">Video</p>
          {cameraClips.length === 0 ? (
            <p className="text-[11px] text-[#7C8B97]">
              No video yet. Turn on a camera for Host or Guest and record — then export a finished video here.
            </p>
          ) : (
            <>
              <select
                className={select}
                value={exportFormat}
                disabled={exporting}
                onChange={(e) => setExportFormat(e.target.value as VideoExportFormat)}
                title="MP4 (H.264/AAC) plays everywhere; WebM (VP8/Opus) encodes fastest in Chrome"
              >
                <option value="webm">WebM</option>
                <option value="mp4">MP4</option>
              </select>
              <button
                type="button"
                className={primary}
                disabled={!cameraClips.some((c) => !c.muted) || Boolean(busy)}
                title="The Output with its scene switches, captions and cut-aways, plus the mixed episode audio. Saved to this computer — the podcast stays audio."
                onClick={() => void exportProgramVideo()}
              >
                {busy?.includes('program video') ? busy : 'Export video'}
              </button>
              <button
                type="button"
                className={btn}
                disabled={!hasAudio || Boolean(busy)}
                title="Host camera full-screen for the whole episode (ignores scene switches)."
                onClick={() => void downloadPicture('a-roll')}
              >
                {busy?.includes('Full-screen') ? busy : 'Full-screen only'}
              </button>
              <button
                type="button"
                className={btn}
                disabled={!hasAudio || !cameraClips.some((c) => c.personId === 'guest') || Boolean(busy)}
                title="Host full-screen with the guest picture-in-picture, whole episode (ignores scene switches)."
                onClick={() => void downloadPicture('pip')}
              >
                {busy?.includes('Picture-in-picture') ? busy : 'Picture-in-picture only'}
              </button>
              {exporting && (
                <button type="button" className={danger} onClick={() => exportAbortRef.current?.abort()}>
                  Cancel export
                </button>
              )}
              <p className="basis-full text-[10px] text-[#7C8B97]">
                {programCuts.length
                  ? `${programCuts.length} scene switch${programCuts.length === 1 ? '' : 'es'} on the Output lane.`
                  : 'No scene switches — the video stays on Host (Guest fills in when there is no host picture).'}{' '}
                Chrome asks where to save so long episodes stream to disk instead of memory.
              </p>
            </>
          )}
        </div>
        </div>

        {step !== 'publish' && (
          <div className="flex justify-end">
            <button type="button" className={btn} onClick={() => setStep(NEXT_STEP[step])}>
              Next: {STUDIO_STEPS.find((x) => x.id === NEXT_STEP[step])?.label} →
            </button>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        {ok && (
          <p className="text-sm text-[#8DEBFF]" role="status">
            {ok}
          </p>
        )}
        <div className="flex items-center gap-2 text-[11px] text-[#A9B8C6]">
          <span>
            Podcast feed: <code className="text-[#8DEBFF]">/podcast/rss.xml</code> — new published episodes appear in
            Apple Podcasts, Spotify and Amazon Music automatically.
          </span>
          <InfoTip label="More about recording, video and publishing">
            Each take lands on that person’s lane; “After everything so far” starts the next person where the mix
            ends. With two microphones, the one not talking is lowered on the timeline — both recordings are kept.
            Cameras save separate video files on this computer; the podcast itself is always audio. “Save full
            episode” evens out loudness to {PODCAST_LUFS} LUFS and stores the mix with the episode; publishing then
            goes through the episode’s review checklist. If this browser runs low on space you are told to download
            the camera files.
          </InfoTip>
        </div>
      </div>
    </div>
    </LiveStoreContext.Provider>
  )
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8DEBFF]'
const btn =
  `inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#4A5968] text-sm text-[#D5DEE6] disabled:opacity-40 ${focusRing}`
const chip =
  `inline-flex items-center justify-center h-8 min-w-[2rem] px-1.5 rounded border border-[#4A5968] text-xs text-[#D5DEE6] ${focusRing}`
const primary =
  `inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40 ${focusRing}`
const danger =
  `inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/90 text-white text-sm font-medium ${focusRing}`
const select =
  `min-h-[36px] rounded-lg border border-[#4A5968] bg-[#151B22] px-2 py-1.5 text-sm text-[#D5DEE6] ${focusRing}`
const field =
  `rounded border border-[#4A5968] bg-[#151B22] text-[#F6FAFC] ${focusRing}`
