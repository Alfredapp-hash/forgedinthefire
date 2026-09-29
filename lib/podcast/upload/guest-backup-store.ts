/**
 * Browser-side persistence for guest backup uploads, so a reload or a crashed
 * tab does not lose slices that were recorded but not yet sent.
 *
 * Everything here is best-effort: private windows, blocked site data and old
 * Safari can make storage throw or vanish, so every call is wrapped and failure
 * means "memory only" (the upload still runs, it just cannot survive a reload).
 *
 * - Slices that are not yet confirmed uploaded live in IndexedDB (`slices`).
 * - One row per take (`takes`) remembers what the server needs at finish time.
 * - tus upload URLs (for resuming a half-sent large object) live in localStorage.
 * Keys use a short non-reversible tag of the invite token, never the token itself.
 */

import type { UrlStorage } from 'tus-js-client'

const DB_NAME = 'fitf-guest-backup'
const DB_VERSION = 1
const SLICES = 'slices'
const TAKES = 'takes'

export type PendingSlice = {
  key: string
  tag: string
  takeId: string
  index: number
  bytes: ArrayBuffer
  createdAt: number
}

export type PendingTake = {
  key: string
  tag: string
  takeId: string
  kind: 'audio' | 'camera'
  /** Base MIME (no codecs) the take was started with. */
  mime: string
  /** Slices recorded so far (the highest index + 1). */
  chunksRecorded: number
  /** Set once recording stopped: finish with exactly this many slices. */
  finalChunks: number | null
  /** Alignment inputs for the finish call (see guest-backup.ts). */
  durationSec: number | null
  startedAtSessionSec: number | null
  guestStartHostMs: number | null
  clockRttMs: number | null
  updatedAt: number
}

/** FNV-1a tag so storage never holds the invite token. */
export function tokenTag(token: string) {
  let h = 2166136261
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(SLICES)) db.createObjectStore(SLICES, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(TAKES)) db.createObjectStore(TAKES, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await openDb()
  if (!db) return null
  return new Promise<T | null>((resolve) => {
    try {
      const t = db.transaction(store, mode)
      const req = run(t.objectStore(store))
      t.oncomplete = () => resolve(req ? (req.result as T) : null)
      t.onerror = () => resolve(null)
      t.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export function sliceKey(tag: string, takeId: string, index: number) {
  return `${tag}:${takeId}:${String(index).padStart(6, '0')}`
}

export function takeKey(tag: string, takeId: string) {
  return `${tag}:${takeId}`
}

/** Returns false when the slice could not be persisted (memory only). */
export async function savePendingSlice(tag: string, takeId: string, index: number, blob: Blob) {
  let bytes: ArrayBuffer
  try {
    bytes = await blob.arrayBuffer()
  } catch {
    return false
  }
  const row: PendingSlice = { key: sliceKey(tag, takeId, index), tag, takeId, index, bytes, createdAt: Date.now() }
  return (await tx(SLICES, 'readwrite', (s) => s.put(row))) !== null
}

export async function removePendingSlice(tag: string, takeId: string, index: number) {
  await tx(SLICES, 'readwrite', (s) => s.delete(sliceKey(tag, takeId, index)))
}

export async function listPendingSlices(tag: string, takeId?: string) {
  const all = ((await tx<PendingSlice[]>(SLICES, 'readonly', (s) => s.getAll())) || []) as PendingSlice[]
  return all
    .filter((r) => r.tag === tag && (!takeId || r.takeId === takeId))
    .sort((a, b) => (a.takeId === b.takeId ? a.index - b.index : a.takeId < b.takeId ? -1 : 1))
}

export async function savePendingTake(take: Omit<PendingTake, 'key' | 'updatedAt'>) {
  const row: PendingTake = { ...take, key: takeKey(take.tag, take.takeId), updatedAt: Date.now() }
  return (await tx(TAKES, 'readwrite', (s) => s.put(row))) !== null
}

export async function removePendingTake(tag: string, takeId: string) {
  await tx(TAKES, 'readwrite', (s) => s.delete(takeKey(tag, takeId)))
}

export async function listPendingTakes(tag: string) {
  const all = ((await tx<PendingTake[]>(TAKES, 'readonly', (s) => s.getAll())) || []) as PendingTake[]
  return all.filter((r) => r.tag === tag).sort((a, b) => a.updatedAt - b.updatedAt)
}

/** Forget everything this device holds for the invite (after the host confirmed every take). */
export async function clearPendingForInvite(tag: string) {
  const [slices, takes] = await Promise.all([listPendingSlices(tag), listPendingTakes(tag)])
  for (const s of slices) await removePendingSlice(tag, s.takeId, s.index)
  for (const t of takes) await removePendingTake(tag, t.takeId)
}

/** tus UrlStorage over localStorage with every access guarded. */
export class SafeTusUrlStorage implements UrlStorage {
  private prefix = 'fitf-tus::'

  private read(key: string) {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  private entries(match?: string) {
    const out: { key: string; value: Record<string, unknown> }[] = []
    try {
      const ls = window.localStorage
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i)
        if (!key || !key.startsWith(this.prefix)) continue
        if (match && !key.startsWith(match)) continue
        const value = this.read(key)
        if (value) out.push({ key, value })
      }
    } catch {
      /* storage blocked */
    }
    return out
  }

  async findAllUploads() {
    return this.entries().map(({ key, value }) => ({ ...(value as object), urlStorageKey: key }) as never)
  }

  async findUploadsByFingerprint(fingerprint: string) {
    return this.entries(`${this.prefix}${fingerprint}::`).map(
      ({ key, value }) => ({ ...(value as object), urlStorageKey: key }) as never,
    )
  }

  async removeUpload(urlStorageKey: string) {
    try {
      window.localStorage.removeItem(urlStorageKey)
    } catch {
      /* ignore */
    }
  }

  async addUpload(fingerprint: string, upload: object) {
    const key = `${this.prefix}${fingerprint}::${Math.round(Math.random() * 1e12)}`
    try {
      window.localStorage.setItem(key, JSON.stringify(upload))
    } catch {
      /* storage blocked or full: resume-after-reload is lost, upload continues */
    }
    return key
  }
}
