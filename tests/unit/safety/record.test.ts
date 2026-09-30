import { describe, expect, it } from 'vitest'
import { hashRemoteAudio, isProjectStorageUrl, parseStorageObject } from '@/lib/podcast/safety/audio-hash'
import { cleanDecisions, cleanPlan, cleanSafetyRecord, cleanTerms, isApprovalMethod, isIsoDate, textHash } from '@/lib/podcast/safety/record'

describe('safety record validation', () => {
  it('cleans terms: trims, de-duplicates, defaults kind, drops junk', () => {
    expect(cleanTerms(['  Maria ', 'maria', { text: 'Dayton', kind: 'place' }, { text: '', kind: 'name' }, { text: 'X', kind: 'bogus' }, 42])).toEqual([
      { text: 'Maria', kind: 'name' },
      { text: 'Dayton', kind: 'place' },
      { text: 'X', kind: 'other' },
    ])
    expect(cleanTerms('nope')).toEqual([])
  })

  it('cleans decisions: only accept/reject with sane keys', () => {
    expect(cleanDecisions({ 'maria@1200': 'accept', 'x@1': 'reject', bad: 'maybe', ['k'.repeat(300)]: 'accept' })).toEqual({ 'maria@1200': 'accept', 'x@1': 'reject' })
    expect(cleanDecisions([])).toEqual({})
    expect(cleanDecisions(null)).toEqual({})
  })

  it('cleans the plan: modes, pad range, ranges, presets, filler words', () => {
    const plan = cleanPlan({
      mode: 'roomtone',
      pad: 0.15,
      manual: [{ start: 5, end: 6 }, { start: 9, end: 8 }, { start: 0, end: 60 }],
      disguise: [{ start: 1, end: 2, preset: 'masked' }, { start: 1, end: 2, preset: 'nope' }],
      filler_words: ['Um', 'uh', 'um', ''],
      include_pauses: false,
    })
    expect(plan.mode).toBe('roomtone')
    expect(plan.pad).toBe(0.15)
    expect(plan.manual).toEqual([{ start: 5, end: 6 }])
    expect(plan.disguise).toEqual([{ start: 1, end: 2, preset: 'masked' }])
    expect(plan.filler_words).toEqual(['um', 'uh'])
    expect(plan.include_pauses).toBe(false)
    const dflt = cleanPlan({ mode: 'loud', pad: 9 })
    expect(dflt.mode).toBe('tone')
    expect(dflt.pad).toBe(0.08)
    expect(dflt.include_pauses).toBe(true)
  })

  it('cleans a whole row and ignores unknown keys', () => {
    const rec = cleanSafetyRecord('e1', { protected_terms: ['A'], term_decisions: { 'a@0': 'accept' }, evil: 1, updated_by: 'x@y' })
    expect(rec.episode_id).toBe('e1')
    expect(rec.protected_terms).toEqual([{ text: 'A', kind: 'name' }])
    expect(rec.term_decisions).toEqual({ 'a@0': 'accept' })
    expect(rec.filler_decisions).toEqual({})
    expect(rec.updated_by).toBe('x@y')
    expect('evil' in rec).toBe(false)
  })

  it('validates approval method and dates', () => {
    expect(isApprovalMethod('sent_file')).toBe(true)
    expect(isApprovalMethod('phoned')).toBe(false)
    expect(isIsoDate('2026-09-20')).toBe(true)
    expect(isIsoDate('20/09/2026')).toBe(false)
    expect(isIsoDate('2999-01-01')).toBe(false)
  })

  it('textHash is stable, normalises line endings and whitespace', () => {
    expect(textHash('a\r\nb')).toBe(textHash('a\nb'))
    expect(textHash('  a\nb \n')).toBe(textHash('a\nb'))
    expect(textHash('a')).not.toBe(textHash('b'))
    expect(textHash('')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('audio hashing', () => {
  const url = 'https://proj.supabase.co/storage/v1/object/public/media/123-abcdef01.mp3'

  it('only accepts this project’s storage objects', () => {
    expect(isProjectStorageUrl(url)).toBe(true)
    expect(isProjectStorageUrl('https://evil.example/storage/v1/object/public/media/x.mp3')).toBe(false)
    expect(isProjectStorageUrl('http://proj.supabase.co/storage/v1/object/public/media/x.mp3')).toBe(false)
    expect(parseStorageObject(url)).toEqual({ bucket: 'media', path: '123-abcdef01.mp3' })
    expect(parseStorageObject('https://proj.supabase.co/other')).toBeNull()
  })

  it('streams and hashes the file, refusing oversized ones', async () => {
    const body = new TextEncoder().encode('hello audio')
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch
    const r = await hashRemoteAudio(url, { fetchImpl })
    expect(r?.bytes).toBe(body.byteLength)
    expect(r?.sha256).toBe('e4f0a15c6259946026541556ba400b40fd9c90a6a0774671efa8337b17ddadc2')
    expect(await hashRemoteAudio(url, { fetchImpl, maxBytes: 4 })).toBeNull()
    expect(await hashRemoteAudio('https://evil.example/x.mp3', { fetchImpl })).toBeNull()
    const failing = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    expect(await hashRemoteAudio(url, { fetchImpl: failing })).toBeNull()
  })
})
