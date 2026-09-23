import { z } from 'zod'
import { ADMIN_SENDABLE_KINDS, GUEST_SENDABLE_KINDS, GUEST_TALLY_PHASES } from '@/lib/podcast/guest-types'

/** Hard cap for one signaling POST body (an SDP with video + two audio lines is ~6-12KB). */
export const SIGNAL_BODY_MAX = 64 * 1024

/** Peer generation id: lets each side drop answers/candidates from an older peer. */
const gen = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/).optional()

/**
 * De-dupe metadata. A control signal can arrive twice (data channel + signal
 * table): `cid` identifies it, `seq` (monotonic per sender, ms-based) lets the
 * receiver drop an older state that lands after a newer one.
 */
const meta = {
  cid: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}

const sdp = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(10).max(48 * 1024),
  gen,
  restart: z.boolean().optional(),
})

const candidate = z
  .object({
    candidate: z.string().max(1024),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(32).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  })
  .strip()

const ice = z.object({ candidate: candidate.nullable().optional(), gen }).strip()
const flag = z.object({ on: z.boolean().optional(), ...meta }).strip()

const PAYLOADS = {
  offer: sdp.refine((v) => v.type === 'offer', 'offer expected'),
  answer: sdp.refine((v) => v.type === 'answer', 'answer expected'),
  ice,
  hangup: z.object({ ...meta }).strip(),
  reconnect: z.object({ ...meta }).strip(),
  camera: flag,
  mute: flag,
  talkback: flag,
  record: z
    .object({
      on: z.boolean().optional(),
      phase: z.enum(GUEST_TALLY_PHASES).optional(),
      /** Host session clock (seconds) at record start: the guest backup is placed from here. */
      sessionSec: z.number().min(0).max(172_800).nullable().optional(),
      /** Host wall clock (epoch ms) at sessionSec. */
      hostAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
      ...meta,
    })
    .strip(),
  tally: z.object({ phase: z.enum(GUEST_TALLY_PHASES), ...meta }).strip(),
  cue: z.object({ on: z.boolean().optional(), live: z.boolean().optional(), ...meta }).strip(),
  /**
   * Guest -> host: "I need a pause" (on) / "I'm ready" (off).
   * Host -> guest: safe pause on/off; `slate` when it came from the live room's Safe slate.
   */
  pause: z.object({ on: z.boolean(), slate: z.boolean().optional(), ...meta }).strip(),
} as const

export type ParsedSignal = { kind: string; payload: Record<string, unknown> }

/**
 * Validate kind for the sending role and strip the payload to known fields.
 * Returns null when the signal is not allowed or malformed.
 */
export function parseSignal(role: 'admin' | 'guest', kind: unknown, payload: unknown): ParsedSignal | null {
  const k = String(kind || '')
  const allowed = role === 'guest' ? GUEST_SENDABLE_KINDS : ADMIN_SENDABLE_KINDS
  if (!allowed.has(k) || !(k in PAYLOADS)) return null
  const schema = PAYLOADS[k as keyof typeof PAYLOADS]
  const parsed = schema.safeParse(payload ?? {})
  if (!parsed.success) return null
  return { kind: k, payload: parsed.data as Record<string, unknown> }
}
