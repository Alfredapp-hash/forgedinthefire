import { describe, expect, it } from 'vitest'
import {
  POLL_ERROR_MAX_MS,
  POLL_FALLBACK_MS,
  POLL_FAST_MS,
  POLL_IDLE_MAX_MS,
  SignalDeduper,
  errorPollDelay,
  nextPollDelay,
  newSignalCid,
  nextSignalSeq,
  stampControl,
} from '@/lib/podcast/guest/control-channel'

describe('stampControl', () => {
  it('adds a cid and a monotonic seq, and keeps an existing stamp', () => {
    const a = stampControl({ on: true })
    const b = stampControl({ on: false })
    expect(a.cid).toMatch(/^[0-9a-f]{18}$/)
    expect(typeof a.seq).toBe('number')
    expect((b.seq as number) > (a.seq as number)).toBe(true)
    expect(stampControl(a)).toBe(a)
  })

  it('seq never repeats even inside one millisecond', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 50; i++) seen.add(nextSignalSeq())
    expect(seen.size).toBe(50)
    expect(newSignalCid()).not.toBe(newSignalCid())
  })
})

describe('SignalDeduper', () => {
  it('applies a signal once (data channel + signal table copy)', () => {
    const d = new SignalDeduper()
    const sig = stampControl({ on: true })
    expect(d.accept('mute', sig)).toBe(true)
    expect(d.accept('mute', sig)).toBe(false)
  })

  it('drops an older state that arrives after a newer one, per kind', () => {
    const d = new SignalDeduper()
    expect(d.accept('mute', { cid: 'a1b2c3d4e5f6', seq: 200, on: true })).toBe(true)
    expect(d.accept('mute', { cid: 'b1b2c3d4e5f6', seq: 100, on: false })).toBe(false)
    // A different kind has its own order.
    expect(d.accept('pause', { cid: 'c1b2c3d4e5f6', seq: 100, on: true })).toBe(true)
  })

  it('never seq-gates reconnect / hangup and accepts unstamped legacy signals', () => {
    const d = new SignalDeduper()
    expect(d.accept('reconnect', { cid: 'd1b2c3d4e5f6', seq: 500 })).toBe(true)
    expect(d.accept('reconnect', { cid: 'e1b2c3d4e5f6', seq: 400 })).toBe(true)
    expect(d.accept('hangup', { cid: 'f1b2c3d4e5f6', seq: 1 })).toBe(true)
    expect(d.accept('mute', { on: true })).toBe(true)
    expect(d.accept('mute', { on: true })).toBe(true)
  })

  it('reset forgets everything', () => {
    const d = new SignalDeduper()
    const sig = stampControl({ on: true })
    d.accept('mute', sig)
    d.reset()
    expect(d.accept('mute', sig)).toBe(true)
  })
})

describe('poll delays', () => {
  it('slows to the fallback once control runs on the data channel', () => {
    expect(nextPollDelay({ channelUp: true, gotSignals: true, idleTicks: 0 })).toBe(POLL_FALLBACK_MS)
    expect(POLL_FALLBACK_MS).toBeGreaterThan(POLL_FAST_MS)
  })

  it('stays fast while signals flow and backs off gradually when quiet', () => {
    expect(nextPollDelay({ channelUp: false, gotSignals: true, idleTicks: 9 })).toBe(POLL_FAST_MS)
    const quiet = [0, 1, 2, 5, 20].map((idleTicks) => nextPollDelay({ channelUp: false, gotSignals: false, idleTicks }))
    for (let i = 1; i < quiet.length; i++) expect(quiet[i]).toBeGreaterThanOrEqual(quiet[i - 1])
    expect(quiet[quiet.length - 1]).toBe(POLL_IDLE_MAX_MS)
  })

  it('error delay doubles and caps', () => {
    expect(errorPollDelay(0)).toBe(1500)
    expect(errorPollDelay(1500)).toBe(3000)
    expect(errorPollDelay(100_000)).toBe(POLL_ERROR_MAX_MS)
  })
})
