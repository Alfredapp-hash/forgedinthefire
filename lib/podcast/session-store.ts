/** IndexedDB autosave for in-progress production-room takes (per episode). */

import { encodeWav } from '@/lib/podcast/audio'
import { cameraKind, normalizeCameraClip, type CameraClip } from '@/lib/podcast/camera'
import { bufferFromBlob } from '@/lib/podcast/effects'
import type { SessionPerson, StudioTrack } from '@/lib/podcast/multitrack'

const DB_NAME = 'forged-podcast-room'
const DB_VERSION = 2
const STORE = 'sessions'

export type SessionPeek = {
  episodeId: string
  savedAt: number
  takeCount: number
  cameraCount: number
  durationSec: number
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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
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
