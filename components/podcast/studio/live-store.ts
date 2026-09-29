'use client'

/**
 * High-frequency studio values (playhead, record clock, input meters) live OUTSIDE React state so
 * the 4,000-line editor does not re-render every animation frame. Writers update `raw` as often
 * as they like; subscribers are notified at most ~15 Hz. Seeks from the user can publish
 * immediately. Canvas painters (Program monitor) read `get()` directly for smooth motion.
 */
import { createContext, useContext, useSyncExternalStore } from 'react'

export type LiveState = {
  playhead: number
  recClock: number
  /** Input peak (0..1) keyed by capture device key. */
  peaks: Record<string, number>
  /** Clip-hold flag keyed by capture device key. */
  clips: Record<string, boolean>
}

export type LiveStore = {
  /** Latest raw value (every write). Use in rAF painters and event handlers. */
  get: () => LiveState
  /** Throttled snapshot for React subscribers. */
  getSnapshot: () => LiveState
  subscribe: (listener: () => void) => () => void
  set: (patch: Partial<LiveState>, immediate?: boolean) => void
  setPeak: (key: string, peak: number) => void
  setClip: (key: string, on: boolean) => void
  resetPeaks: () => void
}

const EMIT_MS = 66 // ≈15 Hz

const EMPTY: LiveState = { playhead: 0, recClock: 0, peaks: {}, clips: {} }

export function createLiveStore(): LiveStore {
  let raw: LiveState = EMPTY
  let published: LiveState = EMPTY
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastEmit = 0

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const emit = () => {
    timer = null
    lastEmit = now()
    if (published === raw) return
    published = raw
    listeners.forEach((l) => l())
  }

  const schedule = (immediate: boolean) => {
    if (immediate) {
      if (timer != null) clearTimeout(timer)
      emit()
      return
    }
    if (timer != null) return
    timer = setTimeout(emit, Math.max(0, EMIT_MS - (now() - lastEmit)))
  }

  return {
    get: () => raw,
    getSnapshot: () => published,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(patch, immediate = false) {
      raw = { ...raw, ...patch }
      schedule(immediate)
    },
    setPeak(key, peak) {
      if (raw.peaks[key] === peak) return
      raw = { ...raw, peaks: { ...raw.peaks, [key]: peak } }
      schedule(false)
    },
    setClip(key, on) {
      if (Boolean(raw.clips[key]) === on) return
      raw = { ...raw, clips: { ...raw.clips, [key]: on } }
      schedule(false)
    },
    resetPeaks() {
      raw = { ...raw, peaks: {}, clips: {} }
      schedule(true)
    },
  }
}

export const LiveStoreContext = createContext<LiveStore | null>(null)

const noopSubscribe = () => () => {}

/** Subscribe to one slice of the live store (≤15 Hz). Falls back to `fallback` with no provider. */
export function useLiveValue<T>(select: (s: LiveState) => T, fallback: T): T {
  const store = useContext(LiveStoreContext)
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? select(store.getSnapshot()) : fallback),
    () => fallback,
  )
}

export function useLiveStore(): LiveStore | null {
  return useContext(LiveStoreContext)
}
