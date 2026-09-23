/** In-browser audio trim / fade / gain. WAV encode is native. MP3 uses lamejs (LGPL runtime). */

import { floatToInt16, quantize16, resolveDither, type DitherMode } from '@/lib/podcast/engine/dither'
import { buildId3v24, type Id3Tags } from '@/lib/podcast/engine/id3'
import { isEffectivelyMono } from '@/lib/podcast/engine/master-core'
import { SESSION_SAMPLE_RATE } from '@/lib/podcast/engine/resample'

export type { Id3Tags, Id3Chapter } from '@/lib/podcast/engine/id3'

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
  // Plain AudioBuffer — no AudioContext per slice.
  const next = new AudioBuffer({ length, numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate })
  if (end > start) {
    for (let ch = 0; ch < source.numberOfChannels; ch++) {
      next.copyToChannel(source.getChannelData(ch).subarray(start, end), ch)
    }
  }
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
      // Float headroom is kept; the limiter (renderMaster) or the encoder handles overs.
      data[i] = sample
    }
  }
  return buffer
}

export type WavOptions = {
  /** TPDF dither when quantizing to 16-bit. 'auto' (default) skips buffers already on the 16-bit grid. */
  dither?: DitherMode
  /** 16-bit PCM (default) or 32-bit float. */
  bitDepth?: 16 | 32
}

export function encodeWav(buffer: AudioBuffer, opts: WavOptions = {}): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const float = opts.bitDepth === 32
  const bytesPer = float ? 4 : 2
  const length = buffer.length * channels * bytesPer + 44
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
  view.setUint16(offset, float ? 3 : 1, true); offset += 2
  view.setUint16(offset, channels, true); offset += 2
  view.setUint32(offset, rate, true); offset += 4
  view.setUint32(offset, rate * channels * bytesPer, true); offset += 4
  view.setUint16(offset, channels * bytesPer, true); offset += 2
  view.setUint16(offset, bytesPer * 8, true); offset += 2
  writeStr('data')
  view.setUint32(offset, length - offset - 4, true); offset += 4
  const chans = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i))
  if (float) {
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < channels; c++) {
        view.setFloat32(offset, chans[c][i], true)
        offset += 4
      }
    }
  } else {
    const dither = resolveDither(opts.dither, chans)
    let seed = 0x2545f491
    const next = () => {
      seed ^= seed << 13
      seed >>>= 0
      seed ^= seed >>> 17
      seed ^= seed << 5
      seed >>>= 0
      return seed / 4294967296
    }
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < channels; c++) {
        view.setInt16(offset, quantize16(chans[c][i], dither ? next() - next() : 0), true)
        offset += 2
      }
    }
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

export type Mp3Options = {
  /** kbps. Default 96 for mono, 160 for stereo. */
  bitrate?: number
  /** Force mono / stereo. Default: mono when L/R are effectively identical. */
  mono?: boolean
  tags?: Id3Tags
  dither?: DitherMode
}

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]

/**
 * MP3 export. Mono programmes encode as 1-channel (64–96 kbps), stereo at 128–192 kbps.
 * Optional ID3v2.4 tag (title, artist, album, artwork, chapters) is prepended.
 * Backward compatible: `encodeMp3(buffer)` still works.
 */
export async function encodeMp3(buffer: AudioBuffer, opts: Mp3Options = {}): Promise<Blob> {
  const mod = await import('@breezystack/lamejs')
  const Encoder = mod.Mp3Encoder ?? (mod as { default?: { Mp3Encoder: typeof mod.Mp3Encoder } }).default?.Mp3Encoder
  if (!Encoder) throw new Error('MP3 encoder failed to load. Export WAV instead.')
  let src = buffer
  if (!MP3_RATES.includes(src.sampleRate)) {
    const { toSessionRate } = await import('@/lib/podcast/multitrack')
    src = await toSessionRate(src, SESSION_SAMPLE_RATE)
  }
  const raw = Array.from({ length: Math.min(2, src.numberOfChannels) }, (_, i) => src.getChannelData(i))
  const mono = opts.mono ?? isEffectivelyMono(raw)
  const channels = mono ? 1 : Math.min(2, raw.length) === 2 ? 2 : 1
  const bitrate = clampBitrate(opts.bitrate ?? (channels === 1 ? 96 : 160), channels)
  const encoder = new Encoder(channels, src.sampleRate, bitrate)
  const dither = resolveDither(opts.dither, raw)
  let left: Int16Array
  let right: Int16Array
  if (channels === 1) {
    let m = raw[0]
    if (raw.length > 1) {
      m = new Float32Array(raw[0].length)
      for (let i = 0; i < m.length; i++) m[i] = 0.5 * (raw[0][i] + raw[1][i])
    }
    left = floatToInt16(m, dither, 1)
    right = left
  } else {
    left = floatToInt16(raw[0], dither, 1)
    right = floatToInt16(raw[1], dither, 2)
  }
  const block = 1152
  const parts: Uint8Array[] = []
  if (opts.tags) parts.push(buildId3v24(opts.tags, src.duration))
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

function clampBitrate(kbps: number, channels: number) {
  const allowed = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  const [lo, hi] = channels === 1 ? [64, 96] : [128, 192]
  const want = Math.max(lo, Math.min(hi, kbps))
  return allowed.reduce((best, b) => (Math.abs(b - want) < Math.abs(best - want) ? b : best), allowed[0])
}

let decodeCtx: OfflineAudioContext | null = null

/**
 * Decode compressed audio. Uses one reusable OfflineAudioContext at the session rate
 * (48 kHz), so decoded buffers land at the session rate without a hardware context.
 */
export async function decodeAudio(data: ArrayBuffer, sampleRate = SESSION_SAMPLE_RATE): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      if (!decodeCtx || decodeCtx.sampleRate !== sampleRate) decodeCtx = new OfflineAudioContext(1, 1, sampleRate)
      return await decodeCtx.decodeAudioData(data)
    } catch (err) {
      // Detached buffer means the data was consumed — surface that decode error.
      if (data.byteLength === 0) throw err
    }
  }
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(data)
  } finally {
    void ctx.close()
  }
}

export async function decodeUrl(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load audio for editing')
  // The fetched ArrayBuffer is ours — no defensive copy needed.
  return decodeAudio(await res.arrayBuffer())
}
