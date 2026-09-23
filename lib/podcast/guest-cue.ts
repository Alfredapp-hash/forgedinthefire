/**
 * Program/cue in guest headphones. The mix tap is host-outbound WebRTC only.
 * Do not pass these streams into startLaneCapture or the Guest take.
 */

export const TALKBACK_DUCK_THRESHOLD = 0.07
export const CUE_DUCKED_GAIN = 0.22

export function duckGainForTalkback(peak: number, open = 1, ducked = CUE_DUCKED_GAIN) {
  return peak >= TALKBACK_DUCK_THRESHOLD ? ducked : open
}

function connectStream(ctx: AudioContext, stream: MediaStream | null, sink: AudioNode) {
  if (!stream?.getAudioTracks().some((t) => t.readyState === 'live')) return null
  try {
    const src = ctx.createMediaStreamSource(stream)
    src.connect(sink)
    return src
  } catch {
    return null
  }
}

function peakFromAnalyser(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(data)
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i] - 128) / 128)
  }
  return peak
}

export type GuestHeadphoneMix = {
  attach: (talk: MediaStream | null, cue: MediaStream | null) => void
  setTalkbackOn: (on: boolean) => void
  setCueLive: (on: boolean) => void
  setCueVolume: (gain: number) => void
  talkPeak: () => number
  stop: () => void
  /** iOS/Safari: resume audio from inside a tap if the context was suspended. */
  resume?: () => Promise<void>
  /** False while the browser is still blocking sound (needs a tap). */
  running?: () => boolean
}

/**
 * Mix talkback + cue in the booth. Talkback ducks cue so the host still cuts through.
 * Pass the booth's shared AudioContext (unlocked in the Join tap) so iOS/Safari
 * never needs a second gesture; a shared context is not closed by stop().
 */
export function createGuestHeadphoneMix(shared?: AudioContext | null): GuestHeadphoneMix {
  const ctx = shared && shared.state !== 'closed' ? shared : new AudioContext()
  const ownsContext = ctx !== shared
  if (ownsContext) void ctx.resume()
  const talkGain = ctx.createGain()
  const cueUser = ctx.createGain()
  const cueDuck = ctx.createGain()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  const data = new Uint8Array(analyser.fftSize)
  talkGain.connect(ctx.destination)
  talkGain.connect(analyser)
  cueUser.connect(cueDuck)
  cueDuck.connect(ctx.destination)

  let talkSrc: MediaStreamAudioSourceNode | null = null
  let cueSrc: MediaStreamAudioSourceNode | null = null
  let talkOn = false
  let cueLive = false
  let cueVol = 0.85
  let lastPeak = 0
  let raf = 0

  const applyGains = () => {
    talkGain.gain.value = talkOn ? 1 : 0
    cueUser.gain.value = cueLive ? Math.max(0, Math.min(1, cueVol)) : 0
  }

  const tick = () => {
    lastPeak = talkOn ? peakFromAnalyser(analyser, data) : 0
    const target = talkOn && cueLive ? duckGainForTalkback(lastPeak) : 1
    const current = cueDuck.gain.value
    cueDuck.gain.value = current + (target - current) * (lastPeak >= TALKBACK_DUCK_THRESHOLD ? 0.45 : 0.12)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  applyGains()

  return {
    attach(talk, cue) {
      talkSrc?.disconnect()
      cueSrc?.disconnect()
      talkSrc = connectStream(ctx, talk, talkGain)
      cueSrc = connectStream(ctx, cue && cue !== talk ? cue : null, cueUser)
      if (!cueSrc && cue && talk && cue.getAudioTracks()[0] === talk.getAudioTracks()[0]) {
        /* one m-line fallback: same stream already feeds talkGain; cue rides that path */
      }
      void ctx.resume()
    },
    setTalkbackOn(on) {
      talkOn = on
      applyGains()
      void ctx.resume()
    },
    setCueLive(on) {
      cueLive = on
      applyGains()
      void ctx.resume()
    },
    setCueVolume(gain) {
      cueVol = gain
      applyGains()
    },
    talkPeak() {
      return lastPeak
    },
    async resume() {
      try {
        await ctx.resume()
      } catch {
        /* still blocked; caller shows the tap prompt */
      }
    },
    running() {
      return ctx.state === 'running'
    },
    stop() {
      cancelAnimationFrame(raf)
      talkSrc?.disconnect()
      cueSrc?.disconnect()
      try {
        talkGain.disconnect()
        cueDuck.disconnect()
      } catch {
        /* ignore */
      }
      if (ownsContext) void ctx.close()
    },
  }
}

export type HostFallbackSendMix = {
  stream: MediaStream
  update: (talk: MediaStream | null, cue: MediaStream | null, talkOn: boolean, cueOn: boolean) => void
  stop: () => void
}

/** One-audio-line fallback: mix talkback+cue on the host, duck cue, send on the talkback m-line. */
export function createHostFallbackSendMix(): HostFallbackSendMix {
  const ctx = new AudioContext()
  void ctx.resume()
  const dest = ctx.createMediaStreamDestination()
  const talkGain = ctx.createGain()
  const cueUser = ctx.createGain()
  const cueDuck = ctx.createGain()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  const data = new Uint8Array(analyser.fftSize)
  talkGain.connect(dest)
  talkGain.connect(analyser)
  cueUser.connect(cueDuck)
  cueDuck.connect(dest)

  let talkSrc: MediaStreamAudioSourceNode | null = null
  let cueSrc: MediaStreamAudioSourceNode | null = null
  let talkOn = false
  let cueOn = false
  let raf = 0

  const tick = () => {
    const peak = talkOn ? peakFromAnalyser(analyser, data) : 0
    const target = talkOn && cueOn ? duckGainForTalkback(peak) : 1
    cueDuck.gain.value += (target - cueDuck.gain.value) * 0.35
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    stream: dest.stream,
    update(talk, cue, nextTalkOn, nextCueOn) {
      talkOn = nextTalkOn
      cueOn = nextCueOn
      talkSrc?.disconnect()
      cueSrc?.disconnect()
      talkSrc = nextTalkOn ? connectStream(ctx, talk, talkGain) : null
      cueSrc = nextCueOn ? connectStream(ctx, cue, cueUser) : null
      talkGain.gain.value = nextTalkOn ? 1 : 0
      cueUser.gain.value = nextCueOn ? 1 : 0
      void ctx.resume()
    },
    stop() {
      cancelAnimationFrame(raf)
      talkSrc?.disconnect()
      cueSrc?.disconnect()
      void ctx.close()
    },
  }
}
