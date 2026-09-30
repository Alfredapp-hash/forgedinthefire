/**
 * Real-time voice disguise for the live guest bus: a delay-line (two-tap,
 * Hann-crossfaded) pitch shifter in an AudioWorklet. Cheap, ~45 ms latency, no
 * formant correction — it changes how a voice sounds, it does not anonymise it.
 */

export const VOICE_DISGUISE_WARNING =
  'Pitch shifting is not anonymity. A recording of a shifted voice can often be shifted back, and speech ' +
  'patterns, accent and word choice still identify people. If the guest must not be recognised, keep them ' +
  'off mic and have the host summarise, or use a re-voiced segment in the edited episode.'

/** Semitone presets offered in the control room (negative = deeper). */
export const VOICE_DISGUISE_PRESETS = [
  { id: 'deeper', label: 'Deeper (−4 st)', semitones: -4 },
  { id: 'much-deeper', label: 'Much deeper (−7 st)', semitones: -7 },
  { id: 'higher', label: 'Higher (+4 st)', semitones: 4 },
] as const

export type VoiceDisguisePreset = (typeof VOICE_DISGUISE_PRESETS)[number]['id']

export function semitonesToRatio(st: number) {
  return Math.pow(2, st / 12)
}

const PROCESSOR = 'fitf-pitch-shift'

const WORKLET_SOURCE = `
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 0.8, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.size = 8192
    this.buf = new Float32Array(this.size)
    this.w = 0
    this.phase = 0
    this.win = Math.round(sampleRate * 0.045)
  }
  tap(d) {
    let r = this.w - d - 1
    while (r < 0) r += this.size
    const i = Math.floor(r)
    const f = r - i
    const a = this.buf[i % this.size]
    const b = this.buf[(i + 1) % this.size]
    return a + (b - a) * f
  }
  process(inputs, outputs, params) {
    const input = inputs[0]
    const out = outputs[0]
    if (!out || !out.length) return true
    const inp = input && input.length ? input[0] : null
    const ratio = params.ratio[0]
    const N = this.win
    const step = (1 - ratio) / N
    const n = out[0].length
    for (let i = 0; i < n; i++) {
      this.buf[this.w] = inp ? inp[i] : 0
      this.phase += step
      if (this.phase >= 1) this.phase -= 1
      if (this.phase < 0) this.phase += 1
      const p2 = (this.phase + 0.5) % 1
      const g1 = Math.sin(Math.PI * this.phase)
      const g2 = Math.sin(Math.PI * p2)
      const y = this.tap(this.phase * N) * g1 * g1 + this.tap(p2 * N) * g2 * g2
      for (let c = 0; c < out.length; c++) out[c][i] = y
      this.w = (this.w + 1) % this.size
    }
    return true
  }
}
registerProcessor('${PROCESSOR}', PitchShift)
`

const loaded = new WeakMap<BaseAudioContext, Promise<void>>()

/** Create the pitch-shift node. Rejects if AudioWorklet is unavailable — callers must fail safe. */
export async function createVoiceDisguiseNode(ctx: AudioContext, semitones: number): Promise<AudioWorkletNode> {
  if (!ctx.audioWorklet) throw new Error('AudioWorklet is not available in this browser')
  let ready = loaded.get(ctx)
  if (!ready) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }))
    ready = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    loaded.set(ctx, ready)
    ready.catch(() => loaded.delete(ctx))
  }
  await ready
  const node = new AudioWorkletNode(ctx, PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
  })
  node.parameters.get('ratio')?.setValueAtTime(semitonesToRatio(semitones), ctx.currentTime)
  return node
}
