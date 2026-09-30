import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backoffDelay,
  backoffSchedule,
  isRetryableStatus,
  startPollLoop,
  TUS_RETRY_DELAYS,
} from '@/lib/podcast/guest/backoff'

afterEach(() => {
  vi.useRealTimers()
})

describe('backoff', () => {
  it('grows exponentially and caps', () => {
    expect(backoffSchedule(6, { jitter: 0, base: 1000, max: 10_000 })).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000])
  })

  it('jitter stays inside [raw*(1-j), raw]', () => {
    expect(backoffDelay(2, { base: 1000, jitter: 0.5, random: () => 0 })).toBe(2000)
    expect(backoffDelay(2, { base: 1000, jitter: 0.5, random: () => 0.999999 })).toBe(4000)
  })

  it('treats negative attempts as 0', () => {
    expect(backoffDelay(-3, { base: 500, jitter: 0 })).toBe(500)
  })

  it('tus schedule starts immediately and never exceeds 30s', () => {
    expect(TUS_RETRY_DELAYS[0]).toBe(0)
    expect(Math.max(...TUS_RETRY_DELAYS)).toBe(30_000)
  })

  it('classifies retryable statuses', () => {
    expect(isRetryableStatus(0)).toBe(true)
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(403)).toBe(false)
  })
})

describe('startPollLoop', () => {
  it('never overlaps: next poll starts only after the previous resolves', async () => {
    vi.useFakeTimers()
    let active = 0
    let maxActive = 0
    let calls = 0
    const loop = startPollLoop({
      interval: 100,
      run: async () => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 350)) // slower than the interval
        active -= 1
      },
    })
    await vi.advanceTimersByTimeAsync(2000)
    loop.stop()
    expect(maxActive).toBe(1)
    expect(calls).toBeGreaterThanOrEqual(4)
    expect(calls).toBeLessThanOrEqual(5)
  })

  it('backs off after errors and stops when onError returns true', async () => {
    vi.useFakeTimers()
    let calls = 0
    const loop = startPollLoop({
      interval: 100,
      maxInterval: 1000,
      random: () => 0,
      run: async () => {
        calls += 1
        throw new Error('net')
      },
      onError: (_e, failures) => failures >= 3,
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toBe(3)
    expect(loop.failures).toBe(3)
    loop.stop()
  })

  it('kick runs immediately and resets the timer', async () => {
    vi.useFakeTimers()
    let calls = 0
    const loop = startPollLoop({ interval: 10_000, run: async () => void (calls += 1) })
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toBe(1)
    loop.kick()
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toBe(2)
    loop.stop()
  })
})
