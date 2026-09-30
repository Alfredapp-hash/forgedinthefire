/**
 * Minimal Web Audio AudioBuffer for Node tests. The pure podcast libs only touch
 * length / sampleRate / numberOfChannels / duration / getChannelData / copy{To,From}Channel.
 */
export class FakeAudioBuffer {
  readonly length: number
  readonly sampleRate: number
  readonly numberOfChannels: number
  private readonly data: Float32Array[]

  constructor(opts: { length: number; numberOfChannels?: number; sampleRate: number }) {
    this.length = Math.max(1, Math.floor(opts.length))
    this.sampleRate = opts.sampleRate
    this.numberOfChannels = opts.numberOfChannels ?? 1
    this.data = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length))
  }

  get duration() {
    return this.length / this.sampleRate
  }

  getChannelData(ch: number) {
    const d = this.data[ch]
    if (!d) throw new RangeError(`channel ${ch} out of range`)
    return d
  }

  copyToChannel(src: Float32Array, ch: number, start = 0) {
    this.getChannelData(ch).set(src.subarray(0, this.length - start), start)
  }

  copyFromChannel(dest: Float32Array, ch: number, start = 0) {
    dest.set(this.getChannelData(ch).subarray(start, start + dest.length))
  }
}

/** Install as the global AudioBuffer (cloneAudioBuffer etc. call `new AudioBuffer`). */
export function installAudioBuffer() {
  ;(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeAudioBuffer
}

export function silentBuffer(seconds: number, sampleRate = 48000, channels = 1): AudioBuffer {
  return new FakeAudioBuffer({
    length: Math.round(seconds * sampleRate),
    numberOfChannels: channels,
    sampleRate,
  }) as unknown as AudioBuffer
}

/** Sine at `dbfs` peak level. */
export function sine(freq: number, dbfs: number, seconds: number, sampleRate = 48000): Float32Array {
  const amp = 10 ** (dbfs / 20)
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate)
  return out
}
