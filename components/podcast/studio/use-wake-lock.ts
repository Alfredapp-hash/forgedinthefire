'use client'

import { useEffect } from 'react'

type Sentinel = { release: () => Promise<void>; released?: boolean }
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> }

/** Keep the screen awake while `active` (recording). Re-acquires after the tab becomes visible. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return
    const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
    if (!api) return
    let sentinel: Sentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      try {
        const next = await api.request('screen')
        if (cancelled) {
          void next.release().catch(() => {})
          return
        }
        sentinel = next
      } catch {
        /* battery saver or permissions policy — recording still works */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
