import { describe, expect, it } from 'vitest'
import { resampleSinc, resampledLength } from '@/lib/podcast/engine/resample'
import { compGainAt, renderMixPlan } from '@/lib/podcast/engine/mix-core'
import { buildId3v24, syncSafe } from '@/lib/podcast/engine/id3'
import {
  assembleChunks,
  ChunkAccumulator,
  chunkFramesFor,
  decodeChunkInt16,
  encodeChunkInt16,
  isQuotaError,
} from '@/lib/podcast/engine/journal-chunks'
import { findClickOnset, latencyCompensationFrames } from '@/lib/podcast/engine/latency'
import { floatToInt16, isOn16BitGrid } from '@/lib/podcast/engine/dither'
import { deEssChannels, gateChannels } from '@/lib/podcast/engine/dynamics'
import { isEffectivelyMono, processMaster } from '@/lib/podcast/engine/master-core'
import { createEmptyTrack, mixdownTracks, assignCompRange, takeAudibleWindows } from '@/lib/podcast/multitrack'
import { installAudioBuffer, sine } from './shim'

installAudioBuffer()

function rms(x: Float32Array, from = 0, to = x.length) {
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, to - from))
}

describe('resampler', () => {
  it('produces the expected length for 44.1k ↔ 48k and odd rates', () => {
    const x = new Float32Array(44100)
    expect(resampleSinc(x, 44100, 48000).length).toBe(48000)
    expect(resampleSinc(new Float32Array(48000), 48000, 44100).length).toBe(44100)
    expect(resampleSinc(new Float32Array(1000), 22050, 48000).length).toBe(resampledLength(1000, 22050, 48000))
    expect(resampleSinc(new Float32Array(12345), 47999, 48000).length).toBe(Math.round((12345 * 48000) / 47999))
  })

  it('preserves an in-band sine and rejects content above the new Nyquist', () => {
    const x = sine(1000, 0.5, 0.5, 44100)
    const y = resampleSinc(x, 44100, 48000)
    const ref = sine(1000, 0.5, 0.5, 48000)
    let err = 0
    for (let i = 2000; i < 20000; i++) err = Math.max(err, Math.abs(y[i] - ref[i]))
    expect(err).toBeLessThan(2e-3)
    // 23 kHz at 48k → 22.05k (Nyquist 11.025k) must be attenuated heavily, not aliased.
    const hi = sine(15000, 0.5, 0.5, 48000)
    const down = resampleSinc(hi, 48000, 22050)
    expect(rms(down, 1000, down.length - 1000)).toBeLessThan(0.005)
  })
})

describe('mixdown', () => {
  it('resamples mismatched track rates to the 48 kHz session rate', () => {
    const a = new AudioBuffer({ length: 44100, numberOfChannels: 1, sampleRate: 44100 })
    a.copyToChannel(sine(440, 0.25, 1, 44100), 0)
    const b = new AudioBuffer({ length: 48000, numberOfChannels: 1, sampleRate: 48000 })
    b.copyToChannel(sine(440, 0.25, 1, 48000), 0)
    const tracks = [
      createEmptyTrack({ name: 'A', role: 'music', personId: 'beds', buffer: a, fadeIn: 0, fadeOut: 0 }),
      createEmptyTrack({ name: 'B', role: 'sfx', personId: 'sfx', buffer: b, fadeIn: 0, fadeOut: 0 }),
    ]
    const mix = mixdownTracks(tracks)
    expect(mix.sampleRate).toBe(48000)
    expect(mix.length).toBe(48000)
    const L = mix.getChannelData(0)
    // Both copies in phase → amplitude 0.5 (no clipping, correct duration → no drift).
    let peak = 0
    for (let i = 1000; i < 47000; i++) peak = Math.max(peak, Math.abs(L[i]))
    expect(peak).toBeGreaterThan(0.49)
    expect(peak).toBeLessThan(0.51)
  })

  it('keeps float headroom (no clamp at ±1)', () => {
    const a = new AudioBuffer({ length: 4800, numberOfChannels: 1, sampleRate: 48000 })
    a.getChannelData(0).fill(0.8)
    const t1 = createEmptyTrack({ name: 'A', role: 'music', personId: 'beds', buffer: a, fadeIn: 0, fadeOut: 0 })
    const t2 = createEmptyTrack({ name: 'B', role: 'sfx', personId: 'sfx', buffer: a, fadeIn: 0, fadeOut: 0 })
    const mix = mixdownTracks([t1, t2])
    expect(mix.getChannelData(0)[2000]).toBeCloseTo(1.6, 3)
  })

  it('crossfades comp switch points with equal power and no discontinuity', () => {
    const sr = 48000
    const dc = (v: number) => {
      const b = new AudioBuffer({ length: sr * 2, numberOfChannels: 1, sampleRate: sr })
      b.getChannelData(0).fill(v)
      return b
    }
    let tracks = [
      createEmptyTrack({ name: 'H1', role: 'vocal', personId: 'host', take: 1, buffer: dc(0.5), listen: true, fadeIn: 0, fadeOut: 0 }),
      createEmptyTrack({ name: 'H2', role: 'vocal', personId: 'host', take: 2, buffer: dc(0.5), listen: false, fadeIn: 0, fadeOut: 0 }),
    ]
    tracks = assignCompRange(tracks, tracks[1].id, 1, 1.5)
    const w = takeAudibleWindows(tracks, tracks[1])
    expect(w).toEqual([{ start: 1, end: 1.5, xfadeIn: true, xfadeOut: true }])
    const mix = mixdownTracks(tracks, { crossfadeSec: 0.016 })
    const L = mix.getChannelData(0)
    // Largest sample-to-sample jump around the switch stays tiny (no click)…
    let jump = 0
    for (let i = sr * 0.98; i < sr * 1.02; i++) jump = Math.max(jump, Math.abs(L[i + 1] - L[i]))
    expect(jump).toBeLessThan(0.01)
    // …and the equal-power crossfade peaks at +3 dB for correlated material, never drops out.
    let min = Infinity
    for (let i = sr * 0.98; i < sr * 1.02; i++) min = Math.min(min, L[i])
    expect(min).toBeGreaterThan(0.49)
    // Power sums to one at every point of the fade.
    for (const t of [0.992, 0.996, 1, 1.004, 1.008]) {
      const gi = compGainAt(w, t, 0.016)
      const go = compGainAt(takeAudibleWindows(tracks, tracks[0]), t, 0.016)
      expect(gi * gi + go * go).toBeCloseTo(1, 5)
    }
  })

  it('renderMixPlan resamples inside the worker path', () => {
    const src = sine(440, 0.3, 1, 44100)
    const { left } = renderMixPlan({
      sampleRate: 48000,
      startSec: 0,
      endSec: 1,
      tracks: [{ channels: [src], sourceRate: 44100, pan: 0, volume: 1, automation: [], clips: [{ sourceStart: 0, duration: 1, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0 }], windows: null }],
    })
    expect(left.length).toBe(48000)
    expect(rms(left, 1000, 47000)).toBeCloseTo(0.3 / Math.SQRT2, 2)
  })
})

describe('master core', () => {
  it('matches −16 LUFS stereo and stays under −1 dBTP', () => {
    const sr = 48000
    const l = sine(997, 0.05, 5, sr)
    const r = sine(997, 0.05, 5, sr)
    for (let i = 0; i < l.length; i += 4800) {
      l[i] += 0.3
      r[i] += 0.3
    }
    const res = processMaster([l, r], sr, { matchLufs: true })
    expect(res.lufs).toBeGreaterThan(-16.6)
    expect(res.lufs).toBeLessThan(-15.4)
    expect(res.truePeakDb).toBeLessThanOrEqual(-0.95)
  })

  it('detects an effectively-mono mix', () => {
    const x = sine(300, 0.3, 0.2, 48000)
    expect(isEffectivelyMono([x, x.slice()])).toBe(true)
    expect(isEffectivelyMono([x, sine(500, 0.3, 0.2, 48000)])).toBe(false)
  })
})

describe('ID3v2.4', () => {
  it('writes a valid header, text frames, APIC and chapters', () => {
    const tag = buildId3v24(
      {
        title: 'Episode 1',
        artist: 'Forged',
        album: 'Show',
        artwork: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
        chapters: [{ title: 'Intro', startSec: 0 }, { title: 'Main', startSec: 61.5 }],
      },
      120,
    )
    expect(Array.from(tag.slice(0, 6))).toEqual([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])
    const size = (tag[6] << 21) | (tag[7] << 14) | (tag[8] << 7) | tag[9]
    expect(size).toBe(tag.length - 10)
    for (const b of tag.slice(6, 10)) expect(b & 0x80).toBe(0)
    const ascii = new TextDecoder('latin1').decode(tag)
    for (const id of ['TIT2', 'TPE1', 'TALB', 'APIC', 'CTOC', 'CHAP']) expect(ascii).toContain(id)
    expect(ascii).toContain('image/jpeg')
    // First frame: TIT2, sync-safe size, UTF-8 encoding byte.
    expect(ascii.slice(10, 14)).toBe('TIT2')
    const fsize = (tag[14] << 21) | (tag[15] << 14) | (tag[16] << 7) | tag[17]
    expect(fsize).toBe(1 + 'Episode 1'.length)
    expect(tag[20]).toBe(0x03)
    // Second chapter ends at the episode duration (120 s → 120000 ms).
    const chap1 = ascii.indexOf('chp1\u0000', ascii.lastIndexOf('CHAP'))
    const dv = new DataView(tag.buffer, tag.byteOffset + chap1 + 5)
    expect(dv.getUint32(0)).toBe(61500)
    expect(dv.getUint32(4)).toBe(120000)
    expect(Array.from(syncSafe(0x0fffffff))).toEqual([0x7f, 0x7f, 0x7f, 0x7f])
  })
})

describe('take journal chunk math', () => {
  it('splits arbitrary appends into fixed ~1 s chunks and reassembles exactly', () => {
    const sr = 48000
    const frames = chunkFramesFor(sr, 1)
    expect(frames).toBe(48000)
    expect(chunkFramesFor(sr, 10)).toBe(96000) // clamped to 2 s
    const acc = new ChunkAccumulator(1, frames)
    const src = sine(220, 0.4, 2.7, sr)
    const out: Float32Array[][] = []
    for (let i = 0; i < src.length; i += 4096) out.push(...acc.push([src.subarray(i, i + 4096)]))
    expect(out.length).toBe(2)
    expect(acc.pendingFrames).toBe(src.length - 2 * frames)
    const tail = acc.drain()!
    expect(tail[0].length).toBe(src.length - 2 * frames)
    expect(acc.totalFrames).toBe(src.length)
    const encoded = [...out, tail].map((c) => decodeChunkInt16(encodeChunkInt16(c), 1))
    const back = assembleChunks(encoded, 1)[0]
    expect(back.length).toBe(src.length)
    let err = 0
    for (let i = 0; i < src.length; i++) err = Math.max(err, Math.abs(back[i] - src[i]))
    expect(err).toBeLessThanOrEqual(1 / 32768)
  })

  it('interleaves stereo Int16 correctly and recognises quota errors', () => {
    const l = new Float32Array([0.5, -0.5])
    const r = new Float32Array([0.25, 1.5])
    const i16 = encodeChunkInt16([l, r])
    expect(Array.from(i16)).toEqual([16384, 8192, -16384, 32767])
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError(new Error('nope'))).toBe(false)
  })
})

describe('latency', () => {
  it('computes (cueStart − captureStart) + round-trip × sr', () => {
    const f = latencyCompensationFrames({
      sampleRate: 48000,
      cueStartFrame: 96000,
      captureStartFrame: 96480,
      outputLatency: 0.02,
      baseLatency: 0.005,
      inputLatency: 0.01,
    })
    expect(f).toBe(-480 + Math.round(0.035 * 48000))
    expect(latencyCompensationFrames({ sampleRate: 48000, measuredRoundTripSec: 0.012, outputLatency: 1 })).toBe(576)
  })

  it('finds a click onset in a noisy loop-back', () => {
    const x = new Float32Array(8000)
    for (let i = 0; i < x.length; i++) x[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.001
    x[5000] = 0.6
    x[5001] = -0.5
    expect(findClickOnset(x, 3000, 7000)).toBe(5000)
    expect(findClickOnset(new Float32Array(8000), 3000, 7000)).toBe(-1)
  })
})

describe('dither + dynamics', () => {
  it('TPDF dither decorrelates quantization; 16-bit grid is detected', () => {
    const x = new Float32Array(48000).fill(0.3 / 32768) // 0.3 LSB: truncates to silence without dither
    expect(Array.from(floatToInt16(x, false).slice(0, 4))).toEqual([0, 0, 0, 0])
    const d = floatToInt16(x, true)
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    expect(mean).toBeGreaterThan(0.2)
    expect(mean).toBeLessThan(0.4)
    expect(isOn16BitGrid([new Float32Array([1 / 32768, -5 / 32768])])).toBe(true)
    expect(isOn16BitGrid([sine(100, 0.3, 0.1, 48000)])).toBe(false)
  })

  it('gate closes on room tone, opens on speech, with no hard steps', () => {
    const sr = 48000
    const x = new Float32Array(sr)
    for (let i = 0; i < sr; i++) x[i] = 0.003 * Math.sin(i * 0.37)
    const tone = sine(300, 0.3, 0.3, sr)
    x.set(tone, sr * 0.4)
    gateChannels([x], sr, { threshold: 0.02 })
    expect(rms(x, 0, sr * 0.3)).toBeLessThan(0.0005)
    expect(rms(x, sr * 0.45, sr * 0.65)).toBeGreaterThan(0.2)
    let jump = 0
    for (let i = 1; i < sr; i++) jump = Math.max(jump, Math.abs(x[i] - x[i - 1]))
    expect(jump).toBeLessThan(0.05)
  })

  it('de-esser reduces a hot 6.5 kHz burst but leaves a 300 Hz voice alone', () => {
    const sr = 48000
    const voice = sine(300, 0.3, 0.5, sr)
    const vRms = rms(voice)
    const red = deEssChannels([voice], sr)
    expect(red).toBe(0)
    expect(rms(voice)).toBeCloseTo(vRms, 3)
    const ess = sine(6500, 0.3, 0.5, sr)
    const eRms = rms(ess, sr * 0.1, sr * 0.5)
    expect(deEssChannels([ess], sr)).toBeGreaterThan(3)
    expect(rms(ess, sr * 0.1, sr * 0.5)).toBeLessThan(eRms * 0.7)
  })
})
