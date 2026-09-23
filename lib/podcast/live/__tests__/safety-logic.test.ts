import { describe, expect, it } from 'vitest'
import { blurDecision, coverCrop, mapToDest, padBox } from '@/lib/podcast/vision/face-blur'
import { bitrateCheck, delayCheck, faceBlurCheck, goLiveBlockers } from '@/lib/podcast/live/preflight'
import { semitonesToRatio } from '@/lib/podcast/live/voice-disguise'

describe('face blur geometry', () => {
  it('pads 30% on every side and clamps to the image', () => {
    expect(padBox({ x: 100, y: 100, w: 100, h: 100 }, 0.3, 1000, 1000)).toEqual({ x: 70, y: 70, w: 160, h: 160 })
    expect(padBox({ x: 0, y: 0, w: 100, h: 100 }, 0.3, 120, 120)).toEqual({ x: 0, y: 0, w: 120, h: 120 })
  })

  it('cover-crops like the compositor', () => {
    // 4:3 camera into a 16:9 box → crop top/bottom.
    const crop = coverCrop(640, 480, 1280, 720)
    expect(crop.w).toBeCloseTo(640)
    expect(crop.h).toBeCloseTo(360)
    expect(crop.y).toBeCloseTo(60)
  })

  it('maps a source box into the destination and clips it', () => {
    const crop = { x: 0, y: 60, w: 640, h: 360 }
    const dest = mapToDest({ x: 320, y: 60, w: 64, h: 36 }, crop, 0, 0, 1280, 720)
    expect(dest).toEqual({ x: 640, y: 0, w: 128, h: 72 })
    // Partly above the crop → clipped at the top edge.
    const clipped = mapToDest({ x: 0, y: 0, w: 100, h: 100 }, crop, 0, 0, 1280, 720)
    expect(clipped?.y).toBe(0)
    expect(clipped?.h).toBeCloseTo(80)
    expect(mapToDest({ x: 0, y: 0, w: 10, h: 10 }, crop, 0, 0, 1280, 720)).toBeNull()
  })
})

describe('face blur fail-safe timing', () => {
  const base = { stallMs: 300, holdMs: 500, failed: false }
  it('shows the silhouette card before the first detection', () => {
    expect(blurDecision({ ...base, now: 0, lastOkAt: null, lastFaceAt: null })).toBe('card')
  })
  it('shows the card when the detector stalls > 300 ms', () => {
    expect(blurDecision({ ...base, now: 1301, lastOkAt: 1000, lastFaceAt: 1000 })).toBe('card')
    expect(blurDecision({ ...base, now: 1300, lastOkAt: 1000, lastFaceAt: 1000 })).toBe('boxes')
  })
  it('shows the card after a detector error', () => {
    expect(blurDecision({ ...base, failed: true, now: 10, lastOkAt: 10, lastFaceAt: 10 })).toBe('card')
  })
  it('holds the last box for 500 ms when the face drops out, then obscures the whole picture', () => {
    expect(blurDecision({ ...base, now: 1500, lastOkAt: 1450, lastFaceAt: 1000 })).toBe('boxes')
    expect(blurDecision({ ...base, now: 1501, lastOkAt: 1450, lastFaceAt: 1000 })).toBe('noface')
  })
})

describe('go-live gating', () => {
  const provider = {
    configured: true,
    provider: 'cloudflare' as const,
    host: 'x',
    bearer: false,
    defaultHlsUrl: null,
    defaultWhepUrl: 'https://x/play',
  }
  it('explains every blocker', () => {
    const { blockers, warnings } = goLiveBlockers({
      active: null,
      hostStreamOpen: false,
      provider: { ...provider, configured: false },
      providerError: null,
      guestConnected: false,
      playbackMissing: false,
    })
    expect(blockers.join(' ')).toMatch(/No show selected/)
    expect(blockers.join(' ')).toMatch(/Camera \+ mic not opened/)
    expect(blockers.join(' ')).toMatch(/not configured/)
    expect(warnings.join(' ')).toMatch(/Guest not connected/)
  })
  it('a missing guest only warns', () => {
    const { blockers } = goLiveBlockers({
      active: { status: 'scheduled' },
      hostStreamOpen: true,
      provider,
      providerError: null,
      guestConnected: false,
      playbackMissing: false,
    })
    expect(blockers).toEqual([])
  })
})

describe('pre-flight checks', () => {
  it('grades bitrate', () => {
    expect(bitrateCheck(12).status).toBe('ok')
    expect(bitrateCheck(3.5).status).toBe('warn')
    expect(bitrateCheck(1).detail).toMatch(/below/)
    expect(bitrateCheck(null).status).toBe('pending')
  })
  it('warns when there is no delay', () => {
    expect(delayCheck(10).status).toBe('ok')
    expect(delayCheck(0).status).toBe('warn')
  })
  it('warns when guest blur is off or not running', () => {
    expect(faceBlurCheck('Guest', { on: false, state: 'off' }, true).status).toBe('warn')
    expect(faceBlurCheck('Guest', { on: true, state: 'ok' }, true).status).toBe('ok')
    expect(faceBlurCheck('Guest', { on: true, state: 'failed', detail: 'x' }, true).detail).toMatch(/silhouette/)
    expect(faceBlurCheck('Host', { on: false, state: 'off' }, false).status).toBe('ok')
  })
})

describe('voice disguise', () => {
  it('converts semitones to a pitch ratio', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2)
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5)
    expect(semitonesToRatio(0)).toBe(1)
  })
})
