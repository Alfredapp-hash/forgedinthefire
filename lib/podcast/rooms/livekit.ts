/**
 * LiveKit provider (LiveKit Cloud or a self-hosted server).
 *
 * Tokens are plain HS256 JWTs with LiveKit's `video` grant, signed here with
 * node:crypto — no server SDK needed. Room creation goes through LiveKit's
 * Twirp RoomService over HTTPS. Keys never leave the server.
 *
 * Claim shape: https://docs.livekit.io/home/get-started/authentication/
 */

import { createHmac } from 'node:crypto'
import type { RoomProvider } from '@/lib/podcast/rooms/provider'
import {
  MAX_ROOM_GUESTS,
  ROOM_TOKEN_TTL_SEC,
  type MintTokenInput,
  type RoomGrant,
  type RoomToken,
} from '@/lib/podcast/rooms/types'

export type LiveKitVideoGrant = {
  roomJoin?: boolean
  room?: string
  roomCreate?: boolean
  roomAdmin?: boolean
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  canPublishSources?: string[]
  hidden?: boolean
}

export type LiveKitClaims = {
  iss: string
  sub: string
  nbf: number
  exp: number
  name?: string
  metadata?: string
  video: LiveKitVideoGrant
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Sign a claims object as a compact HS256 JWT. */
export function signHs256(claims: Record<string, unknown>, secret: string) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest())
  return `${header}.${body}.${sig}`
}

/** Decode (without verifying) — for tests and diagnostics only. */
export function decodeJwtClaims<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const pad = parts[1].length % 4 ? '='.repeat(4 - (parts[1].length % 4)) : ''
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8')) as T
  } catch {
    return null
  }
}

/**
 * Grant for one participant. Pure: what the token will say, before signing.
 * Guest tokens never outlive the invite; the host cannot publish data to a
 * room it is not joining.
 */
export function roomGrantFor(input: MintTokenInput): RoomGrant {
  const now = Math.floor((input.now ?? Date.now()) / 1000)
  let ttl = Math.max(60, Math.min(24 * 60 * 60, Math.floor(input.ttlSec ?? ROOM_TOKEN_TTL_SEC)))
  if (input.invite?.expiresAt) {
    const inviteExp = Math.floor(new Date(input.invite.expiresAt).getTime() / 1000)
    if (Number.isFinite(inviteExp)) ttl = Math.max(60, Math.min(ttl, inviteExp - now))
  }
  const guest = input.role === 'guest'
  return {
    room: input.room,
    identity: input.identity,
    name: (input.name || (guest ? 'Guest' : 'Host')).slice(0, 60),
    role: input.role,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    nbf: now - 10,
    exp: now + ttl,
    metadata: guest && input.invite ? JSON.stringify({ inviteId: input.invite.id }) : undefined,
  }
}

export function livekitClaims(grant: RoomGrant, apiKey: string): LiveKitClaims {
  const guest = grant.role === 'guest'
  return {
    iss: apiKey,
    sub: grant.identity,
    nbf: grant.nbf,
    exp: grant.exp,
    name: grant.name,
    ...(grant.metadata ? { metadata: grant.metadata } : {}),
    video: {
      roomJoin: true,
      room: grant.room,
      canPublish: grant.canPublish,
      canSubscribe: grant.canSubscribe,
      canPublishData: grant.canPublishData,
      // Guests: mic + camera only. Host may also publish the cue/talkback lines (audio) and screen later.
      ...(guest ? { canPublishSources: ['microphone', 'camera'] } : {}),
    },
  }
}

/** wss://x.livekit.cloud → https://x.livekit.cloud (for the Twirp API). */
export function livekitHttpUrl(url: string) {
  return url.trim().replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '')
}

/** https://x.livekit.cloud → wss://x.livekit.cloud (what the browser SDK connects to). */
export function livekitWsUrl(url: string) {
  return url.trim().replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:').replace(/\/+$/, '')
}

export function createLiveKitProvider(env: { url: string; apiKey: string; apiSecret: string }): RoomProvider {
  const apiKey = env.apiKey.trim()
  const apiSecret = env.apiSecret.trim()
  const httpUrl = livekitHttpUrl(env.url)
  const clientUrl = livekitWsUrl(env.url)

  function serviceToken(grant: LiveKitVideoGrant) {
    const now = Math.floor(Date.now() / 1000)
    return signHs256({ iss: apiKey, sub: 'fitf-server', nbf: now - 10, exp: now + 5 * 60, video: grant }, apiSecret)
  }

  async function twirp(method: string, body: Record<string, unknown>, grant: LiveKitVideoGrant) {
    const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken(grant)}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`LiveKit ${method} failed (${res.status}) ${text.slice(0, 200)}`.trim())
    }
    return res.json().catch(() => ({}))
  }

  return {
    kind: 'livekit',
    clientUrl,
    async createRoom(roomName, opts) {
      await twirp(
        'CreateRoom',
        {
          name: roomName,
          empty_timeout: opts?.emptyTimeoutSec ?? 10 * 60,
          max_participants: opts?.maxParticipants ?? MAX_ROOM_GUESTS + 2,
        },
        { roomCreate: true },
      )
    },
    async endRoom(roomName) {
      try {
        await twirp('DeleteRoom', { room: roomName }, { roomCreate: true, roomAdmin: true, room: roomName })
      } catch {
        /* the room times out on its own once empty */
      }
    },
    mintToken(input): RoomToken {
      const grant = roomGrantFor(input)
      return { token: signHs256(livekitClaims(grant, apiKey), apiSecret), identity: grant.identity, expiresAt: grant.exp }
    },
  }
}
