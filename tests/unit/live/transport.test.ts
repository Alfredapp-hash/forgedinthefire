import { describe, expect, it } from 'vitest'
import {
  isOnAir,
  transportDisabled,
  transportLabel,
  transportRecordState,
  viewerBadge,
} from '@/lib/podcast/live/transport'

describe('live transport strip — RecordButton state', () => {
  it('is idle until a show is selected and nothing blocks going live', () => {
    expect(transportRecordState({ phase: 'off', blockers: 2, hasActiveShow: true })).toBe('idle')
    expect(transportRecordState({ phase: 'off', blockers: 0, hasActiveShow: false })).toBe('idle')
  })

  it('arms when the room is ready, and reads as recording while on air', () => {
    expect(transportRecordState({ phase: 'off', blockers: 0, hasActiveShow: true })).toBe('armed')
    expect(transportRecordState({ phase: 'ended', blockers: 0, hasActiveShow: true })).toBe('armed')
    for (const phase of ['connecting', 'live', 'ending'] as const) {
      expect(transportRecordState({ phase, blockers: 5, hasActiveShow: true })).toBe('recording')
    }
  })

  it('treats connecting / live / ending as on air', () => {
    expect(isOnAir('off')).toBe(false)
    expect(isOnAir('ended')).toBe(false)
    expect(isOnAir('connecting')).toBe(true)
    expect(isOnAir('live')).toBe(true)
    expect(isOnAir('ending')).toBe(true)
  })
})

describe('live transport strip — accessible name and disabled state', () => {
  it('explains why Go live is unavailable instead of going silent', () => {
    expect(transportLabel({ phase: 'off', blockers: 1, preflightOpen: false })).toMatch(/unavailable/i)
    expect(transportLabel({ phase: 'off', blockers: 0, preflightOpen: true })).toMatch(/pre-flight/i)
    expect(transportLabel({ phase: 'off', blockers: 0, preflightOpen: false })).toMatch(/^Go live/)
  })

  it('becomes End show while live and is inert while connecting or ending', () => {
    expect(transportLabel({ phase: 'live', blockers: 0, preflightOpen: false })).toBe('End show')
    expect(transportDisabled({ phase: 'live', blockers: 0, preflightOpen: false })).toBe(false)
    expect(transportDisabled({ phase: 'connecting', blockers: 0, preflightOpen: false })).toBe(true)
    expect(transportDisabled({ phase: 'ending', blockers: 0, preflightOpen: false })).toBe(true)
  })

  it('is disabled off air when blocked or while the checklist is open', () => {
    expect(transportDisabled({ phase: 'off', blockers: 1, preflightOpen: false })).toBe(true)
    expect(transportDisabled({ phase: 'off', blockers: 0, preflightOpen: true })).toBe(true)
    expect(transportDisabled({ phase: 'off', blockers: 0, preflightOpen: false })).toBe(false)
  })
})

describe('viewer preview badge', () => {
  it('reads Off air whenever nothing is being published', () => {
    expect(viewerBadge({ phase: 'off', dumped: false, activeDelaySec: 10, rebuildingSec: 0 })).toBe('Off air')
    expect(viewerBadge({ phase: 'ended', dumped: true, activeDelaySec: 10, rebuildingSec: 3 })).toBe('Off air')
  })

  it('DUMPED wins over every other on-air state', () => {
    expect(viewerBadge({ phase: 'live', dumped: true, activeDelaySec: 10, rebuildingSec: 4 })).toBe('DUMPED · slate + silence')
  })

  it('shows the delay, the refill, or No delay', () => {
    expect(viewerBadge({ phase: 'live', dumped: false, activeDelaySec: 0, rebuildingSec: 0 })).toBe('No delay')
    expect(viewerBadge({ phase: 'live', dumped: false, activeDelaySec: 10, rebuildingSec: 4 })).toBe('Refilling · slate for 4 s')
    expect(viewerBadge({ phase: 'live', dumped: false, activeDelaySec: 10, rebuildingSec: 0 })).toBe('10 s behind')
  })
})
