/** Offline AudioBuffer effects for the podcast studio (GarageBand-style chain). */

export type EffectId =
  | 'normalize'
  | 'noise_gate'
  | 'highpass'
  | 'presence'
  | 'deess'
  | 'compress'
  | 'limit'
  | 'room'
  | 'hall'
  | 'echo'
  | 'chorus'
  | 'telephone'
  | 'warmth'
  | 'isolate'
  | 'strip_silence'
  | 'reverse'

export const EFFECT_META: { id: EffectId; label: string; hint: string }[] = [
  { id: 'normalize', label: 'Normalize', hint: 'Peak to −1 dB' },
  { id: 'noise_gate', label: 'Noise gate', hint: 'Cut quiet room hiss' },
  { id: 'highpass', label: 'Rumble cut', hint: 'High-pass ~80 Hz' },
  { id: 'presence', label: 'Presence', hint: 'Vocal clarity ~3 kHz' },
  { id: 'deess', label: 'De-ess', hint: 'Tame harsh S sounds' },
  { id: 'compress', label: 'Compress', hint: 'Even out dynamics' },
  { id: 'limit', label: 'Limiter', hint: 'Soft clip peaks' },
  { id: 'room', label: 'Room', hint: 'Short convolution reverb' },
  { id: 'hall', label: 'Hall', hint: 'Longer room tail' },
  { id: 'echo', label: 'Echo', hint: 'Delay with feedback' },
  { id: 'chorus', label: 'Chorus', hint: 'Stacked short delays' },
  { id: 'telephone', label: 'Telephone', hint: 'Narrow band, lo-fi' },
  { id: 'warmth', label: 'Tape warmth', hint: 'Soft clip + low-pass' },
  { id: 'isolate', label: 'Isolate', hint: 'RNNoise (Xiph) voice cleanup; spectral fallback' },
  { id: 'strip_silence', label: 'Strip silence', hint: 'Remove long quiet gaps' },
  { id: 'reverse', label: 'Reverse', hint: 'Play the clip backwards' },
]

function peakAmplitude(buffer: AudioBuffer) {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  }
  return peak || 1
}

export function normalizeBuffer(buffer: AudioBuffer, targetPeak = 0.89) {
  const peak = peakAmplitude(buffer)
  const gain = targetPeak / peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i] * gain))
  }
  return buffer
}

/** Simple amplitude gate — zeros samples below threshold with short attack/release. */
export function noiseGate(buffer: AudioBuffer, threshold = 0.02, holdSamples = 256) {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    let open = false
    let hold = 0
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i])
      if (a >= threshold) {
        open = true
        hold = holdSamples
      } else if (hold > 0) {
        hold--
      } else {
        open = false
      }
      if (!open) data[i] = 0
    }
  }
  return buffer
}

export function softLimit(buffer: AudioBuffer, ceiling = 0.95) {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const x = data[i]
      const sign = x < 0 ? -1 : 1
      const a = Math.abs(x)
      data[i] = a > ceiling ? sign * (ceiling + (1 - ceiling) * Math.tanh((a - ceiling) * 3)) : x
    }
  }
  return buffer
}

async function runOffline(
  buffer: AudioBuffer,
  setup: (ctx: OfflineAudioContext, source: AudioBufferSourceNode) => AudioNode,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  )
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const tail = setup(ctx, source)
  tail.connect(ctx.destination)
  source.start(0)
  return ctx.startRendering()
}

export async function highPass(buffer: AudioBuffer, freq = 80): Promise<AudioBuffer> {
  return runOffline(buffer, (ctx, source) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = freq
    filter.Q.value = 0.7
    source.connect(filter)
    return filter
  })
}

/** Mild presence shelf around speech clarity band. */
export async function presenceBoost(buffer: AudioBuffer): Promise<AudioBuffer> {
  return runOffline(buffer, (ctx, source) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.value = 3200
    filter.Q.value = 1.1
    filter.gain.value = 3.5
    source.connect(filter)
    return filter
  })
}

/** Soft de-esser: cut a narrow band around 6–7 kHz. */
export async function deEss(buffer: AudioBuffer): Promise<AudioBuffer> {
  return runOffline(buffer, (ctx, source) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.value = 6500
    filter.Q.value = 2.5
    filter.gain.value = -5
    source.connect(filter)
    return filter
  })
}

export async function compress(buffer: AudioBuffer): Promise<AudioBuffer> {
  return runOffline(buffer, (ctx, source) => {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value = 12
    comp.ratio.value = 3.5
    comp.attack.value = 0.008
    comp.release.value = 0.18
    source.connect(comp)
    return comp
  })
}

async function runOfflineGraph(
  buffer: AudioBuffer,
  build: (ctx: OfflineAudioContext, source: AudioBufferSourceNode) => void,
): Promise<AudioBuffer> {
  const tailSamples = Math.ceil(buffer.sampleRate * 2.5)
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length + tailSamples,
    buffer.sampleRate,
  )
  const source = ctx.createBufferSource()
  source.buffer = buffer
  build(ctx, source)
  source.start(0)
  const rendered = await ctx.startRendering()
  return trimTrailingSilence(rendered)
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate))
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return impulse
}

function trimTrailingSilence(buffer: AudioBuffer, floor = 0.0008) {
  let end = buffer.length - 1
  const ch0 = buffer.getChannelData(0)
  while (end > buffer.sampleRate * 0.05 && Math.abs(ch0[end]) < floor) end--
  const keep = Math.min(buffer.length, end + Math.floor(buffer.sampleRate * 0.04))
  if (keep >= buffer.length - 16) return buffer
  const out = new AudioBuffer({
    length: keep,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(0, keep), ch)
  }
  return out
}

export async function convolveReverb(buffer: AudioBuffer, seconds: number, decay: number, mix = 0.32) {
  return runOfflineGraph(buffer, (ctx, source) => {
    const conv = ctx.createConvolver()
    conv.buffer = makeImpulse(ctx, seconds, decay)
    const wet = ctx.createGain()
    wet.gain.value = mix
    const dry = ctx.createGain()
    dry.gain.value = 1
    source.connect(dry)
    dry.connect(ctx.destination)
    source.connect(conv)
    conv.connect(wet)
    wet.connect(ctx.destination)
  })
}

export async function echoDelay(buffer: AudioBuffer, delaySec = 0.28, feedbackAmt = 0.32, mix = 0.28) {
  const extra = Math.ceil(buffer.sampleRate * (delaySec * 4 + 0.2))
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length + extra,
    buffer.sampleRate,
  )
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const delay = ctx.createDelay(1.5)
  delay.delayTime.value = delaySec
  const feedback = ctx.createGain()
  feedback.gain.value = feedbackAmt
  const wet = ctx.createGain()
  wet.gain.value = mix
  const dry = ctx.createGain()
  dry.gain.value = 1
  source.connect(dry)
  dry.connect(ctx.destination)
  source.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(ctx.destination)
  source.start(0)
  return trimTrailingSilence(await ctx.startRendering())
}

export async function chorus(buffer: AudioBuffer) {
  return runOfflineGraph(buffer, (ctx, source) => {
    const dry = ctx.createGain()
    dry.gain.value = 0.7
    source.connect(dry)
    dry.connect(ctx.destination)
    for (const ms of [0.012, 0.018, 0.026]) {
      const delay = ctx.createDelay(0.05)
      delay.delayTime.value = ms
      const g = ctx.createGain()
      g.gain.value = 0.22
      source.connect(delay)
      delay.connect(g)
      g.connect(ctx.destination)
    }
  })
}

export async function telephone(buffer: AudioBuffer) {
  return runOffline(buffer, (ctx, source) => {
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 380
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3200
    source.connect(hp)
    hp.connect(lp)
    return lp
  })
}

export async function tapeWarmth(buffer: AudioBuffer) {
  const shaped = await runOffline(buffer, (ctx, source) => {
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = Math.tanh(x * 1.6)
    }
    shaper.curve = curve
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 7800
    source.connect(shaper)
    shaper.connect(lp)
    return lp
  })
  return softLimit(shaped, 0.92)
}

export async function applyEffect(buffer: AudioBuffer, id: EffectId): Promise<AudioBuffer> {
  const { stripSilence, reverseBuffer } = await import('@/lib/podcast/multitrack')
  switch (id) {
    case 'normalize':
      return normalizeBuffer(buffer)
    case 'noise_gate':
      return noiseGate(buffer)
    case 'highpass':
      return highPass(buffer)
    case 'presence':
      return presenceBoost(buffer)
    case 'deess':
      return deEss(buffer)
    case 'compress':
      return compress(buffer)
    case 'limit':
      return softLimit(buffer)
    case 'room':
      return convolveReverb(buffer, 0.85, 2.4, 0.28)
    case 'hall':
      return convolveReverb(buffer, 2.1, 2.8, 0.34)
    case 'echo':
      return echoDelay(buffer)
    case 'chorus':
      return chorus(buffer)
    case 'telephone':
      return telephone(buffer)
    case 'warmth':
      return tapeWarmth(buffer)
    case 'isolate': {
      const { isolateVoice } = await import('@/lib/podcast/isolate')
      return isolateVoice(buffer)
    }
    case 'strip_silence':
      return stripSilence(buffer)
    case 'reverse':
      return reverseBuffer(buffer)
    default:
      return buffer
  }
}

export async function applyEffectChain(buffer: AudioBuffer, ids: EffectId[]): Promise<AudioBuffer> {
  let next = buffer
  for (const id of ids) {
    next = await applyEffect(next, id)
  }
  return next
}

export function cloneBuffer(buffer: AudioBuffer): AudioBuffer {
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

export function bufferFromBlob(blob: Blob): Promise<AudioBuffer> {
  return blob.arrayBuffer().then(async (data) => {
    const ctx = new AudioContext()
    const buffer = await ctx.decodeAudioData(data.slice(0))
    void ctx.close()
    return buffer
  })
}
