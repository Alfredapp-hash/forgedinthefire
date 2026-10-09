'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyGainAndFades,
  decodeBlob,
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
  duckWithSidechain,
  rippleDeleteSession,
  duplicateClipAt,
  fullClipForBuffer,
  joinAdjacentClips,
  mapTrack,
  moveClip,
  muteRange,
  pasteClip,
  rollTrimClip,
  setClipFades,
  setClipGain,
  setVolumeInRange,
  snapTime,
  splitRange,
  splitTrackAt,
  trimClip,
} from '@/lib/podcast/edit'
import {
  REC_MODE_META,
  attachInputMeter,
  computePunchAlignmentOffset,
  createSessionContext,
  decodePunchAlignment,
  playCountIn,
  punchAlignSec,
  punchInTime,
  sharedPunchInTime,
  sleep,
  startLiveMix,
  waitUntilContextTime,
  type CueHandle,
  type RecMode,
} from '@/lib/podcast/record-session'
import { renderMaster } from '@/lib/podcast/master'
import { requestPersistentStorage } from '@/lib/podcast/take-journal'
import { useWakeLock } from '@/components/podcast/studio/use-wake-lock'
import { useLeaveGuard } from '@/components/podcast/studio/leave-guard'
import { watchInputs } from '@/components/podcast/studio/track-watchdog'
import { createLiveStore, LiveStoreContext } from '@/components/podcast/studio/live-store'
import { LiveMeters } from '@/components/podcast/studio/live-readouts'
import {
  describeExportRange,
  replaceWarning,
  resolveExportRange,
  selectionOf,
  shortExportWarning,
  type ExportScope,
} from '@/components/podcast/studio/export-range'
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
import {
  renderCameraDeliverable,
  renderPictureMix,
  type PictureMode,
  type PictureScene,
} from '@/lib/podcast/picture'
import type { PodcastChapter } from '@/lib/studio/types'
import { type StudioStage } from '@/lib/podcast/stage'
import { applyFollowTalker } from '@/lib/podcast/auto-mix'
import {
  gainForTargetLufs,
  measureLoudness,
  verifyLufs,
  LUFS_TOLERANCE,
  PODCAST_LUFS,
} from '@/lib/podcast/lufs'
import { checkFeedCompliance } from '@/lib/podcast/compliance'
import { slugFile, zipStore } from '@/lib/podcast/zip'
import { renderSfx, SFX_META, type SfxId } from '@/lib/podcast/sfx'
import { SfxPad } from '@/components/podcast/sfx-pad'
import { SessionTimeline } from '@/components/podcast/session-timeline'
import { GuestInvitePanel, type RemoteGuestLane } from '@/components/podcast/guest-invite-panel'
import { fetchGuestTakeBlob } from '@/lib/podcast/upload/guest-take-client'
import { isRemoteLaneKey, remoteLaneKey } from '@/lib/podcast/rooms/layout'
import { RecordingBooth, type BoothParticipant, type BoothStageProps } from '@/components/podcast/recording-booth'
import { BoothStage } from '@/components/podcast/booth-stage'
import { Teleprompter } from '@/components/podcast/teleprompter'
import type { BoothTakeSummary } from '@/lib/podcast/booth-layout'
import { ShortcutsHelpModal } from '@/components/podcast/shortcuts-help-modal'
import { STUDIO_HOW_IT_WORKS } from '@/lib/podcast/shortcuts'
import { RecoveryBanner } from '@/components/podcast/studio/recovery-banner'
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
  clearCameraDissolve,
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
  snapCamerasToAudio,
} from '@/lib/podcast/av-sync'
import { createActiveSpeakerTracker } from '@/lib/podcast/active-speaker'
import {
  addSwitch,
  dedupeEdl,
  moveSwitch,
  removeSwitch,
  setSwitchMain,
  type SwitchEDL,
} from '@/lib/podcast/switch-edl'

const REMOTE_GUEST_KEY = 'remote:guest'
import {
  BookmarkPlus,
  CopyPlus,
  Headphones,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Scissors,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Video,
  VideoOff,
  VolumeX,
} from 'lucide-react'
import {
  Button,
  Chip,
  IconButton,
  Meter,
  Panel,
  RecordButton,
  SegmentedControl,
  Slider,
  toast,
  laneColor,
  LANE_IDS,
  type LaneColor,
} from '@/components/studio-ui'

type Props = {
  episodeId?: string | null
  audioUrl?: string | null
  title: string
  onExported: (file: File, durationSeconds: number) => Promise<void>
  /** Combined export's muxed program video → episode.video_url (watch on site + video feed). */
  onVideoExported?: (file: File) => Promise<void>
  onPublished?: () => Promise<void>
  onMarkChapter?: (seconds: number) => void
  chapters?: PodcastChapter[]
  /** Current studio workflow stage. When omitted, every section renders (legacy
   *  behavior). When set, sections are gated by stage — but the component and all
   *  its state/effects stay mounted, so a live recording survives stage switches. */
  stage?: StudioStage
  /** Optional stage navigator. When supplied, a successful Record-stage export
   *  surfaces a "View in editor" toast action that jumps to the Edit stage. */
  onGoToStage?: (stage: StudioStage) => void
  /** Episode status; 'published' makes "replace the episode audio" a stronger confirm. */
  episodeStatus?: string | null
  /** Fires when unsaved timeline edits appear/clear, so the host shell can warn before navigating away. */
  onDirtyChange?: (dirty: boolean) => void
  /** Live transport signals for the production-room header chip (Idle / Count-in / REC / Saving). */
  onTransportStatus?: (status: { recording: boolean; countIn: boolean; saving: boolean; elapsedSec: number }) => void
  /** Episode recording script (show notes) for the built-in teleprompter. */
  script?: string | null
}

const ADVANCED_KEY = 'studio-advanced-tools'

/** Advanced-tools preference, remembered per browser. Storage failures fall back to simple mode. */
function readAdvancedPref(): boolean {
  try {
    return window.localStorage.getItem(ADVANCED_KEY) === '1'
  } catch {
    return false
  }
}
function writeAdvancedPref(value: boolean) {
  try {
    window.localStorage.setItem(ADVANCED_KEY, value ? '1' : '0')
  } catch {
    /* ignore storage failures */
  }
}

/** True when a single-letter shortcut may fire: nothing focused, or focus is inside the
 *  studio but not on a control (so a slip while a chip button is focused never records or cuts). */
function shortcutTargetOk(target: EventTarget | null, root: HTMLElement | null): boolean {
  const el = target as HTMLElement | null
  if (!el || el === document.body || el === document.documentElement) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return false
  if (el.isContentEditable) return false
  if (el.closest('button, a, input, select, textarea, [role="dialog"]')) return false
  return Boolean(root && root.contains(el))
}

type Snapshot = {
  tracks: StudioTrack[]
  cameras: CameraClip[]
  switchEdl: SwitchEDL
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

export function PodcastAudioEditor({ episodeId, audioUrl, title, onExported, onVideoExported, onPublished, onMarkChapter, chapters, stage, onGoToStage, episodeStatus, onDirtyChange, onTransportStatus, script }: Props) {
  // Stage gating. `stage == null` keeps legacy behavior (show everything). These
  // are presentational only — nothing below unmounts on a stage switch, so a live
  // recording, its checkpoints, and all editor state persist across stages.
  const showAll = stage == null
  /** The Sound Booth stage: the focused-in recording view (big cameras + transport). */
  const booth = stage === 'record'
  /** Legacy full-rack record controls (only when every stage renders at once). */
  const showRecord = showAll
  const showEdit = showAll || stage === 'edit'
  const showPublish = showAll || stage === 'publish'
  const [tracks, setTracks] = useState<StudioTrack[]>(() => defaultSessionTracks())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [sectionLevel, setSectionLevel] = useState(0.25)
  /** Ducking preset config: lower the selected lane when the sidechain lane is loud. */
  const [duckSidechainId, setDuckSidechainId] = useState('')
  const [duckDb, setDuckDb] = useState(-12)
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
  const [snap, setSnap] = useState(false)
  const SNAP_GRID = 0.1
  const SNAP_MAGNET = 6 // px; converted to seconds via zoom at edit time
  /** Extra clips in the current selection beyond the primary selectedClipId.
   *  Value is the owning trackId so batch ops can find each clip's lane. */
  const [multiSel, setMultiSel] = useState<Record<string, string>>({})
  /** Live mirror of the full clip selection for the keydown handler (no re-subscribe). */
  const selectionClipIdsRef = useRef<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setErrorText] = useState<string | null>(null)
  const [ok, setOkText] = useState<string | null>(null)
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
  /** Live-captured + hand-edited camera-switch cuts (MAIN follows the talker). */
  const [switchEdl, setSwitchEdl] = useState<SwitchEDL>([])
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
  /** Input meters + record clock live OUTSIDE React state (≤15 Hz to subscribers). */
  const liveStore = useMemo(() => createLiveStore(), [])
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
  /** Device / permission watchdog: a mic unplugged, muted by the OS, or permission pulled mid-take. */
  const [inputLost, setInputLost] = useState<string | null>(null)
  const inputWatchStopRef = useRef<(() => void) | null>(null)
  /** One 48 kHz AudioContext per recording session: cue playback + every mic share its clock. */
  const sessionCtxRef = useRef<AudioContext | null>(null)
  /** What "Save mix" exports. Whole episode by default; a selection only when asked explicitly. */
  const [exportScope, setExportScope] = useState<ExportScope>('full')
  /** Edits since the last saved mix (takes are still backed up on this computer). */
  const [dirty, setDirty] = useState(false)
  const mountedEditsRef = useRef(false)

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
  /** Teardown callbacks for the live active-speaker analysers + sampling loop. */
  const speakerTrackerStopRef = useRef<Array<() => void>>([])
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
  /** Panel shows: room streams for guests 2..n by person id (guest 1 stays on remoteGuestRef). */
  const remoteGuestsRef = useRef<Map<string, MediaStream>>(new Map())
  const [remoteGuestSig, setRemoteGuestSig] = useState('')
  /** Session time ↔ wall clock at the instant the host captures went live; rides the record-on signal to the guests. */
  const [guestRecClock, setGuestRecClock] = useState<{ sec: number; at: number } | null>(null)
  const [hostTalkStream, setHostTalkStream] = useState<MediaStream | null>(null)
  const [guestTakeUrl, setGuestTakeUrl] = useState<string | null>(null)
  const [guestCameraUrl, setGuestCameraUrl] = useState<string | null>(null)
  const [recTally, setRecTally] = useState<GuestTallyPhase>('waiting')
  const [boothOpen, setBoothOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  /** Progressive disclosure for the lane "smart controls": keeps the default
   *  edit view calm (Split only) and reveals the advanced tool sections on demand. */
  const [smartControlsOpen, setSmartControlsOpen] = useState(false)
  /** Simple by default: a first-time host sees lanes, transport, split/ripple/undo, volume,
   *  fade, best take, clean-up and export. Everything else sits one click away under
   *  Advanced (remembered per browser). Nothing is removed. */
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => {
    setAdvanced(readAdvancedPref())
  }, [])
  const toggleAdvanced = useCallback(() => {
    setAdvanced((v) => {
      writeAdvancedPref(!v)
      return !v
    })
  }, [])
  /** Editor root — the scope for single-letter keyboard shortcuts. */
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** Redo stack: filled by undo, cleared by the next new edit. */
  const redoRef = useRef<Snapshot[]>([])
  const [redoLen, setRedoLen] = useState(0)

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
  // A recording "has video" when any camera/picture clip exists on the picture lane
  // (live-captured camera takes, imported footage, or recorded picture). This gates
  // the video half of the combined "Export episode" action.
  const hasVideo = cameraClips.length > 0
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

  // Feedback: every ok/error goes through the mounted studio Toaster (aria-live) AND the
  // inline status/alert line under the transport, so nothing lands silently below the fold.
  // Success clears any stale error; error clears stale ok.
  const setOk = useCallback((message: string | null) => {
    setOkText(message)
    if (message) {
      setErrorText(null)
      toast({ title: message, tone: 'success' })
    }
  }, [])
  const setError = useCallback((message: string | null) => {
    setErrorText(message)
    if (message) {
      setOkText(null)
      toast({ title: message, tone: 'error' })
    }
  }, [])
  const notifyOk = useCallback(
    (title: string, opts?: { description?: string; action?: { label: string; onClick: () => void } }) => {
      setErrorText(null)
      setOkText(opts?.description ? `${title} — ${opts.description}` : title)
      toast({ title, description: opts?.description, tone: 'success', action: opts?.action })
    },
    [],
  )
  const notifyError = useCallback((title: string, description?: string) => {
    setOkText(null)
    setErrorText(description ? `${title} — ${description}` : title)
    toast({ title, description, tone: 'error' })
  }, [])

  cueToGuestRef.current = cueToGuest

  // Keep the screen awake while recording; confirm before leaving with a live take or unsaved mix.
  useWakeLock(recording)
  useLeaveGuard({ recording, unsaved: dirty })
  useEffect(() => {
    // The first tracks/cameras value is the mount (or restore) — only later changes are edits.
    if (!mountedEditsRef.current) {
      mountedEditsRef.current = true
      return
    }
    if (tracks.some((t) => t.buffer) || cameraClips.length > 0) setDirty(true)
  }, [tracks, cameraClips])
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

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
      switchEdl: switchEdl.map((e) => ({ ...e })),
      selectedId,
      selectedCamClipId,
    })
    if (historyRef.current.length > 20) historyRef.current.shift()
    setHistoryLen(historyRef.current.length)
    // A fresh edit invalidates the redo branch.
    redoRef.current = []
    setRedoLen(0)
  }, [tracks, cameraClips, switchEdl, selectedId, selectedCamClipId])

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

  /**
   * Panel shows: every guest after the first becomes a voice person with lane slots and
   * records from their own room stream. Guest 1 keeps the existing Guest lane / remoteGuestRef.
   */
  const onRemoteGuests = useCallback((lanes: RemoteGuestLane[]) => {
    const extra = lanes.filter((l) => l.index >= 2)
    const next = new Map<string, MediaStream>()
    for (const l of extra) if (l.stream) next.set(l.personId, l.stream)
    remoteGuestsRef.current = next
    setRemoteGuestSig([...next.keys()].sort().join(','))
    if (!extra.length) return
    setPeople((prev) => {
      let changed = false
      let list = prev
      for (const l of extra) {
        const have = list.find((p) => p.id === l.personId)
        if (!have) {
          changed = true
          const person: SessionPerson = {
            id: l.personId,
            name: l.name,
            color: TRACK_COLORS[(list.length + l.index) % TRACK_COLORS.length],
            kind: 'voice',
          }
          const beds = list.filter((p) => p.kind !== 'voice')
          const voices = list.filter((p) => p.kind === 'voice')
          list = [...voices, person, ...beds]
        } else if (have.name !== l.name && l.name) {
          changed = true
          list = list.map((p) => (p.id === l.personId ? { ...p, name: l.name } : p))
        }
      }
      return changed ? list : prev
    })
    setTracks((prev) => {
      const missing = extra.filter((l) => !prev.some((t) => t.personId === l.personId))
      if (!missing.length) return prev
      const added = missing.flatMap((l) =>
        emptyTakesForPerson({ id: l.personId, name: l.name, color: TRACK_COLORS[l.index % TRACK_COLORS.length], kind: 'voice' }).map(
          (t, i) => ({ ...t, armed: i === 0 && Boolean(l.stream) }),
        ),
      )
      return prev.concat(added)
    })
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

  // Booth per-person mute: flips `muted` on that person's audible (listen) take,
  // falling back to their armed take, then their first take. This is the only
  // per-person mute surface the editor exposes (mute lives on StudioTrack, not
  // on a live mic), so we mute every take that person owns to keep it decisive.
  const toggleBoothMute = useCallback((personId: string) => {
    setTracks((prev) => {
      const owned = prev.filter((t) => t.personId === personId)
      if (owned.length === 0) return prev
      const anchor = owned.find((t) => t.listen) || owned.find((t) => t.armed) || owned[0]
      const nextMuted = !anchor.muted
      return prev.map((t) => (t.personId === personId ? { ...t, muted: nextMuted } : t))
    })
  }, [])

  // Reflect the anchor-take mute state back to the booth so its per-tile mute
  // toggle stays in sync with the mixer.
  const personMuted = useCallback(
    (personId: string) => {
      const owned = tracks.filter((t) => t.personId === personId)
      const anchor = owned.find((t) => t.listen) || owned.find((t) => t.armed) || owned[0]
      return Boolean(anchor?.muted)
    },
    [tracks],
  )

  const nameFor = useCallback(
    (personId: string, fallback: string) => people.find((p) => p.id === personId)?.name || fallback,
    [people],
  )

  // Persistent GarageBand-style hue per person. Host + Guest map to their
  // canonical lane hues; everyone else takes a stable colour by their order
  // among the voice people, wrapping the six-lane palette. Presentation only.
  const laneFor = useCallback(
    (personId: string): LaneColor => {
      if (personId === 'host' || personId === 'guest') return laneColor(personId)
      const voices = people.filter((p) => p.kind === 'voice')
      const idx = voices.findIndex((p) => p.id === personId)
      // 0/1 are host/guest — cohorts start at lane index 2.
      return laneColor(idx < 0 ? 2 : (idx % (LANE_IDS.length - 2)) + 2)
    },
    [people],
  )

  const boothParticipants = useMemo<BoothParticipant[]>(() => {
    const guestLive = Boolean(remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest)))
    const list: BoothParticipant[] = []

    // Host — always part of the session and anchors the booth.
    const hostCam = cameraStreams.host ?? null
    list.push({
      id: 'host',
      name: nameFor('host', 'Host'),
      role: 'host',
      videoStream: hostCam,
      audioStream: hostTalkStream,
      hasLiveVideo: Boolean(hostCam),
      muted: personMuted('host'),
      cameraOn: Boolean(hostCam),
      connection: 'connected',
    })

    // Remote guest — only when a peer stream is actually present.
    if (remoteGuest) {
      list.push({
        id: 'guest',
        name: nameFor('guest', 'Guest'),
        role: 'guest',
        videoStream: guestLive ? remoteGuest : null,
        audioStream: remoteGuest,
        hasLiveVideo: guestLive,
        muted: personMuted('guest'),
        cameraOn: guestLive,
        connection: guestLive ? 'connected' : 'linking',
      })
    }

    // Panel guests (2..n) — one tile each from their room stream.
    for (const [personId, stream] of remoteGuestsRef.current) {
      const live = streamHasLiveVideo(stream)
      list.push({
        id: personId,
        name: nameFor(personId, 'Guest'),
        role: 'guest',
        videoStream: live ? stream : null,
        audioStream: stream,
        hasLiveVideo: live,
        muted: personMuted(personId),
        cameraOn: live,
        connection: 'connected',
      })
    }

    // Any other local cameras (co-hosts in the room) — skip host/guest keys.
    for (const [personId, stream] of Object.entries(cameraStreams)) {
      if (remoteGuestsRef.current.has(personId)) continue
      if (personId === 'host' || personId === 'guest') continue
      list.push({
        id: personId,
        name: nameFor(personId, 'Co-host'),
        role: 'cohost',
        videoStream: stream,
        audioStream: stream,
        hasLiveVideo: streamHasLiveVideo(stream),
        muted: personMuted(personId),
        cameraOn: Boolean(stream),
        connection: 'connected',
      })
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStreams, hostTalkStream, remoteGuest, remoteGuestVideo, remoteGuestSig, personMuted, nameFor])

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
      void saveSession(episodeId, people, tracks, cameraClips, switchEdl).catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not autosave takes on this computer')
      })
    }, 1600)
    return () => window.clearTimeout(t)
  }, [episodeId, people, tracks, cameraClips, switchEdl, recording, sessionStatus])

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
      speakerTrackerStopRef.current.forEach((fn) => fn())
      idleStopRef.current.forEach((fn) => fn())
      abortRef.current?.abort()
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
      if (watchdogRafRef.current) window.clearInterval(watchdogRafRef.current)
      inputWatchStopRef.current?.()
      inputWatchStopRef.current = null
      void sessionCtxRef.current?.close().catch(() => {})
      sessionCtxRef.current = null
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
        (armed.length ? armed : []).map((t) => deviceKey(t.personId)).filter((key) => !isRemoteLaneKey(key)),
      ),
    ]
    if (keys.length === 0 && !remoteGuest && !remoteGuestSig) keys.push(micId || '')
    void (async () => {
      try {
        const streams = keys.length ? await openInputStreams(keys, rawInput) : new Map<string, MediaStream>()
        if (cancelled || recordingRef.current) {
          stopStreams(streams.values())
          return
        }
        if (remoteGuest) streams.set(REMOTE_GUEST_KEY, remoteGuest)
        remoteGuestsRef.current.forEach((stream, personId) => streams.set(remoteLaneKey(personId), stream))
        idleStreamRef.current = [...streams.values()].filter((stream) => !isRemoteStream(stream))
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
            liveStore.setPeak(meterKey, peak)
            if (peak >= 0.98) {
              liveStore.setClip(meterKey, true)
              const timers = clipTimerRef.current
              if (timers[meterKey]) window.clearTimeout(timers[meterKey])
              timers[meterKey] = window.setTimeout(() => liveStore.setClip(meterKey, false), 1600)
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
  }, [recording, anyArmed, rawInput, micId, remoteGuest, remoteGuestSig, people, tracks.map((t) => `${t.id}:${t.armed}:${t.personId}`).join('|')])

  useEffect(() => {
    if (!recording && (recTally === 'count-in' || recTally === 'rec')) {
      setRecTally('stopped')
    }
    if (!recording) setGuestRecClock(null)
  }, [recording, recTally])

  // Header status chip: whole seconds only, so the shell re-renders ~1/s while recording.
  const elapsedWhole = Math.floor(recClock)
  useEffect(() => {
    onTransportStatus?.({ recording, countIn: recTally === 'count-in', saving: Boolean(busy), elapsedSec: elapsedWhole })
  }, [onTransportStatus, recording, recTally, busy, elapsedWhole])

  // Recording from anywhere (the Edit stage's Record button, the R key) opens the
  // Sound Booth; Stop returns to where you were with the take already on the timeline.
  const returnStageRef = useRef<StudioStage | null>(null)
  const stageRef = useRef(stage)
  stageRef.current = stage
  useEffect(() => {
    if (!onGoToStage) return
    if (recording) {
      const from = stageRef.current
      if (from && from !== 'record') {
        returnStageRef.current = from
        onGoToStage('record')
      }
      return
    }
    const back = returnStageRef.current
    returnStageRef.current = null
    if (back) onGoToStage(back)
  }, [recording, onGoToStage])

  // Sound Booth: camera on by default when a camera exists (the size warning still
  // appears once — the host confirms before the preview opens). Asked once per mount.
  const camAutoAskedRef = useRef(false)
  useEffect(() => {
    if (!booth || camAutoAskedRef.current) return
    if (cams.length === 0 || cameraStreams.host || recording) return
    camAutoAskedRef.current = true
    void toggleCamera('host')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booth, cams.length])

  /** Talkback lives inside the guest panel; the booth transport mirrors and flips it. */
  const [talkbackState, setTalkbackState] = useState({ on: false, available: false })
  const talkbackControllerRef = useRef<((on: boolean) => void) | null>(null)
  const toggleTalkback = useCallback(() => {
    talkbackControllerRef.current?.(!talkbackState.on)
  }, [talkbackState.on])

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
    // Every frame goes to the live store; React state only ~10×/s so the editor is not
    // re-rendered 60 times a second for a clock that shows whole seconds.
    let lastState = 0
    const tick = () => {
      const elapsed = (performance.now() - recStartedAtRef.current) / 1000
      const t = punchRef.current + Math.max(0, elapsed)
      liveStore.set({ recClock: t, playhead: t })
      playheadRef.current = t
      const now = performance.now()
      if (now - lastState >= 100) {
        lastState = now
        setRecClock(t)
        setHead(t)
      }
      recRafRef.current = requestAnimationFrame(tick)
    }
    recRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current)
    }
  }, [recording, setHead, liveStore])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((event.target as HTMLElement | null)?.isContentEditable) return
      // Shift+/ (?) opens the keyboard-shortcuts help. Guarded above against typing.
      if (event.key === '?') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      // Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z (or Cmd/Ctrl+Y) redoes — from anywhere but a field.
      if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        if (event.key === 'y' || event.key === 'Y' || event.shiftKey) void redo()
        else void undo()
        return
      }
      // Cmd/Ctrl +/-/0 drive the timeline zoom (0 = Fit). Guarded against typing above.
      if (event.metaKey || event.ctrlKey) {
        if (event.key === '=' || event.key === '+') {
          event.preventDefault()
          zoomBy(1.25)
          return
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault()
          zoomBy(0.8)
          return
        }
        if (event.key === '0') {
          event.preventDefault()
          zoomToFit()
          return
        }
      }
      // Single-letter shortcuts only fire with nothing focused or with the timeline /
      // studio surface focused — never while a button or link has focus (a slip there
      // used to record or cut a hole).
      if (!shortcutTargetOk(event.target, rootRef.current)) return
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
      // Sound Booth: M mutes yourself, C toggles your camera (C marks a chapter elsewhere).
      if (booth && (event.key === 'm' || event.key === 'M') && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        toggleBoothMute('host')
        return
      }
      if (booth && (event.key === 'c' || event.key === 'C') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        if (!recording) void toggleCamera('host')
        return
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
        if (event.shiftKey && applyRangeAll) rippleDeleteEverything()
        else editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, event.shiftKey), event.shiftKey ? 'Ripple-deleted range' : 'Cut hole in lane')
      }
      if ((event.key === 'm' || event.key === 'M') && !recording && event.shiftKey) {
        event.preventDefault()
        // With a clip multi-selection, mute the selected clips; else mute the range.
        if (selectionClipIdsRef.current.size > 0) batchClips('mute')
        else editRange((t) => muteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Muted range on this lane')
      }
      // F — fade the selected clip(s): short in/out on each. Guarded against typing.
      if ((event.key === 'f' || event.key === 'F') && !recording && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        batchClips('fade')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, tracks, cameraClips, switchEdl, recMode, preroll, cueEnabled, selectedId, selectedCamClipId, playing, booth])

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

  const ZOOM_MIN = 12
  const ZOOM_MAX = 240
  const timelineViewportRef = useRef<HTMLDivElement>(null)
  function zoomBy(factor: number) {
    setZoom((z) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor))))
  }
  /** Fit the whole session (plus a little headroom) into the timeline viewport. */
  function zoomToFit() {
    const total = Math.max(1, sessionLen + 2)
    const px = timelineViewportRef.current?.clientWidth || 720
    const gutter = 180 // shared-ruler left gutter + padding
    const usable = Math.max(240, px - gutter)
    setZoom(Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, usable / total))))
    setTimelineScroll(0)
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

  function currentSnapshot(): Snapshot {
    return {
      tracks: snapshotTracks(tracks),
      cameras: cameraClips.map((c) => ({ ...c })),
      switchEdl: switchEdl.map((e) => ({ ...e })),
      selectedId,
      selectedCamClipId,
    }
  }

  function applySnapshot(snap: Snapshot) {
    tracks.forEach((t) => revokeUrl(t.url))
    setTracks(
      snap.tracks.map((t) => ({
        ...t,
        url: t.buffer ? bufferToUrl(t.buffer) : null,
      })),
    )
    setCameraClips(snap.cameras.map((c) => normalizeCameraClip({ ...c })))
    setSwitchEdl(snap.switchEdl || [])
    setSelectedId(snap.selectedId)
    setSelectedCamClipId(snap.selectedCamClipId)
    setApplied([])
  }

  async function undo() {
    const prev = historyRef.current.pop()
    setHistoryLen(historyRef.current.length)
    if (!prev) return
    redoRef.current.push(currentSnapshot())
    setRedoLen(redoRef.current.length)
    applySnapshot(prev)
    setOk('Undid last change')
  }

  async function redo() {
    const next = redoRef.current.pop()
    setRedoLen(redoRef.current.length)
    if (!next) return
    historyRef.current.push(currentSnapshot())
    setHistoryLen(historyRef.current.length)
    applySnapshot(next)
    setOk('Redid change')
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
      setSwitchEdl(saved.switchEdl || [])
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
      notifyError('Select a track with audio first')
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
      notifyOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} on insert rack · ${selected.name}`)
      return
    }
    pushHistory()
    setBusy(`Rendering ${id.replace('_', ' ')} on ${selected.name}…`)
    setError(null)
    try {
      const next = await applyEffect(cloneBuffer(selected.buffer), id)
      assignBufferToTrack(selected.id, next)
      setApplied((prev) => [...prev, id])
      notifyOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} baked into ${selected.name}`)
    } catch (err) {
      notifyError('Effect failed', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  function deviceKey(personId: string) {
    if (personId === 'guest' && remoteGuestRef.current) return REMOTE_GUEST_KEY
    if (remoteGuestsRef.current.has(personId)) return remoteLaneKey(personId)
    return people.find((p) => p.id === personId)?.inputDeviceId || micId || ''
  }

  /** Remote guest streams are owned by the guest panel: never stop them here. */
  function isRemoteStream(stream: MediaStream) {
    if (stream === remoteGuestRef.current) return true
    for (const s of remoteGuestsRef.current.values()) if (s === stream) return true
    return false
  }

  function stopLocalRecordStreams() {
    stopStreams(streamRef.current.filter((stream) => !isRemoteStream(stream)))
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
      const { blob, manifest } = await fetchGuestTakeBlob(url)
      if (blob.size < 64) throw new Error('Guest camera backup was empty')
      const objectUrl = URL.createObjectURL(blob)
      const fullDur = await measureVideoDuration(objectUrl)
      const full = Math.max(0.1, Number.isFinite(fullDur) && fullDur > 0 ? fullDur : 0.1)
      const placed = manifest?.startedAtSessionSec
      const clip: CameraClip = {
        id: newCameraClipId(),
        personId: 'guest',
        url: objectUrl,
        mime: blob.type || manifest?.mime || 'video/webm',
        offset: Math.max(0, typeof placed === 'number' && Number.isFinite(placed) ? placed : playheadRef.current),
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
      // Chunked guest backups (private://…/take/<invite>/<take>) are reassembled from
      // their signed-URL manifest and carry their own host-clock start; legacy single
      // objects still go through the media proxy + punch stamp.
      const { blob, manifest } = await fetchGuestTakeBlob(cleanUrl)
      if (blob.size < 64) throw new Error('Guest take was empty')
      const buffer = await decodeBlob(blob)
      const placed = manifest?.startedAtSessionSec
      if (typeof placed === 'number' && Number.isFinite(placed)) {
        setTracks((prev) => prev.map((t) => (t.id === guest.id ? { ...t, offset: Math.max(0, placed) } : t)))
      } else if (align != null && Math.abs(align) > 0.0005) {
        // Shift the lane before laying the buffer so assignBufferToTrack rebuilds the
        // clip at the aligned offset. Fall back to the raw punch offset when there is
        // no usable stamp — the av-sync drift badge + manual nudge remain the net.
        setTracks((prev) =>
          prev.map((t) =>
            t.id === guest.id ? { ...t, offset: Math.max(0, t.offset + align) } : t,
          ),
        )
      }
      const missing = manifest?.missing?.length || 0
      const note =
        typeof placed === 'number' && Number.isFinite(placed)
          ? `Remote guest backup laid on ${guest.name} at ${formatClock(Math.max(0, placed))}${missing ? ` · ${missing} upload part${missing === 1 ? '' : 's'} never arrived — expect a gap there` : ''}`
          : align != null && Math.abs(align) > 0.0005
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

  async function toggleRecord(modeOverride?: RecMode) {
    const mode = modeOverride ?? recMode
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
        ? punchInTime(mode, playheadNow, tracks, jobs[0].lane.personId)
        : sharedPunchInTime(
            mode,
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
    liveStore.resetPeaks()
    stopMix()

    try {
      idleStopRef.current.forEach((fn) => fn())
      idleStopRef.current = []
      stopStreams(idleStreamRef.current)
      idleStreamRef.current = []
      // Storage-quota preflight — crash-safe autosave needs room to checkpoint.
      if (episodeId) {
        // Ask the browser not to evict the studio's storage (checkpoints + autosave) under pressure.
        void requestPersistentStorage()
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
      const localKeys = uniqueDevices.filter((key) => !isRemoteLaneKey(key))
      const streams = localKeys.length
        ? await openInputStreams(localKeys, rawInput)
        : new Map<string, MediaStream>()
      if (uniqueDevices.includes(REMOTE_GUEST_KEY)) {
        const remote = remoteGuestRef.current
        if (!remote) throw new Error('Guest is not connected. Wait for them to join, or un-arm Guest.')
        streams.set(REMOTE_GUEST_KEY, remote)
      }
      // Panel shows: guests 2..n record from their own room stream.
      for (const key of uniqueDevices) {
        if (!isRemoteLaneKey(key) || key === REMOTE_GUEST_KEY) continue
        const personId = key.slice('remote:'.length)
        const remote = remoteGuestsRef.current.get(personId)
        if (!remote) {
          const who = people.find((p) => p.id === personId)?.name || 'A panel guest'
          throw new Error(`${who} is not in the room. Wait for them to join, or un-arm their lane.`)
        }
        streams.set(key, remote)
      }
      if (ac.signal.aborted) {
        stopStreams([...streams.values()].filter((stream) => !isRemoteStream(stream)))
        finishRecCleanup()
        recordingRef.current = false
        setRecording(false)
        return
      }
      streamRef.current = [...streams.values()].filter((stream) => !isRemoteStream(stream))
      const hostKey = people.find((p) => p.id === 'host')?.inputDeviceId || micId || ''
      setHostTalkStream(streams.get(hostKey) || [...streams.values()].find((s) => !isRemoteStream(s)) || null)
      stopMeterRef.current = jobs.map((job) => {
        const stream = streams.get(job.key)
        if (!stream) return () => {}
        const meterKey = job.sharedNames.join(' + ') || 'mic'
        return attachInputMeter(stream, (peak) => {
          liveStore.setPeak(meterKey, peak)
          if (peak >= 0.98) {
            liveStore.setClip(meterKey, true)
            const timers = clipTimerRef.current
            if (timers[meterKey]) window.clearTimeout(timers[meterKey])
            timers[meterKey] = window.setTimeout(() => liveStore.setClip(meterKey, false), 1600)
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

      // One shared 48 kHz context for the count-in, the cue mix and every mic capture, so
      // their frame clocks are directly comparable (sample-accurate punch alignment).
      let sessionCtx = sessionCtxRef.current
      if (!sessionCtx || sessionCtx.state === 'closed') {
        sessionCtx = createSessionContext()
        sessionCtxRef.current = sessionCtx
      }
      await sessionCtx.resume().catch(() => {})

      if (countInBeats > 0) {
        setRecTally('count-in')
        setOk('Count-in…')
        await playCountIn(countInBeats, bpm, ac.signal, sessionCtx)
      }

      setRecTally('rec')

      if (cueEnabled || cueToGuestRef.current) {
        const prepared = await tracksWithInserts(tracks)
        const cue = startLiveMix(prepared, {
          fromSec: cueStart,
          excludeIds,
          gain: cueGain,
          monitor: cueEnabled,
          context: sessionCtx,
        })
        cueRef.current = cue
        publishGuestCue(cue)
        if (cue) await cue.ctx.resume()
      }

      const prerollSec = punch - cueStart
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      const recTrim = Math.max(0, prerollSec)
      const captureRate = sessionCtx.sampleRate || cueRef.current?.ctx.sampleRate || sampleRateProbe()
      watchdogsRef.current = []
      // Per-lane failure isolation: one mic that will not open must not cancel the others.
      const settled = await Promise.allSettled(
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
            capture: await startLaneCapture(job.lane.id, stream, { checkpoint, watchdog, context: sessionCtx }),
          }
        }),
      )
      const captures = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      const laneFailures = settled.flatMap((r, i) =>
        r.status === 'rejected'
          ? [`${jobs[i].sharedNames.join(' + ') || 'Voice'}: ${r.reason instanceof Error ? r.reason.message : 'could not start'}`]
          : [],
      )
      if (captures.length === 0) {
        throw new Error(laneFailures[0] || 'No microphone could be started')
      }
      if (laneFailures.length) {
        notifyError('Recording without every voice', `${laneFailures.join(' · ')} — the other mics are rolling.`)
      }
      // Device / permission watchdog: unplugged mic, OS mute, permission pulled, Safari interruption.
      inputWatchStopRef.current?.()
      setInputLost(null)
      inputWatchStopRef.current = watchInputs(
        captures.map((c) => ({ label: c.job.sharedNames.join(' + ') || 'Mic', stream: streams.get(c.job.key)! })),
        (label, reason) => setInputLost(`${label} ${reason}`),
        [sessionCtx],
      )
      capturesRef.current = captures.map((c) => c.capture)
      recorderRef.current = captures.map((c) => c.capture)
      const camJobs = liveCameraJobs()
      const camCaptures = camJobs.map((job) => startCameraCapture(job.person.id, job.stream))
      cameraCapturesRef.current = camCaptures

      const cueForAlign = cueRef.current
      void Promise.all([
        Promise.allSettled(captures.map((c) => c.capture.done)),
        Promise.all(camCaptures.map((c) => c.done.catch(() => new Blob()))),
      ]).then(async ([blobResults, camBlobs]) => {
        const blobs = blobResults.map((r) => (r.status === 'fulfilled' ? r.value : null))
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
          const decoded: { lane: StudioTrack; buffer: AudioBuffer; sharedNames: string[]; late: number }[] = []
          for (let i = 0; i < captures.length; i++) {
            const blob = blobs[i]
            const capture = captures[i].capture
            // Worklet captures hand back their float result directly (no WAV decode round-trip).
            let buffer = capture.buffer?.() || null
            if (!buffer) {
              if (!blob || blob.size < 64) continue
              buffer = await bufferFromBlob(blob)
            }
            // Preroll + device/round-trip latency (+ cue-vs-capture frame delta when they share a
            // clock). Negative = the capture began after the punch point: lay it later, don't trim.
            const align = capture.timing
              ? punchAlignSec({
                  prerollSec: recTrim,
                  capture,
                  cue: cueForAlign,
                  compensateLatency: captures[i].job.key !== REMOTE_GUEST_KEY,
                })
              : recTrim
            const trim = Math.max(0, align)
            const late = Math.max(0, -align)
            if (trim > 0.04) {
              if (buffer.duration <= trim + 0.08) continue
              buffer = sliceBuffer(buffer, trim, buffer.duration)
            }
            decoded.push({
              lane: captures[i].job.lane,
              buffer,
              sharedNames: captures[i].job.sharedNames,
              late,
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
            for (const { lane, buffer, sharedNames, late } of decoded) {
              const person = people.find((p) => p.id === lane.personId)
              const reuse =
                replaceArmed && lane.buffer
                  ? next.find((t) => t.id === lane.id)
                  : emptyTakeForPerson(next, lane.personId) || (lane.buffer ? null : next.find((t) => t.id === lane.id))
              const offset = (replaceArmed && reuse?.buffer ? reuse.offset : punch) + late
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
                  offset,
                  armed: true,
                  volume: 1,
                  listen: true,
                  inserts: cleanup || [],
                  clips: [fullClipForBuffer(buffer, offset, 0.05, 0.15, syncGroup)],
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
                ? `Host + Guest takes at ${formatClock(punch)} — two mics, one button${autoMuteQuiet ? ' · quieter mic ducks while the other talks' : ''}${voiceIsolate ? ' · voice clean-up on' : ''}${camNote}`
                : decoded[0]?.sharedNames.length > 1
                  ? `Shared mic — ${decoded[0].sharedNames.join(' + ')} on one take at ${formatClock(punch)}${camNote}`
                  : `Take at ${formatClock(punch)} — it is on the timeline below${camNote}`,
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
      // Session time now (captures live at the punch) ↔ wall clock: rides the record-on
      // signal so each guest's chunked backup lands at the right place on the timeline.
      setGuestRecClock({ sec: punch, at: Date.now() })
      // Start capturing active-speaker switches now that the session clock anchor
      // (recStartedAtRef) is set — atSec below is measured off the same anchor as
      // the record clock, so cuts land on the timeline where the talker flips.
      startSwitchCapture(
        jobs
          .map((job) => ({ id: job.lane.personId, stream: streams.get(job.key) }))
          .filter((p): p is { id: string; stream: MediaStream } => Boolean(p.stream)),
      )
      const camCount = cameraCapturesRef.current.length
      setOk(
        `Recording ${recLabel} from ${formatClock(punch)}${cueEnabled ? ' · mix in headphones' : ''}${
          cueToGuestRef.current ? ' · cue to guest' : ''
        }${camCount ? ` · ${camCount} camera${camCount === 1 ? '' : 's'}` : ''}`,
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
    inputWatchStopRef.current?.()
    inputWatchStopRef.current = null
    cueRef.current?.stop()
    cueRef.current = null
    publishGuestCue(mixRef.current)
    stopMeterRef.current.forEach((fn) => fn())
    stopMeterRef.current = []
    stopSwitchCapture()
  }

  /**
   * Capture live active-speaker switches into the EDL while recording.
   *
   * A lightweight AnalyserNode meters each participant that can be MAIN (host mic,
   * remote guest audio, any local camera-audio lane). A few times a second we read
   * their peak levels and feed them — with the *monotonic* performance.now() clock —
   * to the active-speaker tracker. When the tracker's MAIN flips, we append a switch
   * at the current session-clock time (punch + elapsed) with reason 'auto'. The EDL
   * op keeps it sorted/deterministic; we dedupe consecutive same-main cuts on stop.
   */
  function startSwitchCapture(participantStreams: Array<{ id: string; stream: MediaStream }>) {
    stopSwitchCapture()
    const metered = participantStreams.filter((p) => p.stream.getAudioTracks().length > 0)
    if (metered.length === 0) return

    let ctx: AudioContext
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    const analysers: Array<{ id: string; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }> = []
    for (const { id, stream } of metered) {
      try {
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        analysers.push({ id, analyser, data: new Uint8Array(new ArrayBuffer(analyser.fftSize)) })
      } catch {
        /* a stream without a usable audio track is simply skipped */
      }
    }
    if (analysers.length === 0) {
      void ctx.close()
      return
    }

    const tracker = createActiveSpeakerTracker()
    // Seed the tracker with whatever is currently MAIN so the first live flip
    // (not the initial adoption) produces the first captured cut.
    let lastMain: string | null = null
    const SAMPLE_MS = 120 // ~8 Hz — comfortably faster than the tracker's holdMs.
    const interval = window.setInterval(() => {
      if (!recLiveRef.current) return
      const samples = analysers.map(({ id, analyser, data }) => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128)
        return { id, level: peak }
      })
      const main = tracker.update(samples, performance.now())
      if (main && main !== lastMain) {
        lastMain = main
        const atSec = punchRef.current + Math.max(0, (performance.now() - recStartedAtRef.current) / 1000)
        setSwitchEdl((edl) => addSwitch(edl, { atSec, mainId: main, reason: 'auto' }))
      }
    }, SAMPLE_MS)

    speakerTrackerStopRef.current.push(() => {
      window.clearInterval(interval)
      void ctx.close()
    })
  }

  function stopSwitchCapture() {
    const fns = speakerTrackerStopRef.current
    speakerTrackerStopRef.current = []
    fns.forEach((fn) => {
      try {
        fn()
      } catch {
        /* teardown is best-effort */
      }
    })
    // Collapse any no-op consecutive same-main cuts the live pass may have left.
    setSwitchEdl((edl) => (edl.length ? dedupeEdl(edl) : edl))
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
      setError('Arm two recorded takes, then Follow talker. Recordings stay; only the volume moves.')
      return
    }
    pushHistory()
    const result = applyFollowTalker(tracks, armed[0].id, armed[1].id)
    setTracks(result.tracks)
    setOk(
      `Follow talker: gain-sharing automation written (ducked ${formatClock(result.mutedA)} / ${formatClock(result.mutedB)}). Both recordings kept — no hard mutes.`,
    )
  }

  function editRange(fn: (track: StudioTrack) => StudioTrack, label: string) {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    if (b - a < 0.05) {
      notifyError('Select a range first', 'Drag a range on the timeline (empty lane or ruler), then use the lane tools')
      return
    }
    const ids = applyRangeAll
      ? tracks.filter((t) => t.buffer).map((t) => t.id)
      : selected
        ? [selected.id]
        : []
    if (ids.length === 0) {
      notifyError('Select a lane first')
      return
    }
    pushHistory()
    setTracks((prev) => prev.map((t) => (ids.includes(t.id) ? fn(t) : t)))
    notifyOk(label)
  }

  /**
   * Ripple delete on the whole session clock: the range leaves every audio lane, every
   * picture lane and the camera-switch cuts, and everything after it moves left together —
   * linked picture never drifts from its audio. (Per-lane ripple stays on the lane tools.)
   */
  function rippleDeleteEverything() {
    const cur = rangeRef.current
    const a = Math.min(cur.start, cur.end)
    const b = Math.max(cur.start, cur.end)
    if (b - a < 0.05) {
      notifyError('Select a range first', 'Drag a range on the timeline, then Ripple delete')
      return
    }
    pushHistory()
    const next = rippleDeleteSession({ tracks, cameras: cameraClips, switchEdl }, a, b)
    setTracks(next.tracks)
    setCameraClips(next.cameras)
    setSwitchEdl(next.switchEdl)
    notifyOk(`Ripple-deleted ${formatClock(b - a)} from every lane`, {
      description: 'Audio, picture and camera cuts all moved together — nothing drifts.',
    })
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
      const mixed = await buildMasterMix(false)
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
      notifyOk(`${mode === 'pip' ? 'PIP' : 'A-roll'} downloaded`, {
        description: `${a.download}${blob.size ? ` · ${formatBytes(blob.size)}` : ''}${
          usedRealtime ? ' · realtime encode' : ''
        } — public RSS is still the audio mix`,
      })
    } catch (err) {
      notifyError('Picture export failed', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  /**
   * One-click video deliverable: the edited camera timeline muxed with the same
   * mixed master audio the audio export uses. MP4 (H.264/AAC) preferred; WebM fallback.
   * Local download only — never touches episode.audio_url / the RSS mix.
   */
  async function downloadDeliverable(prebuiltMaster?: AudioBuffer, manageBusy = true) {
    const host = cameraClips.filter((c) => c.personId === 'host')
    const guest = cameraClips.filter((c) => c.personId === 'guest')
    if (host.length === 0 && guest.length === 0) {
      setError('Record or import a camera file first — the MP4 deliverable needs picture')
      return false
    }
    const mode: PictureMode = guest.length > 0 ? 'pip' : 'a-roll'
    if (manageBusy) {
      setBusy('Encoding MP4 (picture + master mix)…')
      setError(null)
      setOk(null)
    }
    try {
      // Reuse the audio-export master so the video carries the identical master mix.
      // When the combined "Export episode" action supplies `prebuiltMaster`, we mux
      // the exact same buffer that produced the podcast-feed file; standalone use
      // rebuilds it here through the shared `buildMasterMix` so both paths match
      // (mixdown → gain/fades → −LUFS match → limiter).
      const master = prebuiltMaster ?? (await buildMasterMix(false))
      const overlays = cameraClips.filter((c) => cameraLayer(c) === 'overlay')
      // EDL-aware export: group base (non-overlay) camera clips by participant so the
      // MP4 follows the edited cuts. renderCameraDeliverable ignores edl/sources when
      // the EDL is empty or fewer than two participants have picture, degrading to the
      // classic host/guest single/PIP path — so the audio-only export is unaffected.
      const baseClips = cameraClips.filter((c) => cameraLayer(c) !== 'overlay')
      const sourcesByPerson = new Map<string, CameraClip[]>()
      for (const clip of baseClips) {
        const list = sourcesByPerson.get(clip.personId)
        if (list) list.push(clip)
        else sourcesByPerson.set(clip.personId, [clip])
      }
      const sources = [...sourcesByPerson.entries()].map(([participantId, clips]) => ({
        participantId,
        clips,
      }))
      const fallbackId = host.length ? 'host' : guest[0]?.personId
      const out = await renderCameraDeliverable({
        host: [...(host.length ? host : cameraClips.filter((c) => c.personId === guest[0]?.personId)), ...overlays],
        guest: mode === 'pip' ? guest : null,
        master,
        mode,
        edl: switchEdl,
        sources,
        fallbackId,
        fileStem: `${slugFile(title)}-program`,
        onProgress: (ratio, info) => {
          setBusy(
            info?.realtime
              ? `Encoding MP4 ${Math.round(ratio * 100)}% — keep this tab open`
              : `Encoding MP4 ${Math.round(ratio * 100)}%`,
          )
        },
      })
      const url = URL.createObjectURL(out.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = out.filename
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      if (onVideoExported) {
        try {
          await onVideoExported(new File([out.blob], out.filename, { type: out.blob.type || 'video/mp4' }))
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Video upload failed')
        }
      }
      if (manageBusy) {
        notifyOk(`Downloaded ${out.ext.toUpperCase()} deliverable`, {
          description: `${out.filename}${out.blob.size ? ` · ${formatBytes(out.blob.size)}` : ''}${
            out.realtime ? ' · realtime encode' : ''
          } — public RSS is still the audio mix`,
        })
      }
      return true
    } catch (err) {
      if (manageBusy) notifyError('MP4 deliverable failed', err instanceof Error ? err.message : undefined)
      else setError(err instanceof Error ? err.message : 'MP4 deliverable failed')
      return false
    } finally {
      if (manageBusy) setBusy(null)
    }
  }

  /**
   * Combined "Export episode" — one action, both deliverables from ONE master mix.
   *
   * 1. Builds the finished master AudioBuffer ONCE via `buildMasterMix` (full session,
   *    no range scope) so the audio in the video is byte-identical to the feed audio.
   * 2. ALWAYS produces the audio-only podcast-feed file (Apple/Spotify via RSS) by
   *    encoding that master and handing it to `onExported` → episode.audio_url. This
   *    is the priority: it runs first and is never blocked by the video step.
   * 3. WHEN the session has picture (`hasVideo`), ALSO muxes that same master with the
   *    edited camera timeline (following the switch EDL when present) into an MP4 for
   *    YouTube/social and downloads it. If the video encode fails, the audio file is
   *    already delivered and we only surface the video error.
   *
   * RSS/publish logic is untouched: the audio-only file remains the feed enclosure;
   * the video is a local download only.
   */
  async function exportEpisode(thenPublish = false) {
    if (!hasAudio) {
      notifyError('Nothing to export', 'Record or import onto a track first')
      return
    }
    if (!confirmReplaceAudio(resolveExportRange('full', range, sessionLen))) return
    setError(null)
    setOk(null)
    const notes: string[] = []
    let audioSaved = false
    let master: AudioBuffer
    try {
      // Sub-step 1 — Building mix.
      setBusy('Building mix (shared by audio + video)…')
      master = await buildMasterMix(false)
    } catch (err) {
      setBusy(null)
      notifyError('Could not build the master mix', err instanceof Error ? err.message : undefined)
      return
    }

    // Part 1 — audio-only podcast-feed file. Priority deliverable; runs first.
    // Sub-step 2 — Loudness + 3 — Encoding are handled inside exportAudio/buildMasterMix.
    setBusy(thenPublish ? 'Loudness → Encoding → saving audio + publishing…' : 'Loudness → Encoding audio (Apple & Spotify)…')
    const audioOk = (await exportAudio('mp3', thenPublish, master, false)) === true
    audioSaved = audioOk
    notes.push(audioOk ? 'Audio for Apple & Spotify saved to the feed' : 'Audio export failed')

    // Part 2 — video for YouTube & social. Only when the session has picture. A video
    // failure must NOT block or undo the podcast-feed file already delivered above.
    if (hasVideo) {
      // Sub-step 4 — Muxing (progress % streamed into busy by downloadDeliverable).
      setBusy('Muxing video for YouTube & social (picture + master mix)…')
      const videoOk = await downloadDeliverable(master, false)
      notes.push(videoOk ? 'Video for YouTube & social downloaded' : 'Video encode failed — audio feed file is unaffected')
    } else {
      notes.push('No picture in this session — video step skipped')
    }

    setBusy(null)
    // Success/summary. On success in the Record stage, offer a jump to the editor.
    const summary = notes.join(' · ')
    if (audioSaved) {
      const action =
        onGoToStage && stage === 'record'
          ? { label: 'View in editor', onClick: () => onGoToStage('edit') }
          : undefined
      notifyOk(thenPublish ? 'Episode exported + published' : 'Episode exported', {
        description: summary,
        action,
      })
    } else {
      notifyError('Export finished with problems', summary)
    }
  }

  async function downloadStems() {
    if (!hasAudio) return
    setBusy('Packing stems zip…')
    setError(null)
    try {
      const prepared = await tracksWithInserts(tracks)
      const files: { name: string; data: Uint8Array }[] = []
      // Same master render as the feed file (mixdown → gain/fades → loudness → true-peak limiter).
      const mixed = await buildMasterMix(false)
      const mixBytes = new Uint8Array(await (await encodeMp3(mixed, { tags: { title } })).arrayBuffer())
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
      notifyOk(`Downloaded ${files.length - 1} stems + mix`, {
        description: `${a.download}${zip.size ? ` · ${formatBytes(zip.size)}` : ''}`,
      })
    } catch (err) {
      notifyError('Stems zip failed', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  /**
   * Build the finished, delivery-ready **master mix** exactly as the audio export
   * bakes it: mixdown → master gain/fades → optional −LUFS match → limiter. This is
   * the single source of truth for BOTH deliverables — the audio-only podcast-feed
   * file and the muxed video — so the audio in the video is byte-identical to the
   * audio the RSS enclosure carries. Pass `scopeToRange` to honor a selected range
   * (only used by the standalone audio export; the combined "Export episode" action
   * always renders the full session so both files share one buffer).
   */
  async function buildMasterMix(scopeToRange: boolean): Promise<AudioBuffer> {
    const prepared = await tracksWithInserts(tracks)
    // Whole episode unless the host explicitly chose "Selection only" (and one exists).
    const win = resolveExportRange(scopeToRange ? exportScope : 'full', range, sessionLen)
    const { buffer, lufs, truePeakDb } = await renderMaster(prepared, {
      startSec: win.isFull ? undefined : win.start,
      endSec: win.isFull ? undefined : win.end,
      matchLufs,
      targetLufs: PODCAST_LUFS,
      gainDb: masterGain > 0 ? 20 * Math.log10(masterGain) : -80,
      fadeInSec: masterFadeIn,
      fadeOutSec: masterFadeOut,
    })
    if (Number.isFinite(lufs)) setLoudness({ lufs, peakDb: truePeakDb })
    return buffer
  }

  /** The export window the standalone audio export will use (for the UI readout + confirms). */
  const exportWindow = resolveExportRange(exportScope, range, sessionLen)
  const hasSelection = selectionOf(range, sessionLen) != null && !resolveExportRange('selection', range, sessionLen).isFull

  /**
   * Saving over existing episode audio asks first; over a published episode it asks harder.
   * A far-too-short selection export is called out in the same dialog.
   */
  function confirmReplaceAudio(win: ReturnType<typeof resolveExportRange>): boolean {
    const notes: string[] = []
    const short = shortExportWarning(win, sessionLen)
    if (short) notes.push(short)
    const warn = replaceWarning({ hasExistingAudio: Boolean(audioUrl), published: episodeStatus === 'published' })
    if (warn === 'published') {
      notes.push('This episode is already published. Saving replaces the audio listeners get from the feed.')
    } else if (warn === 'replace') {
      notes.push('This replaces the audio already saved on this episode.')
    }
    if (notes.length === 0) return true
    return window.confirm(`${notes.join('\n\n')}\n\nSave ${describeExportRange(win)}?`)
  }

  /**
   * Encode + deliver the audio-only podcast-feed file (Apple/Spotify/RSS enclosure).
   * When `prebuiltMaster` is supplied (combined "Export episode" flow) the mix is not
   * rebuilt — the exact buffer that also feeds the video encoder is encoded here, so
   * the two deliverables carry identical audio. `manageBusy=false` lets the combined
   * action own the busy/status text across both parts.
   */
  async function exportAudio(
    kind: 'wav' | 'mp3',
    thenPublish = false,
    prebuiltMaster?: AudioBuffer,
    manageBusy = true,
  ) {
    if (!hasAudio) {
      setError('Nothing to export — record or import onto a track first')
      return
    }
    // The combined action already confirmed; the standalone export confirms here.
    if (!prebuiltMaster && !confirmReplaceAudio(exportWindow)) return
    if (manageBusy) {
      setBusy(thenPublish ? 'Mixing, saving & preparing publish…' : kind === 'wav' ? 'Mixing WAV…' : 'Mixing MP3…')
      setError(null)
      setOk(null)
    }
    try {
      // Reuse the shared master when the combined action already built it; otherwise
      // build one here (honoring an explicit "Selection only" for the standalone export).
      const mixed = prebuiltMaster ?? (await buildMasterMix(true))
      const after = measureLoudness(mixed)
      if (Number.isFinite(after.lufs)) setLoudness({ lufs: after.lufs, peakDb: after.peakDb })
      const blob =
        kind === 'wav'
          ? encodeWav(mixed)
          : await encodeMp3(mixed, {
              tags: {
                title,
                chapters: (chapters || []).map((c) => ({ title: c.title, startSec: c.start_ms / 1000 })),
              },
            })
      const ext = kind === 'wav' ? 'wav' : 'mp3'
      const file = new File(
        [blob],
        `${title.replace(/[^\w]+/g, '-').slice(0, 48) || 'episode'}-mix.${ext}`,
        { type: blob.type },
      )

      // Validate the *delivered* file, not just the pre-encode mix: re-decode the
      // exact blob and confirm it still lands on the LUFS target and carries a real
      // duration. A lossy encoder or limiter that clawed loudness back shows up here.
      const warnings: string[] = []
      let durationSeconds = mixed.duration
      try {
        const rendered = await decodeBlob(blob)
        if (Number.isFinite(rendered.duration) && rendered.duration > 0) {
          durationSeconds = rendered.duration
        }
        if (matchLufs) {
          const verdict = verifyLufs(rendered, PODCAST_LUFS, LUFS_TOLERANCE)
          if (Number.isFinite(verdict.lufs)) setLoudness({ lufs: verdict.lufs, peakDb: verdict.peakDb })
          if (!verdict.onTarget) {
            warnings.push(
              `Rendered mix is ${verdict.lufs.toFixed(1)} LUFS (${verdict.deltaLu >= 0 ? '+' : ''}${verdict.deltaLu.toFixed(1)} LU off the ${PODCAST_LUFS} target). ` +
                (verdict.deltaLu > 0 ? 'The limiter held it hotter than target.' : 'It came out quieter than target.'),
            )
          }
        }
      } catch {
        /* Re-decode is a validation nicety; the mix duration is a safe fallback. */
      }

      // Never hand off a null/NaN duration — the RSS enclosure needs > 0.
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) durationSeconds = mixed.duration || 0

      // Non-blocking feed-compliance hint at export time, mirroring the publish gate,
      // so an unusable enclosure (0 bytes / 0 duration / bad mime) surfaces here.
      try {
        const gate = checkFeedCompliance({
          title,
          audio_url: 'about:blank', // a real URL is assigned after upload; not the check we care about here
          audio_mime: blob.type,
          duration_seconds: durationSeconds,
          file_size: file.size,
          cover_url: 'about:blank', // cover is managed in the episode form, out of scope for the editor
          chapters: chapters ?? null,
          summary: '',
        })
        const relevant = gate.blockers.filter((b) => ['file_size', 'duration', 'audio_mime', 'chapters', 'title'].includes(b.id))
        for (const b of relevant) warnings.push(b.detail || `${b.label} is not feed-ready`)
      } catch {
        /* compliance hint is advisory only */
      }

      await onExported(file, durationSeconds)
      setDirty(false)
      if (warnings.length) {
        notifyError('Saved — check before publish', warnings.join(' · '))
      }
      if (manageBusy) {
        notifyOk(thenPublish ? 'Mix saved to site host' : `Saved ${ext.toUpperCase()} mix to episode`, {
          description: `${file.name} · ${formatBytes(file.size)} · ${formatClock(durationSeconds)}`,
        })
      }
      if (thenPublish && onPublished) await onPublished()
      return true
    } catch (err) {
      if (manageBusy) notifyError('Export failed', err instanceof Error ? err.message : undefined)
      else setError(err instanceof Error ? err.message : 'Export failed')
      return false
    } finally {
      if (manageBusy) setBusy(null)
    }
  }

  const durationLabel = formatClock(sessionDuration(tracks))
  const peakDb = meter ? dbFromLinear(meter.peak) : null
  const rmsDb = meter ? dbFromLinear(meter.rms) : null
  const recHint = REC_MODE_META.find((m) => m.id === recMode)?.hint
  const boardDuration = Math.max(30, playhead + 8, sessionLen) + 4

  // Participants that can be MAIN in a camera switch — the voice people (each owns a
  // camera lane). mainId matches the EDL's CameraSwitchEvent.mainId / personId.
  const switchParticipants = useMemo(
    () => people.filter((p) => p.kind === 'voice').map((p) => ({ id: p.id, name: p.name })),
    [people],
  )

  // Waveform source for the camera lane: a person's audible (listen) take buffer,
  // falling back to their armed take, then their first take with audio.
  const audioForPerson = useCallback(
    (personId: string): AudioBuffer | null => {
      const owned = tracks.filter((t) => t.personId === personId && t.buffer)
      const anchor =
        owned.find((t) => t.listen) || owned.find((t) => t.armed) || owned[0]
      return anchor?.buffer ?? null
    },
    [tracks],
  )
  // Magnetic-snap anchors for a lane edit: that lane's other clip edges, the
  // playhead, and the loop-range bounds. Snap quantizes to a 0.1s grid and magnets
  // onto any anchor within a few pixels (converted to seconds via the current zoom).
  const snapAnchors = useCallback(
    (track: StudioTrack | null | undefined, excludeClipId?: string): number[] => {
      const edges = track
        ? clipsOf(track)
            .filter((c) => c.id !== excludeClipId)
            .flatMap((c) => [c.offset, c.offset + c.duration])
        : []
      const rng = rangeRef.current
      return [...edges, playheadRef.current, rng.start, rng.end].filter((n) => Number.isFinite(n) && n >= 0)
    },
    [],
  )
  const applySnap = useCallback(
    (time: number, track: StudioTrack | null | undefined, excludeClipId?: string): number => {
      if (!snap) return time
      return snapTime(time, SNAP_GRID, snapAnchors(track, excludeClipId), SNAP_MAGNET / Math.max(1, zoom))
    },
    [snap, snapAnchors, zoom],
  )

  // Multi-select: primary is selectedClipId; extras live in multiSel keyed by clipId.
  const selectionClipIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(multiSel))
    if (selectedClipId) ids.add(selectedClipId)
    return ids
  }, [multiSel, selectedClipId])
  selectionClipIdsRef.current = selectionClipIds

  /**
   * Batch clip operation across the current multi-selection (or the single selected
   * clip). Runs one history snapshot, then maps the op over every selected clip,
   * grouped by its lane. `fade` sets a short in/out; `mute` toggles muted on; `gain`
   * scales clip gain by the supplied factor.
   */
  function batchClips(op: 'fade' | 'mute' | 'gain', arg?: number) {
    const ids = selectionClipIdsRef.current
    if (ids.size === 0) {
      notifyError('Select a clip first', 'Click a clip (Cmd/Ctrl-click to add more), then use clip tools')
      return
    }
    pushHistory()
    setTracks((prev) =>
      prev.map((t) => {
        const mine = clipsOf(t).filter((c) => ids.has(c.id))
        if (mine.length === 0) return t
        let next = t
        for (const clip of mine) {
          if (op === 'fade') {
            const dur = clip.duration
            next = setClipFades(next, clip.id, Math.min(0.25, dur / 3), Math.min(0.4, dur / 3))
          } else if (op === 'mute') {
            next = setClipGain(next, clip.id, clip.gain ?? 1, !clip.muted)
          } else if (op === 'gain') {
            next = setClipGain(next, clip.id, Math.max(0, (clip.gain ?? 1) * (arg ?? 1)))
          }
        }
        return next
      }),
    )
    const label =
      op === 'fade'
        ? `Faded ${ids.size} clip${ids.size === 1 ? '' : 's'}`
        : op === 'mute'
          ? `Muted ${ids.size} clip${ids.size === 1 ? '' : 's'}`
          : `Adjusted gain on ${ids.size} clip${ids.size === 1 ? '' : 's'}`
    notifyOk(label)
  }

  /** Simple view hides empty take slots: only takes with audio, the armed slot, and the
   *  selected one show. Advanced shows every slot. Recording is never affected — the
   *  hidden slots still exist and fill in the moment audio lands on them. */
  const visibleTrackIds = useMemo(() => {
    if (advanced) return new Set(tracks.map((t) => t.id))
    const ids = new Set<string>()
    for (const t of tracks) if (t.buffer || t.armed || t.id === selectedId) ids.add(t.id)
    // A person with nothing yet still gets their first slot so the lane is visible.
    for (const person of people) {
      if (tracks.some((t) => t.personId === person.id && ids.has(t.id))) continue
      const first = tracks.filter((t) => t.personId === person.id).sort((a, b) => a.take - b.take)[0]
      if (first && person.kind === 'voice') ids.add(first.id)
    }
    return ids
  }, [advanced, tracks, people, selectedId])
  const visibleTracks = useMemo(
    () => (advanced ? tracks : tracks.filter((t) => visibleTrackIds.has(t.id))),
    [advanced, tracks, visibleTrackIds],
  )
  /** Beds / SFX lanes with nothing on them stay out of the simple view. */
  const visiblePeople = useMemo(
    () =>
      advanced ? people : people.filter((p) => p.kind === 'voice' || visibleTracks.some((t) => t.personId === p.id)),
    [advanced, people, visibleTracks],
  )

  function voiceCleanupOn(track: StudioTrack) {
    const ids = new Set((track.inserts || []).filter((slot) => !slot.bypass).map((slot) => slot.id))
    return VOICE_CLEANUP_INSERTS.every((slot) => ids.has(slot.id))
  }
  /** One-click voice clean-up: the same non-destructive inserts Record applies (high-pass + RNNoise). */
  function toggleVoiceCleanup(trackId: string) {
    const track = tracks.find((t) => t.id === trackId)
    if (!track?.buffer) return
    pushHistory()
    const on = voiceCleanupOn(track)
    const cleanupIds = new Set(VOICE_CLEANUP_INSERTS.map((slot) => slot.id))
    const inserts = on
      ? (track.inserts || []).filter((slot) => !cleanupIds.has(slot.id))
      : [...VOICE_CLEANUP_INSERTS.map((slot) => ({ ...slot })), ...(track.inserts || []).filter((slot) => !cleanupIds.has(slot.id))]
    invalidateInsertCache(trackId)
    updateTrack(trackId, { inserts })
    notifyOk(on ? `Voice clean-up off · ${track.name}` : `Voice clean-up on · ${track.name}`, {
      description: on ? undefined : 'Background noise and rumble are reduced on playback and export — the take itself is untouched',
    })
  }

  const timelineBoard = {
    people,
    tracks: visibleTracks,
    playhead,
    pxPerSec: zoom,
    selectedId: selected?.id || null,
    selectedClipId,
    selectedClipIds: selectionClipIds,
    snap,
    range,
    loop,
    durationSec: boardDuration,
    scrollLeft: timelineScroll,
    onScrollLeft: setTimelineScroll,
    onSelect: (id: string, clipId: string | null, additive = false) => {
      setSelectedId(id)
      if (additive && clipId) {
        // Cmd/Ctrl-click toggles a clip in/out of the multi-selection.
        setMultiSel((prev) => {
          const next = { ...prev }
          const anchor = selectedClipId
          if (anchor && anchor !== clipId && !next[anchor]) next[anchor] = id
          if (next[clipId]) delete next[clipId]
          else next[clipId] = id
          return next
        })
        setSelectedClipId(clipId)
        return
      }
      setMultiSel({})
      setSelectedClipId(clipId)
    },
    onPlayhead: setHead,
    onEditStart: () => pushHistory(),
    onMoveClip: (id: string, clipId: string, offset: number) => {
      const track = tracks.find((t) => t.id === id)
      const clip = track ? clipsOf(track).find((c) => c.id === clipId) : null
      const snapped = applySnap(offset, track, clipId)
      setTracks((prev) => mapTrack(prev, id, (t) => moveClip(t, clipId, snapped)))
      if (track && clip && personAvLinked(people.find((p) => p.id === track.personId))) {
        setCameraClips((prev) => nudgeCamerasWithAudio(prev, clip, track.personId, clip.offset, snapped, true))
      }
    },
    onTrimClip: (id: string, clipId: string, edge: 'in' | 'out', time: number) => {
      const track = tracks.find((t) => t.id === id)
      const snapped = applySnap(time, track, clipId)
      setTracks((prev) => mapTrack(prev, id, (t) => trimClip(t, clipId, edge, snapped)))
    },
    onRollTrim: (id: string, clipId: string, edge: 'in' | 'out', time: number) => {
      const track = tracks.find((t) => t.id === id)
      const snapped = applySnap(time, track, clipId)
      setTracks((prev) => mapTrack(prev, id, (t) => rollTrimClip(t, clipId, edge, snapped)))
    },
    onRange: (start: number, end: number, trackId: string) => {
      setSelectedId(trackId)
      setRange((prev) => ({ ...prev, start, end }))
    },
  }

  /* Advanced: the one switch between the calm default surface and the full rack.
     Remembered per browser; nothing is removed, everything is one click away. */
  const advancedToggle = (
    <Button
      variant={advanced ? 'primary' : 'secondary'}
      size="compact"
      aria-pressed={advanced}
      onClick={toggleAdvanced}
      title={
        advanced
          ? 'Back to the simple view — the full toolset stays one click away'
          : 'Show every tool: effects, sidechain ducking, pan and timing, sound-effect pad, graphics, stems, calibration'
      }
    >
      <SlidersHorizontal size={14} /> {advanced ? 'Advanced: on' : 'Advanced'}
    </Button>
  )
  const readouts = (
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
  )

  /* Inline alerts for the Sound Booth (recovery, lost input, stalled capture, camera size). */
  const boothNotices = booth ? (
    <>
      {(recover || crashTakes.length > 0) && sessionStatus === 'offer' && (
        <RecoveryBanner
          episodeId={episodeId}
          saved={recover}
          crashTakes={crashTakes}
          busy={busy != null}
          onRestoreCrashTakes={() => void restoreCrashTakes()}
          onRestoreSession={() => void restoreSavedSession()}
          onDecideLater={() => dismissRecover(false)}
          onDelete={() => dismissRecover(true)}
          onOk={(m) => notifyOk(m)}
          onError={(m) => notifyError(m)}
        />
      )}
      {recording && inputLost && (
        <div className="rounded-xl border border-[#FF7A9A]/60 bg-[#20101A] px-4 py-3" role="alert">
          <p className="text-sm text-[#FF7A9A]">
            {inputLost}. The take keeps recording what still arrives — reconnect the device, or stop and re-record.
          </p>
        </div>
      )}
      {recording && recFlowStalled && (
        <div className="rounded-xl border border-[#FF7A9A]/60 bg-[#20101A] px-4 py-3">
          <p className="text-sm text-[#FF7A9A]">
            No samples are reaching the recorder — the capture may have stalled. Check the mic / guest connection; the
            last checkpoint is safe on this computer.
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
      {error && (
        <p className="text-sm text-[#FF8FA3]" role="alert">
          {error}
        </p>
      )}
      {ok && !error && (
        <p className="text-sm text-[#8DEBFF]" role="status">
          {ok}
        </p>
      )}
    </>
  ) : null

  /* Takes already on the timeline, for the booth's counter + drawer list. */
  const boothTakes: BoothTakeSummary[] = tracks
    .filter((t) => t.buffer)
    .map((t) => ({
      id: t.id,
      person: nameFor(t.personId, t.name),
      durationSec: t.buffer?.duration ?? 0,
      offsetSec: t.offset,
      laneIndex:
        t.personId === 'host'
          ? 0
          : t.personId === 'guest'
            ? 1
            : Math.max(2, people.filter((p) => p.kind === 'voice').findIndex((p) => p.id === t.personId)),
    }))

  const invitePanel = (
    <GuestInvitePanel
      episodeId={episodeId}
      recording={recording && guestRecClock != null}
      recTally={recTally}
      hostStream={hostTalkStream}
      cueStream={guestCueStream}
      onCueToGuest={setCueToGuest}
      onRemoteStream={onRemoteGuestStream}
      onRemoteVideo={setRemoteGuestVideo}
      onGuestName={onRemoteGuestName}
      onTakeUrl={setGuestTakeUrl}
      onCameraUrl={setGuestCameraUrl}
      onRemoteGuests={onRemoteGuests}
      recordStartSessionSec={guestRecClock?.sec ?? null}
      recordStartedAt={guestRecClock?.at ?? null}
      onTalkbackState={setTalkbackState}
      talkbackController={talkbackControllerRef}
    />
  )

  const hasProgram = switchEdl.length > 0 || cameraClips.length > 0
  const programMonitor = hasProgram ? (
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
  ) : null

  /* Everything the booth renders — one object for the inline stage and the overlay. */
  const boothVoicePeople = people.filter((person) => person.kind === 'voice')
  // Two-host safety: flag when people who are both live would capture from the SAME
  // device, which silently records them onto one track instead of two.
  const boothLocalVoices = boothVoicePeople.filter((person) => !(person.id === 'guest' && Boolean(remoteGuest)))
  const boothCamsOn = boothLocalVoices.filter((person) => cameraStreams[person.id])
  const boothDupCamera =
    boothCamsOn.length > 1 &&
    new Set(boothCamsOn.map((person) => person.videoDeviceId || 'default')).size < boothCamsOn.length
  const boothArmedVoices = boothLocalVoices.filter((person) => tracks.some((t) => t.armed && t.personId === person.id))
  const boothSharedMic =
    boothArmedVoices.length > 1 &&
    new Set(boothArmedVoices.map((person) => person.inputDeviceId || micId || 'default')).size < boothArmedVoices.length
  const boothDeviceBar = (
    <div className="space-y-2 rounded-panel border border-divider bg-[#080C10] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[#8DEBFF]">
          <Video size={12} /> Cameras &amp; mics · this room
        </span>
        <button
          type="button"
          className={chip}
          disabled={recording}
          onClick={() => void refreshMediaDevices()}
          title="Rescan after connecting an iPhone (Continuity Camera) or a USB mic"
        >
          Rescan
        </button>
      </div>
      {boothVoicePeople.map((person) => {
        const isRemote = person.id === 'guest' && Boolean(remoteGuest)
        const lc = laneFor(person.id)
        return (
          <div key={person.id} className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-w-[92px] items-center gap-1.5 text-[11px] font-medium" style={{ color: lc?.base }}>
              <span className="h-2 w-2 rounded-full" style={{ background: lc?.base }} aria-hidden="true" />
              {person.name || 'Voice'}
            </span>
            {isRemote ? (
              <span className="text-[11px] text-silver-label">On their own device (joined by invite)</span>
            ) : (
              <>
                <button
                  type="button"
                  className={cameraStreams[person.id] ? primary : chip}
                  disabled={recording}
                  onClick={() => void toggleCamera(person.id)}
                  title={cameraStreams[person.id] ? 'Turn this camera off' : 'Turn on this person’s camera'}
                >
                  {cameraStreams[person.id] ? <Video size={12} /> : <VideoOff size={12} />}
                  {cameraStreams[person.id] ? 'Cam on' : 'Cam off'}
                </button>
                <label className="inline-flex items-center gap-1 text-[11px] text-[#A9B8C6]">
                  Camera
                  <select
                    className={select}
                    value={person.videoDeviceId || ''}
                    disabled={recording}
                    onChange={(e) => void changeCameraDevice(person.id, e.target.value)}
                    aria-label={`Camera for ${person.name}`}
                    title="An iPhone appears here as a Continuity Camera once you allow it"
                  >
                    <option value="">Default camera</option>
                    {cams.map((cam, idx) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-[#A9B8C6]">
                  Mic
                  <select
                    className={select}
                    value={person.inputDeviceId || ''}
                    disabled={recording}
                    onChange={(e) =>
                      setPeople((prev) => prev.map((pp) => (pp.id === person.id ? { ...pp, inputDeviceId: e.target.value } : pp)))
                    }
                    aria-label={`Microphone for ${person.name}`}
                  >
                    <option value="">Default mic</option>
                    {mics.map((mic, idx) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label || `Mic ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        )
      })}
      {!cams.some((c) => c.label) && (
        <span className="block text-[10px] text-[#7C8B97]">
          Turn a camera on once to name devices — each person&apos;s iPhone shows up as a Continuity Camera.
        </span>
      )}
      {boothDupCamera && (
        <span className="block rounded bg-[#2A1E0B] px-2 py-1 text-[10px] text-[#F5C451]">
          Two cameras are set to the same device — give each person their own camera (e.g. each phone) so they record separately.
        </span>
      )}
      {boothSharedMic && (
        <span className="block rounded bg-[#2A1E0B] px-2 py-1 text-[10px] text-[#F5C451]">
          Both people are armed on the same mic — they&apos;ll record onto one track. Pick a separate mic for each for two tracks.
        </span>
      )}
    </div>
  )
  const boothVoices = people.filter((person) => person.kind === 'voice')
  const boothHasContent = tracks.some((t) => clipsOf(t).length > 0) || cameraClips.length > 0
  const boothTimeline = (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="studio-type-label text-ice">Timeline · video &amp; audio</p>
          <span className="text-[10px] uppercase tracking-wider text-silver-label">
            {recording
              ? 'Recording — takes land here on stop'
              : boothHasContent
                ? 'Your session, left to right'
                : 'Record a take to fill these lanes'}
          </span>
        </div>
        <SessionTimeline {...timelineBoard} rulerOnly showRuler gutterLeft={116} />
        {boothVoices.map((person) => {
          const personCam = cameraClips.filter((c) => c.personId === person.id)
          const lc = laneFor(person.id)
          return (
            <div key={person.id} className="flex items-stretch gap-2">
              <div
                className="w-[108px] shrink-0 truncate pt-1 text-[11px] font-medium"
                style={{ color: lc?.base }}
                title={person.name || 'Voice'}
              >
                {person.name || 'Voice'}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="relative h-6 overflow-hidden rounded border border-divider bg-[#0A1016]">
                  {personCam.length === 0 ? (
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] text-silver-label">
                      No video
                    </span>
                  ) : (
                    personCam.map((c) => (
                      <div
                        key={c.id}
                        className="absolute top-0.5 bottom-0.5 rounded-sm border border-forged/60 bg-forged/30"
                        style={{ left: c.offset * zoom, width: Math.max(2, c.duration * zoom) }}
                        title="Camera take"
                      />
                    ))
                  )}
                </div>
                <SessionTimeline {...timelineBoard} personId={person.id} embedded showRuler={false} />
              </div>
            </div>
          )
        })}
      </div>
    )

  const boothTeleprompter = script && script.trim() ? <Teleprompter text={script} title={title} /> : null

  const boothProps: Omit<BoothStageProps, 'variant'> = {
    title,
    participants: boothParticipants,
    recording,
    tally: recTally === 'waiting' ? 'idle' : recTally,
    countdownSec: recTally === 'count-in' ? countInBeats : null,
    elapsedSec: recClock,
    canRecord: anyArmed || Boolean(selected) || tracks.length > 0,
    onToggleRecord: () => void toggleRecord(),
    onToggleMute: toggleBoothMute,
    onToggleCamera: (id) => void toggleCamera(id),
    talkbackOn: talkbackState.on,
    talkbackAvailable: talkbackState.available,
    onToggleTalkback: toggleTalkback,
    cueEnabled,
    onCueEnabledChange: setCueEnabled,
    preroll,
    onPrerollChange: setPreroll,
    countInBeats,
    onCountInChange: setCountInBeats,
    takes: boothTakes,
    onOpenTake: (id) => {
      setSelectedId(id)
      const track = tracks.find((t) => t.id === id)
      if (track) setHead(track.offset)
      onGoToStage?.('edit')
    },
    onRerecordFromHere: () => {
      setRecMode('at_playhead')
      void toggleRecord('at_playhead')
    },
    onMarkChapter: onMarkChapter ? () => onMarkChapter(playheadRef.current) : undefined,
    programMonitor,
  }

  return (
    <div ref={rootRef} className={`rounded-2xl border border-[#27313B] bg-[#0C141C] ${booth ? '' : 'overflow-hidden'}`}>
      {showAll && (
        <div className="px-4 py-3 border-b border-[#27313B] flex flex-wrap items-center justify-between gap-3 bg-[#11161C]">
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Podcast production room</h2>
            <p className="text-sm text-[#B8C4CF]">
              One lane per person. After the mix puts the guest after the host. Takes autosave on this computer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {advancedToggle}
            {!advanced && (
              <Chip tone="neutral" className="hidden sm:inline-flex" title="Effects, ducking, pan, stems and more live under Advanced">
                More tools under Advanced
              </Chip>
            )}
          </div>
          {readouts}
        </div>
      )}

      {/* Sound Booth — the focused-in recording view. Inline, fills the stage under
          the production-room header; the overlay below is its full-screen fallback. */}
      {booth && (
        <BoothStage
          {...boothProps}
          participants={boothOpen ? [] : boothParticipants}
          variant="inline"
          autoFocusRecord
          notices={boothNotices}
          invitePanel={invitePanel}
          deviceBar={boothDeviceBar}
          timeline={boothTimeline}
          teleprompter={boothTeleprompter}
          onExpand={() => setBoothOpen(true)}
          extraControls={
            <>
              {advancedToggle}
              {advanced && (
                <>
                  <Button
                    variant={metronome ? 'primary' : 'secondary'}
                    size="compact"
                    className="shrink-0"
                    aria-pressed={metronome}
                    onClick={() => setMetronome((v) => !v)}
                  >
                    Metronome
                  </Button>
                  {metronome && (
                    <label className="text-xs text-[#A9B8C6] flex items-center gap-2 shrink-0">
                      BPM
                      <input
                        type="number"
                        aria-label="Metronome tempo (BPM)"
                        min={40}
                        max={200}
                        value={bpm}
                        onChange={(e) => setBpm(Number(e.target.value) || 90)}
                        className="w-16 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[#F6FAFC]"
                      />
                    </label>
                  )}
                </>
              )}
              <Button
                variant="secondary"
                size="compact"
                className="shrink-0"
                onClick={() => setHelpOpen(true)}
                title="Keyboard shortcuts (press ?)"
                aria-label="Show keyboard shortcuts"
              >
                <span aria-hidden="true">?</span>
              </Button>
            </>
          }
        />
      )}

      {/* Sound Booth · Advanced: the full mic/cue rack, one click away. */}
      {booth && advanced && (
        <div className="space-y-3 border-t border-divider p-4">
          <p className="studio-type-label text-ice">Advanced recording settings</p>
          <div className={`space-y-1.5 ${recording ? 'pointer-events-none opacity-60' : ''}`}>
            <p className="studio-type-label text-ice">How to record</p>
            <SegmentedControl
              aria-label="How to record"
              size="compact"
              value={recMode}
              onValueChange={(value) => {
                if (!recording) setRecMode(value)
              }}
              options={ALL_REC_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
            />
            <p className="studio-type-label max-w-[22rem] normal-case tracking-normal text-[#7C8B97]">
              {ALL_REC_MODES.find((m) => m.value === recMode)?.blurb}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#A9B8C6]">
            <label className="inline-flex items-center gap-2" title="Cue level (how loud the mix is in your headphones)">
              Headphone level {Math.round(cueGain * 100)}%
              <input
                type="range"
                aria-label="Headphone mix level"
                min={0}
                max={1}
                step={0.05}
                value={cueGain}
                onChange={(e) => setCueGain(Number(e.target.value))}
                className="w-24 accent-[#53D6FF]"
              />
            </label>
            <label className="inline-flex items-center gap-1.5" title="Voice clean-up (RNNoise noise removal) on every new voice take">
              <input type="checkbox" checked={voiceIsolate} onChange={(e) => setVoiceIsolate(e.target.checked)} />
              Voice clean-up
            </label>
            <button type="button" className={btn} onClick={armHostAndGuest} title="Arm one take for the host and one for the guest">
              Arm Host + Guest
            </button>
            <label className="inline-flex items-center gap-1.5" title="Record over the armed take instead of onto a new one">
              <input type="checkbox" checked={replaceArmed} onChange={(e) => setReplaceArmed(e.target.checked)} />
              Record over the armed take
            </label>
            <label className="inline-flex items-center gap-1.5" title="Raw input: no automatic gain, echo cancellation or noise suppression from the browser (Chrome AGC off)">
              <input type="checkbox" checked={rawInput} onChange={(e) => setRawInput(e.target.checked)} />
              Mic processing: off
            </label>
            <label className="inline-flex items-center gap-1.5" title="With two mics, the quieter one is lowered (never hard-muted) while the other person talks">
              <input type="checkbox" checked={autoMuteQuiet} onChange={(e) => setAutoMuteQuiet(e.target.checked)} />
              Auto-duck the quieter mic
            </label>
            {mics.length > 0 && (
              <label className="inline-flex items-center gap-2" title="Fallback mic: used by anyone without their own microphone picked">
                Fallback mic
                <select className={select} aria-label="Fallback microphone" value={micId} onChange={(e) => setMicId(e.target.value)}>
                  <option value="">Default</option>
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || 'Microphone'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {(recording || anyArmed) && (
            <LiveStoreContext.Provider value={liveStore}>
              <LiveMeters recording={recording} />
            </LiveStoreContext.Provider>
          )}
          <div className="flex flex-wrap gap-2">
            {guestTakeUrl && (
              <button type="button" className={btn} onClick={() => void applyGuestTake(guestTakeUrl)}>
                Lay uploaded guest take
              </button>
            )}
            {guestCameraUrl && (
              <button type="button" className={btn} onClick={() => void applyGuestCamera(guestCameraUrl)}>
                Lay uploaded guest camera
              </button>
            )}
          </div>
          <HowThisWorks topics={['Recording', 'Two mics, one button']} />
        </div>
      )}

      <div className={booth ? 'hidden' : 'p-4 space-y-4'} aria-hidden={booth || undefined}>
        {/* Edit / Publish toolbar: Advanced toggle + live readouts (the header holds only the tabs now). */}
        {!showAll && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {advancedToggle}
              {!advanced && (
                <Chip tone="neutral" className="hidden sm:inline-flex" title="Effects, ducking, pan, stems and more live under Advanced">
                  More tools under Advanced
                </Chip>
              )}
            </div>
            {readouts}
          </div>
        )}
        {showRecord && (recover || crashTakes.length > 0) && sessionStatus === 'offer' && (
          <RecoveryBanner
            episodeId={episodeId}
            saved={recover}
            crashTakes={crashTakes}
            busy={busy != null}
            onRestoreCrashTakes={() => void restoreCrashTakes()}
            onRestoreSession={() => void restoreSavedSession()}
            onDecideLater={() => dismissRecover(false)}
            onDelete={() => dismissRecover(true)}
            onOk={(m) => notifyOk(m)}
            onError={(m) => notifyError(m)}
          />
        )}

        {showRecord && recording && inputLost && (
          <div className="rounded-xl border border-[#FF7A9A]/60 bg-[#20101A] px-4 py-3" role="alert">
            <p className="text-sm text-[#FF7A9A]">
              {inputLost}. The take keeps recording what still arrives — reconnect the device, or stop and re-record.
            </p>
          </div>
        )}
        {showRecord && recording && recFlowStalled && (
          <div className="rounded-xl border border-[#FF7A9A]/60 bg-[#20101A] px-4 py-3">
            <p className="text-sm text-[#FF7A9A]">
              No samples are reaching the recorder — the capture may have stalled. Check the mic / guest
              connection; the last checkpoint is safe on this computer.
            </p>
          </div>
        )}

        {showRecord && camWarnFor && (
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

        {/* Transport — record arming (record stage) + slim playback (edit stage) */}
        {(showRecord || showEdit) && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#0C141C]/95 border-b border-[#1A232C] flex flex-wrap gap-3 items-start">
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-start flex-1 min-w-[12rem]">
          {showRecord && (
          <div className="flex flex-wrap items-center gap-3">
          {/* Signature record moment — the largest, most tactile control on
              the transport. Wired to the existing toggle; state is derived. */}
          <div className="flex flex-col items-center gap-1.5">
            <RecordButton
              state={recording ? 'recording' : anyArmed ? 'armed' : 'idle'}
              size={64}
              aria-label={recording ? 'Stop recording' : anyArmed ? 'Start recording' : 'Arm a take to record'}
              onClick={() => void toggleRecord()}
            />
            <Chip tone={recording ? 'record' : anyArmed ? 'accent' : 'neutral'} dot>
              {recording ? `REC ${formatClock(recClock)}` : anyArmed ? 'Armed' : 'Idle'}
            </Chip>
          </div>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => setBoothOpen(true)}
            title="Full-screen video booth — live cameras, tally, and per-person mute. Does not interrupt recording."
          >
            <Video size={14} /> Recording Booth
          </Button>
          {boothParticipants.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#27313B] bg-[#0A1016] px-2 py-1 hover:border-[#53D6FF]/50"
              onClick={() => setBoothOpen(true)}
              title="Open the booth — click to see everyone full-screen"
            >
              <span className="flex -space-x-1.5">
                {boothParticipants.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold text-[#061016] ${
                      recording && p.hasLiveVideo ? 'border-[#FF5B73]' : 'border-[#0A1016]'
                    }`}
                    style={{ background: people.find((per) => per.id === p.id)?.color || '#53D6FF' }}
                    title={p.name}
                  >
                    {(p.name || '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                ))}
              </span>
              <span className="text-[11px] text-[#B8C4CF]">
                {boothParticipants.length} in booth
                {boothParticipants.length > 4 ? ` +${boothParticipants.length - 4}` : ''}
              </span>
            </button>
          )}
          <div className={`space-y-1.5 ${recording ? 'pointer-events-none opacity-60' : ''}`}>
            <p className="studio-type-label text-ice">How to record</p>
            <SegmentedControl
              aria-label="How to record"
              size="compact"
              value={recMode}
              onValueChange={(value) => {
                if (!recording) setRecMode(value)
              }}
              options={ALL_REC_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
            />
            <p className="studio-type-label max-w-[22rem] normal-case tracking-normal text-[#7C8B97]">
              {ALL_REC_MODES.find((m) => m.value === recMode)?.blurb}
            </p>
          </div>
          <label
            className="text-xs text-[#A9B8C6] flex items-center gap-2"
            title="Lead-in (preroll): the mix plays for this long before recording starts, so you can settle in"
          >
            Lead-in
            <select
              className={select}
              aria-label="Lead-in before recording"
              value={preroll}
              disabled={recording}
              onChange={(e) => setPreroll(Number(e.target.value))}
            >
              <option value={0}>None</option>
              <option value={1}>1s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
            </select>
          </label>
          {advanced && (
            <label className="text-xs text-[#A9B8C6] flex items-center gap-2" title="Metronome count-in beats before the take">
              Count-in
              <select
                className={select}
                aria-label="Count-in beats"
                value={countInBeats}
                disabled={recording}
                onChange={(e) => setCountInBeats(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </label>
          )}
          </div>
          )}
          {/* Edit stage: a compact Record — pressing it opens the Sound Booth; Stop brings you back
              with the take on the timeline. (Legacy all-stages mode has the big one above.) */}
          {showEdit && !showRecord && (
            <div className="flex items-center gap-2 shrink-0">
              <RecordButton
                state={recording ? 'recording' : 'armed'}
                size={44}
                aria-label={recording ? 'Stop recording' : 'Start recording'}
                title="Record a take — opens the Sound Booth (R)"
                onClick={() => void toggleRecord()}
              />
              <Chip tone={recording ? 'record' : 'neutral'} dot={recording}>
                {recording ? `REC ${formatClock(recClock)}` : 'Record'}
              </Chip>
            </div>
          )}
          {/* Playback transport — shared by record (monitoring) and edit (review takes).
              On narrow screens this group scrolls sideways so the primary Record / Play
              buttons above stay reachable instead of piling into a tall stack. */}
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <IconButton
            aria-label="Mark a chapter at the playhead (C)"
            title="Mark a chapter at the playhead (C)"
            variant="secondary"
            className="shrink-0"
            disabled={!onMarkChapter}
            onClick={() => {
              if (onMarkChapter) onMarkChapter(playheadRef.current)
            }}
          >
            <BookmarkPlus />
          </IconButton>
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={!ready || recording}
            onClick={() => togglePlay()}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? 'Pause' : 'Play mix'}
          </Button>
          <IconButton
            aria-label="Back 5 seconds"
            title="Back 5 seconds"
            variant="secondary"
            className="shrink-0"
            disabled={!ready || recording}
            onClick={() => nudge(-5)}
          >
            <SkipBack />
          </IconButton>
          <IconButton
            aria-label="Forward 5 seconds"
            title="Forward 5 seconds"
            variant="secondary"
            className="shrink-0"
            disabled={!ready || recording}
            onClick={() => nudge(5)}
          >
            <SkipForward />
          </IconButton>
          {advanced && (
            <>
              <Button variant="secondary" size="dense" className="shrink-0" disabled={!ready} title="Selection start at the playhead" onClick={() => setBound('start')}>
                In
              </Button>
              <Button variant="secondary" size="dense" className="shrink-0" disabled={!ready} title="Selection end at the playhead" onClick={() => setBound('end')}>
                Out
              </Button>
            </>
          )}
          <IconButton
            aria-label="Undo (Cmd/Ctrl Z)"
            title="Undo (Cmd/Ctrl Z)"
            variant="secondary"
            className="shrink-0"
            disabled={historyLen === 0}
            onClick={() => void undo()}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            aria-label="Redo (Shift Cmd/Ctrl Z)"
            title="Redo (Shift Cmd/Ctrl Z)"
            variant="secondary"
            className="shrink-0"
            disabled={redoLen === 0}
            onClick={() => void redo()}
          >
            <Redo2 />
          </IconButton>
          {showEdit && advanced && (
          <>
          <label className={btn + ' shrink-0 cursor-pointer'}>
            Import → selected
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              className="hidden"
              onChange={(e) => void onUploadPick(e.target.files?.[0] || null)}
            />
          </label>
          <label className={btn + ' shrink-0 cursor-pointer'}>
            Add music bed
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              className="hidden"
              onChange={(e) => void onImportBed(e.target.files?.[0] || null)}
            />
          </label>
          </>
          )}
          {advanced && (
          <IconButton
            aria-label="Loop the selection"
            title="Loop the selection"
            variant={loop ? 'primary' : 'secondary'}
            active={loop}
            className="shrink-0"
            onClick={() => setLoop((v) => !v)}
          >
            <Repeat />
          </IconButton>
          )}
          {/* Zoom cluster: − / Fit / + (also Cmd/Ctrl −, 0, +). */}
          <div className="inline-flex items-center gap-1 shrink-0 rounded-control border border-divider bg-surface-raised px-1">
            <IconButton
              aria-label="Zoom out (Cmd/Ctrl −)"
              title="Zoom out (Cmd/Ctrl −)"
              variant="ghost"
              onClick={() => zoomBy(0.8)}
            >
              <Minus />
            </IconButton>
            <Button
              variant="ghost"
              size="dense"
              title="Fit session to view (Cmd/Ctrl 0)"
              onClick={() => zoomToFit()}
            >
              Fit
            </Button>
            <IconButton
              aria-label="Zoom in (Cmd/Ctrl +)"
              title="Zoom in (Cmd/Ctrl +)"
              variant="ghost"
              onClick={() => zoomBy(1.25)}
            >
              <Plus />
            </IconButton>
          </div>
          {showEdit && advanced && (
            <Button
              variant={snap ? 'primary' : 'secondary'}
              size="dense"
              className="shrink-0"
              title={`Snap clip moves/trims to a ${SNAP_GRID}s grid and magnet to nearby clip edges / the playhead`}
              aria-pressed={snap}
              onClick={() => setSnap((v) => !v)}
            >
              Snap {snap ? 'on' : 'off'}
            </Button>
          )}
          {showEdit && selectionClipIds.size > 1 && (
            <div className="inline-flex items-center gap-1 shrink-0">
              <Chip tone="accent" dot>
                {selectionClipIds.size} clips
              </Chip>
              <Button
                variant="secondary"
                size="dense"
                title="Fade in/out on all selected clips (F)"
                onClick={() => batchClips('fade')}
              >
                Fade
              </Button>
              <Button
                variant="secondary"
                size="dense"
                title="Toggle mute on all selected clips (Shift+M)"
                onClick={() => batchClips('mute')}
              >
                Mute
              </Button>
              <Button
                variant="secondary"
                size="dense"
                title="Trim gain −3 dB on all selected clips"
                onClick={() => batchClips('gain', 0.708)}
              >
                −3 dB
              </Button>
              <Button
                variant="ghost"
                size="dense"
                title="Clear multi-selection"
                onClick={() => setMultiSel({})}
              >
                Clear
              </Button>
            </div>
          )}
          {showRecord && advanced && (
          <>
          <Button
            variant={metronome ? 'primary' : 'secondary'}
            size="compact"
            className="shrink-0"
            aria-pressed={metronome}
            onClick={() => setMetronome((v) => !v)}
          >
            Metronome
          </Button>
          {metronome && (
            <label className="text-xs text-[#A9B8C6] flex items-center gap-2 shrink-0">
              BPM
              <input
                type="number"
                aria-label="Metronome tempo (BPM)"
                min={40}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className="w-16 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[#F6FAFC]"
              />
            </label>
          )}
          </>
          )}
          <Button
            variant="secondary"
            size="compact"
            className="shrink-0"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (press ?)"
            aria-label="Show keyboard shortcuts"
          >
            <span aria-hidden="true">?</span> Help &amp; shortcuts
          </Button>
          </div>
          </div>
          {showRecord && boothDeviceBar}

          {!showRecord ? null : (Object.keys(cameraStreams).length > 0 ||
            (remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest))) ||
            cameraClips.length > 0) ? (
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
          ) : (
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#27313B] bg-[#0B0F14] px-6 py-8 text-center">
              <VideoOff size={20} className="text-[#4A5A68]" />
              <p className="max-w-[220px] text-xs text-[#9AABBA]">
                No camera yet. Turn one on to see yourself here — Record then also saves a video file
                on this computer alongside the audio.
              </p>
              <button
                type="button"
                className={primary}
                disabled={recording}
                onClick={() => void toggleCamera('host')}
                title="Open a local camera preview (warns once about file size)"
              >
                <Video size={12} /> Turn on camera
              </button>
            </div>
          )}
        </div>
        )}

        {/* Inline feedback — an accessible live region right under the transport (the toast
            mirrors it). Success clears an error and vice versa. */}
        {error && (
          <p className="text-sm text-[#FF8FA3]" role="alert">
            {error}
          </p>
        )}
        {ok && !error && (
          <p className="text-sm text-[#8DEBFF]" role="status">
            {ok}
          </p>
        )}

        {showRecord && (
        <>
        <GuestInvitePanel
          episodeId={episodeId}
          recording={recording && guestRecClock != null}
          recTally={recTally}
          hostStream={hostTalkStream}
          cueStream={guestCueStream}
          onCueToGuest={setCueToGuest}
          onRemoteStream={onRemoteGuestStream}
          onRemoteVideo={setRemoteGuestVideo}
          onGuestName={onRemoteGuestName}
          onTakeUrl={setGuestTakeUrl}
          onCameraUrl={setGuestCameraUrl}
          onRemoteGuests={onRemoteGuests}
          recordStartSessionSec={guestRecClock?.sec ?? null}
          recordStartedAt={guestRecClock?.at ?? null}
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
            <label className="inline-flex items-center gap-1.5" title="Cue mix: the other lanes play in your headphones while you record">
              <input type="checkbox" checked={cueEnabled} onChange={(e) => setCueEnabled(e.target.checked)} />
              Hear the mix in headphones
            </label>
            {cueEnabled && advanced && (
              <label className="inline-flex items-center gap-2" title="Cue level (how loud the mix is in your headphones)">
                Headphone level {Math.round(cueGain * 100)}%
                <input
                  type="range"
                  aria-label="Headphone mix level"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cueGain}
                  onChange={(e) => setCueGain(Number(e.target.value))}
                  className="w-24 accent-[#53D6FF]"
                />
              </label>
            )}
            <label className="inline-flex items-center gap-1.5" title="Voice clean-up (RNNoise noise removal) on every new voice take">
              <input type="checkbox" checked={voiceIsolate} onChange={(e) => setVoiceIsolate(e.target.checked)} />
              Voice clean-up
            </label>
            <button type="button" className={btn} onClick={armHostAndGuest} title="Arm one take for the host and one for the guest">
              Arm Host + Guest
            </button>
            {advanced && (
              <>
                <label className="inline-flex items-center gap-1.5" title="Record over the armed take instead of onto a new one">
                  <input type="checkbox" checked={replaceArmed} onChange={(e) => setReplaceArmed(e.target.checked)} />
                  Record over the armed take
                </label>
                <label className="inline-flex items-center gap-1.5" title="Raw input: no automatic gain, echo cancellation or noise suppression from the browser (Chrome AGC off)">
                  <input type="checkbox" checked={rawInput} onChange={(e) => setRawInput(e.target.checked)} />
                  Mic processing: off
                </label>
                <label className="inline-flex items-center gap-1.5" title="With two mics, the quieter one is lowered (never hard-muted) while the other person talks">
                  <input type="checkbox" checked={autoMuteQuiet} onChange={(e) => setAutoMuteQuiet(e.target.checked)} />
                  Auto-duck the quieter mic
                </label>
                {mics.length > 0 && (
                  <label className="inline-flex items-center gap-2" title="Fallback mic: used by anyone without their own microphone picked">
                    Fallback mic
                    <select className={select} aria-label="Fallback microphone" value={micId} onChange={(e) => setMicId(e.target.value)}>
                      <option value="">Default</option>
                      {mics.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || 'Microphone'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className={btn} onClick={followTalkerNow} title="Follow talker: write volume automation so the mix follows whoever is talking">
                  Auto-switch to who’s talking
                </button>
              </>
            )}
          </div>
          {(recording || anyArmed) && (
            <div className="space-y-1.5">
              <LiveStoreContext.Provider value={liveStore}>
                <LiveMeters recording={recording} />
              </LiveStoreContext.Provider>
            </div>
          )}
          <HowThisWorks topics={['Recording', 'Two mics, one button']} />
          {recHint && (
            <p className="text-[11px] text-[#9AABBA]">
              {recHint}
              {personIdsArmed > 1
                ? remoteGuest
                  ? ' Remote guest is a second input — Host local, Guest booth, one punch.'
                  : armedDeviceCount > 1
                    ? ' Two mics, one punch — quieter lane ducks (never hard-mutes) while the other person talks. Both recordings keep rolling.'
                    : ' Shared mic — Host and Guest record onto one take.'
                : ''}
            </p>
          )}
        </div>
        </>
        )}

        {showEdit && (
        <>
        <Panel elevation="flat" className="px-3 py-2.5 space-y-2.5" aria-labelledby="studio-selection-tools">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="studio-selection-tools" className="studio-type-label text-ice">Selection tools</h3>
            <div className="flex flex-wrap items-center gap-3">
              {advanced && (
                <label className="studio-type-label inline-flex items-center gap-1.5 normal-case tracking-normal text-[#A9B8C6]">
                  <input type="checkbox" checked={applyRangeAll} onChange={(e) => setApplyRangeAll(e.target.checked)} />
                  Apply to every track
                </label>
              )}
              {/* Progressive disclosure — the default view is calm (Split only). */}
              {advanced && (
                <Button
                  variant={smartControlsOpen ? 'primary' : 'ghost'}
                  size="dense"
                  aria-expanded={smartControlsOpen}
                  onClick={() => setSmartControlsOpen((v) => !v)}
                  title="Reveal the lane tools (section volume, ducking, timing, trim, clips)"
                >
                  <SlidersHorizontal size={13} /> {smartControlsOpen ? 'Fewer tools' : 'More tools'}
                </Button>
              )}
            </div>
          </div>
          <p className="studio-type-label normal-case tracking-normal text-[#9AABBA]">
            Click a take to select it, drag across it to select a section. Split cuts at the playhead; Remove
            selection takes the section out and closes the gap.
          </p>
          {/* Split stays prominent as the primary in-lane action. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="compact"
              disabled={!selected?.buffer}
              title="Split the selected take at the playhead (S)"
              onClick={() => {
                if (!selected) return
                pushHistory()
                setTracks((prev) => mapTrack(prev, selected.id, (t) => splitTrackAt(t, playheadRef.current)))
                setOk('Split at playhead')
              }}
            >
              <Scissors size={12} /> Split
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={!selected?.buffer || !hasSelection}
              title={
                applyRangeAll
                  ? 'Ripple delete: remove the selection from every lane and the picture, then close the gap (Shift+Delete)'
                  : 'Ripple delete: remove the selection from this lane and pull the rest left (Shift+Delete)'
              }
              onClick={() =>
                applyRangeAll
                  ? rippleDeleteEverything()
                  : editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Removed the selection and closed the gap')
              }
            >
              <Trash2 size={12} /> Remove selection
            </Button>
            {selected && isVoiceRole(selected.role) && (
              <Button
                variant="secondary"
                size="compact"
                disabled={!selected?.buffer || Boolean(busy)}
                aria-pressed={voiceCleanupOn(selected)}
                title="Voice clean-up: removes background noise and rumble on this take (non-destructive RNNoise + high-pass inserts)"
                onClick={() => toggleVoiceCleanup(selected.id)}
              >
                {voiceCleanupOn(selected) ? 'Voice clean-up: on' : 'Clean up voice'}
              </Button>
            )}
            {advanced && (
              <Button
                variant="secondary"
                size="compact"
                disabled={!selected?.buffer}
                onClick={() => editRange((t) => splitRange(t, rangeRef.current.start, rangeRef.current.end), 'Split at selection edges')}
              >
                Split selection
              </Button>
            )}
          </div>
          <HowThisWorks topics={['Best take, layers and comps', 'Clean-up and effects', 'Music under voices']} />
          {advanced && smartControlsOpen && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <details className="rounded-control border border-divider bg-obsidian px-2.5 py-1.5" open>
              <summary className="studio-type-label cursor-pointer text-ice">
                Volume &amp; dynamics
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="studio-type-label inline-flex items-center gap-2 normal-case tracking-normal text-[#B8C4CF]">
                  Section {Math.round(sectionLevel * 100)}%
                  <Slider
                    aria-label="Section level"
                    min={0}
                    max={1}
                    step={0.01}
                    value={sectionLevel}
                    onChange={(e) => setSectionLevel(Number(e.target.value))}
                    className="w-28"
                  />
                </label>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() =>
                    editRange((t) => setVolumeInRange(t, rangeRef.current.start, rangeRef.current.end, sectionLevel), `Section volume ${Math.round(sectionLevel * 100)}% on this lane`)
                  }
                >
                  Set section volume
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
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
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() => editRange((t) => setVolumeInRange(t, rangeRef.current.start, rangeRef.current.end, 0), 'Ducked section to silence (automation)')}
                >
                  <VolumeX size={12} /> Mute section
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer || !(selected.automation || []).length}
                  onClick={() => {
                    if (!selected) return
                    pushHistory()
                    setTracks((prev) => mapTrack(prev, selected.id, clearAutomation))
                    setOk('Cleared volume automation')
                  }}
                >
                  Clear automation
                </Button>
              </div>
            </details>
            <details className="rounded-control border border-divider bg-obsidian px-2.5 py-1.5">
              <summary className="studio-type-label cursor-pointer text-ice" title="Sidechain ducking preset">
                Lower music under voices
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#A9B8C6]">
                <span className="normal-case tracking-normal">
                  Lower <b className="text-white">{selected?.name || 'selected lane'}</b> by
                </span>
                <select
                  className={select}
                  aria-label="How much to lower it (duck amount)"
                  value={duckDb}
                  onChange={(e) => setDuckDb(Number(e.target.value))}
                >
                  <option value={-6}>6 dB</option>
                  <option value={-9}>9 dB</option>
                  <option value={-12}>12 dB</option>
                  <option value={-18}>18 dB</option>
                </select>
                <span className="normal-case tracking-normal">when</span>
                <select
                  className={select}
                  aria-label="Lane that triggers the lowering (sidechain)"
                  value={duckSidechainId}
                  onChange={(e) => setDuckSidechainId(e.target.value)}
                >
                  <option value="">choose a lane…</option>
                  {tracks
                    .filter((t) => t.buffer && t.id !== selected?.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <span className="normal-case tracking-normal">is loud.</span>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer || !duckSidechainId || Boolean(busy)}
                  onClick={() => {
                    const side = tracks.find((t) => t.id === duckSidechainId)
                    if (!selected || !side?.buffer) {
                      notifyError('Pick a sidechain lane with audio')
                      return
                    }
                    pushHistory()
                    setBusy('Analyzing sidechain + writing ducking automation…')
                    // Defer so the busy label paints before the analysis pass.
                    window.setTimeout(() => {
                      try {
                        setTracks((prev) =>
                          mapTrack(prev, selected.id, (t) => duckWithSidechain(t, side, { duckDb })),
                        )
                        notifyOk(`Ducked ${selected.name} by ${Math.abs(duckDb)} dB under ${side.name}`, {
                          description: 'Volume automation only — no take was rewritten',
                        })
                      } catch (err) {
                        notifyError('Ducking failed', err instanceof Error ? err.message : undefined)
                      } finally {
                        setBusy(null)
                      }
                    }, 0)
                  }}
                >
                  Apply ducking
                </Button>
              </div>
            </details>
            <details className="rounded-control border border-divider bg-obsidian px-2.5 py-1.5">
              <summary className="studio-type-label cursor-pointer text-ice">
                Timing
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() => {
                    if (!selected) return
                    pushHistory()
                    setTracks((prev) => mapTrack(prev, selected.id, (t) => joinAdjacentClips(t, playheadRef.current)))
                    setOk('Joined adjacent clips')
                  }}
                >
                  Join
                </Button>
              </div>
            </details>
            <details className="rounded-control border border-divider bg-obsidian px-2.5 py-1.5">
              <summary className="studio-type-label cursor-pointer text-ice">
                Trim &amp; delete
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() => editRange((t) => cropToRange(t, rangeRef.current.start, rangeRef.current.end), 'Cropped to selection')}
                >
                  Crop to selection
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() => editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, false), 'Cut hole (gap stays)')}
                >
                  Cut hole
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer}
                  onClick={() =>
                    applyRangeAll
                      ? rippleDeleteEverything()
                      : editRange((t) => deleteRange(t, rangeRef.current.start, rangeRef.current.end, true), 'Ripple delete')
                  }
                  title={
                    applyRangeAll
                      ? 'Remove the range from every audio lane, every picture lane and the camera cuts, then close the gap'
                      : 'Remove the range from this lane and pull the rest of the lane left'
                  }
                >
                  {applyRangeAll ? 'Ripple delete (all + picture)' : 'Ripple delete'}
                </Button>
              </div>
            </details>
            <details className="rounded-control border border-divider bg-obsidian px-2.5 py-1.5">
              <summary className="studio-type-label cursor-pointer text-ice">
                Clips
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer || !selectedClipId}
                  onClick={() => {
                    if (!selected || !selectedClipId) return
                    const clip = clipsOf(selected).find((c) => c.id === selectedClipId) || clipsOf(selected)[0]
                    if (clip) clipClipboardRef.current = { ...clip }
                    setOk('Copied clip')
                  }}
                >
                  Copy clip
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
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
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
                  disabled={!selected?.buffer || !selectedClipId}
                  onClick={() => {
                    if (!selected || !selectedClipId) return
                    pushHistory()
                    setTracks((prev) => mapTrack(prev, selected.id, (t) => duplicateClipAt(t, selectedClipId)))
                    setOk('Repeated clip after itself')
                  }}
                >
                  Repeat clip
                </Button>
                <Button
                  variant="secondary"
                  size="dense"
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
                </Button>
              </div>
            </details>
          </div>
          )}
        </Panel>

        {advanced && <SfxPad compact disabled={Boolean(busy) || recording} onDrop={(id) => void dropSfx(id)} />}
        </>
        )}

        {/* Empty state — one clear next action instead of four empty lanes. */}
        {(showRecord || showEdit) && !hasAudio && !recording && (
          <Panel elevation="flat" className="flex flex-col items-center gap-3 px-4 py-8 text-center" role="status">
            <p className="studio-type-section !text-[16px]">Record your first take</p>
            <p className="studio-type-body max-w-[28rem] text-silver-body">
              {showRecord
                ? 'Press the big Record button (or R). Your take appears on the timeline right here the moment you stop.'
                : 'Nothing on the timeline yet. Record a take, or add a music bed — then trim and mix it here.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {showRecord ? (
                <Button variant="primary" size="touch" onClick={() => void toggleRecord()}>
                  Record your first take
                </Button>
              ) : onGoToStage ? (
                <Button variant="primary" size="touch" onClick={() => onGoToStage('record')}>
                  Go to the Sound Booth
                </Button>
              ) : null}
              {showEdit && (
                <label className={btn + ' cursor-pointer'}>
                  Add music bed
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.webm"
                    className="hidden"
                    onChange={(e) => void onImportBed(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          </Panel>
        )}

        {/* People / takes — the timeline. Shown on Record too, so a take visibly lands
            where it was recorded (GarageBand's "press record, watch the region appear"). */}
        {(showRecord || showEdit) && (hasAudio || recording) && (
        <section className="space-y-3" aria-labelledby="studio-people-takes">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 id="studio-people-takes" className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">People & takes</h3>
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
                aria-label="New person's name"
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
              {(advanced || showEdit) && (
                <button type="button" className={btn} onClick={() => addTrack('bed')} title="Add a music bed lane">
                  <Plus size={14} /> Music
                </button>
              )}
              {advanced && (
                <button type="button" className={btn} onClick={() => addTrack('sfx')} title="Add a sound-effects lane">
                  <Plus size={14} /> SFX lane
                </button>
              )}
            </div>
          </div>
          {/* Shared ruler. gutterLeft matches each track group's left header rail
              (card pad 10 + card border 1 + rail 160 + rail border 1) so the time
              axis lines up with the video/audio content columns below. */}
          <div ref={timelineViewportRef}>
            <SessionTimeline {...timelineBoard} rulerOnly showRuler gutterLeft={172} />
          </div>

          {visiblePeople.map((person) => {
            const lane = tracks.filter((t) => t.personId === person.id).sort((a, b) => a.take - b.take)
            /** Take slots shown to the host: every slot under Advanced; otherwise only takes
             *  with audio plus the armed one (empty slots appear on demand — see visibleTracks). */
            const visibleLane = lane.filter((t) => visibleTrackIds.has(t.id))
            const mixerTrack = lane.find((t) => t.id === selected?.id) || lane.find((t) => t.armed) || lane[0] || null
            // Persistent lane hue — the whole row wears this person's colour.
            const lc = person.kind === 'voice' ? laneFor(person.id) : null
            return (
              <div
                key={person.id}
                className="rounded-panel border p-2.5 space-y-2 shadow-depth-sm"
                style={
                  lc
                    ? { background: lc.laneBg, borderColor: lc.border }
                    : { background: '#080C10', borderColor: '#1A232C' }
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0 ring-2 ring-white/5"
                    style={{ background: lc?.base ?? person.color }}
                  />
                  <input
                    value={person.name}
                    aria-label={`Name of ${person.name || 'this person'}`}
                    onChange={(e) =>
                      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, name: e.target.value } : p)))
                    }
                    className="min-w-[7rem] rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-sm font-medium text-[#F6FAFC]"
                  />
                  <span className="text-[11px] text-[#A9B8C6]">
                    {lane.filter((t) => t.buffer).length} take{lane.filter((t) => t.buffer).length === 1 ? '' : 's'}
                    {advanced ? ` · ${lane.length} slot${lane.length === 1 ? '' : 's'}` : ''}
                  </span>
                  {advanced && (
                    <button type="button" className={btn} onClick={() => addTake(person.id)} title="Add an empty take slot">
                      <Plus size={14} /> Take
                    </button>
                  )}
                  {!(showRecord || advanced) ? null : person.kind === 'voice' && person.id === 'guest' && remoteGuest ? (
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
                      aria-label={`Microphone for ${person.name}`}
                    >
                      <option value="">Fallback mic</option>
                      {mics.map((mic, idx) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {idx === 0 ? 'Mic 1 · ' : idx === 1 ? 'Mic 2 · ' : ''}
                          {mic.label || `Input ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <div
                      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#1A232C] bg-[#0A1016] px-2 py-1.5"
                      role="group"
                      aria-label={`Camera controls for ${person.name}`}
                    >
                      <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[#8DEBFF]">
                        <Video size={11} /> Camera
                      </span>
                      <button
                        type="button"
                        className={cameraStreams[person.id] ? primary : camWarnFor === person.id ? danger : chip}
                        disabled={recording}
                        title={
                          cameraStreams[person.id]
                            ? 'Turn camera off'
                            : camWarnFor === person.id
                              ? `Confirm camera — ~${CAMERA_MB_PER_MIN} MB/min at 720p`
                              : 'Turn on a real local camera preview (warns once about file size)'
                        }
                        onClick={() => void toggleCamera(person.id)}
                      >
                        {cameraStreams[person.id] ? <Video size={12} /> : <VideoOff size={12} />}
                        {cameraStreams[person.id] ? 'Cam on' : camWarnFor === person.id ? 'Confirm' : 'Cam off'}
                      </button>
                      <select
                        className={select}
                        value={person.videoDeviceId || ''}
                        disabled={recording}
                        onChange={(e) => void changeCameraDevice(person.id, e.target.value)}
                        title="Camera device for this person"
                        aria-label={`Camera device for ${person.name}`}
                      >
                        <option value="">Default camera</option>
                        {cams.map((cam, idx) => (
                          <option key={cam.deviceId} value={cam.deviceId}>
                            {cam.label || `Camera ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                      {advanced && (
                      <>
                      <span className="mx-0.5 hidden h-4 w-px bg-[#1A232C] sm:inline-block" aria-hidden="true" />
                      <span className="text-[10px] uppercase tracking-[0.1em] text-silver-label">Graphics</span>
                      <button
                        type="button"
                        className={chip}
                        disabled={recording}
                        title="Add a lower-third title on the picture at the playhead"
                        onClick={() => addLowerThird(person.id)}
                      >
                        Lower third
                      </button>
                      <label className={`${chip} cursor-pointer`} title="Import a B-roll clip onto this picture lane">
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
                        title="Add a black flash (stinger) on the picture at the playhead"
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
                    </div>
                    </>
                  ) : null}
                  {person.kind === 'voice' && (showRecord || advanced) && (
                    <button
                      type="button"
                      className={lane.some((t) => t.armed) ? danger : chip}
                      aria-pressed={lane.some((t) => t.armed)}
                      title={`Arm ${person.name} — their next take records when you press Record`}
                      onClick={() => {
                        const empty = emptyTakeForPerson(tracks, person.id)
                        const last = lane[lane.length - 1]
                        if (empty) armTrack(empty.id)
                        else if (last) armTrack(last.id)
                      }}
                    >
                      {lane.some((t) => t.armed) ? 'Armed' : 'Arm'}
                    </button>
                  )}
                  {advanced && person.kind === 'voice' && lane.some((t) => (t.compRanges || []).length > 0) && (
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
                {showEdit && mixerTrack && (advanced || lane.some((t) => t.buffer)) && (
                  <div
                    className={`rounded-control border p-2.5 space-y-2 transition-shadow ${
                      selected?.id === mixerTrack.id
                        ? 'border-forged/60 bg-surface-raised shadow-highlight-rim'
                        : 'border-divider bg-obsidian'
                    } ${personMuted(person.id) ? 'opacity-55' : ''}`}
                    onClick={() => setSelectedId(mixerTrack.id)}
                  >
                    {(advanced || visibleLane.length > 1) && (
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Takes for ${person.name}`}>
                      {visibleLane.map((track) => {
                        const active = mixerTrack.id === track.id
                        return (
                          <button
                            key={track.id}
                            type="button"
                            className={active ? primary : chip}
                            aria-pressed={active}
                            title={track.buffer ? track.name : `${track.name} · empty — arm to record`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedId(track.id)
                            }}
                          >
                            take {track.take}
                            {track.armed ? ' · armed' : ''}
                            {!track.buffer ? ' · empty' : ''}
                          </button>
                        )
                      })}
                    </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={mixerTrack.name}
                        aria-label={`Take name (${mixerTrack.name})`}
                        onChange={(e) => updateTrack(mixerTrack.id, { name: e.target.value })}
                        className="min-w-[7rem] flex-1 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-sm text-[#F6FAFC]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        className={personMuted(person.id) ? danger : chip}
                        aria-pressed={personMuted(person.id)}
                        aria-label={`Mute ${person.name}`}
                        title={`Mute ${person.name} — silences them everywhere (booth and mixer)`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleBoothMute(person.id)
                        }}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        className={mixerTrack.solo ? primary : chip}
                        aria-pressed={mixerTrack.solo}
                        aria-label={`Solo ${mixerTrack.name}`}
                        title={`Solo — hear only ${mixerTrack.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateTrack(mixerTrack.id, { solo: !mixerTrack.solo })
                        }}
                      >
                        S
                      </button>
                      {advanced && (
                      <button
                        type="button"
                        className={mixerTrack.armed ? danger : chip}
                        aria-pressed={mixerTrack.armed}
                        aria-label={`Arm ${mixerTrack.name} for recording`}
                        title="Arm for record (R)"
                        onClick={(e) => {
                          e.stopPropagation()
                          armTrack(mixerTrack.id)
                        }}
                      >
                        R
                      </button>
                      )}
                      {isVoiceRole(mixerTrack.role) && (
                        <>
                          {(advanced || visibleLane.length > 1) && (
                          <button
                            type="button"
                            className={mixerTrack.listen ? primary : chip}
                            aria-pressed={mixerTrack.listen}
                            aria-label={`Best take: use ${mixerTrack.name} in the mix`}
                            title="Best take (A) — the audible take; other takes for this person stay out of the mix"
                            onClick={(e) => {
                              e.stopPropagation()
                              pushHistory()
                              setTracks((prev) => withListenTake(prev, mixerTrack.id))
                            }}
                          >
                            {advanced ? 'A' : 'Best take'}
                          </button>
                          )}
                          {advanced && (
                          <>
                          <button
                            type="button"
                            className={mixerTrack.layered ? primary : chip}
                            aria-pressed={mixerTrack.layered}
                            aria-label={`Layer ${mixerTrack.name} with the best take`}
                            title="Layer (L) — play this take together with the audible take"
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
                            aria-label={`Use ${mixerTrack.name} for the selected range (comp)`}
                            title="Comp — use this take for the selected range (other takes yield)"
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
                        </>
                      )}
                      {advanced && (
                      <>
                      <button
                        type="button"
                        className={chip}
                        aria-label={`Duplicate ${mixerTrack.name}`}
                        title="Duplicate this take onto a new slot"
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
                        aria-label={`Clear audio from ${mixerTrack.name}`}
                        title="Clear the audio from this take (keeps the slot)"
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
                        aria-label={`Remove ${mixerTrack.name}`}
                        title="Remove this take"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTrack(mixerTrack.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                      </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 studio-type-label normal-case tracking-normal text-[#A9B8C6]">
                      <label>
                        Vol {mixerTrack.volume.toFixed(2)}
                        <Slider
                          aria-label={`${mixerTrack.name} volume`}
                          min={0}
                          max={2}
                          step={0.02}
                          value={mixerTrack.volume}
                          onChange={(e) => updateTrack(mixerTrack.id, { volume: Number(e.target.value) })}
                          className="mt-1 w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      {advanced && (
                      <label>
                        Pan {mixerTrack.pan.toFixed(2)}
                        <Slider
                          aria-label={`${mixerTrack.name} pan`}
                          min={-1}
                          max={1}
                          step={0.05}
                          value={mixerTrack.pan}
                          onChange={(e) => updateTrack(mixerTrack.id, { pan: Number(e.target.value) })}
                          className="mt-1 w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      )}
                      {advanced && (
                      <label>
                        Start
                        <input
                          defaultValue={formatClock(mixerTrack.offset)}
                          key={`${mixerTrack.id}-${mixerTrack.offset.toFixed(2)}`}
                          aria-label={`${mixerTrack.name} start time (minutes:seconds)`}
                          placeholder="1:30"
                          className="mt-1 w-full rounded border border-[#27313B] bg-[#151B22] px-2 py-0.5 text-[11px] text-[#F6FAFC]"
                          onBlur={(e) => {
                            const parsed = parseClock(e.target.value)
                            if (parsed != null) updateTrack(mixerTrack.id, { offset: parsed })
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      )}
                      <label>
                        Fade {mixerTrack.fadeIn.toFixed(1)}/{mixerTrack.fadeOut.toFixed(1)}s
                        <div className="mt-1 flex gap-1">
                          <Slider
                            aria-label={`${mixerTrack.name} fade in`}
                            min={0}
                            max={4}
                            step={0.05}
                            value={mixerTrack.fadeIn}
                            onChange={(e) => updateTrack(mixerTrack.id, { fadeIn: Number(e.target.value) })}
                            className="w-1/2"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Slider
                            aria-label={`${mixerTrack.name} fade out`}
                            min={0}
                            max={4}
                            step={0.05}
                            value={mixerTrack.fadeOut}
                            onChange={(e) => updateTrack(mixerTrack.id, { fadeOut: Number(e.target.value) })}
                            className="w-1/2"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                )}
                {(() => {
                  // The audio row — every person renders this.
                  const audioRow = (
                    <SessionTimeline {...timelineBoard} personId={person.id} embedded showRuler={false} />
                  )

                  // Audio-only people (beds / SFX / voices with no camera lane) show
                  // only the waveform row — no empty video lane above it.
                  if (person.kind !== 'voice') return audioRow

                  // Live preview for this voice person — remote guest peer or local cam.
                  const guestLive =
                    person.id === 'guest' && remoteGuest && (remoteGuestVideo || streamHasLiveVideo(remoteGuest))
                  const previewStream = guestLive ? remoteGuest : cameraStreams[person.id] || null
                  const personCameraClips = cameraClips.filter((c) => c.personId === person.id)
                  // Show the video row only when this person actually has picture
                  // (clips) or a live camera to preview — otherwise it is audio-only.
                  const hasVideoRow = personCameraClips.length > 0 || Boolean(previewStream)

                  // Shared left header column: one swatch + name + role, spanning both
                  // rows, with the live preview folded in as a small thumbnail. The two
                  // rows to its right share the same content origin, pxPerSec, and scroll,
                  // so a vertical line at any x hits the same moment in video and audio.
                  const trackHeader = (
                    <div
                      className="shrink-0 w-40 flex flex-col gap-2 border-r border-divider px-2.5 py-2"
                      style={{ background: lc?.laneBg }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: lc?.base ?? person.color }} />
                        <span className="studio-type-label text-ice truncate">{person.name}</span>
                      </span>
                      <span className="studio-type-label text-silver-body normal-case tracking-normal">
                        {lc?.id ?? 'track'} · video + audio
                      </span>
                      {previewStream ? (
                        <CameraPreview
                          stream={previewStream}
                          label={guestLive ? `${person.name} (live)` : person.name}
                          live={recording}
                          role="preview"
                          compact
                        />
                      ) : (
                        <span className="studio-type-label text-silver-body normal-case tracking-normal">
                          {person.id === 'guest' ? 'Camera off — waiting for guest' : 'Camera off'}
                        </span>
                      )}
                    </div>
                  )

                  const videoRow = (
                    <CameraLane
                      hideChrome
                      clips={personCameraClips}
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
                      onSnapSync={() => {
                        const drift = avDriftForPerson(tracks, cameraClips, person.id)
                        if (!drift) return
                        pushHistory()
                        setCameraClips((prev) => snapCamerasToAudio(prev, drift))
                        setOk(`Snapped ${person.name} picture to the audio in-point — sync corrected`)
                      }}
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
                      onDissolve={(seconds) => {
                        if (!selectedCamClipId) return
                        pushHistory()
                        setCameraClips((prev) => dissolveCameraPair(prev, selectedCamClipId, seconds))
                        notifyOk(`Dissolve (${seconds}s) into the next picture clip`, {
                          description: 'Crossfade renders on export — audio unchanged',
                        })
                      }}
                      onClearDissolve={() => {
                        if (!selectedCamClipId) return
                        pushHistory()
                        setCameraClips((prev) => clearCameraDissolve(prev, selectedCamClipId))
                        notifyOk('Removed dissolve')
                      }}
                      onStinger={(where) => addStinger(person.id, where)}
                      markers={pictureMarkers}
                      edl={switchEdl}
                      switchParticipants={switchParticipants}
                      onAddSwitch={(atSec, mainId) =>
                        setSwitchEdl((e) => addSwitch(e, { atSec, mainId, reason: 'manual' }))
                      }
                      onMoveSwitch={(id, toSec) => setSwitchEdl((e) => moveSwitch(e, id, toSec))}
                      onRemoveSwitch={(id) => setSwitchEdl((e) => removeSwitch(e, id))}
                      onSetSwitchMain={(id, mainId) => setSwitchEdl((e) => setSwitchMain(e, id, mainId))}
                      audioForPerson={audioForPerson}
                    />
                  )

                  // One cohesive track group: shared left header, then the video lane
                  // stacked directly on top of the audio lane — tight, no divider break.
                  // Audio-only voices (no picture, no live camera) skip the video row.
                  return (
                    <Panel
                      elevation="flat"
                      className="overflow-hidden p-0"
                      style={{ borderColor: lc?.border, background: lc?.laneBg }}
                    >
                      <div className="flex items-stretch">
                        {trackHeader}
                        <div className="min-w-0 flex-1 flex flex-col">
                          {hasVideoRow && (
                            <div className="border-b border-divider/60">{videoRow}</div>
                          )}
                          <div>
                            <SessionTimeline
                              {...timelineBoard}
                              personId={person.id}
                              embedded
                              showRuler={false}
                              flush
                            />
                          </div>
                        </div>
                      </div>
                    </Panel>
                  )
                })()}
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
        </section>
        )}

        {showEdit && tracks.some((t) => !people.some((p) => p.id === t.personId)) && (
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
        {showEdit && (
        <section aria-labelledby="studio-master">
          <h3 id="studio-master" className="studio-type-label text-ice mb-2">
            Playhead {formatClock(playhead)} · export {describeExportRange(exportWindow)}
          </h3>
          <button
            type="button"
            aria-label={`Session overview — click to move the playhead (now at ${formatClock(playhead)})`}
            className="relative w-full h-16 rounded-panel bg-obsidian border border-divider overflow-hidden shadow-inset-well"
            onClick={(e) => {
              if (sessionLen <= 0) return
              const rect = e.currentTarget.getBoundingClientRect()
              const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              setHead(x * sessionLen)
            }}
          >
            <div
              className="absolute inset-y-0 bg-forged/15"
              style={{
                left: sessionLen > 0 ? `${(range.start / sessionLen) * 100}%` : 0,
                width: sessionLen > 0 ? `${((range.end - range.start) / sessionLen) * 100}%` : 0,
              }}
            />
            {hasAudio && (
              <div
                className="absolute top-0 bottom-0 -ml-[2.5px] w-[5px] rounded-full bg-ice shadow-[0_0_10px_rgba(141,235,255,0.6)]"
                style={{ left: sessionLen > 0 ? `${(playhead / sessionLen) * 100}%` : 0 }}
              >
                {/* Bold playhead with a grabbable top handle + glow. */}
                <span className="absolute -top-px left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-ice shadow-[0_0_8px_rgba(141,235,255,0.8)]" />
              </div>
            )}
            {!hasAudio && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-[#A9B8C6]">
                Record a take — playhead and cue mix run live, without bouncing a WAV first
              </p>
            )}
          </button>
          <div className="mt-3 grid sm:grid-cols-4 gap-3 studio-type-label normal-case tracking-normal text-[#A9B8C6]">
            <label>
              Zoom {zoom}px/s
              <Slider
                aria-label="Timeline zoom"
                min={20}
                max={200}
                step={5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <label>
              Master vol {masterGain.toFixed(2)}
              <Slider
                aria-label="Master volume"
                min={0.2}
                max={2}
                step={0.05}
                value={masterGain}
                onChange={(e) => setMasterGain(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            {advanced && (
            <>
            <label>
              Master fade in {masterFadeIn.toFixed(1)}s
              <Slider
                aria-label="Master fade in"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeIn}
                onChange={(e) => setMasterFadeIn(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <label>
              Master fade out {masterFadeOut.toFixed(1)}s
              <Slider
                aria-label="Master fade out"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeOut}
                onChange={(e) => setMasterFadeOut(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            </>
            )}
          </div>
        </section>
        )}

        {/* Effects + clip tools — Advanced only. Nothing here is needed for a first episode. */}
        {showEdit && advanced && (
        <section aria-labelledby="studio-effects">
          <h3 id="studio-effects" className="studio-type-label text-ice mb-2" title="Insert rack — bypass / wet-dry, never baked into the take">
            Effects {selected ? `· ${selected.name}` : ''} · non-destructive
          </h3>
          <div className="flex flex-wrap gap-2">
            {INSERT_FX.map((id) => {
              const fx = EFFECT_META.find((e) => e.id === id)!
              return (
                <Button
                  key={id}
                  variant="secondary"
                  size="compact"
                  title={fx.hint}
                  disabled={!selected?.buffer || Boolean(busy)}
                  onClick={() => void runEffect(id, 'insert')}
                >
                  {fx.label}
                </Button>
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
                    <Slider
                      aria-label="Insert wet/dry"
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
                      className="w-20"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="dense"
                    onClick={() => {
                      const inserts = (selected.inserts || []).filter((_, i) => i !== idx)
                      invalidateInsertCache(selected.id)
                      updateTrack(selected.id, { inserts })
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 studio-type-label text-ice" title="Render to take — rewrites the audio of the selected take (Undo brings it back)">
            Apply permanently to the take
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {RENDER_ONLY_FX.map((id) => {
              const fx = EFFECT_META.find((e) => e.id === id)!
              return (
                <Button
                  key={id}
                  variant="secondary"
                  size="compact"
                  title={fx.hint}
                  disabled={!selected?.buffer || Boolean(busy)}
                  onClick={() => void runEffect(id, 'render')}
                >
                  {fx.label}
                </Button>
              )
            })}
            <Button
              variant="secondary"
              size="compact"
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
              Bake effects into the take
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="secondary" size="compact" disabled={!selected?.buffer} onClick={splitSelectedAtPlayhead}>
              Split at playhead (same lane)
            </Button>
            <Button variant="secondary" size="compact" disabled={!selected?.buffer} title="Bounce this track to a stem file" onClick={bounceSelectedToStem}>
              Export this track
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={!hasAudio || Boolean(busy)}
              title="Bounce: normalize + compress + limit the whole mix onto a new lane. Your takes stay."
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'], 'keep')}
            >
              Flatten mix (keeps takes)
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={!hasAudio || Boolean(busy)}
              title="Normalize + limit the whole mix onto a new lane. Your takes stay."
              onClick={() => void applyMasterBus(['normalize', 'limit'], 'keep')}
            >
              Normalize + limit (keeps takes)
            </Button>
            <Button
              variant="danger"
              size="compact"
              disabled={!hasAudio || Boolean(busy)}
              title="Start over: replaces every take with one flattened, mastered mix. Undo brings the takes back."
              onClick={() => {
                if (
                  window.confirm(
                    'Start over with one flattened mix? Every take is replaced by a single mastered mix lane. Undo brings the takes back until you leave the page.',
                  )
                )
                  void applyMasterBus(['normalize', 'compress', 'limit'], 'replace')
              }}
            >
              Start over with the mix
            </Button>
          </div>
        </section>
        )}

        {showPublish && !showAll && (
          <Panel elevation="flat" className="px-3 py-2.5 text-xs text-[#A9B8C6]">
            <h3 className="studio-type-label text-ice">{hasAudio ? 'Ready to export' : 'Nothing to export yet'}</h3>
            <p className="mt-1">
              {hasAudio
                ? `Session ${durationLabel}${loudness && Number.isFinite(loudness.lufs) ? ` · ${loudness.lufs.toFixed(1)} LUFS (target ${PODCAST_LUFS})` : ''}${cameraClips.length ? ` · ${cameraClips.length} picture clip${cameraClips.length === 1 ? '' : 's'}` : ''}. ${hasVideo ? 'Use “Export episode” below to save the audio podcast-feed file and download the video, both from one master mix.' : 'Use “Export episode” below to save the audio podcast-feed file.'}`
                : 'No audio yet — record or import a take in the earlier stages before exporting.'}
            </p>
            <HowThisWorks topics={['Export and publish']} />
          </Panel>
        )}

        {showPublish && (
        <div className="flex flex-col gap-3 pt-1 border-t border-divider">
          {/* PRIMARY — one action, both deliverables from one master mix. Always writes
              the audio-only podcast-feed file; also downloads the video when the session
              has picture. One confident primary action. */}
          <div className="flex flex-col gap-1.5">
            <Button
              variant="primary"
              size="touch"
              className="w-full sm:w-auto"
              loading={Boolean(busy) && !/stems|A-roll|PIP/.test(busy || '')}
              disabled={!hasAudio || Boolean(busy)}
              title={
                hasVideo
                  ? 'One action: saves the audio-only podcast-feed file (Apple/Spotify via RSS) AND downloads the video (picture + the same master mix) for YouTube/social.'
                  : 'Saves the audio-only podcast-feed file (Apple/Spotify via RSS). No picture in this session, so no video is produced.'
              }
              onClick={() => void exportEpisode()}
            >
              {busy && !busy.includes('stems') && !busy.includes('A-roll') && !busy.includes('PIP')
                ? busy
                : hasVideo
                  ? 'Export episode (audio feed + video)'
                  : 'Export episode (audio feed)'}
            </Button>
            <p className="text-[11px] text-[#A9B8C6]">
              Always writes <span className="text-[#8DEBFF]">Audio for Apple &amp; Spotify (podcast feed)</span>
              {hasVideo ? (
                <>
                  {' '}and also downloads <span className="text-[#8DEBFF]">Video for YouTube &amp; social</span> — both from
                  one master mix, so the audio matches exactly. Video is a local download; RSS stays the audio file.
                </>
              ) : (
                ' — audio only. Add a camera take to also get a video file.'
              )}
            </p>
            {onPublished && (
              <Button
                variant="primary"
                size="touch"
                className="w-full sm:w-auto"
                loading={/publish/.test(busy || '')}
                disabled={!hasAudio || Boolean(busy)}
                title="Runs Export episode, then publishes the audio-only file to your site / RSS. Video (if any) still downloads locally."
                onClick={() => void exportEpisode(true)}
              >
                Export episode + publish to site / RSS
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
          <span className="studio-type-label w-full text-silver-label">Individual files</span>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('MP3'))}
            disabled={!hasAudio || Boolean(busy)}
            title="Audio-only MP3 podcast-feed file (Apple/Spotify via RSS) — same as the audio half of Export episode."
            onClick={() => void exportAudio('mp3')}
          >
            {busy?.includes('MP3') ? busy : 'Audio only: MP3 (podcast feed)'}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('WAV'))}
            disabled={!hasAudio || Boolean(busy)}
            title="Audio-only WAV of the master mix."
            onClick={() => void exportAudio('wav')}
          >
            {busy?.includes('WAV') ? busy : 'Audio only: WAV'}
          </Button>
          {advanced && (
          <label className="inline-flex items-center gap-1.5 text-xs text-[#A9B8C6]" title={`Loudness-match the export to ${PODCAST_LUFS} LUFS (podcast standard)`}>
            <input type="checkbox" checked={matchLufs} onChange={(e) => setMatchLufs(e.target.checked)} />
            Match podcast loudness ({PODCAST_LUFS} LUFS)
          </label>
          )}
          {hasSelection && (
            <span className="inline-flex items-center gap-2 text-xs text-[#A9B8C6]">
              <SegmentedControl
                size="dense"
                aria-label="What the audio-only export saves"
                options={[
                  { value: 'full', label: 'Whole episode' },
                  { value: 'selection', label: 'Selection only' },
                ]}
                value={exportScope}
                onValueChange={setExportScope}
              />
              <span title="Applies to the Audio only buttons. Export episode always saves the whole episode.">
                {describeExportRange(exportWindow)}
              </span>
            </span>
          )}
          {advanced && (
          <>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('stems'))}
            disabled={!hasAudio || Boolean(busy)}
            title="Every lane as its own WAV, zipped — for editing elsewhere"
            onClick={() => void downloadStems()}
          >
            {busy?.includes('stems') ? busy : 'Download stems zip'}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('A-roll'))}
            disabled={!cameraClips.length || Boolean(busy)}
            title="Host camera + audio mix, encoded as fast as this computer can. Local file — RSS stays the mix."
            onClick={() => void downloadPicture('a-roll')}
          >
            {busy?.includes('A-roll') ? busy : 'Download A-roll'}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('PIP'))}
            disabled={!cameraClips.some((c) => c.personId === 'guest') || Boolean(busy)}
            title="Host full frame, guest PIP, encoded as fast as this computer can. Local file — audio_url stays the mix."
            onClick={() => void downloadPicture('pip')}
          >
            {busy?.includes('PIP') ? busy : 'Download PIP'}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            loading={Boolean(busy?.includes('MP4'))}
            disabled={!cameraClips.length || Boolean(busy)}
            title="Video only: camera timeline muxed with the master mix into one MP4 (WebM fallback). Same as the video half of Export episode. Local deliverable — RSS stays the audio mix."
            onClick={() => void downloadDeliverable()}
          >
            {busy?.includes('MP4') ? busy : 'Video only: MP4 (picture + master mix)'}
          </Button>
          </>
          )}
          </div>
        </div>
        )}

      </div>

      {/* Full-screen overlay: the fallback "Expand to full screen" for browsers without the
          Fullscreen API (the inline stage goes full screen in place elsewhere). The guest
          panel stays mounted in the inline stage so a live call is never dropped; in legacy
          all-stages mode it is mounted in the record rack above. */}
      <RecordingBooth
        {...boothProps}
        open={boothOpen}
        onClose={() => setBoothOpen(false)}
      />

      <ShortcutsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

/** Per-panel "How this works" disclosure — the same copy the help modal shows, scoped to one panel. */
function HowThisWorks({ topics }: { topics: string[] }) {
  const items = STUDIO_HOW_IT_WORKS.filter((t) => topics.includes(t.title))
  if (!items.length) return null
  return (
    <details className="mt-1">
      <summary className="studio-type-label cursor-pointer normal-case tracking-normal text-[#9AABBA] hover:text-white">
        How this works
      </summary>
      <div className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <p key={item.title} className="text-[11px] leading-relaxed text-[#B8C4CF]">
            <span className="text-[#8DEBFF]">{item.title}.</span> {item.body}
          </p>
        ))}
      </div>
    </details>
  )
}

const btn =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40'
const chip =
  'inline-flex items-center justify-center h-7 min-w-[1.75rem] px-1.5 rounded border border-[#27313B] text-xs text-[#B8C4CF]'
const primary =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40'
const danger =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#950D12] border border-[#E74D5B]/70 text-white text-sm font-medium'
const select =
  'rounded-lg border border-[#27313B] bg-[#151B22] px-2 py-1.5 text-sm text-[#B8C4CF]'

/**
 * Record-mode choices presented as plain-language radios. The primary three cover
 * the everyday cases; rarer modes live under Advanced. Each maps to an existing
 * RecMode value — the recording behavior is unchanged. `hint` is the longer tooltip
 * text pulled from REC_MODE_META so the labels and behavior never drift apart.
 */
type RecModeChoice = { id: string; value: RecMode; label: string; blurb: string; hint: string }

function recModeHint(value: RecMode): string {
  return REC_MODE_META.find((m) => m.id === value)?.hint || ''
}

const PRIMARY_REC_MODES: RecModeChoice[] = [
  {
    id: 'new-take',
    value: 'after_mix',
    label: 'New take',
    blurb: 'Start after the current mix — the next person comes in.',
    hint: recModeHint('after_mix'),
  },
  {
    id: 'punch-in',
    value: 'at_playhead',
    label: 'Re-record from here',
    blurb: 'Punch in: drop in right at the playhead while the mix plays in your headphones.',
    hint: recModeHint('at_playhead'),
  },
  {
    id: 'replace',
    value: 'after_mine',
    label: 'Pick up',
    blurb: 'Pick up from your last take — redo a line without a fresh lane.',
    hint: recModeHint('after_mine'),
  },
]

const ADVANCED_REC_MODES: RecModeChoice[] = [
  {
    id: 'from-start',
    value: 'from_start',
    label: 'From the top',
    blurb: 'Play the whole mix from 0:00 and lay a new take on its own lane.',
    hint: recModeHint('from_start'),
  },
]

/** Primary + advanced modes, in one flat list for the segmented control. */
const ALL_REC_MODES: RecModeChoice[] = [...PRIMARY_REC_MODES, ...ADVANCED_REC_MODES]
