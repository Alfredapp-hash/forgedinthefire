import { describe, expect, it } from 'vitest'
import {
  chatRateRule,
  containsProfanity,
  flagReasonFor,
  looksLikeAddress,
  looksLikeEmail,
  looksLikeHandle,
  looksLikeIdentityLeak,
  looksLikePhone,
  looksLikeUrl,
  moderateChatBody,
  secondsUntilWindowEnds,
  validateDisplayName,
} from '@/lib/podcast/live/moderation'

describe('phone numbers', () => {
  it.each([
    '(614) 555-0100',
    'call me 614-555-0100',
    '614.555.0100',
    '+1 614 555 0100',
    'text 6145550100 ok',
    'six one four five five five zero one zero zero',
  ])('blocks %s', (s) => {
    expect(looksLikePhone(s)).toBe(true)
  })

  it.each([
    'I was 25 in 2019',
    'the show is on 2026-09-23 at 10:30',
    'it happened on 9/23/2026',
    'season 3 episode 12',
    'about 1,000 people',
    'the hotline is 1-888-373-7888',
    'text 233733',
  ])('allows %s', (s) => {
    expect(looksLikePhone(s)).toBe(false)
  })
})

describe('emails', () => {
  it('blocks addresses and obfuscated forms', () => {
    expect(looksLikeEmail('reach me jane.doe@example.com')).toBe(true)
    expect(looksLikeEmail('jane (at) example (dot) com')).toBe(true)
  })
  it('allows normal text', () => {
    expect(looksLikeEmail('thank you @ all — great show')).toBe(false)
    expect(looksLikeEmail('meet at 5 pm')).toBe(false)
  })
})

describe('urls', () => {
  it.each(['see https://example.com/x', 'www.example.com', 'go to bit.ly/abc', 'forgedinthefireohio.org/podcast'])(
    'blocks %s',
    (s) => expect(looksLikeUrl(s)).toBe(true),
  )
  it.each(['wait... com on', 'e.g. this one', 'I am so proud. Of you.', 'the org helped me'])('allows %s', (s) =>
    expect(looksLikeUrl(s)).toBe(false),
  )
})

describe('street addresses', () => {
  it.each([
    'she lives at 123 Main Street',
    '4521 N High St, Columbus',
    'PO Box 991',
    'apt 4B on the second floor',
    'Columbus, OH 43215',
    'corner of Broad St and High St',
  ])('blocks %s', (s) => expect(looksLikeAddress(s)).toBe(true))

  it.each(['I drove 300 miles to get here', 'the 3rd time was the hardest', 'top 10 moments', 'I was 43215 miles away'])(
    'allows %s',
    (s) => expect(looksLikeAddress(s)).toBe(false),
  )
})

describe('identity leaks', () => {
  it.each([
    'her real name is Anna',
    "the guest's name is Jane Smith",
    'I know where she lives',
    'she works at the hospital on Main',
    'this is actually Jane Smith from Dayton',
    'what is her license plate',
    'someone should dox her',
  ])('blocks %s', (s) => expect(looksLikeIdentityLeak(s)).toBe(true))

  it.each(['my name is Jane', 'what a strong story', 'you are so brave', 'the name of the show is great', 'she lives her truth'])(
    'allows %s',
    (s) => expect(looksLikeIdentityLeak(s)).toBe(false),
  )
})

describe('handles', () => {
  it('blocks social handles', () => {
    expect(looksLikeHandle('follow me @jane_doe')).toBe(true)
    expect(looksLikeHandle('my insta is janedoe')).toBe(true)
  })
  it('allows a lone @ or short mention', () => {
    expect(looksLikeHandle('thanks @ everyone')).toBe(false)
    expect(looksLikeHandle('email@ no')).toBe(false)
  })
})

describe('profanity', () => {
  it('catches plain, leet and spaced variants', () => {
    expect(containsProfanity('what the fuck')).toBe(true)
    expect(containsProfanity('sh1t happens')).toBe(true)
    expect(containsProfanity('f u c k this')).toBe(true)
  })
  it('does not over-match', () => {
    expect(containsProfanity('the assessment was hard')).toBe(false)
    expect(containsProfanity('Scunthorpe is lovely')).toBe(false)
    expect(containsProfanity('shitake mushrooms')).toBe(false)
  })
  it('honours the extra blocklist', () => {
    expect(containsProfanity('you muppet', ['muppet'])).toBe(true)
  })
})

describe('moderateChatBody', () => {
  it('returns the trimmed body and flags sensitive language', () => {
    const r = moderateChatBody('  I sometimes feel suicidal listening to this  ')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.body).toBe('I sometimes feel suicidal listening to this')
      expect(r.flagged).toBe(true)
      expect(r.flagReason).toMatch(/self-harm/)
    }
  })
  it('flags shouting but allows short caps', () => {
    expect(flagReasonFor('THIS IS AMAZING THANK YOU')).toMatch(/caps/)
    expect(flagReasonFor('WOW')).toBeNull()
    expect(flagReasonFor('NHTH 1-888')).toBeNull()
  })
  it('blocks with a reason', () => {
    const r = moderateChatBody('call 614-555-0100')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('phone')
    expect(moderateChatBody('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })
  it('caps the body at 280 characters', () => {
    const r = moderateChatBody('a'.repeat(400))
    expect(r.ok && r.body.length).toBe(280)
  })
})

describe('validateDisplayName', () => {
  it('accepts plain names and strips odd characters', () => {
    expect(validateDisplayName('Jane 🔥')).toEqual({ ok: true, name: 'Jane' })
    expect(validateDisplayName("Mary-Kate O'Neil")).toEqual({ ok: true, name: "Mary-Kate O'Neil" })
  })
  it('rejects staff impersonation, contact details and length', () => {
    expect(validateDisplayName('Host').ok).toBe(false)
    expect(validateDisplayName('moderator').ok).toBe(false)
    expect(validateDisplayName('jane@example.com').ok).toBe(false)
    expect(validateDisplayName('J').ok).toBe(false)
    expect(validateDisplayName('x'.repeat(30)).ok).toBe(false)
  })
})

describe('rate limit math', () => {
  it('base rule is 1 message per 5 s; slow mode widens the window', () => {
    expect(chatRateRule(0)).toEqual({ windowSec: 5, max: 1 })
    expect(chatRateRule(3)).toEqual({ windowSec: 5, max: 1 })
    expect(chatRateRule(30)).toEqual({ windowSec: 30, max: 1 })
    expect(chatRateRule(9999)).toEqual({ windowSec: 600, max: 1 })
    expect(chatRateRule(Number.NaN)).toEqual({ windowSec: 5, max: 1 })
  })
  it('retry-after is the remainder of the fixed window', () => {
    expect(secondsUntilWindowEnds(5, 0)).toBe(5)
    expect(secondsUntilWindowEnds(5, 1000)).toBe(4)
    expect(secondsUntilWindowEnds(5, 4999)).toBe(1)
    expect(secondsUntilWindowEnds(30, 61_000)).toBe(29)
  })
})
