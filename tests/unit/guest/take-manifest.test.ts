import { describe, expect, it } from 'vitest'
import {
  CHUNK_MAX_BYTES,
  MAX_CHUNK_INDEX,
  TAKE_MAX_BYTES,
  TUS_MIN_BYTES,
  baseMime,
  chunkIndexFromName,
  chunkPath,
  chunkedTakeRef,
  containerForExt,
  missingIndices,
  parseChunkedTakeRef,
  sniffContainer,
  takeExt,
  takeFolder,
} from '@/lib/podcast/upload/guest-take-manifest'

const INV = '11111111-1111-4111-8111-111111111111'
const TAKE = '33333333-3333-4333-8333-333333333333'

function wavHeader() {
  const b = new Uint8Array(44)
  b.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  b.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  return b
}

describe('types', () => {
  it('accepts WAV, Opus (webm/ogg) and MP4 audio with codecs stripped; camera is video only', () => {
    expect(baseMime('audio/ogg; codecs=opus')).toBe('audio/ogg')
    expect(baseMime(' Audio/WebM;codecs=opus ')).toBe('audio/webm')
    expect(takeExt('audio', 'audio/wav')).toBe('wav')
    expect(takeExt('audio', 'audio/x-wav')).toBe('wav')
    expect(takeExt('audio', 'audio/ogg;codecs=opus')).toBe('ogg')
    expect(takeExt('audio', 'audio/webm;codecs=opus')).toBe('webm')
    expect(takeExt('audio', 'audio/mp4')).toBe('m4a')
    expect(takeExt('camera', 'video/mp4')).toBe('mp4')
    expect(takeExt('camera', 'video/webm')).toBe('webm')
    expect(takeExt('audio', 'video/webm')).toBeNull()
    expect(takeExt('camera', 'audio/wav')).toBeNull()
    expect(takeExt('audio', 'text/html')).toBeNull()
  })

  it('caps: a take may reach 2 GB; slices are far smaller; big slices go resumable', () => {
    expect(TAKE_MAX_BYTES).toBe(2 * 1024 * 1024 * 1024)
    expect(CHUNK_MAX_BYTES).toBeLessThan(TAKE_MAX_BYTES)
    expect(TUS_MIN_BYTES).toBeLessThan(CHUNK_MAX_BYTES)
    // 2 h of 48 kHz mono 16-bit WAV fits.
    expect(2 * 3600 * 48000 * 2 + 44).toBeLessThan(TAKE_MAX_BYTES)
  })
})

describe('paths and refs', () => {
  it('builds zero-padded, contiguous chunk paths under the take folder', () => {
    expect(takeFolder(INV, TAKE)).toBe(`guest-takes/${INV}/t-${TAKE}`)
    expect(chunkPath(INV, TAKE, 42, 'webm')).toBe(`guest-takes/${INV}/t-${TAKE}/000042.webm`)
    expect(chunkIndexFromName('000042.webm', 'webm')).toBe(42)
    expect(chunkIndexFromName('000042.webm', 'wav')).toBeNull()
    expect(chunkIndexFromName('42.webm', 'webm')).toBeNull()
    expect(chunkIndexFromName('../000001.webm', 'webm')).toBeNull()
    expect(chunkIndexFromName(`${String(MAX_CHUNK_INDEX + 1).padStart(6, '0')}.webm`, 'webm')).toBeNull()
  })

  it('round-trips the private take ref and rejects anything else', () => {
    const ref = chunkedTakeRef(INV, TAKE)
    expect(ref).toBe(`private://podcast-guest-takes/take/${INV}/${TAKE}`)
    expect(parseChunkedTakeRef(ref)).toEqual({ inviteId: INV, takeId: TAKE })
    expect(parseChunkedTakeRef(`private://podcast-guest-takes/take/${INV}/../x`)).toBeNull()
    expect(parseChunkedTakeRef('https://example.com/x.webm')).toBeNull()
    expect(parseChunkedTakeRef(null)).toBeNull()
  })
})

describe('missingIndices', () => {
  const have = (...i: number[]) => i.map((index) => ({ index }))
  it('reports gaps below the expected count, or below the highest present index', () => {
    expect(missingIndices(have(0, 1, 2), 3)).toEqual([])
    expect(missingIndices(have(0, 2, 3), 4)).toEqual([1])
    expect(missingIndices(have(0, 1), 4)).toEqual([2, 3])
    expect(missingIndices(have(1, 3))).toEqual([0, 2])
    expect(missingIndices([], 0)).toEqual([])
    expect(missingIndices([])).toEqual([])
  })
})

describe('sniffContainer', () => {
  it('detects WAV/WebM/Ogg/MP4 and nothing else', () => {
    expect(sniffContainer(wavHeader())).toBe('wav')
    expect(sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe('webm')
    expect(sniffContainer(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe('ogg')
    expect(sniffContainer(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBe('mp4')
    expect(sniffContainer(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffContainer(new Uint8Array(0))).toBeNull()
  })

  it('maps extensions to the container they must sniff as', () => {
    expect(containerForExt('m4a')).toBe('mp4')
    expect(containerForExt('mp4')).toBe('mp4')
    expect(containerForExt('wav')).toBe('wav')
    expect(containerForExt('webm')).toBe('webm')
    expect(containerForExt('ogg')).toBe('ogg')
  })
})
