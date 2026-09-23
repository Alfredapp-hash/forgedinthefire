/**
 * Live Program audio: host mic + guest mic + SFX → limiter → MediaStreamDestination.
 * The destination track is what WHIP sends and what the local recorder captures.
 *
 * Guest mute (safe slate) is a hard gain of 0 on the guest bus, applied
 * immediately — it does not depend on the guest's browser honouring a signal.
 */

import { renderSfx, type SfxId } from '@/lib/podcast/sfx'

type Bus = {
  gain: GainNode
  analyser: AnalyserNode
  source: MediaStreamAudioSourceNode | null
  stream: MediaStream | null
  /** Chrome only pulls remote WebRTC audio into WebAudio if a media element plays it. */
  sink: HTMLAudioElement | null
}

export type LiveLevels = { host: number; guest: number; program: number }

export class LiveAudioMix {
  readonly ctx: AudioContext
  private dest: MediaStreamAudioDestinationNode
  private programGain: GainNode
  private programAnalyser: AnalyserNode
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
    limiter.connect(this.dest)
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

  get stream() {
    return this.dest.stream
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
    const gain = this.ctx.createGain()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    gain.connect(analyser)
    gain.connect(this.programGain)
    if (monitored) gain.connect(this.monitor)
    return { gain, analyser, source: null, stream: null, sink: null }
  }

  private applyGain(bus: Bus, value: number) {
    const t = this.ctx.currentTime
    bus.gain.gain.cancelScheduledValues(t)
    bus.gain.gain.setValueAtTime(value, t)
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
    bus.source.connect(bus.gain)
  }
}

function rms(analyser: AnalyserNode) {
  const buf = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
  return Math.min(1, Math.sqrt(sum / buf.length) * 3)
}
