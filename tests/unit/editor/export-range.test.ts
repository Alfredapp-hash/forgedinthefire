import { describe, expect, it } from 'vitest'
import {
  describeExportRange,
  replaceWarning,
  resolveExportRange,
  selectionOf,
  shortExportWarning,
} from '@/components/podcast/studio/export-range'

describe('resolveExportRange', () => {
  it('defaults to the whole session even when a selection exists', () => {
    const r = resolveExportRange(undefined, { start: 12, end: 14 }, 1800)
    expect(r).toMatchObject({ scope: 'full', start: 0, end: 1800, duration: 1800, isFull: true })
  })

  it('full scope ignores the selection', () => {
    expect(resolveExportRange('full', { start: 12, end: 14 }, 600).duration).toBe(600)
  })

  it('exports the selection only when explicitly asked', () => {
    const r = resolveExportRange('selection', { start: 14, end: 12 }, 600)
    expect(r).toMatchObject({ scope: 'selection', start: 12, end: 14, duration: 2, isFull: false })
  })

  it('falls back to the full session when "selection" has no usable range', () => {
    expect(resolveExportRange('selection', { start: 5, end: 5.01 }, 600).scope).toBe('full')
    expect(resolveExportRange('selection', null, 600)).toMatchObject({
      scope: 'full',
      duration: 600,
    })
  })

  it('clamps a selection that runs past the end', () => {
    const r = resolveExportRange('selection', { start: 590, end: 700 }, 600)
    expect(r.end).toBe(600)
    expect(r.duration).toBe(10)
  })

  it('a selection covering everything counts as full', () => {
    expect(resolveExportRange('selection', { start: 0, end: 600 }, 600).isFull).toBe(true)
  })

  it('handles an empty session', () => {
    expect(resolveExportRange('full', { start: 0, end: 0 }, 0)).toMatchObject({
      start: 0,
      end: 0,
      duration: 0,
    })
  })
})

describe('selectionOf', () => {
  it('normalizes reversed drags', () => {
    expect(selectionOf({ start: 9, end: 3 }, 20)).toEqual({ start: 3, end: 9, duration: 6 })
  })
  it('returns null for a click (no drag)', () => {
    expect(selectionOf({ start: 3, end: 3 }, 20)).toBeNull()
  })
})

describe('warnings', () => {
  it('flags a 2-second selection of a long episode', () => {
    const r = resolveExportRange('selection', { start: 10, end: 12 }, 1800)
    expect(shortExportWarning(r, 1800)).toMatch(/only 2 seconds/)
    expect(describeExportRange(r)).toMatch(/Selection only · 0:10–0:12 \(2 seconds\)/)
  })

  it('does not warn for the whole episode', () => {
    const r = resolveExportRange('full', null, 1800)
    expect(shortExportWarning(r, 1800)).toBeNull()
    expect(describeExportRange(r)).toMatch(/^Whole episode · 30:00/)
  })

  it('asks for confirmation before replacing audio, louder when published', () => {
    expect(replaceWarning({ hasExistingAudio: false, published: false })).toBeNull()
    expect(replaceWarning({ hasExistingAudio: true, published: false })).toBe('replace')
    expect(replaceWarning({ hasExistingAudio: true, published: true })).toBe('published')
    expect(replaceWarning({ hasExistingAudio: false, published: true })).toBe('published')
  })
})
