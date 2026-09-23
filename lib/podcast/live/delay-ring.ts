/**
 * Pure broadcast-delay bookkeeping (no DOM). Used by broadcast-delay.ts for the
 * outgoing video and unit-tested in __tests__/delay-ring.test.ts.
 *
 * Model:
 *   - Every captured item carries its capture time `t` (ms, performance.now clock).
 *   - An item is "due" once `now - t >= delayMs`; due items go on air.
 *   - `anchor` is the moment the buffer became valid (start, or the last DUMP).
 *     Items captured before the anchor are never released — this is what makes a
 *     DUMP safe even when an encoder callback for a pre-dump frame arrives late.
 *   - While `now < anchor + delayMs` the delay is (re)building and the air shows a hold slate.
 */

export const DELAY_MIN_SEC = 7
export const DELAY_MAX_SEC = 30
export const DELAY_DEFAULT_SEC = 10
/** Choices offered in the control room. 0 = no delay (DUMP then only cuts to the safe slate). */
export const DELAY_CHOICES_SEC = [0, 7, 10, 15, 20, 30] as const

/** 0 stays 0 (off); anything else is clamped to the supported 7–30 s window. */
export function clampDelaySec(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return 0
  return Math.min(DELAY_MAX_SEC, Math.max(DELAY_MIN_SEC, Math.round(sec)))
}

export type RingEntry<T> = { t: number; item: T; key: boolean; bytes: number }

export type DelayRingOptions<T> = {
  delayMs: number
  /** Called for every item that leaves the ring without going on air (dump, stale, stop). */
  dispose?: (item: T) => void
  /** Byte size for the memory readout. */
  sizeOf?: (item: T) => number
  /**
   * Encoded video: after a start or dump the first released item must be a key frame
   * (the decoder cannot start mid-GOP). Non-key items are dropped until one arrives.
   */
  requireKeyAfterReset?: boolean
}

export class DelayRing<T> {
  readonly delayMs: number
  private entries: RingEntry<T>[] = []
  private head = 0
  private anchorAt: number | null = null
  private needKey: boolean
  private dumps = 0
  private bytes = 0
  private opts: DelayRingOptions<T>

  constructor(opts: DelayRingOptions<T>) {
    this.opts = opts
    this.delayMs = Math.max(0, opts.delayMs)
    this.needKey = Boolean(opts.requireKeyAfterReset)
  }

  /** Mark the buffer valid from `now` (go-live). Anything captured earlier is ignored. */
  start(now: number) {
    this.drop()
    this.anchorAt = now
    this.needKey = Boolean(this.opts.requireKeyAfterReset)
  }

  get anchor() {
    return this.anchorAt
  }

  get dumpCount() {
    return this.dumps
  }

  get size() {
    return this.entries.length - this.head
  }

  get bufferedBytes() {
    return this.bytes
  }

  /**
   * Add a captured item. Returns false (and disposes it) when it may never air:
   * not started, captured before the last dump, or a non-key item while a key is required.
   */
  push(t: number, item: T, key = true): boolean {
    if (this.anchorAt == null || t < this.anchorAt) {
      this.opts.dispose?.(item)
      return false
    }
    if (this.needKey) {
      if (!key) {
        this.opts.dispose?.(item)
        return false
      }
      this.needKey = false
    }
    // Keep capture order even if an async capture resolves late.
    const last = this.entries[this.entries.length - 1]
    if (this.size && last && t < last.t) {
      this.opts.dispose?.(item)
      return false
    }
    const bytes = this.opts.sizeOf?.(item) ?? 0
    this.bytes += bytes
    this.entries.push({ t, item, key, bytes })
    return true
  }

  /** ms left until the buffer is full again (0 when not building). */
  rebuildingMs(now: number): number {
    if (this.anchorAt == null) return this.delayMs
    return Math.max(0, this.anchorAt + this.delayMs - now)
  }

  /** Every due item, oldest first, removed from the ring. Caller owns them. */
  takeDue(now: number): RingEntry<T>[] {
    const out: RingEntry<T>[] = []
    const cutoff = now - this.delayMs
    while (this.head < this.entries.length && this.entries[this.head].t <= cutoff) {
      const e = this.entries[this.head]
      this.bytes -= e.bytes
      out.push(e)
      this.head += 1
    }
    this.compact()
    return out
  }

  /**
   * Newest due item; older due items are disposed. Caller owns the returned item.
   * Used for raw frames where only the latest one is drawn.
   */
  latestDue(now: number): RingEntry<T> | null {
    const due = this.takeDue(now)
    if (!due.length) return null
    for (let i = 0; i < due.length - 1; i += 1) this.opts.dispose?.(due[i].item)
    return due[due.length - 1]
  }

  /**
   * DUMP: discard every buffered item and restart the delay from `now`.
   * Returns how many items were dropped.
   */
  dump(now: number): number {
    const dropped = this.drop()
    this.anchorAt = now
    this.needKey = Boolean(this.opts.requireKeyAfterReset)
    this.dumps += 1
    return dropped
  }

  /** Release everything (stop). */
  clear() {
    this.drop()
    this.anchorAt = null
  }

  private drop() {
    let n = 0
    for (let i = this.head; i < this.entries.length; i += 1) {
      this.opts.dispose?.(this.entries[i].item)
      n += 1
    }
    this.entries = []
    this.head = 0
    this.bytes = 0
    return n
  }

  private compact() {
    if (this.head > 256 && this.head * 2 > this.entries.length) {
      this.entries = this.entries.slice(this.head)
      this.head = 0
    }
  }
}

export type FramePlan = { fps: number; scale: number; width: number; height: number; bytes: number }

/**
 * Raw-frame fallback (no WebCodecs): pick the highest quality fps × scale whose
 * RGBA ring fits the memory budget. Preference: keep ≥10 fps, then shrink, then drop fps.
 */
export function planRawFrames(
  delayMs: number,
  width: number,
  height: number,
  budgetBytes = 400 * 1024 * 1024,
): FramePlan {
  const candidates: Array<[number, number]> = [
    [15, 1],
    [15, 0.75],
    [15, 0.5],
    [12, 0.5],
    [10, 0.5],
    [10, 0.375],
    [8, 0.375],
    [6, 0.375],
    [5, 0.25],
  ]
  const seconds = Math.max(0, delayMs) / 1000
  let plan: FramePlan | null = null
  for (const [fps, scale] of candidates) {
    const w = Math.max(2, Math.round(width * scale))
    const h = Math.max(2, Math.round(height * scale))
    const bytes = Math.ceil(seconds * fps + 1) * w * h * 4
    plan = { fps, scale, width: w, height: h, bytes }
    if (bytes <= budgetBytes) return plan
  }
  return plan as FramePlan
}
