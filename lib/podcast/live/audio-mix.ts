/**
 * Live Program audio: host mic + guest mic + SFX → limiter → [air delay] → MediaStreamDestination.
 * The destination track (the *air* feed) is what WHIP sends and what the local recorder captures.
 *
 *   source → pre (fader) ─┬─► monitor (host headphones, guest only, undelayed)
 *                         └─► [voice disguise] → gate (mute) → Program → limiter ─┬─► meters
 *                                                                               └─► airDelay → dest (WHIP)
 *
 * Guest mute (safe slate) is a hard gain of 0 on the guest gate, applied
 * immediately — it does not depend on the guest's browser honouring a signal.
 * DUMP swaps in a fresh DelayNode: its buffer starts silent, so the dumped
 * audio never reaches the destination and the delay rebuilds behind it.
 */

import { renderSfx, type SfxId } from '@/lib/podcast/sfx'
import { createVoiceDisguiseNode } from '@/lib/podcast/live/voice-disguise'

type Bus = {
  /** Fader level; also feeds the host monitor. */
  pre: GainNode
  /** Program mute gate (safe slate / mute / disguise not ready). */
  gain: GainNode
  analyser: AnalyserNode
  disguise: AudioWorkletNode | null
  source: MediaStreamAudioSourceNode | null
  stream: MediaStream | null
  /** Chrome only pulls remote WebRTC audio into WebAudio if a media element plays it. */
  sink: HTMLAudioElement | null
}

export type LiveLevels = { host: number; guest: number; program: number; air: number }

export class LiveAudioMix {
  readonly ctx: AudioContext
  private dest: MediaStreamAudioDestinationNode
  private programGain: GainNode
  private programAnalyser: AnalyserNode
  private airIn: GainNode
  private airDelay: DelayNode | null = null
  private airDelaySec = 0
  private airAnalyser: AnalyserNode
  /** Guest disguise requested but not (yet) working → guest held out of Program. */
  private disguiseHold = false
  private disguiseSemitones: number | null = null
  private disguiseGen = 0
  private sfxGain: GainNode
  private monitor: GainNode
  private host: Bus
  private guest: Bus
  private hostLevel = 1
  private guestLevel = 1
  private hostMuted = false
  private guestMuted = false

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    this.dest = this.ctx.createMediaStreamDestination()
    const limiter = this.ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.1
    this.programGain = this.ctx.createGain()
    this.programAnalyser = this.ctx.createAnalyser()
    this.programAnalyser.fftSize = 1024
    this.programGain.connect(limiter)
    limiter.connect(this.programAnalyser)
    this.airIn = this.ctx.createGain()
    this.airAnalyser = this.ctx.createAnalyser()
    this.airAnalyser.fftSize = 1024
    limiter.connect(this.airIn)
    this.airIn.connect(this.dest)
    this.airIn.connect(this.airAnalyser)
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = 0.7
    this.sfxGain.connect(this.programGain)
    // Host hears the guest (and SFX) locally. Never the host's own mic — no echo.
    this.monitor = this.ctx.createGain()
    this.monitor.gain.value = 1
    this.monitor.connect(this.ctx.destination)
    this.sfxGain.connect(this.monitor)
    this.host = this.makeBus(false)
    this.guest = this.makeBus(true)
  }

  /** Air feed (after the broadcast delay). */
  get stream() {
    return this.dest.stream
  }

  get delaySec() {
    return this.airDelaySec
  }

  /** Set the broadcast delay (0 = none). Starts empty: the first `sec` seconds on air are silent. */
  setAirDelay(sec: number) {
    this.airDelaySec = Math.max(0, sec)
    this.rebuildAirDelay()
  }

  /** DUMP: discard everything in the delay line; air is silent until the delay has rebuilt. */
  dumpAir() {
    if (this.airDelaySec > 0) this.rebuildAirDelay()
  }

  private rebuildAirDelay() {
    const old = this.airDelay
    // Disconnect first so not one more sample of the dumped buffer reaches the air.
    try {
      this.airIn.disconnect()
    } catch {
      /* not connected */
    }
    try {
      old?.disconnect()
    } catch {
      /* not connected */
    }
    this.airDelay = null
    if (this.airDelaySec <= 0) {
      this.airIn.connect(this.dest)
      this.airIn.connect(this.airAnalyser)
      return
    }
    const delay = this.ctx.createDelay(Math.min(179, this.airDelaySec + 1))
    delay.delayTime.value = this.airDelaySec
    this.airIn.connect(delay)
    delay.connect(this.dest)
    delay.connect(this.airAnalyser)
    this.airDelay = delay
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume()
  }

  setHost(stream: MediaStream | null) {
    this.attach(this.host, stream, false)
  }

  setGuest(stream: MediaStream | null) {
    this.attach(this.guest, stream, true)
  }

  setHostLevel(level: number) {
    this.hostLevel = level
    this.applyGain(this.host, this.hostMuted ? 0 : level)
  }

  setGuestLevel(level: number) {
    this.guestLevel = level
    this.applyGain(this.guest, this.guestMuted ? 0 : level)
  }

  setHostMuted(muted: boolean) {
    this.hostMuted = muted
    this.applyGain(this.host, muted ? 0 : this.hostLevel)
  }

  /** Safety kill: guest out of Program instantly. */
  setGuestMuted(muted: boolean) {
    this.guestMuted = muted
    this.applyGain(this.guest, muted ? 0 : this.guestLevel)
  }

  /**
   * Voice disguise on the guest's Program feed (null = off). The host monitor keeps the
   * natural voice. Fail-safe: while the worklet loads, or if it fails, the guest is held
   * out of Program (the returned promise rejects on failure).
   */
  async setGuestDisguise(semitones: number | null) {
    const gen = ++this.disguiseGen
    this.disguiseSemitones = semitones
    const bus = this.guest
    const old = bus.disguise
    if (semitones == null) {
      bus.disguise = null
      this.rewireGuest(old)
      this.disguiseHold = false
      this.applyGain(bus, this.guestMuted ? 0 : this.guestLevel)
      return
    }
    this.disguiseHold = true
    this.applyGain(bus, 0)
    const node = await createVoiceDisguiseNode(this.ctx, semitones)
    if (gen !== this.disguiseGen) {
      node.disconnect()
      return
    }
    bus.disguise = node
    this.rewireGuest(old)
    this.disguiseHold = false
    this.applyGain(bus, this.guestMuted ? 0 : this.guestLevel)
  }

  get guestDisguise() {
    return this.disguiseSemitones
  }

  private rewireGuest(old: AudioWorkletNode | null) {
    const bus = this.guest
    try {
      bus.pre.disconnect(old || bus.gain)
    } catch {
      /* not connected */
    }
    try {
      old?.disconnect()
    } catch {
      /* not connected */
    }
    if (bus.disguise) {
      bus.pre.connect(bus.disguise)
      bus.disguise.connect(bus.gain)
    } else {
      bus.pre.connect(bus.gain)
    }
  }

  setMonitor(on: boolean) {
    this.monitor.gain.setValueAtTime(on ? 1 : 0, this.ctx.currentTime)
  }

  async playSfx(id: SfxId) {
    await this.resume()
    const buffer = await renderSfx(id, this.ctx.sampleRate)
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.sfxGain)
    src.start()
  }

  levels(): LiveLevels {
    return {
      host: rms(this.host.analyser),
      guest: rms(this.guest.analyser),
      program: rms(this.programAnalyser),
      air: rms(this.airAnalyser),
    }
  }

  async close() {
    for (const bus of [this.host, this.guest]) this.attach(bus, null, false)
    try {
      await this.ctx.close()
    } catch {
      /* already closed */
    }
  }

  private makeBus(monitored: boolean): Bus {
    const pre = this.ctx.createGain()
    const gain = this.ctx.createGain()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    pre.connect(gain)
    gain.connect(analyser)
    gain.connect(this.programGain)
    if (monitored) pre.connect(this.monitor)
    return { pre, gain, analyser, disguise: null, source: null, stream: null, sink: null }
  }

  /**
   * `value` is the fader level or 0 for a mute. The fader goes on `pre` (so the host
   * monitor follows it), the mute on the Program gate only.
   */
  private applyGain(bus: Bus, value: number) {
    const t = this.ctx.currentTime
    const level = bus === this.guest ? this.guestLevel : this.hostLevel
    const open = value > 0 && !(bus === this.guest && this.disguiseHold)
    bus.pre.gain.cancelScheduledValues(t)
    bus.pre.gain.setValueAtTime(level, t)
    bus.gain.gain.cancelScheduledValues(t)
    bus.gain.gain.setValueAtTime(open ? 1 : 0, t)
  }

  private attach(bus: Bus, stream: MediaStream | null, remote: boolean) {
    if (bus.stream === stream) return
    try {
      bus.source?.disconnect()
    } catch {
      /* not connected */
    }
    bus.source = null
    if (bus.sink) {
      bus.sink.srcObject = null
      bus.sink = null
    }
    bus.stream = stream
    const audio = stream?.getAudioTracks().filter((t) => t.readyState === 'live') || []
    if (!stream || !audio.length) return
    const audioOnly = new MediaStream(audio)
    if (remote) {
      const sink = new Audio()
      sink.muted = true
      sink.srcObject = audioOnly
      void sink.play().catch(() => {})
      bus.sink = sink
    }
    bus.source = this.ctx.createMediaStreamSource(audioOnly)
    bus.source.connect(bus.pre)
  }
}

function rms(analyser: AnalyserNode) {
  const buf = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
  return Math.min(1, Math.sqrt(sum / buf.length) * 3)
}
