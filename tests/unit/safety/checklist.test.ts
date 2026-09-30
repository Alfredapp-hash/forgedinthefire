import { describe, expect, it } from 'vitest'
import { finalCutCheck, finalCutStatus, protectedWordsCheck, transcriptReviewCheck, transcriptReviewStatus } from '@/lib/podcast/safety/checklist'
import { textHash } from '@/lib/podcast/safety/record'
import { releaseBlockers, releaseChecks, type EpisodeSafetyFields } from '@/lib/studio/release'
import type { PodcastEpisode } from '@/lib/studio/types'

const audio = 'https://x.supabase.co/storage/v1/object/public/media/a.mp3'

/** A migrated row: every safety column present. */
function approved(over: Partial<EpisodeSafetyFields & { audio_url: string | null; transcript: string | null }> = {}) {
  return {
    audio_url: audio,
    transcript: 'hello world',
    protected_words_reviewed_at: '2026-09-20T00:00:00Z',
    protected_words_reviewed_by: 'a@b.c',
    guest_final_cut_approved: true,
    guest_final_cut_approved_at: '2026-09-21T10:00:00Z',
    guest_final_cut_approved_by: 'a@b.c',
    guest_final_cut_approved_on: '2026-09-21',
    guest_final_cut_method: 'listened_remotely',
    guest_final_cut_note: null,
    guest_final_cut_audio_url: audio,
    guest_final_cut_audio_hash: 'abc123',
    audio_sha256: 'abc123',
    transcript_reviewed_at: '2026-09-21T10:00:00Z',
    transcript_reviewed_by: 'a@b.c',
    transcript_reviewed_hash: textHash('hello world'),
    ...over,
  }
}

describe('guest final-cut approval', () => {
  it('needs date + method and the current audio file', () => {
    expect(finalCutCheck(approved()).level).toBe('ok')
    expect(finalCutCheck(approved()).detail).toContain('2026-09-21')
    expect(finalCutCheck(approved()).detail).toContain('on a call')
    expect(finalCutCheck(approved({ guest_final_cut_approved: false })).level).toBe('block')
    expect(finalCutCheck(approved({ guest_final_cut_method: null })).level).toBe('block')
    expect(finalCutCheck(approved({ guest_final_cut_approved_on: null })).level).toBe('block')
    expect(finalCutStatus(approved({ guest_final_cut_method: null })).incomplete).toBe(true)
  })

  it('goes stale when the audio URL or fingerprint changes', () => {
    const url = finalCutCheck(approved({ audio_url: 'https://x/b.mp3' }))
    expect(url.level).toBe('block')
    expect(url.fix).toMatch(/audio changed/i)
    const hash = finalCutStatus(approved({ audio_sha256: 'different' }))
    expect(hash.stale).toBe(true)
    // An unknown current fingerprint does not invalidate an approval; the URL still pins it.
    expect(finalCutStatus(approved({ audio_sha256: null })).stale).toBe(false)
    expect(finalCutStatus(approved({ guest_final_cut_audio_hash: null })).stale).toBe(false)
  })

  it('degrades before the migration: URL pinning only', () => {
    const legacy = { audio_url: audio, guest_final_cut_approved: true, guest_final_cut_audio_url: audio }
    expect(finalCutCheck(legacy).level).toBe('ok')
    expect(finalCutCheck({ ...legacy, audio_url: 'https://x/b.mp3' }).level).toBe('block')
  })

  it('explains when the guest asked to hear it first', () => {
    const c = finalCutCheck(approved({ guest_final_cut_approved: false }), { needsGuestApproval: true })
    expect(c.detail).toMatch(/asked to approve/)
    expect(c.fix).toMatch(/asked to hear/)
  })
})

describe('protected terms + transcript review', () => {
  it('protected terms must be reviewed', () => {
    expect(protectedWordsCheck(approved()).level).toBe('ok')
    expect(protectedWordsCheck(approved({ protected_words_reviewed_at: null })).level).toBe('block')
  })

  it('transcript review is tied to the exact transcript text', () => {
    expect(transcriptReviewStatus(approved())).toBe('reviewed')
    expect(transcriptReviewStatus(approved({ transcript: 'hello world!' }))).toBe('changed')
    expect(transcriptReviewStatus(approved({ transcript_reviewed_hash: null }))).toBe('unreviewed')
    expect(transcriptReviewStatus(approved({ transcript: '' }))).toBe('no_transcript')
    expect(transcriptReviewStatus({ transcript: 'x' })).toBe('unsupported')
    // Line endings and surrounding whitespace do not count as a change.
    expect(transcriptReviewStatus(approved({ transcript: ' hello world\r\n' }))).toBe('reviewed')
  })

  it('blocks guest episodes, warns host-only ones, and is silent before the migration', () => {
    expect(transcriptReviewCheck(approved(), true)?.level).toBe('ok')
    expect(transcriptReviewCheck(approved({ transcript: 'edited' }), true)?.level).toBe('block')
    expect(transcriptReviewCheck(approved({ transcript: 'edited' }), false)?.level).toBe('warn')
    expect(transcriptReviewCheck(approved({ transcript: '' }), true)?.level).toBe('warn')
    expect(transcriptReviewCheck({ transcript: 'x' }, true)).toBeNull()
  })
})

describe('release checklist integration', () => {
  const base = () =>
    ({
      id: 'e1',
      title: 'T',
      summary: 's',
      show_notes: 'n',
      guest_name: 'Sam',
      audio_mime: 'audio/mpeg',
      file_size: 100,
      duration_seconds: 60,
      cover_url: 'https://x/c.jpg',
      episode_number: 1,
      season: 1,
      status: 'draft',
      guest_consent_confirmed: true,
      ...approved(),
    }) as unknown as PodcastEpisode & EpisodeSafetyFields

  it('a fully signed-off guest episode passes on the server', () => {
    expect(releaseBlockers(releaseChecks(base(), { server: true }))).toEqual([])
  })

  it('each safety item blocks release on the server', () => {
    const ids = (ep: PodcastEpisode & EpisodeSafetyFields) => releaseBlockers(releaseChecks(ep, { server: true })).map((c) => c.id)
    expect(ids({ ...base(), guest_final_cut_method: null })).toEqual(['guest_final_cut'])
    expect(ids({ ...base(), audio_sha256: 'other' })).toEqual(['guest_final_cut'])
    expect(ids({ ...base(), protected_words_reviewed_at: null })).toEqual(['protected_words'])
    expect(ids({ ...base(), transcript: 'changed' })).toEqual(['transcript_review'])
  })

  it('host-only episodes only warn about the transcript review', () => {
    const solo = { ...base(), guest_name: null, transcript_reviewed_hash: null }
    const checks = releaseChecks(solo, { server: true })
    expect(releaseBlockers(checks)).toEqual([])
    expect(checks.find((c) => c.id === 'transcript_review')?.level).toBe('warn')
    expect(checks.find((c) => c.id === 'guest_final_cut')).toBeUndefined()
  })
})
