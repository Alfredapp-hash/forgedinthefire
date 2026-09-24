/** IndexedDB autosave for in-progress production-room takes (per episode). */

import { encodeWav } from '@/lib/podcast/audio'
import { cameraKind, normalizeCameraClip, type CameraClip } from '@/lib/podcast/camera'
import { bufferFromBlob } from '@/lib/podcast/effects'
import type { SessionPerson, StudioTrack } from '@/lib/podcast/multitrack'

const DB_NAME = 'forged-podcast-room'
/** v3 adds crash-safe checkpoint stores for in-progress (unfinalized) takes. */
const DB_VERSION = 3
const STORE = 'sessions'
/** One meta row per in-progress lane take (keyed by takeKey). */
const CKPT_META = 'checkpoint-meta'
/** Ordered chunk parts for each in-progress take (autoIncrement, indexed by takeKey). */
const CKPT_PARTS = 'checkpoint-parts'

export type SessionPeek = {
  episodeId: string
  savedAt: number
  takeCount: number
  cameraCount: number
  durationSec: number
}

/** How a lane's samples were captured, so recovery knows how to decode. */
export type CheckpointKind = 'worklet' | 'media-recorder' | 'camera'

/** Meta describing an in-progress take being checkpointed to IndexedDB. */
export type CheckpointMeta = {
  /** `${episodeId}::${laneKey}` — stable across ticks for one take. */
  takeKey: string
  episodeId: string
  /** Capture lane key: the StudioTrack id (audio) or personId (camera). */
  laneKey: string
  kind: CheckpointKind
  /** WAV/webm/mp4 mime the finalized blob should carry. */
  mime: string
  /** Only meaningful for worklet PCM — the AudioContext sample rate. */
  sampleRate: number
  /** Punch position on the session clock (seconds). */
  offset: number
  /** Preroll seconds to trim off the front on finalize. */
  recTrim: number
  /** Display label for the recovery offer. */
  label: string
  personId: string
  startedAt: number
  updatedAt: number
  /** Number of parts flushed so far. */
  chunkCount: number
  /** Bytes flushed so far (approx, for the recovery peek). */
  bytes: number
  /** Set once the take stopped cleanly and was laid onto the timeline. */
  finalized: boolean
}

/** A recovered take ready to be finalized/exported after a crash. */
export type RecoveredTake = {
  meta: CheckpointMeta
  /** Concatenated capture blob (WAV for worklet PCM, webm/mp4 otherwise). */
  blob: Blob
}

type StoredTrack = Omit<StudioTrack, 'buffer' | 'url'> & {
  wav: ArrayBuffer | null
}

type StoredCameraClip = Omit<CameraClip, 'url'> & {
  data: ArrayBuffer
}

type StoredSession = {
  episodeId: string
  savedAt: number
  durationSec: number
  people: SessionPerson[]
  tracks: StoredTrack[]
  cameras?: StoredCameraClip[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'episodeId' })
      }
      if (!db.objectStoreNames.contains(CKPT_META)) {
        const meta = db.createObjectStore(CKPT_META, { keyPath: 'takeKey' })
        meta.createIndex('byEpisode', 'episodeId', { unique: false })
      }
      if (!db.objectStoreNames.contains(CKPT_PARTS)) {
        const parts = db.createObjectStore(CKPT_PARTS, { keyPath: 'seq', autoIncrement: true })
        parts.createIndex('byTake', 'takeKey', { unique: false })
        parts.createIndex('byEpisode', 'episodeId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function isQuota(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)
  )
}

function idbGet(episodeId: string): Promise<StoredSession | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(episodeId)
        req.onsuccess = () => resolve(req.result as StoredSession | undefined)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

async function idbPut(row: StoredSession) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function peekSession(episodeId: string): Promise<SessionPeek | null> {
  if (!episodeId || typeof indexedDB === 'undefined') return null
  const row = await idbGet(episodeId)
  if (!row) return null
  return {
    episodeId: row.episodeId,
    savedAt: row.savedAt,
    takeCount: row.tracks.filter((t) => t.wav).length,
    cameraCount: (row.cameras || []).length,
    durationSec: row.durationSec,
  }
}

async function packCameras(episodeId: string, cameras: CameraClip[]): Promise<StoredCameraClip[]> {
  if (cameras.length === 0) return []
  const prev = await idbGet(episodeId)
  const reuse = new Map((prev?.cameras || []).map((clip) => [clip.id, clip]))
  const stored: StoredCameraClip[] = []
  for (const clip of cameras) {
    const old = reuse.get(clip.id)
    const meta = {
      id: clip.id,
      personId: clip.personId,
      mime: clip.mime,
      offset: clip.offset,
      duration: clip.duration,
      trimStart: clip.sourceStart ?? clip.trimStart,
      sourceStart: clip.sourceStart ?? clip.trimStart,
      sourceDuration: clip.sourceDuration || old?.sourceDuration || clip.trimStart + clip.duration,
      muted: Boolean(clip.muted),
      syncGroup: clip.syncGroup,
      kind: clip.kind,
      layer: clip.layer,
      label: clip.label,
      sublabel: clip.sublabel,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      filter: clip.filter,
      overlayFit: clip.overlayFit,
      stingerStyle: clip.stingerStyle,
      keyframes: clip.keyframes,
    }
    if (cameraKind(clip) === 'title' || cameraKind(clip) === 'stinger' || !clip.url) {
      stored.push({
        ...meta,
        mime: clip.mime || 'text/plain',
        bytes: 0,
        data: new ArrayBuffer(0),
      })
      continue
    }
    if (old && old.bytes === clip.bytes && old.data.byteLength > 64) {
      stored.push({
        ...old,
        ...meta,
        mime: clip.mime,
        bytes: old.bytes,
      })
      continue
    }
    try {
      const blob = await fetch(clip.url).then((res) => {
        if (!res.ok) throw new Error('camera fetch failed')
        return res.blob()
      })
      const data = await blob.arrayBuffer()
      if (data.byteLength < 64) continue
      stored.push({
        ...meta,
        mime: clip.mime || blob.type || 'video/webm',
        bytes: data.byteLength,
        data,
      })
    } catch {
      if (old) stored.push({ ...old, ...meta })
    }
  }
  return stored
}

export async function saveSession(
  episodeId: string,
  people: SessionPerson[],
  tracks: StudioTrack[],
  cameras: CameraClip[] = [],
): Promise<void> {
  if (!episodeId || typeof indexedDB === 'undefined') return
  const withAudio = tracks.filter((t) => t.buffer)
  if (withAudio.length === 0 && cameras.length === 0) return

  const stored: StoredTrack[] = []
  for (const track of tracks) {
    const { buffer, url: _url, ...meta } = track
    void _url
    stored.push({
      ...meta,
      wav: buffer ? await encodeWav(buffer).arrayBuffer() : null,
    })
  }

  const durationSec = Math.max(
    0,
    ...tracks.map((t) => {
      const clips = Array.isArray(t.clips) ? t.clips : []
      if (clips.length) return Math.max(0, ...clips.map((c) => c.offset + c.duration))
      return t.buffer ? t.offset + t.buffer.duration : 0
    }),
    ...cameras.map((c) => c.offset + c.duration),
  )

  const packedCams = await packCameras(episodeId, cameras)
  const row: StoredSession = {
    episodeId,
    savedAt: Date.now(),
    durationSec,
    people,
    tracks: stored,
    cameras: packedCams,
  }

  try {
    await idbPut(row)
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)
    if (packedCams.length === 0) {
      throw new Error(
        quota
          ? 'This browser is out of space for session autosave. Download takes or free disk before you close the tab.'
          : 'Could not autosave takes on this computer',
      )
    }
    await idbPut({ ...row, cameras: [] })
    throw new Error(
      quota
        ? 'Takes saved. Camera files did not fit in this browser’s storage — download the camera files before you close the tab.'
        : 'Takes saved; camera files did not fit on this computer',
    )
  }
}

export async function loadSession(
  episodeId: string,
): Promise<{ people: SessionPerson[]; tracks: StudioTrack[]; cameras: CameraClip[] } | null> {
  if (!episodeId || typeof indexedDB === 'undefined') return null
  const row = await idbGet(episodeId)
  if (!row) return null

  const tracks: StudioTrack[] = []
  for (const stored of row.tracks) {
    const { wav, ...meta } = stored
    let buffer: AudioBuffer | null = null
    let url: string | null = null
    if (wav && wav.byteLength > 64) {
      buffer = await bufferFromBlob(new Blob([wav], { type: 'audio/wav' }))
      url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
    }
    tracks.push({
      ...meta,
      inserts: Array.isArray(meta.inserts) ? meta.inserts : [],
      clips: Array.isArray(meta.clips) ? meta.clips : [],
      automation: Array.isArray(meta.automation) ? meta.automation : [],
      compRanges: Array.isArray(meta.compRanges) ? meta.compRanges : [],
      listen: meta.listen !== false,
      layered: Boolean(meta.layered),
      buffer,
      url,
    })
  }

  const cameras: CameraClip[] = []
  for (const stored of row.cameras || []) {
    const kind =
      stored.kind === 'title' || stored.kind === 'broll' || stored.kind === 'stinger' ? stored.kind : 'camera'
    if (kind !== 'title' && kind !== 'stinger' && (!stored.data || stored.data.byteLength < 64)) continue
    const blob =
      stored.data && stored.data.byteLength >= 64
        ? new Blob([stored.data], { type: stored.mime || 'video/webm' })
        : null
    cameras.push(
      normalizeCameraClip({
        id: stored.id,
        personId: stored.personId,
        url: blob ? URL.createObjectURL(blob) : '',
        mime: stored.mime || blob?.type || (kind === 'title' || kind === 'stinger' ? 'text/plain' : 'video/webm'),
        offset: stored.offset,
        duration: stored.duration,
        trimStart: stored.trimStart,
        sourceStart: stored.sourceStart ?? stored.trimStart,
        sourceDuration: stored.sourceDuration || stored.trimStart + stored.duration,
        muted: Boolean(stored.muted),
        syncGroup: stored.syncGroup,
        bytes: stored.bytes || blob?.size || 0,
        kind,
        layer: stored.layer,
        label: stored.label,
        sublabel: stored.sublabel,
        fadeIn: stored.fadeIn,
        fadeOut: stored.fadeOut,
        filter: stored.filter,
        overlayFit: stored.overlayFit,
        stingerStyle: stored.stingerStyle,
        keyframes: stored.keyframes,
      }),
    )
  }

  return { people: row.people, tracks, cameras }
}

export async function clearSession(episodeId: string): Promise<void> {
  if (!episodeId || typeof indexedDB === 'undefined') return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(episodeId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/* ------------------------------------------------------------------ *
 * Crash-safe checkpoints for in-progress takes.
 *
 * While recording, capture code flushes chunk parts here on a periodic
 * tick and drops them from RAM (bounded memory on long takes). Each part
 * is its own IndexedDB record so appends never rewrite the whole take.
 * On reload, listRecoverableTakes() surfaces any checkpointed-but-not-
 * finalized take so the editor can rebuild and lay it onto the timeline.
 * ------------------------------------------------------------------ */

/** True when the origin is comfortably under its storage quota. */
export type QuotaStatus = {
  supported: boolean
  usage: number
  quota: number
  /** Fraction 0–1 of quota used (0 when unknown). */
  ratio: number
  /** Bytes free (0 when unknown). */
  free: number
  /** Over the warn threshold — surface a "near quota" message. */
  low: boolean
}

const QUOTA_WARN_RATIO = 0.9
/** Warn if less than this many bytes remain (≈2 min of camera). */
const QUOTA_WARN_FREE = 40 * 1024 * 1024

/** Storage-quota preflight before/while recording (navigator.storage.estimate). */
export async function checkStorageQuota(): Promise<QuotaStatus> {
  const empty: QuotaStatus = { supported: false, usage: 0, quota: 0, ratio: 0, free: 0, low: false }
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return empty
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    if (!quota) return empty
    const free = Math.max(0, quota - usage)
    const ratio = usage / quota
    return {
      supported: true,
      usage,
      quota,
      ratio,
      free,
      low: ratio >= QUOTA_WARN_RATIO || free <= QUOTA_WARN_FREE,
    }
  } catch {
    return empty
  }
}

export function takeKeyFor(episodeId: string, laneKey: string) {
  return `${episodeId}::${laneKey}`
}

function metaGet(db: IDBDatabase, takeKey: string): Promise<CheckpointMeta | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CKPT_META, 'readonly')
    const req = tx.objectStore(CKPT_META).get(takeKey)
    req.onsuccess = () => resolve(req.result as CheckpointMeta | undefined)
    req.onerror = () => reject(req.error)
  })
}

/** Start (or reset) a checkpoint take. Clears any stale parts under this key. */
export async function beginCheckpoint(
  init: Omit<CheckpointMeta, 'updatedAt' | 'chunkCount' | 'bytes' | 'finalized' | 'startedAt'> & {
    startedAt?: number
  },
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const now = Date.now()
  const meta: CheckpointMeta = {
    ...init,
    startedAt: init.startedAt ?? now,
    updatedAt: now,
    chunkCount: 0,
    bytes: 0,
    finalized: false,
  }
  const db = await openDb()
  try {
    await deleteTakeParts(db, meta.takeKey)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CKPT_META, 'readwrite')
      tx.objectStore(CKPT_META).put(meta)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Refine a checkpoint's capture kind/mime once the capture path is known. */
export async function describeCheckpoint(
  takeKey: string,
  info: { kind: CheckpointKind; mime: string; sampleRate?: number },
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    const meta = await metaGet(db, takeKey)
    if (!meta) return
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CKPT_META, 'readwrite')
      tx.objectStore(CKPT_META).put({
        ...meta,
        kind: info.kind,
        mime: info.mime || meta.mime,
        sampleRate: info.sampleRate ?? meta.sampleRate,
        updatedAt: Date.now(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Append one (or several) captured chunk parts for an in-progress take and
 * refresh its meta row. `part` is a Blob (MediaRecorder/camera) or a plain
 * ArrayBuffer of Float32 PCM (worklet). Throws on quota exhaustion so the
 * caller can surface a "near quota" warning and stop rotating.
 */
export async function appendCheckpoint(
  takeKey: string,
  parts: Array<Blob | ArrayBuffer>,
): Promise<void> {
  if (typeof indexedDB === 'undefined' || parts.length === 0) return
  const db = await openDb()
  try {
    const meta = await metaGet(db, takeKey)
    if (!meta) return
    let added = 0
    let bytes = 0
    for (const part of parts) {
      const size = part instanceof Blob ? part.size : part.byteLength
      if (size <= 0) continue
      added++
      bytes += size
    }
    if (added === 0) return
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CKPT_PARTS, CKPT_META], 'readwrite')
      const partStore = tx.objectStore(CKPT_PARTS)
      for (const part of parts) {
        const size = part instanceof Blob ? part.size : part.byteLength
        if (size <= 0) continue
        partStore.add({ takeKey, episodeId: meta.episodeId, data: part })
      }
      tx.objectStore(CKPT_META).put({
        ...meta,
        chunkCount: meta.chunkCount + added,
        bytes: meta.bytes + bytes,
        updatedAt: Date.now(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (err) {
    if (isQuota(err)) {
      throw new Error(
        'This browser is out of space for crash-safe autosave. Stop the take and download it, or free disk before recording more.',
      )
    }
    throw err
  } finally {
    db.close()
  }
}

/** Mark a take finalized (laid onto the timeline). Its parts are dropped. */
export async function finalizeCheckpoint(takeKey: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    await deleteTakeParts(db, takeKey)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CKPT_META, 'readwrite')
      tx.objectStore(CKPT_META).delete(takeKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

function deleteTakeParts(db: IDBDatabase, takeKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CKPT_PARTS, 'readwrite')
    const index = tx.objectStore(CKPT_PARTS).index('byTake')
    const req = index.openKeyCursor(IDBKeyRange.only(takeKey))
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        tx.objectStore(CKPT_PARTS).delete(cursor.primaryKey)
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Metas for any unfinalized checkpoint takes on this episode (crash survivors). */
export async function peekRecoverableTakes(episodeId: string): Promise<CheckpointMeta[]> {
  if (!episodeId || typeof indexedDB === 'undefined') return []
  const db = await openDb()
  try {
    return await new Promise<CheckpointMeta[]>((resolve, reject) => {
      const tx = db.transaction(CKPT_META, 'readonly')
      const req = tx.objectStore(CKPT_META).index('byEpisode').getAll(IDBKeyRange.only(episodeId))
      req.onsuccess = () =>
        resolve(((req.result as CheckpointMeta[]) || []).filter((m) => !m.finalized && m.chunkCount > 0))
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Rebuild the capture blob for each recoverable take (concatenating stored parts). */
export async function loadRecoverableTakes(episodeId: string): Promise<RecoveredTake[]> {
  const metas = await peekRecoverableTakes(episodeId)
  if (metas.length === 0) return []
  const db = await openDb()
  const out: RecoveredTake[] = []
  try {
    for (const meta of metas) {
      const parts = await new Promise<Array<Blob | ArrayBuffer>>((resolve, reject) => {
        const tx = db.transaction(CKPT_PARTS, 'readonly')
        const req = tx.objectStore(CKPT_PARTS).index('byTake').getAll(IDBKeyRange.only(meta.takeKey))
        req.onsuccess = () =>
          resolve(((req.result as Array<{ data: Blob | ArrayBuffer }>) || []).map((r) => r.data))
        req.onerror = () => reject(req.error)
      })
      if (parts.length === 0) continue
      const blob =
        meta.kind === 'worklet'
          ? pcmPartsToWav(parts, meta.sampleRate)
          : new Blob(parts as BlobPart[], { type: meta.mime || 'application/octet-stream' })
      if (blob.size > 64) out.push({ meta, blob })
    }
  } finally {
    db.close()
  }
  return out
}

/** Drop every checkpoint take for an episode (after a recovery is resolved). */
export async function clearRecoverableTakes(episodeId: string): Promise<void> {
  if (!episodeId || typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CKPT_META, CKPT_PARTS], 'readwrite')
      const metaReq = tx.objectStore(CKPT_META).index('byEpisode').openKeyCursor(IDBKeyRange.only(episodeId))
      metaReq.onsuccess = () => {
        const cursor = metaReq.result
        if (cursor) {
          tx.objectStore(CKPT_META).delete(cursor.primaryKey)
          cursor.continue()
        }
      }
      const partReq = tx.objectStore(CKPT_PARTS).index('byEpisode').openKeyCursor(IDBKeyRange.only(episodeId))
      partReq.onsuccess = () => {
        const cursor = partReq.result
        if (cursor) {
          tx.objectStore(CKPT_PARTS).delete(cursor.primaryKey)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Stitch worklet Float32 PCM parts into a mono 16-bit WAV blob. */
function pcmPartsToWav(parts: Array<Blob | ArrayBuffer>, sampleRate: number): Blob {
  const buffers = parts.filter((p): p is ArrayBuffer => p instanceof ArrayBuffer)
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0) / 4
  const rate = sampleRate > 0 ? sampleRate : 48000
  const length = total * 2 + 44
  const bytes = new ArrayBuffer(length)
  const view = new DataView(bytes)
  let offset = 0
  const writeStr = (text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i))
  }
  writeStr('RIFF')
  view.setUint32(offset, length - 8, true); offset += 4
  writeStr('WAVE')
  writeStr('fmt ')
  view.setUint32(offset, 16, true); offset += 4
  view.setUint16(offset, 1, true); offset += 2
  view.setUint16(offset, 1, true); offset += 2
  view.setUint32(offset, rate, true); offset += 4
  view.setUint32(offset, rate * 2, true); offset += 4
  view.setUint16(offset, 2, true); offset += 2
  view.setUint16(offset, 16, true); offset += 2
  writeStr('data')
  view.setUint32(offset, length - offset - 4, true); offset += 4
  for (const buf of buffers) {
    const floats = new Float32Array(buf)
    for (let i = 0; i < floats.length; i++) {
      const s = Math.max(-1, Math.min(1, floats[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([bytes], { type: 'audio/wav' })
}
