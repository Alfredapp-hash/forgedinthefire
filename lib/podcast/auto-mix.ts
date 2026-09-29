/**
 * Two-mic follow-the-talker. Default: Dugan-style gain sharing written as volume
 * automation (quieter mic attenuated to −12 dB with look-ahead, never hard-muted).
 * The legacy hard-mute spans API (followTalkerSpans / mode: 'mute') is kept.
 */

import { muteRange } from '@/lib/podcast/edit'
import { automationAt, type AutomationPoint, type StudioTrack } from '@/lib/podcast/multitrack'

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
  /** 'gain' (default): Dugan gain-sharing automation. 'mute': legacy hard-mute clip spans. */
  mode?: 'gain' | 'mute'
  /** Gain-sharing options (mode 'gain'). */
  sharing?: GainSharingOpts
}

export type GainSharingOpts = {
  /** Analysis hop (s). Default 0.01. */
  hopSec?: number
  /** Deepest attenuation for the non-talker (dB). Default −12. */
  attenuationDb?: number
  /** Open the talker's gain this early (s). Default 0.03. */
  lookaheadSec?: number
  /** Gain rise time constant (s). Default 0.005. */
  attackSec?: number
  /** Gain fall time constant (s). Default 0.25. */
  releaseSec?: number
  /** Automation thinning tolerance (dB). Default 1. */
  toleranceDb?: number
}

/** Linear gain per hop in session time: value i applies at startSec + i·hopSec. */
export type GainCurve = { startSec: number; hopSec: number; gains: Float32Array }

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

function powerEnvelope(track: StudioTrack, start: number, hops: number, hopSec: number): Float32Array {
  const buf = track.buffer!
  const sr = buf.sampleRate
  const data = mixMono(buf)
  const out = new Float32Array(hops)
  const n = Math.max(1, Math.round(hopSec * sr))
  for (let h = 0; h < hops; h++) {
    const from = Math.round((start + h * hopSec - track.offset) * sr)
    let sum = 0
    let cnt = 0
    for (let i = Math.max(0, from); i < Math.min(data.length, from + n); i++) {
      sum += data[i] * data[i]
      cnt++
    }
    out[h] = cnt ? sum / cnt : 0
  }
  return out
}

/**
 * Dugan-style gain sharing for two mics: each mic's gain is its share of the total
 * power (sum of gains ≈ constant, so the room level never pumps), floored at
 * `attenuationDb`. Levels are read `lookaheadSec` ahead so a talker opens before the
 * first syllable; gains rise fast and fall slowly. Curves cover the overlap of both takes.
 */
export function gainSharingCurves(a: StudioTrack, b: StudioTrack, opts: GainSharingOpts = {}): { a: GainCurve; b: GainCurve } | null {
  if (!a.buffer || !b.buffer) return null
  const hop = opts.hopSec ?? 0.01
  const floorDb = opts.attenuationDb ?? -12
  const floor = 10 ** (floorDb / 20)
  const look = Math.max(0, Math.round((opts.lookaheadSec ?? 0.03) / hop))
  const att = 1 - Math.exp(-hop / (opts.attackSec ?? 0.005))
  const rel = 1 - Math.exp(-hop / (opts.releaseSec ?? 0.25))
  const start = Math.max(a.offset, b.offset)
  const end = Math.min(a.offset + a.buffer.duration, b.offset + b.buffer.duration)
  const hops = Math.floor((end - start) / hop)
  if (hops < 2) return null
  const pa = powerEnvelope(a, start, hops, hop)
  const pb = powerEnvelope(b, start, hops, hop)
  const ga = new Float32Array(hops)
  const gb = new Float32Array(hops)
  let sa = Math.SQRT1_2
  let sb = Math.SQRT1_2
  const eps = 1e-10
  for (let i = 0; i < hops; i++) {
    // Look-ahead: loudest power in [i, i+look].
    let ea = 0
    let eb = 0
    for (let k = i; k <= Math.min(hops - 1, i + look); k++) {
      if (pa[k] > ea) ea = pa[k]
      if (pb[k] > eb) eb = pb[k]
    }
    const total = ea + eb + eps
    // Power share → amplitude gain (equal talkers: −3 dB each, sum of power = 1).
    const ta = Math.max(floor, Math.sqrt((ea + eps / 2) / total))
    const tb = Math.max(floor, Math.sqrt((eb + eps / 2) / total))
    sa += (ta - sa) * (ta > sa ? att : rel)
    sb += (tb - sb) * (tb > sb ? att : rel)
    ga[i] = sa
    gb[i] = sb
  }
  return { a: { startSec: start, hopSec: hop, gains: ga }, b: { startSec: start, hopSec: hop, gains: gb } }
}

/**
 * Turn a gain curve into sparse volume automation, multiplied onto the track's existing
 * automation. Points are only kept where the curve bends by more than `toleranceDb`.
 */
export function gainCurveToAutomation(curve: GainCurve, existing: AutomationPoint[] = [], toleranceDb = 1): AutomationPoint[] {
  const { startSec, hopSec, gains } = curve
  const n = gains.length
  if (!n) return existing.map((p) => ({ ...p }))
  const endSec = startSec + (n - 1) * hopSec
  const tol = Math.max(0.05, toleranceDb)
  const db = (g: number) => 20 * Math.log10(Math.max(g, 1e-6))
  const keep: number[] = [0]
  let anchor = 0
  for (let i = 2; i < n; i++) {
    // Would a straight line anchor → i miss any point in between by more than tol?
    const a = db(gains[anchor])
    const b = db(gains[i])
    let bad = false
    for (let k = anchor + 1; k < i; k++) {
      const lin = a + ((b - a) * (k - anchor)) / (i - anchor)
      if (Math.abs(lin - db(gains[k])) > tol) {
        bad = true
        break
      }
    }
    // Bound each segment (keeps thinning linear-time on long flat stretches).
    if (bad || i - anchor > 200) {
      keep.push(i - 1)
      anchor = i - 1
    }
  }
  keep.push(n - 1)
  const pts: AutomationPoint[] = existing.filter((p) => p.t < startSec - 1e-6 || p.t > endSec + 1e-6).map((p) => ({ ...p }))
  // Pin the existing envelope at the curve edges so it continues unchanged outside.
  if (existing.length) {
    pts.push({ t: startSec - 1e-3, v: automationAt(existing, startSec - 1e-3) })
    pts.push({ t: endSec + 1e-3, v: automationAt(existing, endSec + 1e-3) })
  }
  for (const i of keep) {
    const t = startSec + i * hopSec
    pts.push({ t, v: gains[i] * automationAt(existing, t) })
  }
  return pts.sort((x, y) => x.t - y.t)
}

/** Gain-sharing automation for both tracks (non-destructive). */
export function applyGainSharing(
  tracks: StudioTrack[],
  idA: string,
  idB: string,
  opts: GainSharingOpts = {},
): { tracks: StudioTrack[]; curves: { a: GainCurve; b: GainCurve } | null; attenuatedA: number; attenuatedB: number } {
  const a = tracks.find((t) => t.id === idA)
  const b = tracks.find((t) => t.id === idB)
  if (!a?.buffer || !b?.buffer) return { tracks, curves: null, attenuatedA: 0, attenuatedB: 0 }
  const curves = gainSharingCurves(a, b, opts)
  if (!curves) return { tracks, curves: null, attenuatedA: 0, attenuatedB: 0 }
  const tol = opts.toleranceDb ?? 1
  const nextA = { ...a, automation: gainCurveToAutomation(curves.a, a.automation || [], tol) }
  const nextB = { ...b, automation: gainCurveToAutomation(curves.b, b.automation || [], tol) }
  const under = (c: GainCurve) => c.gains.reduce((n, g) => n + (g < 0.5 ? c.hopSec : 0), 0)
  return {
    tracks: tracks.map((t) => (t.id === idA ? nextA : t.id === idB ? nextB : t)),
    curves,
    attenuatedA: under(curves.a),
    attenuatedB: under(curves.b),
  }
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
  if ((opts?.mode ?? 'gain') === 'gain') {
    // Seconds spent attenuated by more than 6 dB are reported as "muted" for the UI.
    const r = applyGainSharing(tracks, idA, idB, opts?.sharing)
    return { tracks: r.tracks, mutedA: r.attenuatedA, mutedB: r.attenuatedB }
  }
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
