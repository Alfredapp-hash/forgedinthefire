/** Pure chunk math for the crash-safe take journal (testable without IndexedDB). */

/** Frames per persisted chunk (~1 s by default, clamped to 0.25–2 s). */
export function chunkFramesFor(sampleRate: number, seconds = 1): number {
  return Math.max(1, Math.round(sampleRate * Math.max(0.25, Math.min(2, seconds))))
}

/**
 * Collects arbitrary-length planar appends and emits fixed-size planar chunks.
 * Each emitted chunk is a fresh copy (safe to store / transfer).
 */
export class ChunkAccumulator {
  readonly channels: number
  readonly chunkFrames: number
  private buf: Float32Array[]
  private fill = 0
  private total = 0

  constructor(channels: number, chunkFrames: number) {
    this.channels = Math.max(1, channels)
    this.chunkFrames = Math.max(1, chunkFrames)
    this.buf = Array.from({ length: this.channels }, () => new Float32Array(this.chunkFrames))
  }

  /** Total frames appended so far. */
  get totalFrames() {
    return this.total
  }

  /** Frames buffered but not yet emitted. */
  get pendingFrames() {
    return this.fill
  }

  push(frames: Float32Array[]): Float32Array[][] {
    const out: Float32Array[][] = []
    const n = frames[0]?.length ?? 0
    this.total += n
    let offset = 0
    while (offset < n) {
      const take = Math.min(n - offset, this.chunkFrames - this.fill)
      for (let c = 0; c < this.channels; c++) {
        const src = frames[Math.min(c, frames.length - 1)]
        this.buf[c].set(src.subarray(offset, offset + take), this.fill)
      }
      this.fill += take
      offset += take
      if (this.fill === this.chunkFrames) {
        out.push(this.buf)
        this.buf = Array.from({ length: this.channels }, () => new Float32Array(this.chunkFrames))
        this.fill = 0
      }
    }
    return out
  }

  /** Emit the partial tail (or null). The accumulator keeps counting after a drain. */
  drain(): Float32Array[] | null {
    if (!this.fill) return null
    const tail = this.buf.map((b) => b.slice(0, this.fill))
    this.fill = 0
    this.buf = Array.from({ length: this.channels }, () => new Float32Array(this.chunkFrames))
    return tail
  }
}

/** Planar float → interleaved Int16 (rounded, clamped). */
export function encodeChunkInt16(planar: Float32Array[]): Int16Array {
  const ch = planar.length
  const n = planar[0]?.length ?? 0
  const out = new Int16Array(n * ch)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let q = Math.round(planar[c][i] * 32768)
      if (q > 32767) q = 32767
      else if (q < -32768) q = -32768
      out[i * ch + c] = q
    }
  }
  return out
}

export function decodeChunkInt16(data: Int16Array, channels: number): Float32Array[] {
  const ch = Math.max(1, channels)
  const n = Math.floor(data.length / ch)
  const out = Array.from({ length: ch }, () => new Float32Array(n))
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out[c][i] = data[i * ch + c] / 32768
  return out
}

/** Concatenate planar chunks (in order) into full channels. */
export function assembleChunks(chunks: Float32Array[][], channels: number): Float32Array[] {
  const total = chunks.reduce((n, c) => n + (c[0]?.length ?? 0), 0)
  const out = Array.from({ length: channels }, () => new Float32Array(total))
  let offset = 0
  for (const chunk of chunks) {
    const len = chunk[0]?.length ?? 0
    for (let c = 0; c < channels; c++) out[c].set(chunk[Math.min(c, chunk.length - 1)], offset)
    offset += len
  }
  return out
}

export function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name || ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(String((err as Error)?.message || ''))
}
