/**
 * Apply an approved post-production plan to decoded episode audio, entirely in the browser:
 * bleeps → voice disguise → cuts (with crossfades). Also remaps word timings and chapters
 * onto the new timeline. All times are seconds on the ORIGINAL timeline.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'
import { disguiseRange, type DisguiseSettings } from './voice-disguise'

export type BleepMode = 'tone' | 'silence' | 'roomtone'

export const BLEEP_MODE_LABEL: Record<BleepMode, string> = {
  tone: 'Bleep tone (1 kHz)',
  silence: 'Silence',
  roomtone: 'Room tone (sounds natural)',
}

export type Bleep = { start: number; end: number }
export type DisguiseRegion = { start: number; end: number; settings: DisguiseSettings }
/** Remove [start, end). */
export type Cut = { start: number; end: number }

export type EditPlan = {
  bleeps: Bleep[]
  bleepMode: BleepMode
  /** Extra cover around each bleep — Whisper word times can be ~0.1 s off. */
  bleepPad: number
  disguise: DisguiseRegion[]
  cuts: Cut[]
}

export const BLEEP_HZ = 1000
/** −20 dBFS */
export const BLEEP_GAIN = Math.pow(10, -20 / 20)
export const BLEEP_RAMP_S = 0.01
/** Default cover either side of a protected word — Whisper word times can be ~0.1 s off. */
export const BLEEP_PAD_S = 0.08
export const CUT_XFADE_S = 0.01
export const ROOM_TONE_WINDOW_S = 0.5

/** Merge overlapping / touching ranges; drops empty ones. */
export function mergeRanges<T extends { start: number; end: number }>(ranges: T[], gap = 0): { start: number; end: number }[] {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => ({ start: Math.max(0, r.start), end: r.end }))
    .sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end + gap) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** Padded, merged cover ranges for a set of bleeps (clamped to the file when `duration` is given). */
export function bleepRanges(bleeps: Bleep[], pad = BLEEP_PAD_S, duration = Infinity) {
  return mergeRanges(bleeps.map((b) => ({ start: b.start - pad, end: Math.min(duration, b.end + pad) })))
}

/**
 * Quietest non-silent stretch of the recording (per channel) — the natural background used by
 * "room tone" cover so a bleep does not sound like a dropout. Null for a fully silent file.
 */
export function findRoomTone(buffer: AudioBuffer, windowSec = ROOM_TONE_WINDOW_S): Float32Array[] | null {
  const rate = buffer.sampleRate
  const win = Math.max(1, Math.round(windowSec * rate))
  if (buffer.length < win) return null
  const hop = Math.max(1, Math.floor(win / 2))
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  let best = -1
  let bestRms = Infinity
  for (let s = 0; s + win <= buffer.length; s += hop) {
    let sum = 0
    for (const ch of chans) for (let i = s; i < s + win; i += 2) sum += ch[i] * ch[i]
    const rms = Math.sqrt(sum / ((win / 2) * chans.length))
    if (rms > 1e-5 && rms < bestRms) {
      bestRms = rms
      best = s
    }
  }
  if (best < 0) return null
  return chans.map((ch) => ch.slice(best, best + win))
}

/** Two overlapping copies with equal-power windows: a seamless loop of a short noise sample. */
function loopedRoomTone(rt: Float32Array, i: number) {
  const L = rt.length
  const p = (i % L) / L
  const half = Math.floor(L / 2)
  return rt[i % L] * Math.sin(Math.PI * p) + rt[(i + half) % L] * Math.abs(Math.cos(Math.PI * p))
}

/**
 * Replace audio in each range with a 1 kHz tone at −20 dBFS, silence, or looped room tone.
 * 10 ms ramps sit outside the padded range so the word itself is always fully replaced. In place.
 */
export function applyBleeps(buffer: AudioBuffer, bleeps: Bleep[], mode: BleepMode, pad: number = BLEEP_PAD_S, roomTone?: Float32Array[] | null) {
  const rate = buffer.sampleRate
  const ramp = Math.max(1, Math.round(BLEEP_RAMP_S * rate))
  const ranges = bleepRanges(bleeps, pad, buffer.duration)
  const room = mode === 'roomtone' ? (roomTone === undefined ? findRoomTone(buffer) : roomTone) : null
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    const rt = room?.[c] ?? room?.[0] ?? null
    for (const r of ranges) {
      const a = Math.max(0, Math.floor(r.start * rate) - ramp)
      const b = Math.min(data.length, Math.ceil(r.end * rate) + ramp)
      for (let i = a; i < b; i++) {
        let m = 1
        if (i - a < ramp) m = (i - a) / ramp
        else if (b - i <= ramp) m = (b - i) / ramp
        let cover = 0
        if (mode === 'tone') cover = BLEEP_GAIN * Math.sin((2 * Math.PI * BLEEP_HZ * i) / rate)
        else if (rt && rt.length > 1) cover = loopedRoomTone(rt, i - a)
        data[i] = data[i] * (1 - m) + cover * m
      }
    }
  }
}

/** Time map for a set of cuts with crossfade overlap X: each junction also shortens by X. */
export function makeTimeMap(cuts: Cut[], duration: number, xfade = CUT_XFADE_S) {
  const merged = mergeRanges(cuts).filter((c) => c.start < duration)
  return {
    cuts: merged,
    /** Original time → new time; times inside a cut snap to the cut point. */
    map(t: number) {
      let removed = 0
      for (const c of merged) {
        if (t >= c.end) removed += c.end - c.start + xfade
        else if (t > c.start) return Math.max(0, c.start - removed - xfade / 2)
        else break
      }
      return Math.max(0, t - removed)
    },
    /** True when [s, e) lies mostly inside a cut (the word was removed). */
    removes(s: number, e: number) {
      const len = Math.max(1e-6, e - s)
      let inside = 0
      for (const c of merged) inside += Math.max(0, Math.min(e, c.end) - Math.max(s, c.start))
      return inside / len > 0.5
    },
  }
}

/** Build a new buffer without the cut ranges, joined with equal-power crossfades. */
export function applyCuts(buffer: AudioBuffer, cuts: Cut[], xfade = CUT_XFADE_S): AudioBuffer {
  const rate = buffer.sampleRate
  const merged = mergeRanges(cuts)
  if (!merged.length) return buffer
  const X = Math.max(1, Math.round(xfade * rate))
  // Kept segments in samples.
  const keep: [number, number][] = []
  let pos = 0
  for (const c of merged) {
    const a = Math.floor(c.start * rate)
    const b = Math.min(buffer.length, Math.ceil(c.end * rate))
    if (a > pos) keep.push([pos, a])
    pos = Math.max(pos, b)
  }
  if (pos < buffer.length) keep.push([pos, buffer.length])
  const segs = keep.filter(([a, b]) => b - a > 2 * X)
  const total = segs.reduce((n, [a, b]) => n + (b - a), 0) - X * Math.max(0, segs.length - 1)
  const out = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: buffer.numberOfChannels, sampleRate: rate })
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c)
    const dst = out.getChannelData(c)
    let w = 0
    segs.forEach(([a, b], idx) => {
      if (idx === 0) {
        dst.set(src.subarray(a, b), 0)
        w = b - a
        return
      }
      // Overlap the first X samples of this segment with the last X already written.
      const start = w - X
      for (let i = 0; i < X; i++) {
        const t = (i + 0.5) / X
        const fadeIn = Math.sin((Math.PI / 2) * t)
        const fadeOut = Math.cos((Math.PI / 2) * t)
        dst[start + i] = dst[start + i] * fadeOut + src[a + i] * fadeIn
      }
      dst.set(src.subarray(a + X, b), w)
      w = start + (b - a)
    })
  }
  return out
}

export function copyBuffer(buffer: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate })
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c), c)
  return out
}

export type RenderProgress = { stage: string; fraction?: number }

/** Run the whole plan. Never mutates `source`. */
export async function renderPlan(source: AudioBuffer, plan: EditPlan, onProgress?: (p: RenderProgress) => void): Promise<AudioBuffer> {
  const work = copyBuffer(source)
  if (plan.bleeps.length) {
    onProgress?.({ stage: 'Bleeping protected words…' })
    applyBleeps(work, plan.bleeps, plan.bleepMode, plan.bleepPad)
  }
  const regions = plan.disguise.filter((d) => d.end > d.start)
  const totalLen = regions.reduce((n, r) => n + (r.end - r.start), 0) || 1
  let done = 0
  for (const r of regions) {
    const len = r.end - r.start
    await disguiseRange(work, r.start, r.end, r.settings, (f) =>
      onProgress?.({ stage: 'Disguising voice…', fraction: (done + f * len) / totalLen }),
    )
    done += len
  }
  if (plan.cuts.length) {
    onProgress?.({ stage: 'Removing fillers and tightening pauses…' })
    return applyCuts(work, plan.cuts)
  }
  return work
}

/** Word timings on the new timeline; words inside cuts are dropped. */
export function remapWords(words: TranscriptWord[], cuts: Cut[], duration: number): TranscriptWord[] {
  const tm = makeTimeMap(cuts, duration)
  if (!tm.cuts.length) return words
  return words
    .filter((w) => !tm.removes(w.s, w.e))
    .map((w) => {
      const s = tm.map(w.s)
      return { w: w.w, s: Math.round(s * 100) / 100, e: Math.round(Math.max(s, tm.map(w.e)) * 100) / 100 }
    })
}

export function remapChapters<T extends { start_ms: number }>(chapters: T[], cuts: Cut[], duration: number): T[] {
  const tm = makeTimeMap(cuts, duration)
  if (!tm.cuts.length) return chapters
  return chapters.map((c) => ({ ...c, start_ms: Math.round(tm.map(c.start_ms / 1000) * 1000) }))
}
