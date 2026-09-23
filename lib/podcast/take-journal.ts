/**
 * Crash-safe take journal (Stream B implements; Stream A consumes).
 * Audio is persisted in ~1 s chunks WHILE recording, so a crash, refresh or tab close
 * never loses more than a few seconds.
 *
 * Storage: IndexedDB database `fitf-take-journal` (separate from the session store).
 *   takes  — keyPath `id`, index `episodeId`: UnfinishedTake metadata (+ kind)
 *   chunks — keyPath [takeId, seq]: interleaved Int16 PCM (`pcm`) or a MediaRecorder Blob (`blob`)
 * Writes are batched (one transaction per ≥2 chunks or every ~1.5 s). QuotaExceededError
 * marks the journal as failed (recording continues in memory) and calls `onError`.
 */

import {
  assembleChunks,
  ChunkAccumulator,
  chunkFramesFor,
  decodeChunkInt16,
  encodeChunkInt16,
  isQuotaError,
} from '@/lib/podcast/engine/journal-chunks'

export type UnfinishedTake = {
  id: string
  episodeId: string
  personId: string
  label: string
  sampleRate: number
  channels: number
  /** Seconds of audio persisted so far. */
  durationSec: number
  /** Session-clock position where the take started (seconds). */
  startSec: number
  startedAt: number
  updatedAt: number
  /** Finished normally (finish() called) vs interrupted. */
  complete: boolean
  /** 'pcm' (worklet frames) or 'blob' (MediaRecorder chunks). */
  kind?: 'pcm' | 'blob'
  /** Bytes persisted (approx). */
  bytes?: number
}

export type TakeJournal = {
  id: string
  /** Append planar PCM frames (one Float32Array per channel). Cheap; batches internally. */
  append(frames: Float32Array[]): void
  /** Flush and mark complete. */
  finish(): Promise<void>
  /** Delete everything for this take. */
  abort(): Promise<void>
  /** Append an encoded MediaRecorder chunk (fallback capture path). */
  appendBlob?(blob: Blob): void
  /** Persist everything buffered so far without marking complete. */
  flush?(): Promise<void>
  /** True after a storage failure (quota); appends become no-ops. */
  readonly failed?: boolean
}

export type OpenTakeJournalOptions = {
  episodeId: string
  personId: string
  label: string
  sampleRate: number
  channels: number
  startSec: number
  /** Seconds per persisted chunk (0.25–2, default 1). */
  chunkSec?: number
  /** Called once when persistence stops working (e.g. QuotaExceededError). */
  onError?: (err: unknown) => void
}

const DB_NAME = 'fitf-take-journal'
const DB_VERSION = 1
const TAKES = 'takes'
const CHUNKS = 'chunks'
const FLUSH_MS = 1500
const FLUSH_CHUNKS = 2

type ChunkRecord = { takeId: string; seq: number; frames?: number; pcm?: ArrayBuffer; blob?: Blob }

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available'))
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(TAKES)) {
          const takes = db.createObjectStore(TAKES, { keyPath: 'id' })
          takes.createIndex('episodeId', 'episodeId', { unique: false })
        }
        if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ['takeId', 'seq'] })
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('take journal database is blocked by another tab'))
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

function reqValue<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function chunkRange(id: string) {
  return IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
}

function newTakeId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `tj_${Date.now().toString(36)}_${rand}`
}

export async function openTakeJournal(opts: OpenTakeJournalOptions): Promise<TakeJournal> {
  const db = await openDb()
  const id = newTakeId()
  const channels = Math.max(1, Math.min(2, opts.channels || 1))
  const now = Date.now()
  const meta: UnfinishedTake = {
    id,
    episodeId: opts.episodeId,
    personId: opts.personId,
    label: opts.label,
    sampleRate: opts.sampleRate,
    channels,
    durationSec: 0,
    startSec: opts.startSec,
    startedAt: now,
    updatedAt: now,
    complete: false,
    kind: 'pcm',
    bytes: 0,
  }
  {
    const tx = db.transaction(TAKES, 'readwrite')
    tx.objectStore(TAKES).put(meta)
    await txDone(tx)
  }

  const acc = new ChunkAccumulator(channels, chunkFramesFor(opts.sampleRate, opts.chunkSec ?? 1))
  let seq = 0
  let persistedFrames = 0
  let queue: ChunkRecord[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<void> = Promise.resolve()
  let failed = false
  let closed = false

  const fail = (err: unknown) => {
    if (failed) return
    failed = true
    queue = []
    if (timer) clearTimeout(timer)
    timer = null
    try {
      opts.onError?.(isQuotaError(err) ? Object.assign(new Error('Browser storage is full — the crash-safe copy of this take stopped. Recording continues in memory.'), { name: 'QuotaExceededError', cause: err }) : err)
    } catch {
      /* caller's handler threw */
    }
  }

  const writeBatch = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (failed || !queue.length) return writing
    const batch = queue
    queue = []
    writing = writing.then(async () => {
      if (failed) return
      try {
        const tx = db.transaction([CHUNKS, TAKES], 'readwrite')
        const chunks = tx.objectStore(CHUNKS)
        let bytes = 0
        for (const rec of batch) {
          chunks.put(rec)
          persistedFrames += rec.frames || 0
          bytes += rec.pcm?.byteLength || rec.blob?.size || 0
        }
        meta.bytes = (meta.bytes || 0) + bytes
        meta.durationSec = meta.kind === 'blob' ? (Date.now() - meta.startedAt) / 1000 : persistedFrames / meta.sampleRate
        meta.updatedAt = Date.now()
        tx.objectStore(TAKES).put(meta)
        await txDone(tx)
      } catch (err) {
        fail(err)
      }
    })
    return writing
  }

  const enqueue = (rec: ChunkRecord) => {
    if (failed || closed) return
    queue.push(rec)
    if (queue.length >= FLUSH_CHUNKS) void writeBatch()
    else if (!timer) timer = setTimeout(() => void writeBatch(), FLUSH_MS)
  }

  const pcmRecord = (planar: Float32Array[]): ChunkRecord => ({
    takeId: id,
    seq: seq++,
    frames: planar[0]?.length ?? 0,
    pcm: encodeChunkInt16(planar).buffer as ArrayBuffer,
  })

  const flushAll = async () => {
    const tail = acc.drain()
    if (tail) queue.push(pcmRecord(tail))
    await writeBatch()
  }

  return {
    id,
    get failed() {
      return failed
    },
    append(frames: Float32Array[]) {
      if (failed || closed || !frames.length || !frames[0]?.length) return
      for (const chunk of acc.push(frames)) enqueue(pcmRecord(chunk))
    },
    appendBlob(blob: Blob) {
      if (failed || closed || !blob.size) return
      if (meta.kind !== 'blob') meta.kind = 'blob'
      enqueue({ takeId: id, seq: seq++, blob })
    },
    async flush() {
      if (closed) return writing
      await flushAll()
    },
    async finish() {
      if (closed) return
      await flushAll()
      closed = true
      if (failed) return
      try {
        meta.complete = true
        meta.updatedAt = Date.now()
        const tx = db.transaction(TAKES, 'readwrite')
        tx.objectStore(TAKES).put(meta)
        await txDone(tx)
      } catch (err) {
        fail(err)
      }
    },
    async abort() {
      closed = true
      queue = []
      if (timer) clearTimeout(timer)
      timer = null
      await writing.catch(() => {})
      await deleteTake(id)
    },
  }
}

/** Interrupted (incomplete) takes for an episode, newest first. */
export async function listUnfinishedTakes(episodeId: string): Promise<UnfinishedTake[]> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return []
  }
  const tx = db.transaction(TAKES, 'readonly')
  const rows = await reqValue(tx.objectStore(TAKES).index('episodeId').getAll(IDBKeyRange.only(episodeId)) as IDBRequest<UnfinishedTake[]>)
  return rows.filter((t) => !t.complete && (t.durationSec > 0 || (t.bytes || 0) > 0)).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Rebuild an AudioBuffer from persisted chunks. */
export async function recoverTake(id: string): Promise<AudioBuffer> {
  const db = await openDb()
  const tx = db.transaction([TAKES, CHUNKS], 'readonly')
  const meta = (await reqValue(tx.objectStore(TAKES).get(id) as IDBRequest<UnfinishedTake | undefined>)) || null
  const records = await reqValue(tx.objectStore(CHUNKS).getAll(chunkRange(id)) as IDBRequest<ChunkRecord[]>)
  if (!meta) throw new Error('This take is no longer in the journal')
  records.sort((a, b) => a.seq - b.seq)
  if (meta.kind === 'blob' || records.some((r) => r.blob)) {
    const blobs = records.map((r) => r.blob).filter((b): b is Blob => !!b)
    if (!blobs.length) throw new Error('No audio was saved for this take')
    const { decodeAudio } = await import('@/lib/podcast/audio')
    return decodeAudio(await new Blob(blobs, { type: blobs[0].type || 'audio/webm' }).arrayBuffer())
  }
  const chunks = records
    .filter((r) => r.pcm)
    .map((r) => decodeChunkInt16(new Int16Array(r.pcm!), meta.channels))
  const planar = assembleChunks(chunks, meta.channels)
  const length = Math.max(1, planar[0]?.length ?? 0)
  const buffer = new AudioBuffer({ length, numberOfChannels: meta.channels, sampleRate: meta.sampleRate })
  planar.forEach((data, ch) => {
    if (data.length) buffer.copyToChannel(data as Float32Array<ArrayBuffer>, ch)
  })
  return buffer
}

export async function deleteTake(id: string): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  const tx = db.transaction([TAKES, CHUNKS], 'readwrite')
  tx.objectStore(CHUNKS).delete(chunkRange(id))
  tx.objectStore(TAKES).delete(id)
  await txDone(tx)
}

/** Ask the browser not to evict studio storage. Returns true if persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
    if (!navigator.storage.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Free / used bytes for the studio origin (for a "storage low" warning). */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.()
    if (!est) return null
    return { usage: est.usage || 0, quota: est.quota || 0 }
  } catch {
    return null
  }
}
