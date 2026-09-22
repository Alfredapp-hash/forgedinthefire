/** Punch-in record: play the mix as a live cue while a new take is captured. */

import {
  audibleForMix,
  automationAt,
  clipsOf,
  lastTakeEnd,
  sessionDuration,
  takeAudibleAt,
  type StudioTrack,
} from '@/lib/podcast/multitrack'

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
  },
): CueHandle | null {
  const fromSec = Math.max(0, opts.fromSec)
  const live = audibleCueTracks(tracks, opts.excludeIds || [])
  if (live.length === 0) return null

  const ctx = new AudioContext()
  void ctx.resume()
  const master = ctx.createGain()
  master.gain.value = opts.gain ?? 1
  master.connect(ctx.destination)

  const sources: AudioBufferSourceNode[] = []
  const origin = ctx.currentTime

  for (const track of live) {
    const buf = track.buffer!
    const panVal = Math.max(-1, Math.min(1, track.pan))
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
          (takeAudibleAt(tracks, track, t) ? 1 : 0.0001) *
            track.volume *
            clip.gain *
            automationAt(track.automation, t) *
            fade,
        )
      }
      g.gain.setValueAtTime(levelAt(playFrom), when)
      for (let t = playFrom + step; t < playUntil; t += step) {
        g.gain.linearRampToValueAtTime(levelAt(t), origin + (t - fromSec))
      }
      g.gain.linearRampToValueAtTime(levelAt(playUntil), origin + (playUntil - fromSec))

      source.start(when, sourceOffset, remain)
      sources.push(source)
    }
  }

  if (sources.length === 0) {
    void ctx.close()
    return null
  }

  return {
    ctx,
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
      void ctx.close()
    },
  }
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

export async function playCountIn(beats: number, bpm: number, signal?: AbortSignal) {
  if (beats <= 0) return
  const ctx = new AudioContext()
  await ctx.resume()
  const interval = 60 / Math.max(40, bpm)
  const start = ctx.currentTime + 0.05
  for (let i = 0; i < beats; i++) {
    clickAt(ctx, start + i * interval, i === beats - 1 ? 1320 : 880)
  }
  try {
    await waitUntilContextTime(ctx, start + beats * interval, signal)
  } finally {
    void ctx.close()
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
