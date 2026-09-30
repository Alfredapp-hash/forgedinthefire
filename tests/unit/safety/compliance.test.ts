import { describe, expect, it } from 'vitest'
import { checkFeedCompliance, safetyComplianceChecks, type CompliancePayload } from '@/lib/podcast/compliance'
import { textHash } from '@/lib/podcast/safety/record'

const audio = 'https://x.supabase.co/storage/v1/object/public/media/a.mp3'

/** A feed-compliant episode without any safety columns (pre-migration row / partial payload). */
function feedOk(over: Partial<CompliancePayload> = {}): CompliancePayload {
  return {
    title: 'T',
    summary: 's',
    audio_url: audio,
    audio_mime: 'audio/mpeg',
    duration_seconds: 60,
    file_size: 100,
    cover_url: 'https://x/c.jpg',
    chapters: [],
    ...over,
  }
}

/** The same row after 20260924000002 with every sign-off in place. */
function signedOff(over: Partial<CompliancePayload> = {}): CompliancePayload {
  return feedOk({
    guest_name: 'Sam',
    transcript: 'hello world',
    protected_words_reviewed_at: '2026-09-20T00:00:00Z',
    guest_final_cut_approved: true,
    guest_final_cut_approved_on: '2026-09-21',
    guest_final_cut_method: 'sent_file',
    guest_final_cut_audio_url: audio,
    guest_final_cut_audio_hash: 'abc',
    audio_sha256: 'abc',
    transcript_reviewed_hash: textHash('hello world'),
    ...over,
  })
}

describe('feed compliance × survivor safety', () => {
  it('ignores safety entirely when the row has no safety columns', () => {
    expect(safetyComplianceChecks(feedOk({ guest_name: 'Sam' }))).toEqual([])
    expect(checkFeedCompliance(feedOk({ guest_name: 'Sam' })).ok).toBe(true)
  })

  it('a fully signed-off guest episode passes', () => {
    const r = checkFeedCompliance(signedOff())
    expect(r.ok).toBe(true)
    expect(r.checks.map((c) => c.id)).toEqual(expect.arrayContaining(['guest_final_cut', 'protected_words', 'transcript_review']))
  })

  it('blocks a guest episode until the guest approved this exact file', () => {
    const ids = (p: CompliancePayload) => checkFeedCompliance(p).blockers.map((b) => b.id)
    expect(ids(signedOff({ guest_final_cut_approved: false }))).toEqual(['guest_final_cut'])
    expect(ids(signedOff({ audio_url: 'https://x/other.mp3' }))).toEqual(['guest_final_cut'])
    expect(ids(signedOff({ audio_sha256: 'changed' }))).toEqual(['guest_final_cut'])
    expect(ids(signedOff({ guest_final_cut_method: null }))).toEqual(['guest_final_cut'])
  })

  it('blocks until protected terms and the transcript were reviewed', () => {
    const ids = (p: CompliancePayload) => checkFeedCompliance(p).blockers.map((b) => b.id)
    expect(ids(signedOff({ protected_words_reviewed_at: null }))).toEqual(['protected_words'])
    expect(ids(signedOff({ transcript: 'edited after review' }))).toEqual(['transcript_review'])
    expect(ids(signedOff({ transcript_reviewed_hash: null }))).toEqual(['transcript_review'])
  })

  it('a flagged guest review blocks even with every sign-off', () => {
    expect(checkFeedCompliance(signedOff({ guest_review_required: true })).blockers.map((b) => b.id)).toEqual(['guest_review_required'])
  })

  it('host-only episodes: transcript review is advisory, guest items absent', () => {
    const solo = signedOff({ guest_name: null, transcript_reviewed_hash: null })
    const r = checkFeedCompliance(solo)
    expect(r.ok).toBe(true)
    expect(r.checks.find((c) => c.id === 'transcript_review')?.required).toBe(false)
    expect(r.checks.find((c) => c.id === 'guest_final_cut')).toBeUndefined()
    expect(r.checks.find((c) => c.id === 'protected_words')).toBeUndefined()
  })

  it('carries a plain-language fix for every failing safety item', () => {
    const r = checkFeedCompliance(signedOff({ guest_final_cut_approved: false, protected_words_reviewed_at: null }))
    for (const b of r.blockers) expect(b.fix).toMatch(/\w+/)
  })
})
