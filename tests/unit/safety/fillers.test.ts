import { describe, expect, it } from 'vitest'
import { findFillers, findLongPauses, findRepeats, findSuggestions, isUmUh } from '@/lib/podcast/ai/fillers'
import { words } from './helpers'

describe('filler suggestions', () => {
  it('finds um / uh with high confidence and a cut covering the word', () => {
    const s = findFillers(words('So um I went uh home'))
    expect(s.map((x) => x.label)).toEqual(['“um”', '“uh”'])
    expect(s.every(isUmUh)).toBe(true)
    // "um" is word 1: 0.4–0.7; the cut covers it and stops at or before "I" (0.8).
    expect(s[0].cut.start).toBe(0.4)
    expect(s[0].cut.end).toBeGreaterThanOrEqual(0.7)
    expect(s[0].cut.end).toBeLessThanOrEqual(0.8)
  })

  it('ignores punctuation and case (Um, / UH.)', () => {
    expect(findFillers(words('Um, okay. UH. fine'))).toHaveLength(2)
  })

  it('flags "you know" everywhere and "like" / "sort of" only when set off, all as listen-first', () => {
    const s = findFillers(words('it was, like, you know, sort of, hard'), ['um', 'like', 'you know', 'sort of'])
    expect(s.map((x) => x.label)).toEqual(['“like”', '“you know”', '“sort of”'])
    expect(s.every((x) => x.confidence === 'check')).toBe(true)
    expect(s.some(isUmUh)).toBe(false)
  })

  it('does not flag "like" used as a verb, but does after a pause', () => {
    expect(findFillers(words('I like dogs'))).toHaveLength(0)
    const paused = [{ w: 'it', s: 0, e: 0.2 }, { w: 'was', s: 0.25, e: 0.4 }, { w: 'like', s: 0.9, e: 1.1 }, { w: 'hard', s: 1.15, e: 1.4 }]
    expect(findFillers(paused).map((x) => x.label)).toEqual(['“like”'])
  })

  it('has stable ids: <kind>@<start ms>', () => {
    expect(findFillers(words('So um yes'))[0].id).toBe('filler@400')
  })

  it('cuts all but the last of a repeated word', () => {
    const reps = findRepeats(words('I I I think the the answer'))
    expect(reps.map((r) => r.label)).toEqual(['Repeated “I” ×3', 'Repeated “the” ×2'])
    // "I I I" = words 0..2 → cut from word 0 start (0) to word 2 start (0.8).
    expect(reps[0].cut).toEqual({ start: 0, end: 0.8 })
    expect(reps[0].id).toBe('repeat@0')
  })

  it('does not treat separated repeats or um-um as stutters', () => {
    expect(findRepeats([{ w: 'no', s: 0, e: 0.2 }, { w: 'no', s: 2, e: 2.2 }])).toHaveLength(0)
    expect(findRepeats(words('um um'))).toHaveLength(0)
  })

  it('shortens long pauses to the target instead of removing them', () => {
    const p = findLongPauses([{ w: 'Hello.', s: 0, e: 0.5 }, { w: 'Welcome', s: 4.5, e: 5 }])
    expect(p).toHaveLength(1)
    expect(p[0].label).toBe('4.0 s pause → 0.6 s')
    expect(p[0].cut).toEqual({ start: 0.8, end: 4.2 })
    expect(findLongPauses(words('a b c'))).toHaveLength(0)
  })

  it('combines everything, sorted, without overlapping cuts', () => {
    const s = findSuggestions([...words('So um I I think'), { w: 'yes', s: 6, e: 6.3 }])
    expect(s.map((x) => x.kind)).toEqual(['filler', 'repeat', 'pause'])
    for (let i = 1; i < s.length; i++) expect(s[i].cut.start).toBeGreaterThanOrEqual(s[i - 1].cut.end)
    expect(findSuggestions(words('So um I I think'), { repeats: false, pauses: false }).map((x) => x.kind)).toEqual(['filler'])
  })
})
