/**
 * Retry timing for guest uploads and polls. Pure: timers and randomness are
 * injected so tests are deterministic.
 */

export type BackoffOptions = {
  /** First retry delay (ms). */
  base?: number
  /** Ceiling for any single delay (ms). */
  max?: number
  /** Multiplier per attempt. */
  factor?: number
  /** 0..1: share of the delay that is randomized ("equal jitter"). */
  jitter?: number
  /** Injected random source in [0, 1). */
  random?: () => number
}

/** Delay before retry number `attempt` (0-based). */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}) {
  const base = opts.base ?? 1000
  const max = opts.max ?? 30_000
  const factor = opts.factor ?? 2
  const jitter = Math.min(1, Math.max(0, opts.jitter ?? 0.3))
  const random = opts.random ?? Math.random
  const n = Math.max(0, Math.floor(attempt))
  const raw = Math.min(max, base * Math.pow(factor, n))
  const fixed = raw * (1 - jitter)
  return Math.round(fixed + raw * jitter * random())
}

/** A whole schedule, e.g. for tus-js-client `retryDelays`. */
export function backoffSchedule(count: number, opts: BackoffOptions = {}) {
  return Array.from({ length: Math.max(0, count) }, (_, i) => backoffDelay(i, opts))
}

/** tus retry schedule: immediate, then growing to 30 s. tus resets its counter after progress. */
export const TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10_000, 20_000, 30_000, 30_000, 30_000, 30_000]

/** HTTP statuses worth retrying (network / overload / expired signature). */
export function isRetryableStatus(status: number) {
  if (!status) return true // network error / CORS / offline
  return status === 408 || status === 409 || status === 423 || status === 429 || status >= 500
}

export type PollLoopOptions = {
  /** One poll. Resolves when done; never overlaps with the next. */
  run: () => Promise<void>
  /** Normal gap between the end of one poll and the start of the next (ms). May change over time. */
  interval: number | (() => number)
  /** Backoff ceiling after consecutive errors (ms). */
  maxInterval?: number
  /** Return true to stop the loop for good (e.g. revoked invite). */
  onError?: (err: unknown, failures: number) => boolean | void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
  random?: () => number
}

/**
 * Non-overlapping poll: await the request, THEN schedule the next one.
 * setInterval + async would stack requests whenever the network is slow.
 */
export function startPollLoop(opts: PollLoopOptions) {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  const intervalOf = () => (typeof opts.interval === 'function' ? opts.interval() : opts.interval)
  let stopped = false
  let running = false
  let failures = 0
  let timer: unknown = null

  const schedule = (ms: number) => {
    if (stopped) return
    timer = setTimer(() => void tick(), ms)
  }

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      await opts.run()
      failures = 0
    } catch (err) {
      failures += 1
      if (opts.onError?.(err, failures) === true) stopped = true
    } finally {
      running = false
    }
    if (stopped) return
    const base = intervalOf()
    schedule(
      failures
        ? backoffDelay(failures - 1, { base: Math.max(base, 500), max: opts.maxInterval ?? 8000, random: opts.random })
        : base,
    )
  }

  void tick()
  return {
    stop() {
      stopped = true
      if (timer != null) clearTimer(timer)
      timer = null
    },
    /** Run now (e.g. after the tab becomes visible) without waiting for the timer. */
    kick() {
      if (stopped || running) return
      if (timer != null) clearTimer(timer)
      timer = null
      void tick()
    },
    get failures() {
      return failures
    },
  }
}
