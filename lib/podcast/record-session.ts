/** Punch-in record: play the mix as a live cue while a new take is captured. */

import {
  audibleForMix,
  automationAt,
  clipsOf,
  lastTakeEnd,
  sessionDuration,
  takeAudibleWindows,
  type StudioTrack,
} from '@/lib/podcast/multitrack'
import type { LaneCapture } from '@/lib/podcast/capture'
import { compGainAt, DEFAULT_XFADE_SEC } from '@/lib/podcast/engine/mix-core'
import { latencyCompensationFrames } from '@/lib/podcast/engine/latency'

export { createSessionContext } from '@/lib/podcast/engine/context'
export { latencyCompensationFrames } from '@/lib/podcast/engine/latency'

export type RecMode = 'after_mix' | 'after_mine' | 'at_playhead' | 'from_start'

export const REC_MODE_META: { id: RecMode; label: string; hint: string }[] = [
  {
    id: 'after_mix',
    label: 'After the mix',
    hint: 'Start this person when the current mix ends. Use this when the guest comes in after the host.',
  },
  {
    id: 'after_mine',
    label: 'After my last take',
    hint: 'Pickup: continue this person’s previous take. If they have no audio yet, this falls back to the end of the mix.',
  },
  {
    id: 'at_playhead',
    label: 'At playhead',
    hint: 'Punch in at the mix cursor. Other lanes play in your headphones while you record a new take.',
  },
  {
    id: 'from_start',
    label: 'From start',
    hint: 'Play the whole mix from 0:00 and lay a new take on its own lane — wait, then come in naturally.',
  },
]

export function punchInTime(
  mode: RecMode,
  playhead: number,
  tracks: StudioTrack[],
  personId: string,
) {
  if (mode === 'from_start') return 0
  if (mode === 'at_playhead') return Math.max(0, playhead)
  if (mode === 'after_mine') {
    const mine = lastTakeEnd(tracks, personId)
    return mine > 0.05 ? mine : sessionDuration(tracks)
  }
  return sessionDuration(tracks)
}

/** One punch time for every armed person so Host + Guest land together. */
export function sharedPunchInTime(
  mode: RecMode,
  playhead: number,
  tracks: StudioTrack[],
  personIds: string[],
) {
  if (personIds.length <= 1) return punchInTime(mode, playhead, tracks, personIds[0] || '')
  if (mode === 'from_start') return 0
  if (mode === 'at_playhead') return Math.max(0, playhead)
  return sessionDuration(tracks)
}

export type CueHandle = {
  ctx: AudioContext
  stop: () => void
  sessionTime: () => number
  /** Live mix tap for guest headphones. Never feed this into a Guest take. */
  stream: MediaStream
  /** AudioContext frame at which session time `fromSec` plays (cue clock origin). */
  startFrame?: number
  /** Session seconds at `startFrame`. */
  fromSec?: number
  /** True when the context was supplied by the caller (it is not closed on stop). */
  sharedContext?: boolean
}

function audibleCueTracks(tracks: StudioTrack[], excludeIds: string[]) {
  return audibleForMix(tracks, excludeIds)
}

/** Schedule BufferSources from `fromSec` — no bounce, no WAV. */
export function startLiveMix(
  tracks: StudioTrack[],
  opts: {
    fromSec: number
    excludeIds?: string[]
    gain?: number
    /** Host speakers/phones. Default on. Guest tap is always created. */
    monitor?: boolean
    /** Shared session AudioContext (same one passed to startLaneCapture). Not closed on stop. */
    context?: AudioContext
    /** Comp / take-switch crossfade, matches mixdownTracks. Default 16 ms. */
    crossfadeSec?: number
    /** Schedule start slightly ahead so all sources begin on the same frame. Default 0. */
    startDelaySec?: number
  },
): CueHandle | null {
  const fromSec = Math.max(0, opts.fromSec)
  const live = audibleCueTracks(tracks, opts.excludeIds || [])
  if (live.length === 0) return null

  const shared = !!opts.context && opts.context.state !== 'closed'
  const ctx = shared ? opts.context! : new AudioContext()
  void ctx.resume()
  const xfade = opts.crossfadeSec ?? DEFAULT_XFADE_SEC
  const master = ctx.createGain()
  master.gain.value = opts.gain ?? 1
  if (opts.monitor !== false) master.connect(ctx.destination)
  let stream = new MediaStream()
  try {
    const dest = ctx.createMediaStreamDestination()
    master.connect(dest)
    stream = dest.stream
    const tap = stream.getAudioTracks()[0]
    if (tap && 'contentHint' in tap) tap.contentHint = 'music'
  } catch {
    /* captureStream / MediaStreamDestination missing — host still hears the mix */
  }

  const sources: AudioBufferSourceNode[] = []
  const nodes: AudioNode[] = [master]
  const origin = ctx.currentTime + Math.max(0, opts.startDelaySec ?? 0)

  for (const track of live) {
    const buf = track.buffer!
    const panVal = Math.max(-1, Math.min(1, track.pan))
    // Same precomputed comp windows + equal-power crossfades as the offline mixdown.
    const windows = takeAudibleWindows(tracks, track)
    const switchTimes: number[] = []
    if (windows) {
      for (const w of windows) {
        for (const edge of [w.xfadeIn ? w.start : NaN, w.xfadeOut ? w.end : NaN]) {
          if (!Number.isFinite(edge)) continue
          for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) switchTimes.push(edge + k * xfade)
        }
      }
    }
    for (const clip of clipsOf(track)) {
      if (clip.muted) continue
      const clipEnd = clip.offset + clip.duration
      if (clipEnd <= fromSec + 0.001) continue
      const offsetInto = Math.max(0, fromSec - clip.offset)
      if (offsetInto >= clip.duration - 0.001) continue
      const remain = clip.duration - offsetInto
      const sourceOffset = clip.sourceStart + offsetInto
      if (sourceOffset >= buf.duration) continue

      const source = ctx.createBufferSource()
      source.buffer = buf
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      pan.pan.value = panVal
      source.connect(g)
      g.connect(pan)
      pan.connect(master)
      nodes.push(g, pan)

      const startDelay = Math.max(0, clip.offset - fromSec)
      const when = origin + startDelay
      const playFrom = fromSec + startDelay
      const playUntil = clipEnd
      const step = 0.05
      const levelAt = (t: number) => {
        const into = t - clip.offset
        let fade = 1
        if (clip.fadeIn > 0 && into < clip.fadeIn) fade *= into / clip.fadeIn
        if (clip.fadeOut > 0 && into > clip.duration - clip.fadeOut) {
          fade *= Math.max(0, (clip.duration - into) / clip.fadeOut)
        }
        return Math.max(
          0.0001,
          Math.max(0.0001, compGainAt(windows, t, xfade)) *
            track.volume *
            clip.gain *
            automationAt(track.automation, t) *
            fade,
        )
      }
      g.gain.setValueAtTime(levelAt(playFrom), when)
      const times: number[] = []
      for (let t = playFrom + step; t < playUntil; t += step) times.push(t)
      for (const t of switchTimes) if (t > playFrom && t < playUntil) times.push(t)
      times.sort((a, b) => a - b)
      for (const t of times) {
        g.gain.linearRampToValueAtTime(levelAt(t), origin + (t - fromSec))
      }
      g.gain.linearRampToValueAtTime(levelAt(playUntil), origin + (playUntil - fromSec))

      source.start(when, sourceOffset, remain)
      sources.push(source)
    }
  }

  const teardown = () => {
    for (const node of nodes) {
      try {
        node.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    if (!shared) void ctx.close()
  }

  if (sources.length === 0) {
    teardown()
    return null
  }

  return {
    ctx,
    stream,
    startFrame: Math.round(origin * ctx.sampleRate),
    fromSec,
    sharedContext: shared,
    sessionTime() {
      if (ctx.state === 'closed') return fromSec
      return fromSec + Math.max(0, ctx.currentTime - origin)
    },
    stop() {
      for (const source of sources) {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
      }
      for (const track of stream.getAudioTracks()) {
        try {
          track.stop()
        } catch {
          /* already ended */
        }
      }
      teardown()
    },
  }
}

/**
 * Seconds to trim from the head of a decoded punch capture so it lines up with the cue:
 *   preroll + (cueStartFrame − captureStartFrame)/sr + round-trip latency
 * where round-trip = ctx.outputLatency + ctx.baseLatency + track latency, or the
 * measured loop-back value (measureRoundTripLatency) when given. The frame delta is used
 * only when cue and capture share one AudioContext (pass `context` to both).
 * Call after `capture.done` resolves.
 */
export function punchTrimSec(opts: {
  prerollSec: number
  capture: LaneCapture
  cue?: CueHandle | null
  roundTripSec?: number | null
  /** Set false to skip device latency (e.g. a remote guest stream). Default true. */
  compensateLatency?: boolean
}): number {
  const timing = opts.capture.timing?.()
  const pre = Math.max(0, opts.prerollSec)
  if (!timing) return pre
  const cue = opts.cue
  const sameClock = !!cue && cue.startFrame != null && timing.context === cue.ctx && timing.startFrame != null
  const cueCtx = cue?.ctx
  const frames = latencyCompensationFrames({
    sampleRate: timing.sampleRate,
    cueStartFrame: sameClock ? cue!.startFrame : null,
    captureStartFrame: sameClock ? timing.startFrame : null,
    outputLatency: opts.compensateLatency === false ? 0 : cueCtx && typeof cueCtx.outputLatency === 'number' ? cueCtx.outputLatency : timing.outputLatency,
    baseLatency: opts.compensateLatency === false ? 0 : cueCtx && typeof cueCtx.baseLatency === 'number' ? cueCtx.baseLatency : timing.baseLatency,
    inputLatency: opts.compensateLatency === false ? 0 : timing.inputLatency,
    measuredRoundTripSec: opts.compensateLatency === false ? null : opts.roundTripSec ?? null,
  })
  return Math.max(0, pre + frames / timing.sampleRate)
}

/** Loop-back click calibration (see worklet-capture.measureRoundTripLatency). */
export async function measureRoundTripLatency(ctx: AudioContext, stream: MediaStream): Promise<number | null> {
  const mod = await import('@/lib/podcast/worklet-capture')
  return mod.measureRoundTripLatency(ctx, stream)
}

/** Mix every audible lane except `excludeIds` and play from `fromSec`. */
export function startCuePlayback(
  tracks: StudioTrack[],
  fromSec: number,
  excludeIds: string[],
  gain = 1,
): CueHandle | null {
  return startLiveMix(tracks, { fromSec, excludeIds, gain })
}

export function clickAt(ctx: AudioContext, when: number, freq = 880) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.14, when + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.08)
}

export async function playCountIn(beats: number, bpm: number, signal?: AbortSignal, context?: AudioContext) {
  if (beats <= 0) return
  const shared = !!context && context.state !== 'closed'
  const ctx = shared ? context! : new AudioContext()
  await ctx.resume()
  const interval = 60 / Math.max(40, bpm)
  const start = ctx.currentTime + 0.05
  for (let i = 0; i < beats; i++) {
    clickAt(ctx, start + i * interval, i === beats - 1 ? 1320 : 880)
  }
  try {
    await waitUntilContextTime(ctx, start + beats * interval, signal)
  } finally {
    if (!shared) void ctx.close()
  }
}

export function waitUntilContextTime(
  ctx: AudioContext,
  targetTime: number,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      if (ctx.state === 'closed' || ctx.currentTime >= targetTime) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = window.setTimeout(() => resolve(), ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export function attachInputMeter(stream: MediaStream, onLevel: (peak: number) => void) {
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  src.connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  let raf = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i] - 128) / 128)
    }
    onLevel(peak)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    void ctx.close()
  }
}
