/** Offline AudioBuffer effects for the podcast studio (GarageBand-style chain). */

export type EffectId =
  | 'normalize'
  | 'noise_gate'
  | 'highpass'
  | 'presence'
  | 'deess'
  | 'compress'
  | 'limit'
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
