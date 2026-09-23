/** Minimal AudioBuffer for node tests (planar Float32Array storage). */
export class FakeAudioBuffer {
  readonly length: number
  readonly numberOfChannels: number
  readonly sampleRate: number
  private data: Float32Array[]
  constructor(opts: { length: number; numberOfChannels: number; sampleRate: number }) {
    this.length = opts.length
    this.numberOfChannels = opts.numberOfChannels
    this.sampleRate = opts.sampleRate
    this.data = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length))
  }
  get duration() {
    return this.length / this.sampleRate
  }
  getChannelData(ch: number) {
    return this.data[ch]
  }
  copyToChannel(src: Float32Array, ch: number, offset = 0) {
    this.data[ch].set(src.subarray(0, this.length - offset), offset)
  }
  copyFromChannel(dst: Float32Array, ch: number, offset = 0) {
    dst.set(this.data[ch].subarray(offset, offset + dst.length))
  }
}

export function installAudioBuffer() {
  ;(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeAudioBuffer
}

export function sine(freq: number, amp: number, seconds: number, sr: number, phase = 0) {
  const n = Math.round(seconds * sr)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr + phase)
  return out
}
