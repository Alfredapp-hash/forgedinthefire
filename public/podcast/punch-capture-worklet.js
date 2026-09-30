/**
 * Sample-accurate capture.
 *
 * Two protocols, chosen by `processorOptions`:
 *
 *  - Legacy (no processorOptions): one Float32Array per 128-frame quantum, structured-cloned.
 *    Kept so older capture code keeps working unchanged.
 *
 *  - Batched (processorOptions: { batchFrames, channels }): ~4096 frames per message with
 *    the ArrayBuffers transferred instead of cloned. Messages to the main thread:
 *      { type: 'start', frame }                            context frame of the first captured sample
 *      { type: 'data', frame, channels: Float32Array[] }   planar batch, buffers transferred
 *      { type: 'flushed' }                                  reply to a { type: 'flush' } request
 */
class PunchCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || null
    this.batched = !!(opts && (opts.batchFrames || opts.channels))
    this.batch = Math.max(128, (opts && opts.batchFrames) || 4096)
    this.channels = Math.max(1, Math.min(2, (opts && opts.channels) || 1))
    this.started = false
    this.fill = 0
    this.batchFrame = 0
    this.alloc()
    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg && msg.type === 'flush') {
        this.send()
        this.port.postMessage({ type: 'flushed' })
      }
    }
  }

  alloc() {
    this.buf = []
    for (let c = 0; c < this.channels; c++) this.buf.push(new Float32Array(this.batch))
    this.fill = 0
  }

  send() {
    if (!this.fill) return
    const out = this.buf.map((b) => (this.fill === b.length ? b : b.slice(0, this.fill)))
    this.port.postMessage(
      { type: 'data', frame: this.batchFrame, channels: out },
      out.map((b) => b.buffer),
    )
    this.alloc()
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length || !input[0] || !input[0].length) return true
    if (!this.batched) {
      // Legacy protocol: per-quantum mono chunk.
      this.port.postMessage(input[0].slice())
      return true
    }
    const frames = input[0].length
    if (!this.started) {
      this.started = true
      // eslint-disable-next-line no-undef
      this.port.postMessage({ type: 'start', frame: currentFrame })
    }
    let offset = 0
    while (offset < frames) {
      if (this.fill === 0) {
        // eslint-disable-next-line no-undef
        this.batchFrame = currentFrame + offset
      }
      const take = Math.min(frames - offset, this.batch - this.fill)
      for (let c = 0; c < this.channels; c++) {
        const src = input[Math.min(c, input.length - 1)]
        this.buf[c].set(src.subarray(offset, offset + take), this.fill)
      }
      this.fill += take
      offset += take
      if (this.fill >= this.batch) this.send()
    }
    return true
  }
}

registerProcessor('punch-capture', PunchCaptureProcessor)
