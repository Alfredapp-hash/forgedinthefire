/** Two-mic follow-the-talker: mute the quieter lane in time, keep both recordings. */

import { muteRange } from '@/lib/podcast/edit'
import type { StudioTrack } from '@/lib/podcast/multitrack'

export type MuteSpan = { start: number; end: number }

export type FollowTalkerOpts = {
  /** Analysis hop (seconds). */
  windowSec?: number
  /** Stay with the current speaker this long before switching. */
  hangSec?: number
  /** How much louder the other mic must be to steal the floor. */
  marginDb?: number
  /** Within this gap both mics stay open (overlap / “yeah”). */
  overlapDb?: number
  /** Below this, treat the mic as room, not speech. */
  floorDb?: number
}

const DEFAULTS = {
  windowSec: 0.05,
  hangSec: 0.28,
  marginDb: 6,
  overlapDb: 3,
  floorDb: -46,
}

function dbFromRms(rms: number) {
  return 20 * Math.log10(Math.max(rms, 1e-8))
}

function mixMono(buffer: AudioBuffer) {
  const n = buffer.length
  const out = new Float32Array(n)
  const chs = buffer.numberOfChannels
  for (let ch = 0; ch < chs; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += data[i] / chs
  }
  return out
}

function rmsAt(data: Float32Array, sr: number, localSec: number, windowSec: number) {
  const start = Math.floor(localSec * sr)
  const count = Math.max(1, Math.floor(windowSec * sr))
  if (start >= data.length || start + 8 < 0) return 0
  let sum = 0
  let n = 0
  const end = Math.min(data.length, start + count)
  const from = Math.max(0, start)
  for (let i = from; i < end; i++) {
    const x = data[i]
    sum += x * x
    n++
  }
  return n ? Math.sqrt(sum / n) : 0
}

function mergeSpans(spans: MuteSpan[], minSec: number): MuteSpan[] {
  const sorted = spans
    .filter((s) => s.end - s.start >= minSec)
    .sort((a, b) => a.start - b.start)
  const out: MuteSpan[] = []
  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span.start <= last.end + 0.02) last.end = Math.max(last.end, span.end)
    else out.push({ ...span })
  }
  return out
}

/**
 * Shure/Yamaha-style automixer for two interview mics.
 * PCM on both tracks is unchanged. Losing sections get clip.muted = true.
 */
export function followTalkerSpans(
  a: StudioTrack,
  b: StudioTrack,
  opts: FollowTalkerOpts = {},
): { muteA: MuteSpan[]; muteB: MuteSpan[] } {
  const windowSec = opts.windowSec ?? DEFAULTS.windowSec
  const hangSec = opts.hangSec ?? DEFAULTS.hangSec
  const marginDb = opts.marginDb ?? DEFAULTS.marginDb
  const overlapDb = opts.overlapDb ?? DEFAULTS.overlapDb
  const floorDb = opts.floorDb ?? DEFAULTS.floorDb
  if (!a.buffer || !b.buffer) return { muteA: [], muteB: [] }

  const dataA = mixMono(a.buffer)
  const dataB = mixMono(b.buffer)
  const start = Math.max(a.offset, b.offset)
  const end = Math.min(a.offset + a.buffer.duration, b.offset + b.buffer.duration)
  if (end - start < windowSec * 2) return { muteA: [], muteB: [] }

  const hangN = Math.max(1, Math.round(hangSec / windowSec))
  let winner = -1
  let pending: number | null = null
  let pendingN = 0
  const muteA: MuteSpan[] = []
  const muteB: MuteSpan[] = []
  let spanA: MuteSpan | null = null
  let spanB: MuteSpan | null = null

  const close = (side: 'a' | 'b', t: number) => {
    if (side === 'a' && spanA) {
      spanA.end = t
      muteA.push(spanA)
      spanA = null
    }
    if (side === 'b' && spanB) {
      spanB.end = t
      muteB.push(spanB)
      spanB = null
    }
  }

  for (let t = start; t < end; t += windowSec) {
    const aDb = dbFromRms(rmsAt(dataA, a.buffer.sampleRate, t - a.offset, windowSec))
    const bDb = dbFromRms(rmsAt(dataB, b.buffer.sampleRate, t - b.offset, windowSec))
    const aOn = aDb >= floorDb
    const bOn = bDb >= floorDb
    let desired = winner
    if (aOn && bOn) {
      if (Math.abs(aDb - bDb) <= overlapDb) desired = 2
      else if (aDb >= bDb + marginDb) desired = 0
      else if (bDb >= aDb + marginDb) desired = 1
      else desired = aDb >= bDb ? 0 : 1
    } else if (aOn) desired = 0
    else if (bOn) desired = 1
    else desired = winner === 0 || winner === 1 ? winner : -1

    if (desired === winner) {
      pending = null
      pendingN = 0
    } else if (winner === -1 || desired === 2 || desired === -1) {
      winner = desired
      pending = null
      pendingN = 0
    } else {
      if (pending !== desired) {
        pending = desired
        pendingN = 1
      } else {
        pendingN++
        if (pendingN >= hangN) {
          winner = desired
          pending = null
          pendingN = 0
        }
      }
    }

    const muteLeft = winner === 1 || winner === -1
    const muteRight = winner === 0 || winner === -1
    if (muteLeft) {
      if (!spanA) spanA = { start: t, end: t + windowSec }
      else spanA.end = t + windowSec
    } else close('a', t)
    if (muteRight) {
      if (!spanB) spanB = { start: t, end: t + windowSec }
      else spanB.end = t + windowSec
    } else close('b', t)
  }
  close('a', end)
  close('b', end)

  return { muteA: mergeSpans(muteA, 0.08), muteB: mergeSpans(muteB, 0.08) }
}

export function applyFollowTalker(
  tracks: StudioTrack[],
  idA: string,
  idB: string,
  opts?: FollowTalkerOpts,
): { tracks: StudioTrack[]; mutedA: number; mutedB: number } {
  const a = tracks.find((t) => t.id === idA)
  const b = tracks.find((t) => t.id === idB)
  if (!a?.buffer || !b?.buffer) return { tracks, mutedA: 0, mutedB: 0 }
  const { muteA, muteB } = followTalkerSpans(a, b, opts)
  let nextA = a
  let nextB = b
  for (const span of muteA) nextA = muteRange(nextA, span.start, span.end, true)
  for (const span of muteB) nextB = muteRange(nextB, span.start, span.end, true)
  return {
    tracks: tracks.map((t) => (t.id === nextA.id ? nextA : t.id === nextB.id ? nextB : t)),
    mutedA: muteA.reduce((n, s) => n + (s.end - s.start), 0),
    mutedB: muteB.reduce((n, s) => n + (s.end - s.start), 0),
  }
}
