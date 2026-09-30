import { describe, expect, it } from 'vitest'
import {
  HOST_IDENTITY,
  MAX_ROOM_GUESTS,
  ROOM_NAME_PATTERN,
  guestIdentity,
  inviteIdFromIdentity,
  isHostIdentity,
  roomNameFor,
} from '@/lib/podcast/rooms/types'
import { PANEL_NEEDS_ROOM_SERVICE, inviteCapacity, needsRoom, providerConfigured } from '@/lib/podcast/rooms/provider'
import {
  decodeJwtClaims,
  livekitClaims,
  livekitHttpUrl,
  livekitWsUrl,
  roomGrantFor,
  signHs256,
  type LiveKitClaims,
} from '@/lib/podcast/rooms/livekit'
import {
  GRID_MAX_PEOPLE,
  assignGuestLanes,
  gridCells,
  guestPersonId,
  isRemoteLaneKey,
  remoteLaneKey,
} from '@/lib/podcast/rooms/layout'

const EP = '0f8fad5b-d9cb-469f-a165-70867728950e'
const INV = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('room naming and identities', () => {
  it('names one room per episode, with a suffix for later generations', () => {
    expect(roomNameFor(EP)).toBe(`fitf-ep-${EP}`)
    expect(roomNameFor(EP, 2)).toBe(`fitf-ep-${EP}-2`)
    expect(ROOM_NAME_PATTERN.test(roomNameFor(EP))).toBe(true)
    expect(ROOM_NAME_PATTERN.test(roomNameFor(EP, 3))).toBe(true)
    expect(ROOM_NAME_PATTERN.test('fitf-ep-nope')).toBe(false)
  })

  it('maps guest identities back to invite ids and never mistakes the host', () => {
    const id = guestIdentity(INV.toUpperCase())
    expect(id).toBe(`guest:${INV}`)
    expect(inviteIdFromIdentity(id)).toBe(INV)
    expect(inviteIdFromIdentity(HOST_IDENTITY)).toBeNull()
    expect(inviteIdFromIdentity('guest:not-a-uuid')).toBeNull()
    expect(isHostIdentity('host')).toBe(true)
    expect(isHostIdentity('guest:x')).toBe(false)
  })
})

describe('invite capacity', () => {
  it('allows exactly one guest without the room service, with a plain reason for the second', () => {
    const first = inviteCapacity({ liveInvites: 0, available: false, provider: null, unavailableReason: 'not configured' })
    expect(first.remaining).toBe(1)
    expect(first.reason).toBeNull()
    const second = inviteCapacity({ liveInvites: 1, available: false, provider: null, unavailableReason: 'not configured' })
    expect(second.remaining).toBe(0)
    expect(second.reason).toBe(PANEL_NEEDS_ROOM_SERVICE)
    expect(second.maxGuests).toBe(1)
  })

  it('names a config problem when env is half set', () => {
    const cap = inviteCapacity({
      liveInvites: 1,
      available: false,
      provider: null,
      unavailableReason: 'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must all be set',
    })
    expect(cap.reason).toContain('must all be set')
  })

  it('caps a room at MAX_ROOM_GUESTS', () => {
    const cap = inviteCapacity({ liveInvites: MAX_ROOM_GUESTS, available: true, provider: 'livekit' })
    expect(cap.remaining).toBe(0)
    expect(cap.reason).toMatch(/holds \d+ guests/)
    const open = inviteCapacity({ liveInvites: 1, available: true, provider: 'livekit' })
    expect(open.remaining).toBe(MAX_ROOM_GUESTS - 1)
    expect(open.reason).toBeNull()
  })

  it('needsRoom from the second live invite', () => {
    expect(needsRoom(1)).toBe(false)
    expect(needsRoom(2)).toBe(true)
  })

  it('providerConfigured rejects partial or odd env', () => {
    expect(providerConfigured({})).toEqual({ ok: false, reason: 'not configured' })
    expect(providerConfigured({ LIVEKIT_URL: 'wss://x.livekit.cloud' }).ok).toBe(false)
    expect(
      providerConfigured({ LIVEKIT_URL: 'ftp://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'a'.repeat(32) }).ok,
    ).toBe(false)
    expect(
      providerConfigured({ LIVEKIT_URL: 'wss://x.livekit.cloud', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'a'.repeat(32) }),
    ).toEqual({ ok: true, url: 'wss://x.livekit.cloud' })
  })
})

describe('LiveKit token claims', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0)

  it('guest grant is scoped to the room, mic + camera, and dies with the invite', () => {
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString()
    const grant = roomGrantFor({
      room: roomNameFor(EP),
      identity: guestIdentity(INV),
      role: 'guest',
      name: 'Ada',
      invite: { id: INV, expiresAt },
      now,
    })
    expect(grant.exp - grant.nbf).toBeLessThanOrEqual(30 * 60 + 10)
    const claims = livekitClaims(grant, 'APIkey')
    expect(claims.iss).toBe('APIkey')
    expect(claims.sub).toBe(`guest:${INV}`)
    expect(claims.name).toBe('Ada')
    expect(JSON.parse(claims.metadata || '{}')).toEqual({ inviteId: INV })
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: roomNameFor(EP),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ['microphone', 'camera'],
    })
    expect(claims.video.roomCreate).toBeUndefined()
  })

  it('host grant has no source restriction and the default lifetime', () => {
    const grant = roomGrantFor({ room: 'r', identity: HOST_IDENTITY, role: 'host', now })
    const claims = livekitClaims(grant, 'k')
    expect(claims.video.canPublishSources).toBeUndefined()
    expect(claims.metadata).toBeUndefined()
    expect(grant.exp - Math.floor(now / 1000)).toBe(6 * 60 * 60)
  })

  it('signs a verifiable HS256 JWT', () => {
    const claims = livekitClaims(roomGrantFor({ room: 'r', identity: 'host', role: 'host', now }), 'k')
    const token = signHs256(claims, 'secret-secret-secret')
    expect(token.split('.')).toHaveLength(3)
    const decoded = decodeJwtClaims<LiveKitClaims>(token)
    expect(decoded?.video.room).toBe('r')
    expect(decodeJwtClaims('nope')).toBeNull()
  })

  it('translates URLs between ws and http', () => {
    expect(livekitHttpUrl('wss://x.livekit.cloud/')).toBe('https://x.livekit.cloud')
    expect(livekitWsUrl('https://x.livekit.cloud')).toBe('wss://x.livekit.cloud')
    expect(livekitWsUrl('ws://localhost:7880')).toBe('ws://localhost:7880')
  })
})

describe('lane assignment', () => {
  it('keeps the first guest on the existing "guest" person and numbers the rest', () => {
    const lanes = assignGuestLanes([
      { inviteId: INV, name: 'Ada' },
      { inviteId: '11111111-2222-3333-4444-555555555555', name: '' },
      { inviteId: '66666666-7777-8888-9999-000000000000', name: null },
    ])
    expect(lanes[0]).toMatchObject({ personId: 'guest', index: 1, name: 'Ada' })
    expect(lanes[1]).toMatchObject({ personId: 'guest_11111111', index: 2, name: 'Guest 2' })
    expect(lanes[2].personId).toBe('guest_66666666')
    expect(guestPersonId(INV, 1)).toBe('guest')
    expect(remoteLaneKey('guest_11111111')).toBe('remote:guest_11111111')
    expect(isRemoteLaneKey('remote:guest')).toBe(true)
    expect(isRemoteLaneKey('default')).toBe(false)
  })
})

describe('grid layout', () => {
  const W = 1280
  const H = 720

  it('is full frame for one, side by side for two', () => {
    expect(gridCells(1, W, H)).toEqual([{ x: 0, y: 0, w: W, h: H }])
    const two = gridCells(2, W, H)
    expect(two).toHaveLength(2)
    expect(two[0].y).toBe(two[1].y)
    expect(two[0].w).toBe(two[1].w)
    expect(two[1].x).toBeGreaterThan(two[0].x + two[0].w)
  })

  it('centres the lone cell on the second row for three, 2x2 for four', () => {
    const three = gridCells(3, W, H)
    expect(three).toHaveLength(3)
    const lone = three[2]
    expect(Math.abs(lone.x + lone.w / 2 - W / 2)).toBeLessThan(2)
    expect(lone.y).toBeGreaterThan(three[0].y)
    const four = gridCells(4, W, H)
    expect(four).toHaveLength(4)
    expect(four[3].x).toBe(four[1].x)
    expect(four[3].y).toBe(four[2].y)
    for (const c of four) {
      expect(c.x + c.w).toBeLessThanOrEqual(W)
      expect(c.y + c.h).toBeLessThanOrEqual(H)
    }
  })

  it('never draws more than GRID_MAX_PEOPLE and nothing for zero', () => {
    expect(gridCells(9, W, H)).toHaveLength(GRID_MAX_PEOPLE)
    expect(gridCells(0, W, H)).toEqual([])
  })
})
