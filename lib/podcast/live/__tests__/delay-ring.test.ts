import { describe, expect, it, vi } from 'vitest'
import { DelayRing, clampDelaySec, planRawFrames } from '@/lib/podcast/live/delay-ring'

describe('clampDelaySec', () => {
  it('keeps 0 as off and clamps to 7–30 s', () => {
    expect(clampDelaySec(0)).toBe(0)
    expect(clampDelaySec(-5)).toBe(0)
    expect(clampDelaySec(Number.NaN)).toBe(0)
    expect(clampDelaySec(3)).toBe(7)
    expect(clampDelaySec(10)).toBe(10)
    expect(clampDelaySec(10.4)).toBe(10)
    expect(clampDelaySec(90)).toBe(30)
  })
})

describe('DelayRing', () => {
  it('releases items only after the delay, in order', () => {
    const ring = new DelayRing<string>({ delayMs: 10_000 })
    ring.start(0)
    ring.push(0, 'a')
    ring.push(33, 'b')
    ring.push(66, 'c')
    expect(ring.takeDue(9_999)).toEqual([])
    expect(ring.takeDue(10_000).map((e) => e.item)).toEqual(['a'])
    expect(ring.takeDue(10_066).map((e) => e.item)).toEqual(['b', 'c'])
    expect(ring.size).toBe(0)
  })

  it('reports the delay as building until the buffer is full', () => {
    const ring = new DelayRing<number>({ delayMs: 10_000 })
    expect(ring.rebuildingMs(0)).toBe(10_000) // not started
    ring.start(1_000)
    expect(ring.rebuildingMs(1_000)).toBe(10_000)
    expect(ring.rebuildingMs(5_000)).toBe(6_000)
    expect(ring.rebuildingMs(11_000)).toBe(0)
    expect(ring.rebuildingMs(20_000)).toBe(0)
  })

  it('ignores items before start', () => {
    const dispose = vi.fn()
    const ring = new DelayRing<string>({ delayMs: 1000, dispose })
    expect(ring.push(0, 'early')).toBe(false)
    expect(dispose).toHaveBeenCalledWith('early')
  })

  it('DUMP discards the buffered segment so it never airs', () => {
    const dispose = vi.fn()
    const ring = new DelayRing<string>({ delayMs: 10_000, dispose })
    ring.start(0)
    for (let t = 0; t <= 9_000; t += 1_000) ring.push(t, `slip@${t}`)
    // First 2 s have aired already.
    expect(ring.takeDue(11_000).map((e) => e.item)).toEqual(['slip@0', 'slip@1000'])
    const dropped = ring.dump(11_000)
    expect(dropped).toBe(8)
    expect(dispose).toHaveBeenCalledTimes(8)
    expect(ring.dumpCount).toBe(1)
    // Nothing from before the dump is ever released, however long we wait.
    expect(ring.takeDue(60_000)).toEqual([])
  })

  it('rejects late captures from before the dump (encoder callbacks racing the DUMP)', () => {
    const ring = new DelayRing<string>({ delayMs: 10_000 })
    ring.start(0)
    ring.push(4_900, 'before')
    ring.dump(5_000)
    expect(ring.push(4_990, 'late-callback-for-pre-dump-frame')).toBe(false)
    expect(ring.push(5_010, 'after')).toBe(true)
    expect(ring.takeDue(15_010).map((e) => e.item)).toEqual(['after'])
  })

  it('rebuilds the delay behind the dump: holds for the full delay, then resumes', () => {
    const ring = new DelayRing<number>({ delayMs: 10_000 })
    ring.start(0)
    ring.dump(20_000)
    expect(ring.rebuildingMs(20_000)).toBe(10_000)
    expect(ring.rebuildingMs(24_000)).toBe(6_000) // "Delay rebuilding… 6 s"
    for (let t = 20_000; t < 30_000; t += 100) ring.push(t, t)
    expect(ring.takeDue(29_999).map((e) => e.item)).toEqual([])
    expect(ring.rebuildingMs(30_000)).toBe(0)
    const first = ring.takeDue(30_000)
    expect(first[0].item).toBe(20_000)
  })

  it('keeps audio and video aligned: an item captured at t airs at t + delay for every delay choice', () => {
    for (const delayMs of [7_000, 10_000, 15_000, 30_000]) {
      const ring = new DelayRing<number>({ delayMs })
      ring.start(0)
      for (let t = 0; t < 2_000; t += 33) ring.push(t, t)
      for (let now = 0; now < delayMs + 2_000; now += 16) {
        for (const e of ring.takeDue(now)) {
          // Released within one tick of its due time — same offset the DelayNode applies to audio.
          expect(now - e.t).toBeGreaterThanOrEqual(delayMs)
          expect(now - e.t).toBeLessThan(delayMs + 16)
        }
      }
    }
  })

  it('requires a key frame after start and after every dump (decoder cannot start mid-GOP)', () => {
    const ring = new DelayRing<string>({ delayMs: 1000, requireKeyAfterReset: true })
    ring.start(0)
    expect(ring.push(10, 'delta', false)).toBe(false)
    expect(ring.push(20, 'key', true)).toBe(true)
    expect(ring.push(30, 'delta2', false)).toBe(true)
    ring.dump(40)
    expect(ring.push(50, 'delta3', false)).toBe(false)
    expect(ring.push(60, 'key2', true)).toBe(true)
    expect(ring.takeDue(2000).map((e) => e.item)).toEqual(['key2'])
  })

  it('latestDue returns only the newest due frame and disposes the skipped ones', () => {
    const dispose = vi.fn()
    const ring = new DelayRing<string>({ delayMs: 100, dispose })
    ring.start(0)
    ring.push(0, 'f0')
    ring.push(10, 'f1')
    ring.push(20, 'f2')
    ring.push(500, 'f3')
    expect(ring.latestDue(125)?.item).toBe('f2')
    expect(dispose.mock.calls.map((c) => c[0])).toEqual(['f0', 'f1'])
    expect(ring.latestDue(130)).toBeNull()
  })

  it('tracks buffered bytes', () => {
    const ring = new DelayRing<Uint8Array>({ delayMs: 100, sizeOf: (b) => b.byteLength })
    ring.start(0)
    ring.push(0, new Uint8Array(10))
    ring.push(50, new Uint8Array(20))
    expect(ring.bufferedBytes).toBe(30)
    ring.takeDue(100)
    expect(ring.bufferedBytes).toBe(20)
    ring.dump(120)
    expect(ring.bufferedBytes).toBe(0)
  })

  it('drops out-of-order captures (async snapshot resolving late)', () => {
    const ring = new DelayRing<string>({ delayMs: 100 })
    ring.start(0)
    ring.push(50, 'b')
    expect(ring.push(40, 'a-late')).toBe(false)
  })

  it('stays correct across many items (internal compaction)', () => {
    const ring = new DelayRing<number>({ delayMs: 1000 })
    ring.start(0)
    let released = 0
    for (let t = 0; t < 60_000; t += 10) {
      ring.push(t, t)
      released += ring.takeDue(t).length
    }
    expect(released + ring.size).toBe(6000)
    // Items captured in the last second (59 000 … 59 990 ms) are still in the delay.
    expect(ring.size).toBe(100)
  })
})

describe('planRawFrames', () => {
  it('fits the fallback frame buffer into the memory budget', () => {
    const budget = 400 * 1024 * 1024
    for (const sec of [7, 10, 15, 20, 30]) {
      const plan = planRawFrames(sec * 1000, 1280, 720, budget)
      expect(plan.bytes).toBeLessThanOrEqual(budget)
      expect(plan.fps).toBeGreaterThanOrEqual(5)
    }
  })

  it('matches the plans documented in docs/podcast-live.md', () => {
    expect(planRawFrames(7_000, 1280, 720)).toMatchObject({ width: 1280, height: 720, fps: 15 })
    expect(planRawFrames(10_000, 1280, 720)).toMatchObject({ width: 960, height: 540, fps: 15 })
    expect(planRawFrames(30_000, 1280, 720)).toMatchObject({ width: 640, height: 360, fps: 15 })
  })

  it('prefers full size at short delays with a big budget', () => {
    const plan = planRawFrames(7_000, 1280, 720, 2 * 1024 * 1024 * 1024)
    expect(plan).toMatchObject({ fps: 15, scale: 1, width: 1280, height: 720 })
  })
})
