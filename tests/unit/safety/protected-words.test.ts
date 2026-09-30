import { describe, expect, it } from 'vitest'
import {
  findProtectedHits,
  hitId,
  levenshtein,
  redactText,
  redactWords,
  scoreMatch,
  soundex,
} from '@/lib/podcast/safety/protected-words'
import { joined, words } from './helpers'

describe('protected-term matching', () => {
  it('is case-insensitive and ignores punctuation / possessives', () => {
    const hits = findProtectedHits(words('I met maria, and MARIA’S sister'), ['Maria'])
    expect(hits).toHaveLength(2)
    expect(hits[0].heard).toBe('maria,')
    expect(hits[0].reason).toBe('exact')
    expect(hits[1].reason).toBe('possessive')
    expect(hits.every((h) => h.kind === 'name')).toBe(true)
  })

  it('matches multi-word terms and carries the kind', () => {
    const hits = findProtectedHits(words('we lived on Maple Street near maple street'), [{ text: 'Maple Street', kind: 'street' }])
    expect(hits).toHaveLength(2)
    expect(hits[0].from).toBe(3)
    expect(hits[0].to).toBe(4)
    expect(hits[0].start).toBe(1.2)
    expect(hits[0].end).toBe(1.9)
    expect(hits[0].kind).toBe('street')
  })

  it('matches when Whisper splits or joins words', () => {
    const split = findProtectedHits(words('at Mc Donalds today'), [{ text: "McDonald's", kind: 'employer' }])
    expect(split).toHaveLength(1)
    expect(split[0].heard).toBe('Mc Donalds')
    const joinedHit = findProtectedHits(words('in Grandrapids now'), [{ text: 'Grand Rapids', kind: 'place' }])
    expect(joinedHit).toHaveLength(1)
  })

  it('fuzzy-matches misspellings and sound-alikes', () => {
    expect(scoreMatch('katelyn', 'caitlin')).not.toBeNull()
    expect(scoreMatch('steven', 'stephen')).not.toBeNull()
    expect(scoreMatch('jonathon', 'jonathan')?.reason).toBe('spelling')
    const hits = findProtectedHits(words('my friend Katelyn said'), ['Caitlin'])
    expect(hits).toHaveLength(1)
    expect(hits[0].reason).not.toBe('exact')
  })

  it('does not fuzzy-match very short terms, common words or unrelated words', () => {
    expect(scoreMatch('amy', 'ann')).toBeNull()
    expect(scoreMatch('table', 'caitlin')).toBeNull()
    expect(scoreMatch('the', 'theresa')).toBeNull()
    expect(scoreMatch('will', 'willow')).toBeNull()
    expect(findProtectedHits(words('Ann and Amy'), ['Ann'])).toHaveLength(1)
  })

  it('finds nicknames and longer forms', () => {
    expect(scoreMatch('jessica', 'jess')?.reason).toBe('partial')
    expect(scoreMatch('tommy', 'tom')?.reason).toBe('partial')
  })

  it('gives stable ids per term and start time (survive reloads and re-runs)', () => {
    const ids = findProtectedHits(words('Rosa Rosa'), ['Rosa']).map((h) => h.id)
    expect(ids).toEqual(['rosa@0', 'rosa@400'])
    expect(hitId('Rosa ', 0.4)).toBe('rosa@400')
    // A later word does not change earlier ids.
    const again = findProtectedHits(words('Rosa Rosa again'), ['Rosa']).map((h) => h.id)
    expect(again).toEqual(ids)
  })

  it('keeps the best of overlapping spans and sorts by time', () => {
    const hits = findProtectedHits(words('Lincoln High is where Lincoln went'), [{ text: 'Lincoln High', kind: 'employer' }])
    expect(hits.map((h) => h.heard)).toEqual(['Lincoln High', 'Lincoln'])
    expect(hits[0].start).toBeLessThan(hits[1].start)
  })

  it('helpers: levenshtein and soundex', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(soundex('Robert')).toBe('R163')
    expect(soundex('Rupert')).toBe('R163')
  })
})

describe('redaction', () => {
  it('replaces a multi-word mention with one label by kind and keeps trailing punctuation', () => {
    const ws = words('I worked at Blue Moon Diner. It was hard')
    const hits = findProtectedHits(ws, [{ text: 'Blue Moon Diner', kind: 'employer' }])
    const out = redactWords(ws, hits)
    expect(joined(out)).toBe('I worked at [name]. It was hard')
    expect(joined(out)).not.toMatch(/blue|moon|diner/i)
    expect(out[3].s).toBe(ws[3].s)
    expect(out[3].e).toBe(ws[5].e)
  })

  it('uses the label for the kind of detail', () => {
    const ws = words('we moved to Dayton in June')
    const hits = findProtectedHits(ws, [{ text: 'Dayton', kind: 'place' }])
    expect(joined(redactWords(ws, hits))).toBe('we moved to [place] in June')
  })

  it('redacts plain text without timings, including possessives', () => {
    expect(redactText("Maria's mum lives on Maple Street.", ['Maria', { text: 'Maple Street', kind: 'street' }])).toBe('[name] mum lives on [address].')
    expect(redactText('Marias and mariachi', ['Maria'])).toBe('[name] and mariachi')
  })
})
