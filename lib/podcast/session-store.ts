/** IndexedDB autosave for in-progress production-room takes (per episode). */

import { encodeWav } from '@/lib/podcast/audio'
import {
  cameraKind,
  isQuotaError,
  normalizeCameraClip,
  normalizeProgramCuts,
  type CameraClip,
  type ProgramCut,
  type ProgramScene,
} from '@/lib/podcast/camera'
import { bufferFromBlob } from '@/lib/podcast/effects'
import type { SessionPerson, StudioTrack } from '@/lib/podcast/multitrack'

const DB_NAME = 'forged-podcast-room'
/** v3: camera bytes live in their own store, once per file (split clips share one blob). */
const DB_VERSION = 3
const STORE = 'sessions'
const MEDIA = 'media'

export type SessionPeek = {
  episodeId: string
  savedAt: number
  takeCount: number
  cameraCount: number
  durationSec: number
}

/** Program switch state that is not a clip. */
export type SessionPicture = {
  programCuts?: ProgramCut[]
  startScene?: ProgramScene
}

type StoredTrack = Omit<StudioTrack, 'buffer' | 'url'> & {
  wav: ArrayBuffer | null
}

type StoredCameraClip = Omit<CameraClip, 'url'> & {
  /** v2 rows kept the bytes inline. */
  data?: ArrayBuffer
  /** v3: key into the media store. */
  mediaKey?: string
}

type StoredSession = {
  episodeId: string
  savedAt: number
  durationSec: number
  people: SessionPerson[]
  tracks: StoredTrack[]
  cameras?: StoredCameraClip[]
  programCuts?: ProgramCut[]
  startScene?: ProgramScene
}

type StoredMedia = {
  key: string
  episodeId: string
  blob: Blob
  bytes: number
}

/** blob: URL → media key, so repeat autosaves never re-read a camera file already on disk. */
const urlKeys = new Map<string, string>()

function newMediaKey(episodeId: string) {
  return `${episodeId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function episodeRange(episodeId: string) {
  return IDBKeyRange.bound(`${episodeId}:`, `${episodeId}:￿`)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'episodeId' })
      }
      if (!db.objectStoreNames.contains(MEDIA)) {
        db.createObjectStore(MEDIA, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('Close other tabs of the production room, then reload to update autosave'))
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'))
  })
}

async function idbGet(db: IDBDatabase, episodeId: string): Promise<StoredSession | undefined> {
  const tx = db.transaction(STORE, 'readonly')
  const row = await request(tx.objectStore(STORE).get(episodeId))
  return row as StoredSession | undefined
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb()
  try {
    return await fn(db)
  } finally {
    db.close()
  }
}

export async function peekSession(episodeId: string): Promise<SessionPeek | null> {
  if (!episodeId || typeof indexedDB === 'undefined') return null
  const row = await withDb((db) => idbGet(db, episodeId))
  if (!row) return null
  return {
    episodeId: row.episodeId,
    savedAt: row.savedAt,
    takeCount: row.tracks.filter((t) => t.wav).length,
    cameraCount: (row.cameras || []).length,
    durationSec: row.durationSec,
  }
}

function clipMeta(clip: CameraClip): Omit<StoredCameraClip, 'data' | 'mediaKey'> {
  return {
    id: clip.id,
    personId: clip.personId,
    mime: clip.mime,
    offset: clip.offset,
    duration: clip.duration,
    trimStart: clip.sourceStart ?? clip.trimStart,
    sourceStart: clip.sourceStart ?? clip.trimStart,
    sourceDuration: clip.sourceDuration || clip.trimStart + clip.duration,
    muted: Boolean(clip.muted),
    syncGroup: clip.syncGroup,
    bytes: clip.bytes,
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
}

/** Write each distinct camera file once. Returns clip rows + any clips whose bytes did not fit. */
async function packCameras(
  db: IDBDatabase,
  episodeId: string,
  cameras: CameraClip[],
): Promise<{ stored: StoredCameraClip[]; dropped: number; quota: boolean }> {
  const haveTx = db.transaction(MEDIA, 'readonly')
  const have = new Set((await request(haveTx.objectStore(MEDIA).getAllKeys(episodeRange(episodeId)))).map(String))

  const stored: StoredCameraClip[] = []
  const failedUrls = new Set<string>()
  let dropped = 0
  let quota = false

  for (const clip of cameras) {
    const meta = clipMeta(clip)
    if (cameraKind(clip) === 'title' || cameraKind(clip) === 'stinger' || !clip.url) {
      stored.push({ ...meta, mime: clip.mime || 'text/plain', bytes: 0 })
      continue
    }
    let key = urlKeys.get(clip.url)
    if (!key || !have.has(key)) {
      if (failedUrls.has(clip.url)) {
        dropped++
        continue
      }
      try {
        const blob = await fetch(clip.url).then((res) => {
          if (!res.ok) throw new Error('camera fetch failed')
          return res.blob()
        })
        if (blob.size < 64) {
          failedUrls.add(clip.url)
          dropped++
          continue
        }
        key = key || newMediaKey(episodeId)
        const tx = db.transaction(MEDIA, 'readwrite')
        tx.objectStore(MEDIA).put({ key, episodeId, blob, bytes: blob.size } satisfies StoredMedia)
        await done(tx)
        urlKeys.set(clip.url, key)
        have.add(key)
      } catch (err) {
        if (isQuotaError(err)) quota = true
        failedUrls.add(clip.url)
        dropped++
        continue
      }
    }
    stored.push({ ...meta, mediaKey: key })
  }
  return { stored, dropped, quota }
}

/** Delete media blobs this episode's row no longer points at (discarded / undone takes). */
async function collectMedia(db: IDBDatabase, episodeId: string, keep: Set<string>) {
  const tx = db.transaction(MEDIA, 'readwrite')
  const store = tx.objectStore(MEDIA)
  const keys = (await request(store.getAllKeys(episodeRange(episodeId)))).map(String)
  for (const key of keys) {
    if (!keep.has(key)) store.delete(key)
  }
  await done(tx)
}

/** Saves run one at a time so media garbage collection never races a half-written row. */
let saveChain: Promise<unknown> = Promise.resolve()

export function saveSession(
  episodeId: string,
  people: SessionPerson[],
  tracks: StudioTrack[],
  cameras: CameraClip[] = [],
  picture: SessionPicture = {},
): Promise<void> {
  const run = saveChain.catch(() => {}).then(() => saveSessionNow(episodeId, people, tracks, cameras, picture))
  saveChain = run
  return run
}

async function saveSessionNow(
  episodeId: string,
  people: SessionPerson[],
  tracks: StudioTrack[],
  cameras: CameraClip[],
  picture: SessionPicture,
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

  await withDb(async (db) => {
    const packed = await packCameras(db, episodeId, cameras)
    const row: StoredSession = {
      episodeId,
      savedAt: Date.now(),
      durationSec,
      people,
      tracks: stored,
      cameras: packed.stored,
      programCuts: normalizeProgramCuts(picture.programCuts),
      startScene: picture.startScene,
    }
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(row)
      await done(tx)
    } catch (err) {
      const quota = isQuotaError(err)
      throw new Error(
        quota
          ? 'This browser is out of space for session autosave. Download takes or free disk before you close the tab.'
          : 'Could not autosave takes on this computer',
      )
    }
    await collectMedia(db, episodeId, new Set(packed.stored.map((c) => c.mediaKey).filter((k): k is string => Boolean(k))))
    if (packed.dropped > 0) {
      throw new Error(
        packed.quota
          ? `Takes saved. ${packed.dropped} camera clip${packed.dropped === 1 ? '' : 's'} did not fit in this browser’s storage — download the camera files before you close the tab.`
          : `Takes saved; ${packed.dropped} camera clip${packed.dropped === 1 ? '' : 's'} could not be saved on this computer`,
      )
    }
  })
}

export async function loadSession(episodeId: string): Promise<{
  people: SessionPerson[]
  tracks: StudioTrack[]
  cameras: CameraClip[]
  programCuts: ProgramCut[]
  startScene?: ProgramScene
} | null> {
  if (!episodeId || typeof indexedDB === 'undefined') return null
  return withDb(async (db) => {
    const row = await idbGet(db, episodeId)
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

    const mediaUrls = new Map<string, { url: string; bytes: number; type: string }>()
    const mediaFor = async (key: string) => {
      const hit = mediaUrls.get(key)
      if (hit) return hit
      const tx = db.transaction(MEDIA, 'readonly')
      const media = (await request(tx.objectStore(MEDIA).get(key))) as StoredMedia | undefined
      if (!media?.blob || media.blob.size < 64) return null
      const url = URL.createObjectURL(media.blob)
      urlKeys.set(url, key)
      const out = { url, bytes: media.blob.size, type: media.blob.type }
      mediaUrls.set(key, out)
      return out
    }

    const cameras: CameraClip[] = []
    for (const stored of row.cameras || []) {
      const kind =
        stored.kind === 'title' || stored.kind === 'broll' || stored.kind === 'stinger' ? stored.kind : 'camera'
      const graphic = kind === 'title' || kind === 'stinger'
      let url = ''
      let bytes = stored.bytes || 0
      let type = stored.mime
      if (!graphic) {
        if (stored.mediaKey) {
          const media = await mediaFor(stored.mediaKey)
          if (!media) continue
          url = media.url
          bytes = media.bytes
          type = type || media.type
        } else if (stored.data && stored.data.byteLength >= 64) {
          const blob = new Blob([stored.data], { type: stored.mime || 'video/webm' })
          url = URL.createObjectURL(blob)
          bytes = blob.size
        } else {
          continue
        }
      }
      cameras.push(
        normalizeCameraClip({
          id: stored.id,
          personId: stored.personId,
          url,
          mime: type || (graphic ? 'text/plain' : 'video/webm'),
          offset: stored.offset,
          duration: stored.duration,
          trimStart: stored.trimStart,
          sourceStart: stored.sourceStart ?? stored.trimStart,
          sourceDuration: stored.sourceDuration || stored.trimStart + stored.duration,
          muted: Boolean(stored.muted),
          syncGroup: stored.syncGroup,
          bytes,
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

    return {
      people: row.people,
      tracks,
      cameras,
      programCuts: normalizeProgramCuts(row.programCuts),
      startScene: row.startScene,
    }
  })
}

export async function clearSession(episodeId: string): Promise<void> {
  if (!episodeId || typeof indexedDB === 'undefined') return
  await withDb(async (db) => {
    const tx = db.transaction([STORE, MEDIA], 'readwrite')
    tx.objectStore(STORE).delete(episodeId)
    tx.objectStore(MEDIA).delete(episodeRange(episodeId))
    await done(tx)
  })
}
