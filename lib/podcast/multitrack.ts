/** Multi-track mix / schedule helpers for the podcast vocal studio. */

import type { EffectId } from '@/lib/podcast/effects'
import {
  automationValue,
  DEFAULT_XFADE_SEC,
  renderMixPlan,
  type CompWindow,
  type MixPlan,
  type MixTrackPlan,
} from '@/lib/podcast/engine/mix-core'
import { resampleSinc, SESSION_SAMPLE_RATE } from '@/lib/podcast/engine/resample'

export { SESSION_SAMPLE_RATE } from '@/lib/podcast/engine/resample'
export type { CompWindow } from '@/lib/podcast/engine/mix-core'

export type TrackRole = 'vocal' | 'guest' | 'music' | 'bed' | 'sfx' | 'master' | 'custom'
export type PersonKind = 'voice' | 'bed' | 'sfx'

export type InsertSlot = {
  id: EffectId
  bypass: boolean
  wet: number
}

export type SessionPerson = {
  id: string
  name: string
  color: string
  kind: PersonKind
  /** getUserMedia deviceId for this person. Empty = fallback mic. */
  inputDeviceId?: string
  /** Local camera for this person. Empty = default camera. Video stays off the audio mix. */
  videoDeviceId?: string
  /** Linked: moving a take can nudge that person's camera. Default true. */
  avLinked?: boolean
}

export type StudioTrack = {
  id: string
  name: string
  role: TrackRole
  color: string
  /** Who owns this take. Beds/SFX share a lane person. */
  personId: string
  /** 1-based take number within that person */
  take: number
  /** Gain 0–2 */
  volume: number
  /** Pan −1 (L) … 1 (R) */
  pan: number
  muted: boolean
  solo: boolean
  armed: boolean
  /** This is the take you hear for this person (voice lanes). */
  listen: boolean
  /** Stay in the mix even if another take is the listen take. */
  layered: boolean
  /** Start offset on the timeline (seconds) */
  offset: number
  fadeIn: number
  fadeOut: number
  buffer: AudioBuffer | null
  /** Object URL for decode / download. Waveforms come from peaks on the session timeline. */
  url: string | null
  /** Non-destructive insert chain; original buffer is unchanged */
  inserts: InsertSlot[]
  /** Regions on this lane. Empty means one clip covering the whole buffer. */
  clips: TrackClip[]
  /** Volume envelope in session time. 1 = the track fader. Independent per track. */
  automation: AutomationPoint[]
  /** Playlist comps: this take is the audible one in these session ranges. */
  compRanges: CompRange[]
}

export type TrackClip = {
  id: string
  /** Seconds into the source buffer */
  sourceStart: number
  duration: number
  /** Session time */
  offset: number
  /** Clip gain 0–2, on top of the track fader */
  gain: number
  muted: boolean
  fadeIn: number
  fadeOut: number
  /** Same punch as a camera clip — used for link / broken-sync, not mux. */
  syncGroup?: string
}

export type AutomationPoint = {
  t: number
  /** Linear multiplier, 1 = track fader */
  v: number
}

export type CompRange = {
  start: number
  end: number
}

export const TRACK_COLORS = [
  '#53D6FF',
  '#7CFFB2',
  '#FFB86B',
  '#C4A1FF',
  '#FF7A9A',
  '#F6E05E',
  '#64B5F6',
  '#A5D6A7',
]

export function newTrackId() {
  return `trk_${Math.random().toString(36).slice(2, 10)}`
}

export function newPersonId() {
  return `who_${Math.random().toString(36).slice(2, 10)}`
}

export function newClipId() {
  return `clip_${Math.random().toString(36).slice(2, 10)}`
}

export const DEFAULT_PEOPLE: SessionPerson[] = [
  { id: 'host', name: 'Host', color: '#53D6FF', kind: 'voice' },
  { id: 'guest', name: 'Guest', color: '#7CFFB2', kind: 'voice' },
  { id: 'beds', name: 'Beds', color: '#FFB86B', kind: 'bed' },
  { id: 'sfx', name: 'SFX', color: '#C4A1FF', kind: 'sfx' },
]

function personIdForRole(role: TrackRole) {
  if (role === 'guest') return 'guest'
  if (role === 'sfx') return 'sfx'
  if (role === 'bed' || role === 'music') return 'beds'
  return 'host'
}

export function createEmptyTrack(
  partial?: Partial<StudioTrack> & Pick<StudioTrack, 'name' | 'role'>,
): StudioTrack {
  const idx = Math.floor(Math.random() * TRACK_COLORS.length)
  const role = partial?.role || 'custom'
  return {
    id: newTrackId(),
    name: partial?.name || 'Track',
    role,
    color: partial?.color || TRACK_COLORS[idx],
    personId: partial?.personId || personIdForRole(role),
    take: partial?.take ?? 1,
    volume: partial?.volume ?? 1,
    pan: partial?.pan ?? 0,
    muted: partial?.muted ?? false,
    solo: partial?.solo ?? false,
    armed: partial?.armed ?? false,
    listen: partial?.listen ?? true,
    layered: partial?.layered ?? false,
    offset: partial?.offset ?? 0,
    fadeIn: partial?.fadeIn ?? 0.05,
    fadeOut: partial?.fadeOut ?? 0.15,
    buffer: partial?.buffer ?? null,
    url: partial?.url ?? null,
    inserts: partial?.inserts ? [...partial.inserts] : [],
    clips: partial?.clips ? partial.clips.map((c) => ({ ...c })) : [],
    automation: partial?.automation ? partial.automation.map((p) => ({ ...p })) : [],
    compRanges: partial?.compRanges ? partial.compRanges.map((r) => ({ ...r })) : [],
  }
}

/** Voice people get a listen take plus two empty record slots. Beds / SFX stay one lane. */
export const VOICE_LANE_SLOTS = 3
export const UTILITY_LANE_SLOTS = 1

export function laneSlotsForPerson(person: SessionPerson) {
  return person.kind === 'voice' ? VOICE_LANE_SLOTS : UTILITY_LANE_SLOTS
}

function defaultTakeName(person: SessionPerson, take: number) {
  if (person.kind === 'bed') return take === 1 ? 'Music bed' : `${person.name} ${take}`
  if (person.kind === 'sfx') return take === 1 ? 'SFX lane' : `${person.name} ${take}`
  return `${person.name} · take ${take}`
}

/** Empty StudioTrack rows the admin can Arm/Record onto without hitting + Take. */
export function emptyTakesForPerson(
  person: SessionPerson,
  startTake = 1,
  count = laneSlotsForPerson(person),
): StudioTrack[] {
  const role = roleForPerson(person)
  return Array.from({ length: count }, (_, i) => {
    const take = startTake + i
    return createEmptyTrack({
      name: defaultTakeName(person, take),
      role,
      personId: person.id,
      take,
      color: person.color,
      armed: person.kind === 'voice' && take === 1 && person.id === 'host',
      listen: take === 1,
      volume: person.kind === 'bed' ? 0.35 : person.kind === 'sfx' ? 0.85 : 1,
    })
  })
}

export function defaultSessionTracks(): StudioTrack[] {
  return DEFAULT_PEOPLE.flatMap((person) => emptyTakesForPerson(person))
}

/** Pad a restored or bounced session so each voice still has 3 slots (beds/SFX stay 1). */
export function ensurePersonLanes(tracks: StudioTrack[], people: SessionPerson[]): StudioTrack[] {
  let next = tracks
  for (const person of people) {
    const slots = laneSlotsForPerson(person)
    const have = personTakes(next, person.id).length
    if (have >= slots) continue
    next = next.concat(emptyTakesForPerson(person, nextTakeNumber(next, person.id), slots - have))
  }
  return next
}

export function personTakes(tracks: StudioTrack[], personId: string) {
  return tracks.filter((t) => t.personId === personId)
}

export function nextTakeNumber(tracks: StudioTrack[], personId: string) {
  const takes = personTakes(tracks, personId)
  if (takes.length === 0) return 1
  return takes.reduce((n, t) => Math.max(n, t.take), 0) + 1
}

export function emptyTakeForPerson(tracks: StudioTrack[], personId: string) {
  return personTakes(tracks, personId).find((t) => !t.buffer) || null
}

/** Timeline time where this person's last audio ends (offset + duration). */
export function lastTakeEnd(tracks: StudioTrack[], personId: string) {
  const takes = personTakes(tracks, personId).filter((t) => t.buffer)
  if (takes.length === 0) return 0
  return Math.max(0, ...takes.map(trackDuration))
}

export function roleForPerson(person: SessionPerson): TrackRole {
  if (person.kind === 'sfx') return 'sfx'
  if (person.kind === 'bed') return 'bed'
  return person.id === 'guest' || person.name.toLowerCase().includes('guest') ? 'guest' : 'vocal'
}

export function cloneAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const copy = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    copy.copyToChannel(buffer.getChannelData(ch).slice(), ch)
  }
  return copy
}

export function emptyStereo(sampleRate: number, length: number): AudioBuffer {
  return new AudioBuffer({ length: Math.max(1, length), numberOfChannels: 2, sampleRate })
}

export function monoToStereo(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels >= 2) return cloneAudioBuffer(buffer)
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: 2,
    sampleRate: buffer.sampleRate,
  })
  const src = buffer.getChannelData(0)
  out.copyToChannel(src.slice(), 0)
  out.copyToChannel(src.slice(), 1)
  return out
}

export function clipsOf(track: StudioTrack): TrackClip[] {
  if (track.clips && track.clips.length > 0) return track.clips
  if (!track.buffer) return []
  return [
    {
      id: `${track.id}_full`,
      sourceStart: 0,
      duration: track.buffer.duration,
      offset: track.offset,
      gain: 1,
      muted: false,
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut,
    },
  ]
}

export function ensureClips(track: StudioTrack): StudioTrack {
  if ((track.clips || []).length > 0) {
    return { ...track, automation: track.automation || [] }
  }
  return { ...track, clips: clipsOf(track), automation: track.automation || [] }
}

export function automationAt(points: AutomationPoint[] | undefined, t: number, fallback = 1) {
  if (!points || points.length === 0) return fallback
  return automationValue(points, t, fallback)
}

export function trackDuration(track: StudioTrack): number {
  const clips = clipsOf(track)
  if (clips.length > 0) return Math.max(0, ...clips.map((c) => c.offset + c.duration))
  if (!track.buffer) return 0
  return track.offset + track.buffer.duration
}

export function sessionDuration(tracks: StudioTrack[]): number {
  return Math.max(0, ...tracks.map(trackDuration))
}

export function isVoiceRole(role: TrackRole) {
  return role === 'vocal' || role === 'guest'
}

/** Voice lanes: one listen take plus any layered takes. Beds/SFX all stay in. */
export function listenSet(tracks: StudioTrack[]): Set<string> {
  const keep = new Set<string>()
  const byPerson = new Map<string, StudioTrack[]>()
  for (const track of tracks) {
    const list = byPerson.get(track.personId) || []
    list.push(track)
    byPerson.set(track.personId, list)
  }
  for (const takes of byPerson.values()) {
    const voice = takes.some((t) => isVoiceRole(t.role))
    const withBuf = takes.filter((t) => t.buffer)
    if (!voice || withBuf.length <= 1) {
      for (const t of takes) keep.add(t.id)
      continue
    }
    const chosen = withBuf.find((t) => t.listen) || withBuf[withBuf.length - 1]
    for (const t of takes) {
      if (!t.buffer) continue
      if (t.layered || t.id === chosen.id || (t.compRanges || []).length > 0) keep.add(t.id)
    }
  }
  return keep
}

export function withListenTake(tracks: StudioTrack[], id: string): StudioTrack[] {
  const target = tracks.find((t) => t.id === id)
  if (!target) return tracks
  return tracks.map((t) => {
    if (t.id === id) return { ...t, listen: true, muted: false }
    if (t.personId === target.personId && isVoiceRole(t.role) && !t.layered) {
      return { ...t, listen: false }
    }
    return t
  })
}

function mergeCompRanges(ranges: CompRange[]): CompRange[] {
  const sorted = [...ranges].filter((r) => r.end - r.start > 0.02).sort((a, b) => a.start - b.start)
  const out: CompRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end + 0.02) last.end = Math.max(last.end, r.end)
    else out.push({ start: r.start, end: r.end })
  }
  return out
}

function subtractCompRange(ranges: CompRange[], start: number, end: number): CompRange[] {
  const out: CompRange[] = []
  for (const r of ranges) {
    if (r.end <= start || r.start >= end) {
      out.push(r)
      continue
    }
    if (r.start < start) out.push({ start: r.start, end: start })
    if (r.end > end) out.push({ start: end, end: r.end })
  }
  return mergeCompRanges(out)
}

/** Assign this take to a session range. Other takes for that person yield that window. */
export function assignCompRange(tracks: StudioTrack[], trackId: string, start: number, end: number): StudioTrack[] {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b - a < 0.05) return tracks
  const target = tracks.find((t) => t.id === trackId)
  if (!target || !isVoiceRole(target.role)) return tracks
  return tracks.map((t) => {
    if (t.personId !== target.personId || !isVoiceRole(t.role)) return t
    if (t.id === trackId) {
      return {
        ...t,
        muted: false,
        compRanges: mergeCompRanges([...(t.compRanges || []), { start: a, end: b }]),
      }
    }
    return { ...t, compRanges: subtractCompRange(t.compRanges || [], a, b) }
  })
}

export function clearCompRanges(tracks: StudioTrack[], personId: string): StudioTrack[] {
  return tracks.map((t) => (t.personId === personId ? { ...t, compRanges: [] } : t))
}

export function takeAudibleAt(tracks: StudioTrack[], track: StudioTrack, t: number): boolean {
  if (track.layered) return true
  if (!isVoiceRole(track.role)) return true
  const siblings = tracks.filter((x) => x.personId === track.personId && isVoiceRole(x.role) && x.buffer && !x.muted)
  if (siblings.length <= 1) return true
  const covering = siblings.find((s) => (s.compRanges || []).some((r) => t >= r.start && t < r.end))
  if (covering) return covering.id === track.id
  const chosen = siblings.find((s) => s.listen) || siblings[siblings.length - 1]
  return chosen.id === track.id
}

function audibleTracks(tracks: StudioTrack[]): StudioTrack[] {
  const anySolo = tracks.some((t) => t.solo && t.buffer)
  const listening = listenSet(tracks)
  return tracks.filter((t) => {
    if (!t.buffer) return false
    if (t.muted) return false
    if (anySolo && !t.solo) return false
    if (!listening.has(t.id)) return false
    return true
  })
}

export function audibleForMix(tracks: StudioTrack[], excludeIds: string[] = []) {
  return audibleTracks(tracks.filter((t) => !excludeIds.includes(t.id)))
}

/**
 * Session-time windows where `track` is the audible take (same rule as takeAudibleAt),
 * precomputed once instead of scanning siblings per sample. Returns null when the take
 * is audible everywhere. Interior edges are take switch points and get a crossfade.
 */
export function takeAudibleWindows(tracks: StudioTrack[], track: StudioTrack): CompWindow[] | null {
  if (track.layered || !isVoiceRole(track.role)) return null
  const siblings = tracks.filter((x) => x.personId === track.personId && isVoiceRole(x.role) && x.buffer && !x.muted)
  if (siblings.length <= 1) return null
  const edges = new Set<number>()
  for (const s of siblings) {
    for (const r of s.compRanges || []) {
      edges.add(r.start)
      edges.add(r.end)
    }
  }
  const bounds = [...edges].sort((a, b) => a - b)
  if (!bounds.length) return takeAudibleAt(tracks, track, 0) ? null : []
  const windows: CompWindow[] = []
  const cells: [number, number][] = [[-Infinity, bounds[0]]]
  for (let i = 0; i + 1 < bounds.length; i++) cells.push([bounds[i], bounds[i + 1]])
  cells.push([bounds[bounds.length - 1], Infinity])
  for (const [a, b] of cells) {
    const probe = !Number.isFinite(a) ? b - 1 : !Number.isFinite(b) ? a + 1 : (a + b) / 2
    if (!takeAudibleAt(tracks, track, probe)) continue
    const last = windows[windows.length - 1]
    if (last && last.end === a) last.end = b
    else windows.push({ start: a, end: b, xfadeIn: false, xfadeOut: false })
  }
  for (const w of windows) {
    w.xfadeIn = Number.isFinite(w.start)
    w.xfadeOut = Number.isFinite(w.end)
  }
  if (windows.length === 1 && !windows[0].xfadeIn && !windows[0].xfadeOut) return null
  return windows
}

const resampleCache = new WeakMap<AudioBuffer, Map<number, Float32Array[]>>()

/** Channel data (max 2) at `rate` — band-limited sinc, cached per decoded buffer. */
export function channelsAtRate(buffer: AudioBuffer, rate: number): Float32Array[] {
  const raw = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, ch) => buffer.getChannelData(ch))
  if (buffer.sampleRate === rate) return raw
  let byRate = resampleCache.get(buffer)
  if (!byRate) {
    byRate = new Map()
    resampleCache.set(buffer, byRate)
  }
  const hit = byRate.get(rate)
  if (hit) return hit
  const out = raw.map((c) => resampleSinc(c, buffer.sampleRate, rate))
  byRate.set(rate, out)
  return out
}

/** Synchronous band-limited resample of an AudioBuffer (returns the same buffer when rates match). */
export function toSessionRateSync(buffer: AudioBuffer, sampleRate = SESSION_SAMPLE_RATE): AudioBuffer {
  if (buffer.sampleRate === sampleRate) return buffer
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    resampleSinc(buffer.getChannelData(ch), buffer.sampleRate, sampleRate),
  )
  const out = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate })
  chans.forEach((c, ch) => out.copyToChannel(c as Float32Array<ArrayBuffer>, ch))
  return out
}

/**
 * Resample to the session rate (48 kHz default) with OfflineAudioContext — the browser's
 * own band-limited resampler. Falls back to the sinc resampler outside the browser.
 */
export async function toSessionRate(buffer: AudioBuffer, sampleRate = SESSION_SAMPLE_RATE): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate) return buffer
  if (typeof OfflineAudioContext === 'undefined') return toSessionRateSync(buffer, sampleRate)
  try {
    const length = Math.max(1, Math.round((buffer.length * sampleRate) / buffer.sampleRate))
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, length, sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(0)
    return await ctx.startRendering()
  } catch {
    return toSessionRateSync(buffer, sampleRate)
  }
}

export type MixdownOptions = {
  startSec?: number
  endSec?: number
  /** Session rate. Default 48 kHz; every track is resampled to it. */
  sampleRate?: number
  /** Equal-power crossfade at comp / take switch points. Default 16 ms. */
  crossfadeSec?: number
}

/**
 * Plain-data mix plan (for the worker path or custom renders).
 * `resampleOnMainThread: false` leaves source rates as-is so the worker resamples.
 */
export function buildMixPlan(tracks: StudioTrack[], opts?: MixdownOptions & { resampleOnMainThread?: boolean }): MixPlan {
  const live = audibleTracks(tracks)
  const sampleRate = opts?.sampleRate || SESSION_SAMPLE_RATE
  const fullEnd = sessionDuration(live)
  const startSec = Math.max(0, opts?.startSec ?? 0)
  const endSec = Math.max(startSec, Math.min(fullEnd, opts?.endSec ?? fullEnd))
  const main = opts?.resampleOnMainThread !== false
  const plans: MixTrackPlan[] = live.map((track) => {
    const buf = track.buffer!
    const channels = main
      ? channelsAtRate(buf, sampleRate)
      : Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, ch) => buf.getChannelData(ch))
    return {
      channels,
      sourceRate: main ? sampleRate : buf.sampleRate,
      pan: track.pan,
      volume: track.volume,
      automation: track.automation || [],
      clips: clipsOf(track)
        .filter((c) => !c.muted)
        .map((c) => ({
          sourceStart: c.sourceStart,
          duration: c.duration,
          offset: c.offset,
          gain: c.gain,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
        })),
      windows: takeAudibleWindows(tracks, track),
    }
  })
  return { sampleRate, startSec, endSec, xfadeSec: opts?.crossfadeSec ?? DEFAULT_XFADE_SEC, tracks: plans }
}

/**
 * Sum all audible tracks into a stereo master with pan, gain, offset, fades.
 * Every track is resampled to the session rate (48 kHz unless `sampleRate` is given),
 * take switch points get an equal-power crossfade, and the output keeps float headroom —
 * nothing is clipped here; limit (renderMaster) and clamp at export.
 */
export function mixdownTracks(tracks: StudioTrack[], opts?: MixdownOptions): AudioBuffer {
  const sampleRate = opts?.sampleRate || SESSION_SAMPLE_RATE
  if (audibleTracks(tracks).length === 0) return emptyStereo(sampleRate, 1)
  const { left, right } = renderMixPlan(buildMixPlan(tracks, opts))
  const master = emptyStereo(sampleRate, left.length)
  master.copyToChannel(left as Float32Array<ArrayBuffer>, 0)
  master.copyToChannel(right as Float32Array<ArrayBuffer>, 1)
  return master
}

/** Resample / stretch length by copying into a target sample rate (nearest). */
export function resampleNearest(buffer: AudioBuffer, targetRate: number): AudioBuffer {
  if (buffer.sampleRate === targetRate) return cloneAudioBuffer(buffer)
  const ratio = targetRate / buffer.sampleRate
  const length = Math.max(1, Math.round(buffer.length * ratio))
  const out = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: targetRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      dst[i] = src[Math.min(src.length - 1, Math.floor(i / ratio))]
    }
  }
  return out
}

export function splitBuffer(
  buffer: AudioBuffer,
  atSec: number,
): [AudioBuffer, AudioBuffer] {
  const at = Math.max(0, Math.min(buffer.duration, atSec))
  const aLen = Math.max(1, Math.floor(at * buffer.sampleRate))
  const bLen = Math.max(1, buffer.length - aLen)
  const a = new AudioBuffer({
    length: aLen,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  const b = new AudioBuffer({
    length: bLen,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    a.copyToChannel(data.subarray(0, aLen), ch)
    b.copyToChannel(data.subarray(aLen), ch)
  }
  return [a, b]
}

export function appendBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  const rate = a.sampleRate
  const bb = b.sampleRate === rate ? b : toSessionRateSync(b, rate)
  const channels = Math.max(a.numberOfChannels, bb.numberOfChannels)
  const out = new AudioBuffer({
    length: a.length + bb.length,
    numberOfChannels: channels,
    sampleRate: rate,
  })
  for (let ch = 0; ch < channels; ch++) {
    const dst = out.getChannelData(ch)
    const srcA = a.getChannelData(Math.min(ch, a.numberOfChannels - 1))
    const srcB = bb.getChannelData(Math.min(ch, bb.numberOfChannels - 1))
    dst.set(srcA, 0)
    dst.set(srcB, a.length)
  }
  return out
}

export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const out = cloneAudioBuffer(buffer)
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    out.getChannelData(ch).reverse()
  }
  return out
}

export function detectSilenceGaps(
  buffer: AudioBuffer,
  threshold = 0.018,
  minGapSec = 0.45,
): { start: number; end: number }[] {
  const data = buffer.getChannelData(0)
  const minGap = Math.floor(minGapSec * buffer.sampleRate)
  const gaps: { start: number; end: number }[] = []
  let silentStart = -1
  for (let i = 0; i < data.length; i++) {
    const quiet = Math.abs(data[i]) < threshold
    if (quiet && silentStart < 0) silentStart = i
    if ((!quiet || i === data.length - 1) && silentStart >= 0) {
      const end = quiet ? i : i
      if (end - silentStart >= minGap) {
        gaps.push({
          start: silentStart / buffer.sampleRate,
          end: end / buffer.sampleRate,
        })
      }
      silentStart = -1
    }
  }
  return gaps
}

/** Remove long silence gaps, leaving a short breath. */
export function stripSilence(
  buffer: AudioBuffer,
  threshold = 0.018,
  minGapSec = 0.55,
  keepSec = 0.12,
): AudioBuffer {
  const gaps = detectSilenceGaps(buffer, threshold, minGapSec)
  if (gaps.length === 0) return cloneAudioBuffer(buffer)

  const keep = Math.floor(keepSec * buffer.sampleRate)
  const keepRanges: [number, number][] = []
  let cursor = 0
  for (const gap of gaps) {
    const g0 = Math.floor(gap.start * buffer.sampleRate)
    const g1 = Math.floor(gap.end * buffer.sampleRate)
    if (g0 > cursor) keepRanges.push([cursor, g0])
    keepRanges.push([g0, Math.min(g1, g0 + keep)])
    cursor = g1
  }
  if (cursor < buffer.length) keepRanges.push([cursor, buffer.length])

  const total = keepRanges.reduce((n, [a, b]) => n + Math.max(0, b - a), 0)
  const out = new AudioBuffer({
    length: Math.max(1, total),
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  let write = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch)
    const dst = out.getChannelData(ch)
    write = 0
    for (const [a, b] of keepRanges) {
      const slice = src.subarray(a, b)
      dst.set(slice, write)
      write += slice.length
    }
  }
  return out
}

export function peakMeter(buffer: AudioBuffer): { peak: number; rms: number } {
  let peak = 0
  let sum = 0
  let n = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i])
      peak = Math.max(peak, a)
      sum += a * a
      n++
    }
  }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0 }
}

export function dbFromLinear(n: number) {
  if (n <= 0) return -Infinity
  return 20 * Math.log10(n)
}
