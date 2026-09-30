/**
 * Guest backup recorder + progressive uploader (booth side).
 *
 * Why chunks and not one file at the end: a 1-hour WAV is ~600 MB and a failed
 * upload at the end loses everything. MediaRecorder (Opus in WebM, or AAC in
 * fragmented MP4 on Safari) with a 10 s timeslice produces small slices that are
 * uploaded WHILE recording, each to its own single-use signed upload token
 * minted by our server for this guest + invite + take (the browser never holds
 * a service key). A slice that fails is retried with jittered backoff; coming
 * back online retries at once.
 *
 * Durability:
 * - Every slice is also written to IndexedDB until the host confirms it, so a
 *   reload or a crashed tab loses at most the slice in progress. On the next
 *   visit `resumeGuestBackups()` sends what is left and finishes the take.
 * - Slices of 6 MB or more (WAV fallback, camera) go through Supabase's TUS
 *   endpoint with the same per-object signed token, so a half-sent large object
 *   resumes instead of restarting.
 * - The whole take is also kept in memory so the guest can always
 *   "Download my backup" if the network never comes back.
 *
 * Alignment: the host's record-on signal carries its session clock (`sessionSec`)
 * and wall clock (`hostAt`). The data channel ping gives host-minus-guest clock
 * offset. On finish we send startedAtSessionSec = sessionSec + (guestStartInHostClock - hostAt)/1000.
 */

import { cameraRecorderMime } from '@/lib/podcast/camera'

/** Camera backup bitrate (~720p30). Kept local so this module does not depend on the camera engine's constants. */
const CAMERA_VIDEO_BPS = 2_500_000
import { startLaneCapture, stopLaneCapture, type LaneCapture } from '@/lib/podcast/capture'
import { backoffDelay } from '@/lib/podcast/guest/backoff'
import {
  finishGuestChunkedTake,
  signGuestChunks,
  startGuestChunkedTake,
  type GuestChunkUrl,
  type TusConfig,
} from '@/lib/podcast/guest-signal'
import { tusUploadSigned, UploadHttpError } from '@/lib/podcast/media-upload'
import {
  clearPendingForInvite,
  listPendingSlices,
  listPendingTakes,
  removePendingSlice,
  removePendingTake,
  savePendingSlice,
  savePendingTake,
  tokenTag,
  type PendingTake,
} from '@/lib/podcast/upload/guest-backup-store'
import {
  BLOB_SLICE_BYTES,
  CHUNK_TIMESLICE_MS,
  SIGN_BATCH_MAX,
  TUS_MIN_BYTES,
  baseMime,
} from '@/lib/podcast/upload/guest-take-manifest'

export type BackupKind = 'audio' | 'camera'

export type BackupState =
  | 'recording' // recorder running, slices uploading as they come
  | 'finishing' // recorder stopped, last slices uploading
  | 'done' // host has the whole take
  | 'failed' // upload gave up; local download (or a later resume) is the fallback
  | 'local-only' // server refused/unavailable from the start; local download only

export type BackupStatus = {
  kind: BackupKind
  state: BackupState
  takeId: string | null
  chunksRecorded: number
  chunksUploaded: number
  bytesRecorded: number
  bytesUploaded: number
  error: string | null
  /** Every recorded slice is with the host: closing this tab loses nothing. */
  safeToClose: boolean
  /** Unsent slices are saved on this device and will be sent again after a reload. */
  persisted: boolean
  /** Picked up from an earlier visit (reload / crashed tab) rather than recorded now. */
  resumed: boolean
}

export type GuestBackupClock = () => { offsetMs: number | null; rttMs: number | null }

export type GuestBackupOptions = {
  token: string
  kind: BackupKind
  stream: MediaStream
  /** Host session time (s) at record start, from the record signal. */
  sessionSec?: number | null
  /** Host wall clock (epoch ms) at sessionSec. */
  hostAt?: number | null
  /** Host-minus-guest clock offset from the data channel. */
  clock?: GuestBackupClock
  onStatus?: (status: BackupStatus) => void
}

export type GuestBackup = {
  kind: BackupKind
  mime: string
  filename: string
  status: () => BackupStatus
  /** Stop recording (flushes the last slice). Resolves when the recorder has stopped. */
  stopRecording: () => Promise<void>
  /** Resolves when uploading has settled (done / failed / local-only). */
  settled: Promise<BackupStatus>
  /** Retry after a failure (e.g. a "Try sending again" button). */
  retry: () => Promise<BackupStatus>
  /** Whole take as one Blob for "Download my backup" (null when only a partial tail is on this device). */
  localBlob: () => Blob | null
}

const MAX_ATTEMPTS_AFTER_STOP = 8
/** Resumed takes: attempts before we stop and wait for "Try again" / the next visit. */
const MAX_RESUME_ATTEMPTS = 10

export function guestAudioBackupMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

function extFor(mime: string) {
  const base = baseMime(mime)
  if (base.endsWith('/webm')) return 'webm'
  if (base.endsWith('/ogg')) return 'ogg'
  if (base === 'audio/mp4') return 'm4a'
  if (base === 'video/mp4') return 'mp4'
  if (base.includes('wav')) return 'wav'
  return 'bin'
}

function backupFilename(kind: BackupKind, baseType: string) {
  return `forged-in-the-fire-${kind === 'camera' ? 'camera' : 'audio'}-backup.${extFor(baseType)}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoff(attempt: number) {
  return backoffDelay(attempt, { base: 1000, max: 30_000, jitter: 0.3 })
}

/** Server answers that will not fix themselves by retrying (not enabled, bad type, revoked link, other device). */
const REFUSAL = /not switched on|must be|not valid|revoked|expired|another device|join the booth|already complete|was closed/i

export class UploadRefused extends Error {}

/* ---------- shared upload plumbing (live + resumed takes) ---------- */

/** Signed upload targets for one take, minted in batches and dropped when a token is refused. */
class SignCache {
  private urls = new Map<number, GuestChunkUrl>()
  upload: TusConfig | null = null

  constructor(
    private token: string,
    private takeId: string,
    upload: TusConfig | null = null,
  ) {
    this.upload = upload
  }

  async get(index: number) {
    const cached = this.urls.get(index)
    if (cached) return cached
    const res = await signGuestChunks(this.token, this.takeId, index, SIGN_BATCH_MAX)
    if (res.upload) this.upload = res.upload
    for (const u of res.urls) this.urls.set(u.index, u)
    const url = this.urls.get(index)
    if (!url) throw new Error('No upload URL')
    return url
  }

  drop(index: number) {
    this.urls.delete(index)
  }
}

/** Send one slice to its signed target: TUS (resumable) for large objects, one PUT otherwise. */
async function putSlice(blob: Blob, baseType: string, target: GuestChunkUrl, upload: TusConfig | null) {
  if (blob.size >= TUS_MIN_BYTES && target.token && upload) {
    try {
      await tusUploadSigned(
        blob,
        { ...upload, path: target.path, token: target.token, signedUrl: target.signedUrl },
        { contentType: baseType, fingerprint: `fitf-slice:${target.path}:${blob.size}` },
      )
      return
    } catch (err) {
      if (err instanceof UploadHttpError && err.status === 413) throw new UploadRefused('This part is too large to upload')
      throw err
    }
  }
  const res = await fetch(target.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': baseType, 'x-upsert': 'true' },
    body: blob,
    referrerPolicy: 'no-referrer',
  })
  if (res.ok) return
  if (res.status === 413) throw new UploadRefused('This part is too large to upload')
  throw new Error(`Upload failed (${res.status})`)
}

type FinishAlign = {
  durationSec: number | null
  startedAtSessionSec: number | null
  guestStartHostMs: number | null
  clockRttMs: number | null
}

/* ---------- live recording ---------- */

export async function startGuestBackup(opts: GuestBackupOptions): Promise<GuestBackup> {
  const { token, kind } = opts
  const tag = tokenTag(token)
  const tracks = kind === 'camera' ? opts.stream.getVideoTracks() : opts.stream.getAudioTracks()
  if (!tracks.length) throw new Error(kind === 'camera' ? 'No camera to back up' : 'No microphone to back up')
  const source = new MediaStream(tracks)

  // ---------- recorder ----------
  let recorder: MediaRecorder | null = null
  let lane: LaneCapture | null = null
  let mime = kind === 'camera' ? cameraRecorderMime() : guestAudioBackupMime()
  if (typeof MediaRecorder !== 'undefined') {
    try {
      const bitrate = kind === 'camera' ? { videoBitsPerSecond: CAMERA_VIDEO_BPS } : { audioBitsPerSecond: 128_000 }
      recorder = new MediaRecorder(source, { ...(mime ? { mimeType: mime } : {}), ...bitrate })
    } catch {
      try {
        recorder = mime ? new MediaRecorder(source, { mimeType: mime }) : new MediaRecorder(source)
      } catch {
        recorder = null
      }
    }
  }
  if (!recorder && kind === 'audio') {
    // No MediaRecorder at all: whole-file capture (WAV via worklet), sliced and uploaded on stop.
    lane = await startLaneCapture('guest-backup', source)
    mime = 'audio/wav'
  }
  if (!recorder && !lane) throw new Error('This browser cannot record a backup')
  if (recorder?.mimeType) mime = recorder.mimeType
  const baseType = baseMime(mime) || (kind === 'camera' ? 'video/webm' : 'audio/webm')
  const filename = backupFilename(kind, baseType)

  const parts: Blob[] = []
  const uploaded = new Set<number>()
  const status: BackupStatus = {
    kind,
    state: 'recording',
    takeId: null,
    chunksRecorded: 0,
    chunksUploaded: 0,
    bytesRecorded: 0,
    bytesUploaded: 0,
    error: null,
    safeToClose: false,
    persisted: true,
    resumed: false,
  }
  const emit = () => opts.onStatus?.({ ...status })

  let startGuestMs = Date.now()
  let stopGuestMs: number | null = null
  let stopped = false
  let takeId: string | null = null
  let takeStart: Promise<string | null> | null = null
  let signs: SignCache | null = null
  let pumping = false
  let pumpAgain = false
  let attemptsAfterStop = 0
  let settle: (s: BackupStatus) => void = () => {}
  const settled = new Promise<BackupStatus>((resolve) => {
    settle = resolve
  })

  const alignment = (): FinishAlign => {
    const offset = opts.clock?.().offsetMs ?? null
    const rtt = opts.clock?.().rttMs ?? null
    const guestStartHostMs = offset == null ? null : Math.round(startGuestMs + offset)
    let startedAtSessionSec: number | null = opts.sessionSec ?? null
    if (startedAtSessionSec != null && opts.hostAt && guestStartHostMs != null) {
      startedAtSessionSec = Math.max(0, startedAtSessionSec + (guestStartHostMs - opts.hostAt) / 1000)
    }
    return {
      durationSec: stopGuestMs ? Math.max(0, (stopGuestMs - startGuestMs) / 1000) : null,
      startedAtSessionSec,
      guestStartHostMs,
      clockRttMs: rtt == null ? null : Math.round(rtt),
    }
  }

  /** Remember the take on this device so a reload can finish it. Best-effort. */
  const persistTake = async () => {
    if (!takeId) return
    const ok = await savePendingTake({
      tag,
      takeId,
      kind,
      mime: baseType,
      chunksRecorded: parts.length,
      finalChunks: stopped ? parts.length : null,
      ...alignment(),
    })
    if (!ok) {
      status.persisted = false
      emit()
    }
  }

  const persistSlice = async (index: number) => {
    const id = await ensureTake()
    if (!id || uploaded.has(index)) return
    const ok = await savePendingSlice(tag, id, index, parts[index])
    if (!ok && status.persisted) {
      status.persisted = false
      emit()
    }
    // Lost a race with a fast upload: do not leave a stale copy behind.
    if (uploaded.has(index)) await removePendingSlice(tag, id, index)
  }

  const ensureTake = () => {
    if (takeId) return Promise.resolve(takeId)
    if (!takeStart) {
      takeStart = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await startGuestChunkedTake(token, {
              kind,
              mime: baseType,
              sessionSec: opts.sessionSec ?? null,
              hostAt: opts.hostAt ?? null,
            })
            takeId = res.takeId
            status.takeId = res.takeId
            signs = new SignCache(token, res.takeId, res.upload || null)
            emit()
            void persistTake().then(() => Promise.all(parts.map((_, i) => persistSlice(i))))
            return res.takeId as string | null
          } catch (err) {
            const msg = err instanceof Error ? err.message : ''
            // Refusals (not enabled, bad type, revoked link) will not fix themselves.
            if (REFUSAL.test(msg) || attempt >= 6) {
              status.state = 'local-only'
              status.error = msg || 'Could not start the backup upload'
              status.persisted = false
              emit()
              return null
            }
            await sleep(backoff(attempt))
          }
        }
      })().then((id) => {
        if (!id) takeStart = null
        return id
      })
    }
    return takeStart
  }

  async function putChunk(index: number) {
    const blob = parts[index]
    if (status.state === 'local-only') throw new UploadRefused('Upload is off')
    const id = await ensureTake()
    if (!id || !signs) throw new UploadRefused('No take')
    const target = await signs.get(index)
    try {
      await putSlice(blob, baseType, target, signs.upload)
    } catch (err) {
      // Expired/used token: mint a fresh one on the next attempt.
      signs.drop(index)
      throw err
    }
  }

  async function finish() {
    const id = await ensureTake()
    if (!id) throw new UploadRefused('No take')
    const res = await finishGuestChunkedTake(token, { takeId: id, chunks: parts.length, ...alignment() })
    if (res.missing?.length) {
      res.missing.forEach((i) => uploaded.delete(i))
      status.chunksUploaded = uploaded.size
      throw new Error('Some parts did not arrive')
    }
    void removePendingTake(tag, id)
  }

  async function pump(): Promise<void> {
    if (pumping) {
      pumpAgain = true
      return
    }
    pumping = true
    try {
      for (;;) {
        pumpAgain = false
        const index = parts.findIndex((_, i) => !uploaded.has(i))
        if (index === -1) {
          if (stopped && status.state === 'finishing') {
            await finish()
            status.state = 'done'
            status.error = null
            status.safeToClose = true
            emit()
            settle({ ...status })
          }
          if (!pumpAgain) return
          continue
        }
        await putChunk(index)
        uploaded.add(index)
        // After uploaded.add(): a persist still in flight sees the flag and removes its own copy.
        if (takeId) void removePendingSlice(tag, takeId, index)
        status.chunksUploaded = uploaded.size
        status.bytesUploaded += parts[index].size
        status.error = null
        attemptsAfterStop = 0
        emit()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      const refused = err instanceof UploadRefused || status.state === 'local-only' || REFUSAL.test(msg)
      status.error = msg
      if (status.state === 'local-only') {
        if (stopped) settle({ ...status })
        emit()
        return
      }
      if (stopped) attemptsAfterStop += 1
      if (refused || (stopped && attemptsAfterStop >= MAX_ATTEMPTS_AFTER_STOP)) {
        status.state = 'failed'
        emit()
        if (stopped) settle({ ...status })
        return
      }
      emit()
      const wait = backoff(stopped ? attemptsAfterStop : Math.min(attemptsAfterStop + 2, 5))
      setTimeout(() => void pump(), wait)
    } finally {
      pumping = false
    }
  }

  const addPart = (blob: Blob) => {
    if (!blob.size) return
    parts.push(blob)
    const index = parts.length - 1
    status.chunksRecorded = parts.length
    status.bytesRecorded += blob.size
    emit()
    void persistSlice(index).then(persistTake)
    void pump()
  }

  const onOnline = () => {
    if (status.state === 'failed' || status.state === 'recording' || status.state === 'finishing') {
      if (status.state === 'failed') status.state = stopped ? 'finishing' : 'recording'
      attemptsAfterStop = 0
      void pump()
    }
  }
  window.addEventListener('online', onOnline)

  let recorderStopped: Promise<void> = Promise.resolve()
  if (recorder) {
    const rec = recorder
    recorderStopped = new Promise<void>((resolve) => {
      rec.addEventListener('stop', () => resolve(), { once: true })
      rec.addEventListener('error', () => resolve(), { once: true })
    })
    rec.addEventListener('start', () => {
      startGuestMs = Date.now()
    })
    rec.ondataavailable = (event) => addPart(event.data)
    rec.start(CHUNK_TIMESLICE_MS)
  }
  startGuestMs = Date.now()
  void ensureTake()
  emit()

  async function stopRecording() {
    if (stopped) return
    stopped = true
    stopGuestMs = Date.now()
    if (recorder) {
      if (recorder.state !== 'inactive') recorder.stop()
      await recorderStopped
    } else if (lane) {
      stopLaneCapture(lane)
      const blob = await lane.done.catch(() => null)
      if (blob) for (let at = 0; at < blob.size; at += BLOB_SLICE_BYTES) addPart(blob.slice(at, at + BLOB_SLICE_BYTES, baseType))
    }
    if (status.state === 'recording') status.state = 'finishing'
    emit()
    void persistTake()
    if (status.state === 'local-only') {
      settle({ ...status })
    } else if (!parts.length) {
      status.state = 'done'
      status.safeToClose = true
      if (takeId) void removePendingTake(tag, takeId)
      settle({ ...status })
    } else {
      void pump()
    }
  }

  void settled.then(() => window.removeEventListener('online', onOnline))

  return {
    kind,
    mime: baseType,
    filename,
    status: () => ({ ...status }),
    stopRecording,
    settled,
    async retry() {
      if (status.state === 'done') return { ...status }
      if (status.state === 'local-only') {
        status.state = stopped ? 'finishing' : 'recording'
        takeStart = null
      }
      if (status.state === 'failed') status.state = stopped ? 'finishing' : 'recording'
      attemptsAfterStop = 0
      status.error = null
      emit()
      await pump()
      return new Promise<BackupStatus>((resolve) => {
        const check = () => {
          if (status.state === 'done' || status.state === 'failed' || status.state === 'local-only') resolve({ ...status })
          else setTimeout(check, 500)
        }
        check()
      })
    },
    localBlob: () => (parts.length ? new Blob(parts, { type: baseType }) : null),
  }
}

/* ---------- resume after reload ---------- */

export type ResumeOptions = {
  token: string
  onStatus?: (takeId: string, status: BackupStatus) => void
}

/** True when this device still holds unsent backup data for the invite (cheap check for the UI). */
export async function hasPendingGuestBackups(token: string) {
  const tag = tokenTag(token)
  const [takes, slices] = await Promise.all([listPendingTakes(tag), listPendingSlices(tag)])
  return takes.length > 0 || slices.length > 0
}

/**
 * Pick up takes this device did not finish sending (reload, crashed tab, closed
 * laptop) and send the rest. Needs a valid device session (the booth's Join
 * mints one), so call it once the session is known. Returns one GuestBackup
 * per unfinished take; takes with nothing left to send are finished at once.
 */
export async function resumeGuestBackups(opts: ResumeOptions): Promise<GuestBackup[]> {
  const { token } = opts
  const tag = tokenTag(token)
  const takes = await listPendingTakes(tag)
  const out: GuestBackup[] = []
  for (const take of takes) {
    const slices = await listPendingSlices(tag, take.takeId)
    if (!slices.length && take.chunksRecorded === 0) {
      await removePendingTake(tag, take.takeId)
      continue
    }
    out.push(resumeOne(token, tag, take, slices.map((s) => ({ index: s.index, blob: new Blob([s.bytes], { type: take.mime }) })), opts))
  }
  // Orphan slices whose take row was lost: nothing can finish them; drop them.
  const known = new Set(takes.map((t) => t.takeId))
  for (const s of await listPendingSlices(tag)) if (!known.has(s.takeId)) await removePendingSlice(tag, s.takeId, s.index)
  return out
}

function resumeOne(
  token: string,
  tag: string,
  take: PendingTake,
  local: { index: number; blob: Blob }[],
  opts: ResumeOptions,
): GuestBackup {
  const baseType = take.mime
  const kind = take.kind
  const expected = Math.max(take.finalChunks ?? take.chunksRecorded, local.length ? Math.max(...local.map((l) => l.index)) + 1 : 0)
  const pending = new Map(local.map((l) => [l.index, l.blob]))
  const status: BackupStatus = {
    kind,
    state: 'finishing',
    takeId: take.takeId,
    chunksRecorded: expected,
    chunksUploaded: Math.max(0, expected - pending.size),
    bytesRecorded: local.reduce((n, l) => n + l.blob.size, 0),
    bytesUploaded: 0,
    error: null,
    safeToClose: false,
    persisted: true,
    resumed: true,
  }
  const emit = () => opts.onStatus?.(take.takeId, { ...status })
  const signs = new SignCache(token, take.takeId)
  let attempts = 0
  let running = false
  let settle: (s: BackupStatus) => void = () => {}
  const settled = new Promise<BackupStatus>((resolve) => {
    settle = resolve
  })
  const align: FinishAlign = {
    durationSec: take.durationSec,
    startedAtSessionSec: take.startedAtSessionSec,
    guestStartHostMs: take.guestStartHostMs,
    clockRttMs: take.clockRttMs,
  }

  const done = async () => {
    status.state = 'done'
    status.error = null
    status.safeToClose = true
    await removePendingTake(tag, take.takeId)
    for (const index of [...pending.keys()]) await removePendingSlice(tag, take.takeId, index)
    pending.clear()
    emit()
    settle({ ...status })
    window.removeEventListener('online', onOnline)
  }

  const fail = (msg: string) => {
    status.state = 'failed'
    status.error = msg
    emit()
    settle({ ...status })
  }

  const run = async () => {
    if (running || status.state === 'done') return
    running = true
    try {
      for (const index of [...pending.keys()].sort((a, b) => a - b)) {
        const blob = pending.get(index) as Blob
        let target: GuestChunkUrl
        try {
          target = await signs.get(index)
        } catch (err) {
          // Complete: a reload lost our "done" mark. Closed (abandoned): the host gave up on it; nothing to add.
          if (/already complete|was closed/i.test(err instanceof Error ? err.message : '')) {
            await done()
            return
          }
          throw err
        }
        try {
          await putSlice(blob, baseType, target, signs.upload)
        } catch (err) {
          signs.drop(index)
          throw err
        }
        pending.delete(index)
        await removePendingSlice(tag, take.takeId, index)
        status.chunksUploaded += 1
        status.bytesUploaded += blob.size
        status.error = null
        attempts = 0
        emit()
      }
      let chunks = expected
      for (let round = 0; round < 2; round++) {
        const res = await finishGuestChunkedTake(token, { takeId: take.takeId, chunks, ...align })
        if (!res.missing?.length || res.complete) {
          await done()
          return
        }
        // Parts this device never had (storage was blocked at the time): keep the contiguous start.
        chunks = Math.min(...res.missing)
        status.chunksRecorded = chunks
        status.chunksUploaded = Math.min(status.chunksUploaded, chunks)
        emit()
      }
      throw new Error('Some parts did not arrive')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      if (err instanceof UploadRefused || REFUSAL.test(msg) || ++attempts >= MAX_RESUME_ATTEMPTS) {
        // Keep the data on this device: the guest can rejoin (new device session) and try again.
        fail(/another device|join the booth/i.test(msg) ? 'Join the booth again to finish sending your backup.' : msg)
        return
      }
      status.error = msg
      emit()
      setTimeout(() => void run(), backoff(attempts - 1))
    } finally {
      running = false
    }
  }

  const onOnline = () => {
    if (status.state === 'failed') status.state = 'finishing'
    attempts = 0
    void run()
  }
  window.addEventListener('online', onOnline)
  emit()
  void run()

  const contiguousFromStart = () => {
    const indices = [...pending.keys()].sort((a, b) => a - b)
    return indices.length > 0 && indices[0] === 0 && indices.every((v, i) => v === i) && indices.length === expected
  }

  return {
    kind,
    mime: baseType,
    filename: backupFilename(kind, baseType),
    status: () => ({ ...status }),
    stopRecording: async () => {},
    settled,
    async retry() {
      if (status.state === 'done') return { ...status }
      status.state = 'finishing'
      status.error = null
      attempts = 0
      emit()
      await run()
      return new Promise<BackupStatus>((resolve) => {
        const check = () => {
          if (status.state === 'done' || status.state === 'failed') resolve({ ...status })
          else setTimeout(check, 500)
        }
        check()
      })
    },
    // Only whole takes are worth downloading: a WebM/MP4 tail without its header does not play.
    localBlob: () => (contiguousFromStart() ? new Blob([...pending.keys()].sort((a, b) => a - b).map((i) => pending.get(i) as Blob), { type: baseType }) : null),
  }
}

/** Forget everything saved on this device for the invite (after the host confirmed every take, or on request). */
export async function forgetGuestBackups(token: string) {
  await clearPendingForInvite(tokenTag(token))
}
