import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveStore } from '@/components/podcast/studio/live-store'
import { leaveMessage, setStudioGuard, studioGuard } from '@/components/podcast/studio/leave-guard'

afterEach(() => {
  vi.useRealTimers()
})

describe('live store (meters / playhead outside React state)', () => {
  it('raw values update on every write; React snapshots are throttled to ~15 Hz', () => {
    vi.useFakeTimers()
    const store = createLiveStore()
    const listener = vi.fn()
    store.subscribe(listener)
    for (let i = 1; i <= 60; i++) store.set({ playhead: i }) // one animation-frame burst
    expect(store.get().playhead).toBe(60)
    // Nothing published yet: the first emit waits for the throttle window.
    expect(listener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(70)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().playhead).toBe(60)
    // A further burst inside the window coalesces into one more notification.
    for (let i = 61; i <= 120; i++) store.set({ playhead: i })
    vi.advanceTimersByTime(70)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().playhead).toBe(120)
  })

  it('immediate writes (seeks) publish synchronously', () => {
    vi.useFakeTimers()
    const store = createLiveStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ playhead: 12 }, true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().playhead).toBe(12)
  })

  it('peak / clip writes are deduplicated and reset together', () => {
    vi.useFakeTimers()
    const store = createLiveStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setPeak('host', 0.5)
    store.setPeak('host', 0.5)
    store.setClip('host', true)
    store.setClip('host', true)
    vi.advanceTimersByTime(70)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().peaks.host).toBe(0.5)
    expect(store.get().clips.host).toBe(true)
    store.resetPeaks()
    expect(store.getSnapshot().peaks).toEqual({})
    expect(store.getSnapshot().clips).toEqual({})
  })

  it('unsubscribe stops notifications', () => {
    vi.useFakeTimers()
    const store = createLiveStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    off()
    store.set({ recClock: 3 }, true)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('leave-page guard', () => {
  it('warns while recording, or with unsaved edits, and not otherwise', () => {
    expect(leaveMessage({ recording: false, unsaved: false })).toBeNull()
    expect(leaveMessage({ recording: true, unsaved: false })).toMatch(/Recording is in progress/)
    expect(leaveMessage({ recording: false, unsaved: true })).toMatch(/not saved to the episode/)
    // Recording outranks unsaved edits in the message.
    expect(leaveMessage({ recording: true, unsaved: true })).toMatch(/Recording/)
  })

  it('module state is what beforeunload reads at event time', () => {
    setStudioGuard({ recording: false, unsaved: true })
    expect(studioGuard()).toEqual({ recording: false, unsaved: true })
    expect(leaveMessage()).not.toBeNull()
    setStudioGuard({ recording: false, unsaved: false })
    expect(leaveMessage()).toBeNull()
  })
})
