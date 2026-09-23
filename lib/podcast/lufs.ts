/** ITU-R BS.1770-style integrated loudness (approx LUFS) for podcast masters. */

const ABS_GATE = -70
const REL_GATE = 10
const BLOCK_SEC = 0.4
const TARGET_PODCAST_LUFS = -16

function biquad(
  input: Float32Array,
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number,
) {
  const out = new Float32Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x = input[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  return out
}

/** K-weighting at 48 kHz coefficients; close enough at 44.1 for a studio meter. */
function kWeight(channel: Float32Array) {
  const pre = biquad(channel, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585)
  return biquad(pre, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)
}

function meanSquare(channels: Float32Array[], start: number, end: number) {
  // BS.1770: loudness sums each channel's mean square (L/R weight 1), it does not average them.
  const len = end - start
  if (len <= 0) return 0
  let total = 0
  for (const ch of channels) {
    let sum = 0
    for (let i = start; i < end; i++) {
      const s = ch[i]
      sum += s * s
    }
    total += sum / len
  }
  return total
}

function msToLufs(ms: number) {
  if (ms <= 0) return -Infinity
  return -0.691 + 10 * Math.log10(ms)
}

export type Loudness = {
  lufs: number
  peak: number
  peakDb: number
}

export const PODCAST_LUFS = TARGET_PODCAST_LUFS

export function measureLoudness(buffer: AudioBuffer): Loudness {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => kWeight(buffer.getChannelData(i).slice()))
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  }

  const block = Math.max(1, Math.floor(BLOCK_SEC * buffer.sampleRate))
  const hop = Math.max(1, Math.floor(block * 0.25))
  const blocks: number[] = []
  for (let start = 0; start + block <= channels[0].length; start += hop) {
    blocks.push(meanSquare(channels, start, start + block))
  }
  if (blocks.length === 0) {
    blocks.push(meanSquare(channels, 0, channels[0].length))
  }

  const aboveAbs = blocks.filter((ms) => msToLufs(ms) > ABS_GATE)
  const pool = aboveAbs.length ? aboveAbs : blocks
  const meanAbs = pool.reduce((a, b) => a + b, 0) / pool.length
  const rel = msToLufs(meanAbs) - REL_GATE
  const gated = pool.filter((ms) => msToLufs(ms) > rel)
  const used = gated.length ? gated : pool
  const mean = used.reduce((a, b) => a + b, 0) / used.length

  return {
    lufs: msToLufs(mean),
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
  }
}

export function gainForTargetLufs(measured: number, target = TARGET_PODCAST_LUFS) {
  if (!Number.isFinite(measured)) return 1
  return 10 ** ((target - measured) / 20)
}
