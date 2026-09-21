/** Approximate ITU-R BS.1770 loudness + true-peak for browser mixdown. */

export type LoudnessReport = {
  lufsIntegrated: number
  truePeakDb: number
}

function kWeight(sample: number, hp: { x1: number; y1: number }, shelf: { x1: number; y1: number }) {
  // 1st-order HPF ~60 Hz + gentle high shelf — close enough for mix targeting
  const hpY = 0.995 * (hp.y1 + sample - hp.x1)
  hp.x1 = sample
  hp.y1 = hpY
  const shelfY = hpY + 0.35 * (hpY - shelf.x1)
  shelf.x1 = hpY
  shelf.y1 = shelfY
  return shelfY
}

export function measureLoudness(buffer: AudioBuffer): LoudnessReport {
  const chs = Math.min(2, buffer.numberOfChannels)
  const len = buffer.length
  const channels = Array.from({ length: chs }, (_, i) => buffer.getChannelData(i))
  const hp = Array.from({ length: chs }, () => ({ x1: 0, y1: 0 }))
  const shelf = Array.from({ length: chs }, () => ({ x1: 0, y1: 0 }))
  let sum = 0
  let peak = 0
  for (let i = 0; i < len; i++) {
    let ms = 0
    for (let c = 0; c < chs; c++) {
      const s = channels[c][i]
      if (Math.abs(s) > peak) peak = Math.abs(s)
      const w = kWeight(s, hp[c], shelf[c])
      ms += w * w
    }
    sum += ms / chs
  }
  const mean = sum / Math.max(1, len)
  const lufsIntegrated = mean > 1e-12 ? 10 * Math.log10(mean) - 0.691 : -70
  const truePeakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -90
  return { lufsIntegrated, truePeakDb }
}

export function normalizeToLufs(buffer: AudioBuffer, targetLufs = -16, peakCeilDb = -1): AudioBuffer {
  const { lufsIntegrated, truePeakDb } = measureLoudness(buffer)
  const gainLufs = Math.pow(10, (targetLufs - lufsIntegrated) / 20)
  const peakGain = Math.pow(10, (peakCeilDb - truePeakDb) / 20)
  const gain = Math.min(gainLufs, peakGain, 8)
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  const ceil = Math.pow(10, peakCeilDb / 20)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0; i < src.length; i++) {
      const v = src[i] * gain
      dst[i] = Math.max(-ceil, Math.min(ceil, v))
    }
  }
  return out
}
