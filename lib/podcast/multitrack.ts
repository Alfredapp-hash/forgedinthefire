/** Multi-track mix / schedule helpers for the podcast vocal studio. */

export type TrackRole = 'vocal' | 'guest' | 'music' | 'bed' | 'sfx' | 'master' | 'custom'

export type StudioTrack = {
  id: string
  name: string
  role: TrackRole
  color: string
  /** Gain 0–2 */
  volume: number
  /** Pan −1 (L) … 1 (R) */
  pan: number
  muted: boolean
  solo: boolean
  armed: boolean
  /** Start offset on the timeline (seconds) */
  offset: number
  fadeIn: number
  fadeOut: number
  buffer: AudioBuffer | null
  /** Object URL for WaveSurfer display */
  url: string | null
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

export function createEmptyTrack(
  partial?: Partial<StudioTrack> & Pick<StudioTrack, 'name' | 'role'>,
): StudioTrack {
  const idx = Math.floor(Math.random() * TRACK_COLORS.length)
  return {
    id: newTrackId(),
    name: partial?.name || 'Track',
    role: partial?.role || 'custom',
    color: partial?.color || TRACK_COLORS[idx],
    volume: partial?.volume ?? 1,
    pan: partial?.pan ?? 0,
    muted: partial?.muted ?? false,
    solo: partial?.solo ?? false,
    armed: partial?.armed ?? false,
    offset: partial?.offset ?? 0,
    fadeIn: partial?.fadeIn ?? 0.05,
    fadeOut: partial?.fadeOut ?? 0.15,
    buffer: partial?.buffer ?? null,
    url: partial?.url ?? null,
  }
}

export function defaultSessionTracks(): StudioTrack[] {
  return [
    createEmptyTrack({ name: 'Vocal', role: 'vocal', color: '#53D6FF', armed: true }),
    createEmptyTrack({ name: 'Guest', role: 'guest', color: '#7CFFB2' }),
    createEmptyTrack({ name: 'Music bed', role: 'bed', color: '#FFB86B', volume: 0.35 }),
    createEmptyTrack({ name: 'Intro / outro', role: 'music', color: '#C4A1FF', volume: 0.55 }),
  ]
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

export function trackDuration(track: StudioTrack): number {
  if (!track.buffer) return 0
  return track.offset + track.buffer.duration
}

export function sessionDuration(tracks: StudioTrack[]): number {
  return Math.max(0, ...tracks.map(trackDuration))
}

function audibleTracks(tracks: StudioTrack[]): StudioTrack[] {
  const anySolo = tracks.some((t) => t.solo && t.buffer)
  return tracks.filter((t) => {
    if (!t.buffer) return false
    if (t.muted) return false
    if (anySolo && !t.solo) return false
    return true
  })
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

  for (const track of live) {
    const buf = monoToStereo(track.buffer!)
    const srcL = buf.getChannelData(0)
    const srcR = buf.getChannelData(1)
    const gain = track.volume
    const pan = Math.max(-1, Math.min(1, track.pan))
    const gainL = gain * Math.min(1, 1 - pan)
    const gainR = gain * Math.min(1, 1 + pan)
    const fadeInN = Math.floor(track.fadeIn * sampleRate)
    const fadeOutN = Math.floor(track.fadeOut * sampleRate)
    const offsetSamples = Math.floor(track.offset * sampleRate)

    for (let i = 0; i < buf.length; i++) {
      const abs = offsetSamples + i
      const masterIdx = abs - Math.floor(startSec * sampleRate)
      if (masterIdx < 0 || masterIdx >= length) continue

      let env = 1
      if (fadeInN > 0 && i < fadeInN) env *= i / fadeInN
      if (fadeOutN > 0 && i > buf.length - fadeOutN) env *= (buf.length - i) / fadeOutN

      L[masterIdx] = clamp(L[masterIdx] + srcL[i] * gainL * env)
      R[masterIdx] = clamp(R[masterIdx] + srcR[i] * gainR * env)
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
