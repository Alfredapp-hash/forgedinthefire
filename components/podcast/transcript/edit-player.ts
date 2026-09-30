/**
 * "Play with edits": real-time preview of the decoded episode with the cut regions skipped and
 * the protected-word covers muted, without an offline render. Each kept stretch is scheduled as
 * its own AudioBufferSourceNode with a 10 ms gain crossfade at the joins (the same length the
 * final render uses), so what staff hear is what "Apply" will produce — minus bleep tones and
 * voice disguise, which need the offline pass.
 */
import { keptSegments, skipCuts } from '@/lib/podcast/ai/text-edit'
import { CUT_XFADE_S, type Cut } from '@/lib/podcast/safety/render'

type Scheduled = { ctxStart: number; origStart: number; origEnd: number; nodes: AudioNode[]; src: AudioBufferSourceNode }

const MUTE_RAMP_S = 0.005

export class EditPlayer {
  private ctx: AudioContext | null = null
  private scheduled: Scheduled[] = []
  private raf = 0
  private cuts: Cut[] = []
  private mutes: { start: number; end: number }[] = []
  private lastTime = 0
  private generation = 0
  playing = false
  /** Current position on the ORIGINAL timeline, ~60×/s while playing. */
  onTime: ((t: number) => void) | null = null
  onEnd: (() => void) | null = null
  onState: ((playing: boolean) => void) | null = null

  constructor(private readonly buffer: AudioBuffer) {}

  get duration() {
    return this.buffer.duration
  }

  /** Cuts are skipped; mutes (bleep covers) are silenced. Takes effect from the next play(). */
  setPlan(cuts: Cut[], mutes: { start: number; end: number }[] = []) {
    this.cuts = cuts
    this.mutes = mutes
    if (this.playing) this.play(this.time())
  }

  private context() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor({ sampleRate: this.buffer.sampleRate })
    }
    return this.ctx
  }

  /** Original-timeline position (the last known one when paused). */
  time(): number {
    if (!this.playing || !this.ctx) return this.lastTime
    const now = this.ctx.currentTime
    let t = this.lastTime
    for (const s of this.scheduled) {
      const len = s.origEnd - s.origStart
      if (now < s.ctxStart) break
      t = now < s.ctxStart + len ? s.origStart + (now - s.ctxStart) : s.origEnd
    }
    this.lastTime = t
    return t
  }

  play(fromOriginal: number) {
    const ctx = this.context()
    void ctx.resume()
    this.stopNodes()
    const gen = ++this.generation
    const t0 = Math.max(0, Math.min(this.duration, skipCuts(fromOriginal, this.cuts, this.duration)))
    const segs = keptSegments(this.duration, this.cuts).filter((s) => s.end > t0).map((s, i) => (i === 0 ? { start: Math.max(s.start, t0), end: s.end } : s))
    if (!segs.length) {
      this.lastTime = this.duration
      this.setPlaying(false)
      this.onEnd?.()
      return
    }
    const X = CUT_XFADE_S
    const base = ctx.currentTime + 0.05
    let at = base
    this.scheduled = []
    segs.forEach((seg, i) => {
      const len = seg.end - seg.start
      const src = ctx.createBufferSource()
      src.buffer = this.buffer
      const edge = ctx.createGain()
      const mute = ctx.createGain()
      src.connect(edge)
      edge.connect(mute)
      mute.connect(ctx.destination)
      // Equal-power-ish edges: fade in at every join, fade out before the next one.
      const fadeIn = i > 0 && len > 2 * X
      const fadeOut = i < segs.length - 1 && len > 2 * X
      edge.gain.setValueAtTime(fadeIn ? 0 : 1, at)
      if (fadeIn) edge.gain.linearRampToValueAtTime(1, at + X)
      if (fadeOut) {
        edge.gain.setValueAtTime(1, at + len - X)
        edge.gain.linearRampToValueAtTime(0, at + len)
      }
      // Protected-word covers: silent in the preview (the render replaces them with tone / room tone).
      mute.gain.setValueAtTime(1, at)
      for (const m of this.mutes) {
        const a = Math.max(seg.start, m.start)
        const b = Math.min(seg.end, m.end)
        if (b <= a) continue
        const ta = at + (a - seg.start)
        const tb = at + (b - seg.start)
        mute.gain.setValueAtTime(1, Math.max(at, ta - MUTE_RAMP_S))
        mute.gain.linearRampToValueAtTime(0, ta)
        mute.gain.setValueAtTime(0, tb)
        mute.gain.linearRampToValueAtTime(1, Math.min(at + len, tb + MUTE_RAMP_S))
      }
      src.start(at, seg.start, len)
      if (i === segs.length - 1) {
        src.onended = () => {
          if (gen !== this.generation) return
          this.lastTime = seg.end
          this.setPlaying(false)
          this.onEnd?.()
        }
      }
      this.scheduled.push({ ctxStart: at, origStart: seg.start, origEnd: seg.end, nodes: [edge, mute], src })
      at += len - (fadeOut ? X : 0)
    })
    this.lastTime = t0
    this.setPlaying(true)
  }

  pause() {
    if (this.playing) this.lastTime = this.time()
    this.generation++
    this.stopNodes()
    this.setPlaying(false)
  }

  toggle(fromOriginal?: number) {
    if (this.playing) this.pause()
    else this.play(fromOriginal ?? this.lastTime)
  }

  seek(t: number) {
    const was = this.playing
    this.pause()
    this.lastTime = Math.max(0, Math.min(this.duration, t))
    if (was) this.play(this.lastTime)
    else this.onTime?.(this.lastTime)
  }

  dispose() {
    this.pause()
    this.onTime = null
    this.onEnd = null
    this.onState = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }

  private stopNodes() {
    for (const s of this.scheduled) {
      s.src.onended = null
      try {
        s.src.stop()
      } catch {
        /* not started yet */
      }
      s.src.disconnect()
      s.nodes.forEach((n) => n.disconnect())
    }
    this.scheduled = []
  }

  private setPlaying(on: boolean) {
    if (this.playing === on) return
    this.playing = on
    this.onState?.(on)
    cancelAnimationFrame(this.raf)
    if (on) {
      const tick = () => {
        if (!this.playing) return
        this.onTime?.(this.time())
        this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    } else this.onTime?.(this.lastTime)
  }
}
