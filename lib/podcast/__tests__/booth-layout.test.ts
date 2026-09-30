import { describe, expect, it } from 'vitest'

import {
  deriveBoothStatus,
  gridClass,
  laneIndexById,
  mmss,
  recentTakes,
  statusChipLabel,
  takesSummary,
} from '../booth-layout'

describe('booth layout', () => {
  it('picks a balanced grid per participant count, single column on phones', () => {
    expect(gridClass(0)).toContain('grid-cols-1')
    expect(gridClass(1)).toBe('grid-cols-1 sm:grid-rows-1')
    expect(gridClass(2)).toContain('sm:grid-cols-2')
    expect(gridClass(2)).not.toContain('lg:grid-cols-3')
    expect(gridClass(4)).toBe('grid-cols-1 sm:grid-cols-2')
    expect(gridClass(5)).toContain('lg:grid-cols-3')
    expect(gridClass(9)).toContain('lg:grid-cols-3')
    for (const n of [0, 1, 2, 3, 6, 9]) expect(gridClass(n).startsWith('grid-cols-1')).toBe(true)
  })

  it('assigns host lane 0, first guest lane 1, everyone else from 2 in order', () => {
    const map = laneIndexById([
      { id: 'g2', role: 'guest' },
      { id: 'host', role: 'host' },
      { id: 'guest', role: 'guest' },
      { id: 'c1', role: 'cohost' },
    ])
    expect(map.get('host')).toBe(0)
    expect(map.get('g2')).toBe(1) // first guest encountered takes the ice lane
    expect(map.get('guest')).toBe(2)
    expect(map.get('c1')).toBe(3)
  })

  it('formats mm:ss and clamps garbage', () => {
    expect(mmss(0)).toBe('00:00')
    expect(mmss(65.9)).toBe('01:05')
    expect(mmss(5400)).toBe('90:00')
    expect(mmss(-3)).toBe('00:00')
    expect(mmss(Number.NaN)).toBe('00:00')
  })

  it('summarises takes as "N takes · mm:ss"', () => {
    expect(takesSummary([])).toBe('No takes yet')
    expect(takesSummary([{ durationSec: 12 }])).toBe('1 take · 00:12')
    expect(takesSummary([{ durationSec: 300 }, { durationSec: 280 }, { durationSec: 180 }])).toBe('3 takes · 12:40')
  })

  it('lists the newest takes first, capped', () => {
    const takes = [
      { id: 'a', offsetSec: 0 },
      { id: 'b', offsetSec: 30 },
      { id: 'c', offsetSec: 10 },
    ]
    expect(recentTakes(takes).map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(recentTakes(takes, 2).map((t) => t.id)).toEqual(['b', 'c'])
    expect(recentTakes(takes, 0)).toEqual([])
  })

  it('derives the header status chip', () => {
    expect(deriveBoothStatus({ recording: false, countIn: false, saving: false })).toBe('idle')
    expect(deriveBoothStatus({ recording: false, countIn: false, saving: true })).toBe('saving')
    expect(deriveBoothStatus({ recording: true, countIn: true, saving: true })).toBe('count-in')
    expect(deriveBoothStatus({ recording: true, countIn: false, saving: true })).toBe('rec')
    expect(statusChipLabel('idle', 0)).toBe('Idle')
    expect(statusChipLabel('count-in', 0)).toBe('Count-in')
    expect(statusChipLabel('rec', 754)).toBe('REC 12:34')
    expect(statusChipLabel('saving', 0)).toBe('Saving')
  })
})
