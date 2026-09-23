import { describe, expect, it } from 'vitest'
import {
  GUEST_TOKEN_PATTERN,
  adminInvite,
  guestTakeRef,
  hashGuestToken,
  hashesMatch,
  inviteExpiry,
  inviteIsLive,
  isGuestTokenShape,
  mintGuestSession,
  mintGuestToken,
  parseGuestTakeRef,
  publicInvite,
  type GuestInviteRow,
} from '@/lib/podcast/guest-invite'

const ROW_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

function row(partial: Partial<GuestInviteRow> = {}): GuestInviteRow {
  return {
    id: ROW_ID,
    episode_id: 'ep',
    token_hash: 'h',
    label: 'Internal label',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    revoked_at: null,
    guest_name: 'Robin',
    guest_joined_at: null,
    last_seen_at: null,
    connection_state: 'pending',
    take_url: null,
    take_mime: null,
    camera_url: null,
    camera_mime: null,
    created_by: null,
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T00:00:00Z',
    ...partial,
  }
}

describe('token helpers', () => {
  it('mints 48-hex tokens whose hash matches', () => {
    const { raw, hash } = mintGuestToken()
    expect(raw).toMatch(GUEST_TOKEN_PATTERN)
    expect(isGuestTokenShape(raw)).toBe(true)
    expect(hash).toBe(hashGuestToken(raw))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(mintGuestToken().raw).not.toBe(raw)
    expect(mintGuestSession().raw).toMatch(GUEST_TOKEN_PATTERN)
  })

  it('shape check rejects anything that is not 48 lowercase hex', () => {
    expect(isGuestTokenShape('A'.repeat(48))).toBe(false)
    expect(isGuestTokenShape('a'.repeat(47))).toBe(false)
    expect(isGuestTokenShape('a'.repeat(49))).toBe(false)
    expect(isGuestTokenShape('../../etc/passwd')).toBe(false)
    expect(isGuestTokenShape(` ${'a'.repeat(48)} `)).toBe(true) // trimmed
    expect(isGuestTokenShape(undefined as unknown as string)).toBe(false)
  })

  it('hash trims whitespace so a pasted token still matches', () => {
    const raw = 'ab'.repeat(24)
    expect(hashGuestToken(` ${raw}\n`)).toBe(hashGuestToken(raw))
  })

  it('hashesMatch is strict', () => {
    const h = hashGuestToken('ab'.repeat(24))
    expect(hashesMatch(h, h)).toBe(true)
    expect(hashesMatch(h, hashGuestToken('cd'.repeat(24)))).toBe(false)
    expect(hashesMatch(h, h.slice(0, -2))).toBe(false)
    expect(hashesMatch(h, null)).toBe(false)
    expect(hashesMatch('', '')).toBe(false)
  })

  // Hardening (not exploitable today: every caller passes one side from hashGuestToken → 64 hex).
  // Buffer.from(x, 'hex') silently drops non-hex input, so two equal-length junk strings compare as
  // two empty buffers and timingSafeEqual returns true.
  it.fails('HARDENING: non-hex digests of equal length "match"', () => {
    expect(hashesMatch('zz', 'yy')).toBe(false)
  })
})

describe('invite lifetime', () => {
  it('expiry is clamped to 1 h … 7 d; junk → 24 h', () => {
    const hours = (h: number) => Math.round((Date.parse(inviteExpiry(h)) - Date.now()) / 3600_000)
    expect(hours(0)).toBe(1)
    expect(hours(1000)).toBe(168)
    expect(hours(Number.NaN)).toBe(24)
    expect(hours(6)).toBe(6)
  })

  it('live unless revoked or expired', () => {
    expect(inviteIsLive(row())).toBe(true)
    expect(inviteIsLive(row({ revoked_at: '2026-01-01T00:00:00Z' }))).toBe(false)
    expect(inviteIsLive(row({ expires_at: '2000-01-01T00:00:00Z' }))).toBe(false)
  })
})

describe('private take refs', () => {
  it('round-trips the path the take route builds', () => {
    for (const p of [`guest-takes/${ROW_ID}/1758600000000.webm`, `guest-takes/${ROW_ID}/camera-1758600000000.mp4`]) {
      expect(parseGuestTakeRef(guestTakeRef(p))).toBe(p)
    }
  })

  it('rejects traversal, other buckets and public URLs', () => {
    expect(parseGuestTakeRef(guestTakeRef(`guest-takes/${ROW_ID}/../../x.webm`))).toBeNull()
    expect(parseGuestTakeRef(`private://other-bucket/guest-takes/${ROW_ID}/1758600000000.webm`)).toBeNull()
    expect(parseGuestTakeRef('https://cdn.example.org/a.webm')).toBeNull()
    expect(parseGuestTakeRef(null)).toBeNull()
  })
})

describe('public vs admin payload', () => {
  it('guest never sees label or take URLs', () => {
    const r = row({ take_url: guestTakeRef(`guest-takes/${ROW_ID}/1758600000000.webm`), connection_state: 'recording' })
    const pub = publicInvite(r, 'Title')
    expect(pub.label).toBeNull()
    expect(pub.takeUrl).toBeNull()
    expect(pub.takeReady).toBe(true)
    expect(pub.recording).toBe(true)
    expect(JSON.stringify(pub)).not.toContain('token_hash')
  })

  it('admin sees label, refs and a join URL', () => {
    const a = adminInvite(row(), 'Title', 'https://example.org/', 'ab'.repeat(24))
    expect(a.label).toBe('Internal label')
    expect(a.url).toBe(`https://example.org/studio/join/${'ab'.repeat(24)}`)
    expect(a.expired).toBe(false)
    expect(a.revoked).toBe(false)
  })
})
