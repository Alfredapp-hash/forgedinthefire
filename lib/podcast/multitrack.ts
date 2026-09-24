/** Multi-track mix / schedule helpers for the podcast vocal studio. */

import type { EffectId } from '@/lib/podcast/effects'

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
  if (t <= points[0].t) return points[0].v
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t) {
      const a = points[i - 1]
      const b = points[i]
      const span = b.t - a.t
      if (span <= 0) return b.v
      return a.v + (b.v - a.v) * ((t - a.t) / span)
    }
  }
  return points[points.length - 1].v
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

/** Sum all audible tracks into a stereo master with pan, gain, offset, fades. */
export function mixdownTracks(
  tracks: StudioTrack[],
  opts?: { startSec?: number; endSec?: number; sampleRate?: number },
): AudioBuffer {
  const live = audibleTracks(tracks)
  if (live.length === 0) {
    return emptyStereo(opts?.sampleRate || 44100, 1)
  }

  const sampleRate =
    opts?.sampleRate ||
    live.find((t) => t.buffer)?.buffer?.sampleRate ||
    44100

  const fullEnd = sessionDuration(live)
  const startSec = Math.max(0, opts?.startSec ?? 0)
  const endSec = Math.min(fullEnd, opts?.endSec ?? fullEnd)
  const length = Math.max(1, Math.ceil((endSec - startSec) * sampleRate))
  const master = emptyStereo(sampleRate, length)
  const L = master.getChannelData(0)
  const R = master.getChannelData(1)

  const startSample = Math.floor(startSec * sampleRate)

  for (const track of live) {
    const buf = monoToStereo(track.buffer!)
    const srcL = buf.getChannelData(0)
    const srcR = buf.getChannelData(1)
    const pan = Math.max(-1, Math.min(1, track.pan))
    const panL = Math.min(1, 1 - pan)
    const panR = Math.min(1, 1 + pan)
    const autom = track.automation || []

    for (const clip of clipsOf(track)) {
      if (clip.muted) continue
      const srcStart = Math.floor(clip.sourceStart * sampleRate)
      const clipLen = Math.max(1, Math.floor(clip.duration * sampleRate))
      const offsetSamples = Math.floor(clip.offset * sampleRate)
      const fadeInN = Math.floor(Math.max(0, clip.fadeIn) * sampleRate)
      const fadeOutN = Math.floor(Math.max(0, clip.fadeOut) * sampleRate)

      for (let i = 0; i < clipLen; i++) {
        const srcIdx = srcStart + i
        if (srcIdx < 0 || srcIdx >= buf.length) continue
        const abs = offsetSamples + i
        const masterIdx = abs - startSample
        if (masterIdx < 0 || masterIdx >= length) continue
        if (!takeAudibleAt(tracks, track, abs / sampleRate)) continue

        let env = track.volume * clip.gain * automationAt(autom, abs / sampleRate)
        if (fadeInN > 0 && i < fadeInN) env *= i / fadeInN
        if (fadeOutN > 0 && i > clipLen - fadeOutN) env *= (clipLen - i) / fadeOutN

        L[masterIdx] = clamp(L[masterIdx] + srcL[srcIdx] * panL * env)
        R[masterIdx] = clamp(R[masterIdx] + srcR[srcIdx] * panR * env)
      }
    }
  }

  return master
}

function clamp(n: number) {
  return Math.max(-1, Math.min(1, n))
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
  const bb = b.sampleRate === rate ? b : resampleNearest(b, rate)
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
