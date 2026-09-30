/**
 * Local safety recording of the live Program while on air — what viewers got
 * (after the broadcast delay; dumped seconds are not in it).
 *   audio: Program mix → becomes the episode draft audio
 *   video: delayed Program + mix → offered as a local download (too big to upload by default)
 *
 * Chunks (1 s MediaRecorder timeslices) are written to IndexedDB as they arrive,
 * so an hour of 2.5 Mbps video (~1.1 GB) sits on disk, not in RAM, and a
 * recording survives a crashed or closed tab (see listStoredRecordings). If
 * IndexedDB is unavailable or full, chunks fall back to memory.
 *
 * Stored recordings are kept until the host discards them; starting a new
 * recording prunes all but the newest KEEP_RECORDINGS.
 */

import { recorderMime } from '@/lib/podcast/capture'

export type LiveRecording = {
  id: string
  audio: Blob | null
  video: Blob | null
  durationSec: number
  startedAt: number
  /** 'disk' when every chunk made it to IndexedDB. */
  storage: 'disk' | 'memory' | 'mixed'
}

export type StoredRecordingMeta = {
  id: string
  title: string
  startedAt: number
  endedAt: number | null
  audioMime: string
  videoMime: string
  audioChunks: number
  videoChunks: number
}

type Track = 'audio' | 'video'
type ChunkRow = { rec: string; track: Track; seq: number; blob: Blob }

const DB_NAME = 'ff-live-recorder'
const DB_VERSION = 1
const CHUNKS = 'chunks'
const META = 'recordings'
const KEEP_RECORDINGS = 2

function videoMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mime of [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

// ---------- IndexedDB helpers ----------

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const open = indexedDB.open(DB_NAME, DB_VERSION)
      open.onupgradeneeded = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ['rec', 'track', 'seq'] })
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => resolve(null)
      open.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function putMeta(meta: StoredRecordingMeta) {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put(meta)
  await txDone(tx)
}

async function readChunks(rec: string, track: Track): Promise<Array<{ seq: number; blob: Blob }>> {
  const db = await openDb()
  if (!db) return []
  const tx = db.transaction(CHUNKS, 'readonly')
  const range = IDBKeyRange.bound([rec, track, 0], [rec, track, Number.MAX_SAFE_INTEGER])
  const rows = (await req(tx.objectStore(CHUNKS).getAll(range))) as ChunkRow[]
  return rows.map((r) => ({ seq: r.seq, blob: r.blob }))
}

/** Recordings still held in this browser (newest first). */
export async function listStoredRecordings(): Promise<StoredRecordingMeta[]> {
  try {
    const db = await openDb()
    if (!db) return []
    const tx = db.transaction(META, 'readonly')
    const rows = (await req(tx.objectStore(META).getAll())) as StoredRecordingMeta[]
    return rows.sort((a, b) => b.startedAt - a.startedAt)
  } catch {
    return []
  }
}

/** Rebuild a stored recording (e.g. after the tab crashed mid-show). */
export async function loadStoredRecording(meta: StoredRecordingMeta): Promise<LiveRecording> {
  const [a, v] = await Promise.all([readChunks(meta.id, 'audio'), readChunks(meta.id, 'video')])
  const audio = a.length ? new Blob(a.map((c) => c.blob), { type: meta.audioMime || 'audio/webm' }) : null
  const video = v.length ? new Blob(v.map((c) => c.blob), { type: meta.videoMime || 'video/webm' }) : null
  const end = meta.endedAt ?? meta.startedAt + Math.max(a.length, v.length) * 1000
  return {
    id: meta.id,
    audio,
    video,
    durationSec: Math.max(0, Math.round((end - meta.startedAt) / 1000)),
    startedAt: meta.startedAt,
    storage: 'disk',
  }
}

export async function deleteStoredRecording(id: string) {
  try {
    const db = await openDb()
    if (!db) return
    const tx = db.transaction([CHUNKS, META], 'readwrite')
    tx.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 'audio', 0], [id, 'video', Number.MAX_SAFE_INTEGER]))
    tx.objectStore(META).delete(id)
    await txDone(tx)
  } catch {
    /* best effort */
  }
}

async function pruneStored(keep: number) {
  const rows = await listStoredRecordings()
  for (const row of rows.slice(keep)) await deleteStoredRecording(row.id)
}

// ---------- recording ----------

class TrackRecorder {
  readonly recorder: MediaRecorder
  readonly done: Promise<void>
  private seq = 0
  private writes: Promise<void> = Promise.resolve()
  private memory: Array<{ seq: number; blob: Blob }> = []
  private diskFailed = false
  stored = 0

  constructor(
    private rec: string,
    private track: Track,
    stream: MediaStream,
    mime: string,
    options: MediaRecorderOptions,
    private db: IDBDatabase | null,
  ) {
    this.recorder = new MediaRecorder(stream, mime ? { ...options, mimeType: mime } : options)
    this.done = new Promise<void>((resolve) => {
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.store(e.data)
      }
      this.recorder.onstop = () => resolve()
      this.recorder.onerror = () => resolve()
    })
    this.recorder.start(1000)
  }

  get mimeType() {
    return this.recorder.mimeType
  }

  get usedMemory() {
    return this.memory.length > 0
  }

  private store(blob: Blob) {
    const seq = this.seq++
    if (!this.db || this.diskFailed) {
      this.memory.push({ seq, blob })
      return
    }
    const db = this.db
    this.writes = this.writes.then(async () => {
      try {
        const tx = db.transaction(CHUNKS, 'readwrite')
        tx.objectStore(CHUNKS).put({ rec: this.rec, track: this.track, seq, blob } satisfies ChunkRow)
        await txDone(tx)
        this.stored += 1
      } catch (err) {
        // Quota or private mode: keep the rest in memory rather than lose it.
        console.warn('[live] recording chunk kept in memory', err)
        this.diskFailed = true
        this.memory.push({ seq, blob })
      }
    })
  }

  async finish(fallbackType: string): Promise<Blob | null> {
    if (this.recorder.state !== 'inactive') this.recorder.stop()
    await this.done
    await this.writes
    const disk = this.stored ? await readChunks(this.rec, this.track).catch(() => []) : []
    const parts = [...disk, ...this.memory].sort((a, b) => a.seq - b.seq)
    if (!parts.length) return null
    return new Blob(
      parts.map((p) => p.blob),
      { type: this.recorder.mimeType || fallbackType },
    )
  }
}

export class LiveRecorder {
  private audio: TrackRecorder | null = null
  private video: TrackRecorder | null = null
  private startedAt = 0
  private id = ''
  private meta: StoredRecordingMeta | null = null

  get active() {
    return Boolean(this.audio || this.video)
  }

  get recordingId() {
    return this.id
  }

  async start(programVideo: MediaStream, programAudio: MediaStream, withVideo: boolean, title = 'Live show') {
    if (this.active) return
    this.startedAt = Date.now()
    this.id = `live-${this.startedAt}-${Math.random().toString(36).slice(2, 8)}`
    const db = await openDb()
    if (db) await pruneStored(KEEP_RECORDINGS - 1).catch(() => {})
    const audioTracks = programAudio.getAudioTracks()
    if (audioTracks.length) {
      this.audio = new TrackRecorder(
        this.id,
        'audio',
        new MediaStream(audioTracks),
        recorderMime(),
        { audioBitsPerSecond: 128_000 },
        db,
      )
    }
    if (withVideo) {
      const tracks = [...programVideo.getVideoTracks(), ...audioTracks]
      if (tracks.length) {
        this.video = new TrackRecorder(
          this.id,
          'video',
          new MediaStream(tracks),
          videoMime(),
          { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 },
          db,
        )
      }
    }
    this.meta = {
      id: this.id,
      title,
      startedAt: this.startedAt,
      endedAt: null,
      audioMime: this.audio?.mimeType || '',
      videoMime: this.video?.mimeType || '',
      audioChunks: 0,
      videoChunks: 0,
    }
    if (db) await putMeta(this.meta).catch(() => {})
  }

  async stop(): Promise<LiveRecording> {
    const audio = this.audio
    const video = this.video
    this.audio = null
    this.video = null
    const [a, v] = await Promise.all([
      audio?.finish('audio/webm') ?? null,
      video?.finish('video/webm') ?? null,
    ])
    const endedAt = Date.now()
    if (this.meta) {
      await putMeta({
        ...this.meta,
        endedAt,
        audioChunks: audio?.stored ?? 0,
        videoChunks: video?.stored ?? 0,
      }).catch(() => {})
    }
    const usedMemory = Boolean(audio?.usedMemory || video?.usedMemory)
    const usedDisk = Boolean((audio?.stored ?? 0) + (video?.stored ?? 0))
    return {
      id: this.id,
      audio: a && a.size ? a : null,
      video: v && v.size ? v : null,
      durationSec: this.startedAt ? Math.round((endedAt - this.startedAt) / 1000) : 0,
      startedAt: this.startedAt,
      storage: usedMemory ? (usedDisk ? 'mixed' : 'memory') : 'disk',
    }
  }
}

export function extensionFor(blob: Blob) {
  if (blob.type.includes('mp4')) return blob.type.startsWith('audio') ? 'm4a' : 'mp4'
  return 'webm'
}
