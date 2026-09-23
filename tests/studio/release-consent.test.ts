import { describe, expect, it } from 'vitest'
import { guestSafetyChecks, type EpisodeSafetyFields, type GuestConsentStatus } from '@/lib/studio/release'
import type { PodcastEpisode } from '@/lib/studio/types'

const ep = (over: Partial<PodcastEpisode & EpisodeSafetyFields> = {}) =>
  ({
    id: 'e1',
    title: 'T',
    guest_name: 'Sam',
    audio_url: 'https://x/a.mp3',
    guest_consent_confirmed: false,
    guest_final_cut_approved: true,
    guest_final_cut_audio_url: 'https://x/a.mp3',
    protected_words_reviewed_at: '2026-09-20T00:00:00Z',
    ...over,
  }) as PodcastEpisode & EpisodeSafetyFields

const consent = (over: Partial<GuestConsentStatus> = {}): GuestConsentStatus => ({
  available: true,
  guestReviewRequired: false,
  hasConsent: true,
  anyWithdrawn: false,
  needsGuestApproval: false,
  consents: [{ referenceCode: 'G-ABC', acceptedAt: '2026-09-21T10:00:00Z', withdrawnAt: null }],
  ...over,
})

const level = (checks: ReturnType<typeof guestSafetyChecks>, id: string) => checks.find((c) => c.id === id)?.level
const blocked = (checks: ReturnType<typeof guestSafetyChecks>) => checks.some((c) => c.level === 'block')

describe('guest consent → release', () => {
  it('booth consent ticks "consent on file" without the manual confirmation', () => {
    const checks = guestSafetyChecks(ep(), { guestConsent: consent() })
    expect(level(checks, 'guest_consent')).toBe('ok')
    expect(blocked(checks)).toBe(false)
  })

  it('no recorded consent falls back to the manual confirmation', () => {
    expect(level(guestSafetyChecks(ep(), { guestConsent: consent({ hasConsent: false, consents: [] }) }), 'guest_consent')).toBe('block')
    expect(level(guestSafetyChecks(ep({ guest_consent_confirmed: true }), {}), 'guest_consent')).toBe('ok')
    // Migration not applied → manual only.
    expect(level(guestSafetyChecks(ep(), { guestConsent: consent({ available: false }) }), 'guest_consent')).toBe('block')
  })

  it('a withdrawal or review flag blocks even with consent and approvals', () => {
    expect(blocked(guestSafetyChecks(ep(), { guestConsent: consent({ anyWithdrawn: true }) }))).toBe(true)
    expect(blocked(guestSafetyChecks(ep(), { guestConsent: consent({ guestReviewRequired: true }) }))).toBe(true)
    expect(blocked(guestSafetyChecks(ep({ guest_review_required: true }), { server: true }))).toBe(true)
  })

  it('"hear it first" blocks until the final cut is approved', () => {
    const wants = consent({ needsGuestApproval: true })
    expect(level(guestSafetyChecks(ep({ guest_final_cut_approved: false }), { guestConsent: wants }), 'guest_final_cut')).toBe('block')
    expect(blocked(guestSafetyChecks(ep(), { guestConsent: wants }))).toBe(false)
  })

  it('consent records apply even when the guest name field is empty', () => {
    const checks = guestSafetyChecks(ep({ guest_name: null }), { guestConsent: consent({ anyWithdrawn: true }) })
    expect(level(checks, 'guest_withdrawn')).toBe('block')
  })
})
