/** In-browser audio trim / fade / gain. WAV encode is native. MP3 uses lamejs (LGPL runtime). */

export function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function parseClock(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 1) return Math.max(0, parts[0])
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2])
  return null
}

export function sliceBuffer(
  source: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const start = Math.max(0, Math.floor(startSec * source.sampleRate))
  const end = Math.min(source.length, Math.ceil(endSec * source.sampleRate))
  const length = Math.max(1, end - start)
  const ctx = new AudioContext()
  const next = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate)
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    next.copyToChannel(source.getChannelData(ch).subarray(start, end), ch)
  }
  void ctx.close()
  return next
}

export function applyGainAndFades(
  buffer: AudioBuffer,
  gain: number,
  fadeInSec: number,
  fadeOutSec: number,
) {
  const fadeIn = Math.min(buffer.length, Math.floor(fadeInSec * buffer.sampleRate))
  const fadeOut = Math.min(buffer.length, Math.floor(fadeOutSec * buffer.sampleRate))
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      let sample = data[i] * gain
      if (i < fadeIn) sample *= i / fadeIn
      if (i > data.length - fadeOut) sample *= (data.length - i) / fadeOut
      data[i] = Math.max(-1, Math.min(1, sample))
    }
  }
  return buffer
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const length = buffer.length * channels * 2 + 44
  const bytes = new ArrayBuffer(length)
  const view = new DataView(bytes)
  let offset = 0
  const writeStr = (text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i))
  }
  writeStr('RIFF')
  view.setUint32(offset, length - 8, true); offset += 4
  writeStr('WAVE')
  writeStr('fmt ')
  view.setUint32(offset, 16, true); offset += 4
  view.setUint16(offset, 1, true); offset += 2
  view.setUint16(offset, channels, true); offset += 2
  view.setUint32(offset, rate, true); offset += 4
  view.setUint32(offset, rate * channels * 2, true); offset += 4
  view.setUint16(offset, channels * 2, true); offset += 2
  view.setUint16(offset, 16, true); offset += 2
  writeStr('data')
  view.setUint32(offset, length - offset - 4, true); offset += 4
  const chans = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

/**
 * Lowest CBR bitrate Apple Podcasts / Spotify accept without transcoding penalties.
 * lamejs's `Mp3Encoder(channels, rate, kbps)` emits **constant** bitrate at this value,
 * so a 128 kbps floor keeps the enclosure inside every major directory's spec.
 */
export const PODCAST_MP3_BITRATE = 128

export async function encodeMp3(buffer: AudioBuffer, bitrateKbps = PODCAST_MP3_BITRATE): Promise<Blob> {
  const mod = await import('@breezystack/lamejs')
  const Encoder = mod.Mp3Encoder ?? (mod as { default?: { Mp3Encoder: typeof mod.Mp3Encoder } }).default?.Mp3Encoder
  if (!Encoder) throw new Error('MP3 encoder failed to load. Export WAV instead.')
  const channels = Math.min(2, buffer.numberOfChannels)
  // Clamp to a podcast-safe CBR floor; a stereo mix gets at least 128 kbps.
  const kbps = Math.max(PODCAST_MP3_BITRATE, Math.round(bitrateKbps) || PODCAST_MP3_BITRATE)
  const encoder = new Encoder(channels, buffer.sampleRate, kbps)
  const left = floatTo16(buffer.getChannelData(0))
  const right = channels > 1 ? floatTo16(buffer.getChannelData(1)) : left
  const block = 1152
  const parts: Uint8Array[] = []
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block)
    const r = right.subarray(i, i + block)
    const chunk = channels === 1 ? encoder.encodeBuffer(l) : encoder.encodeBuffer(l, r)
    if (chunk.length) parts.push(chunk)
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(tail)
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

function floatTo16(input: Float32Array) {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export async function decodeUrl(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load audio for editing')
  const data = await res.arrayBuffer()
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(data.slice(0))
  void ctx.close()
  return buffer
}

/**
 * Decode an already-encoded Blob (the exact WAV/MP3 we are about to hand off) back
 * to an AudioBuffer. Used to re-measure LUFS on the *delivered* file rather than the
 * pre-encode mix, so a lossy encoder that shifts loudness is caught before save.
 */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(data.slice(0))
  void ctx.close()
  return buffer
}
