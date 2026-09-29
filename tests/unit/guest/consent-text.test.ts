import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CONSENT_POINTS,
  CONSENT_VERSION,
  DEFAULT_CONSENT_CHOICES,
  consentCanonicalText,
  guestReferenceCode,
  normalizeConsentChoices,
  normalizeWithdrawal,
} from '@/lib/podcast/guest/consent-text'

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

describe('consent text v2', () => {
  it('canonical text is versioned, covers every point, and hashes stably', () => {
    const text = consentCanonicalText()
    expect(text.startsWith(`version:${CONSENT_VERSION}`)).toBe(true)
    for (const p of CONSENT_POINTS) expect(text).toContain(`${p.title}\n${p.body}`)
    expect(sha256(text)).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256(consentCanonicalText())).toBe(sha256(text))
  })

  it('tells the guest who records, what happens to it, that they can leave and change their mind', () => {
    const text = consentCanonicalText().toLowerCase()
    expect(text).toMatch(/who is recording/)
    expect(text).toMatch(/published/)
    expect(text).toMatch(/leave/)
    expect(text).toMatch(/change your mind|ask us to remove/)
    expect(text).toMatch(/backup/)
  })

  it('normalizes untrusted choices to booleans with safe defaults', () => {
    expect(normalizeConsentChoices(null)).toEqual(DEFAULT_CONSENT_CHOICES)
    expect(normalizeConsentChoices({ voice_altered: 'yes', may_publish: false, extra: 1 })).toEqual({
      ...DEFAULT_CONSENT_CHOICES,
      voice_altered: false,
      may_publish: false,
    })
    expect(normalizeConsentChoices({ audio_only: false, face_blurred: true })).toMatchObject({
      audio_only: false,
      face_blurred: true,
    })
  })
})

describe('normalizeWithdrawal', () => {
  it('clamps, trims and strips control characters; empty becomes null', () => {
    const out = normalizeWithdrawal({ reason: 'please\u0000 remove ' + 'x'.repeat(2000), contact: '  a@b.c \u0007' })
    expect(out.reason?.startsWith('please remove')).toBe(true)
    expect(out.reason?.length).toBe(1000)
    expect(out.contact).toBe('a@b.c')
    expect(normalizeWithdrawal({})).toEqual({ reason: null, contact: null })
    expect(normalizeWithdrawal(null)).toEqual({ reason: null, contact: null })
    expect(normalizeWithdrawal({ contact: 'c'.repeat(300) }).contact?.length).toBe(200)
  })

  it('keeps newlines in a reason', () => {
    expect(normalizeWithdrawal({ reason: 'line one\nline two' }).reason).toBe('line one\nline two')
  })
})

describe('guestReferenceCode', () => {
  it('is deterministic, formatted, and does not leak the invite id', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const code = guestReferenceCode(id)
    expect(code).toMatch(/^FITF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
    expect(guestReferenceCode(id)).toBe(code)
    expect(guestReferenceCode('0f8fad5b-d9cb-469f-a165-70867728950f')).not.toBe(code)
    expect(code).not.toContain(id.slice(0, 4))
  })
})
