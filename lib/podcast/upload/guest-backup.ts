/**
 * Guest backup recorder + progressive uploader (booth side).
 *
 * Why chunks and not one file at the end: a 1-hour WAV is ~600 MB and a failed
 * upload at the end loses everything. MediaRecorder (Opus in WebM, or AAC in
 * fragmented MP4 on Safari) with a 10 s timeslice produces small slices that are
 * uploaded WHILE recording, each to its own single-use signed upload URL minted
 * by our server for this guest + invite + take. A slice that fails is retried
 * with backoff; the whole take is also kept in memory so the guest can always
 * "Download my backup" if the network never comes back.
 *
 * (Supabase's TUS endpoint accepts a signed-upload token via `x-signature`, but it
 * needs 6 MB chunks and a known length — minutes of audio buffered before the
 * first byte is safe. Per-slice objects are safer for a live recording.)
 *
 * Alignment: the host's record-on signal carries its session clock (`sessionSec`)
 * and wall clock (`hostAt`). The data channel ping gives host-minus-guest clock
 * offset. On finish we send startedAtSessionSec = sessionSec + (guestStartInHostClock - hostAt)/1000.
 */

import { cameraRecorderMime, CAMERA_VIDEO_BPS } from '@/lib/podcast/camera'
import { startLaneCapture, stopLaneCapture, type LaneCapture } from '@/lib/podcast/capture'
import {
  finishGuestChunkedTake,
  signGuestChunks,
  startGuestChunkedTake,
} from '@/lib/podcast/guest-signal'
import {
  BLOB_SLICE_BYTES,
  CHUNK_TIMESLICE_MS,
  SIGN_BATCH_MAX,
  baseMime,
} from '@/lib/podcast/upload/guest-take-manifest'

export type BackupKind = 'audio' | 'camera'

export type BackupState =
  | 'recording' // recorder running, slices uploading as they come
  | 'finishing' // recorder stopped, last slices uploading
  | 'done' // host has the whole take
  | 'failed' // upload gave up; local download is the fallback
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
  /** Whole take as one Blob for "Download my backup". */
  localBlob: () => Blob | null
}

const MAX_ATTEMPTS_AFTER_STOP = 8

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function backoff(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 400)
}

class UploadRefused extends Error {}

export async function startGuestBackup(opts: GuestBackupOptions): Promise<GuestBackup> {
  const { token, kind } = opts
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
  const filename = `forged-in-the-fire-${kind === 'camera' ? 'camera' : 'audio'}-backup.${extFor(baseType)}`

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
  }
  const emit = () => opts.onStatus?.({ ...status })

  let startGuestMs = Date.now()
  let stopGuestMs: number | null = null
  let stopped = false
  let takeId: string | null = null
  let takeStart: Promise<string | null> | null = null
  const urlCache = new Map<number, string>()
  let pumping = false
  let pumpAgain = false
  let attemptsAfterStop = 0
  let settle: (s: BackupStatus) => void = () => {}
  const settled = new Promise<BackupStatus>((resolve) => {
    settle = resolve
  })

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
            emit()
            return res.takeId as string | null
          } catch (err) {
            const msg = err instanceof Error ? err.message : ''
            // Refusals (not enabled, bad type, revoked link) will not fix themselves.
            if (/not switched on|must be|not valid|revoked|expired|another device|join the booth/i.test(msg) || attempt >= 6) {
              status.state = 'local-only'
              status.error = msg || 'Could not start the backup upload'
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

  async function urlFor(index: number) {
    const cached = urlCache.get(index)
    if (cached) return cached
    if (status.state === 'local-only') throw new UploadRefused('Upload is off')
    const id = await ensureTake()
    if (!id) throw new UploadRefused('No take')
    const res = await signGuestChunks(token, id, index, SIGN_BATCH_MAX)
    for (const u of res.urls) urlCache.set(u.index, u.signedUrl)
    const url = urlCache.get(index)
    if (!url) throw new Error('No upload URL')
    return url
  }

  async function putChunk(index: number) {
    const blob = parts[index]
    const url = await urlFor(index)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': baseType, 'x-upsert': 'true' },
      body: blob,
      referrerPolicy: 'no-referrer',
    })
    if (res.ok) return
    // Expired/used token: mint a fresh one on the next attempt.
    urlCache.delete(index)
    if (res.status === 413) throw new UploadRefused('This part is too large to upload')
    throw new Error(`Upload failed (${res.status})`)
  }

  async function finish() {
    const id = await ensureTake()
    if (!id) throw new UploadRefused('No take')
    const offset = opts.clock?.().offsetMs ?? null
    const rtt = opts.clock?.().rttMs ?? null
    const guestStartHostMs = offset == null ? null : Math.round(startGuestMs + offset)
    let startedAtSessionSec: number | null = opts.sessionSec ?? null
    if (startedAtSessionSec != null && opts.hostAt && guestStartHostMs != null) {
      startedAtSessionSec = Math.max(0, startedAtSessionSec + (guestStartHostMs - opts.hostAt) / 1000)
    }
    const durationSec = stopGuestMs ? Math.max(0, (stopGuestMs - startGuestMs) / 1000) : null
    const res = await finishGuestChunkedTake(token, {
      takeId: id,
      chunks: parts.length,
      durationSec,
      startedAtSessionSec,
      guestStartHostMs,
      clockRttMs: rtt == null ? null : Math.round(rtt),
    })
    if (res.missing?.length) {
      res.missing.forEach((i) => uploaded.delete(i))
      status.chunksUploaded = uploaded.size
      throw new Error('Some parts did not arrive')
    }
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
            emit()
            settle({ ...status })
          }
          if (!pumpAgain) return
          continue
        }
        await putChunk(index)
        uploaded.add(index)
        status.chunksUploaded = uploaded.size
        status.bytesUploaded += parts[index].size
        status.error = null
        attemptsAfterStop = 0
        emit()
      }
    } catch (err) {
      const refused = err instanceof UploadRefused || status.state === 'local-only'
      status.error = err instanceof Error ? err.message : 'Upload failed'
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
    status.chunksRecorded = parts.length
    status.bytesRecorded += blob.size
    emit()
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
    if (status.state === 'local-only') {
      settle({ ...status })
    } else if (!parts.length) {
      status.state = 'done'
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
