// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SafeTusUrlStorage,
  listPendingSlices,
  listPendingTakes,
  savePendingSlice,
  savePendingTake,
  sliceKey,
  takeKey,
  tokenTag,
} from '@/lib/podcast/upload/guest-backup-store'

const TOKEN = 'gt_0123456789abcdef0123456789abcdef0123456789abcdef'

describe('tokenTag / keys', () => {
  it('is short, deterministic and never contains the token', () => {
    const tag = tokenTag(TOKEN)
    expect(tag).toMatch(/^[0-9a-z]{1,7}$/)
    expect(tokenTag(TOKEN)).toBe(tag)
    expect(tokenTag(TOKEN + 'x')).not.toBe(tag)
    expect(TOKEN.includes(tag)).toBe(false)
    expect(sliceKey(tag, 'take', 7)).toBe(`${tag}:take:000007`)
    expect(takeKey(tag, 'take')).toBe(`${tag}:take`)
  })
})

describe('without IndexedDB (private window, blocked storage)', () => {
  it('every call degrades to "memory only" instead of throwing', async () => {
    // jsdom has no indexedDB: openDb resolves null.
    expect(typeof indexedDB).toBe('undefined')
    const tag = tokenTag(TOKEN)
    expect(await savePendingSlice(tag, 'take', 0, new Blob([new Uint8Array(4)]))).toBe(false)
    expect(
      await savePendingTake({
        tag,
        takeId: 'take',
        kind: 'audio',
        mime: 'audio/webm',
        chunksRecorded: 1,
        finalChunks: null,
        durationSec: null,
        startedAtSessionSec: null,
        guestStartHostMs: null,
        clockRttMs: null,
      }),
    ).toBe(false)
    expect(await listPendingSlices(tag)).toEqual([])
    expect(await listPendingTakes(tag)).toEqual([])
  })
})

describe('SafeTusUrlStorage', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores, finds by fingerprint and removes tus upload URLs', async () => {
    const store = new SafeTusUrlStorage()
    const key = await store.addUpload('fp-a', { uploadUrl: 'https://x/1', size: 10 })
    await store.addUpload('fp-b', { uploadUrl: 'https://x/2', size: 20 })
    expect(key.startsWith('fitf-tus::fp-a::')).toBe(true)
    const a = await store.findUploadsByFingerprint('fp-a')
    expect(a).toHaveLength(1)
    expect((a[0] as { uploadUrl: string }).uploadUrl).toBe('https://x/1')
    expect(await store.findAllUploads()).toHaveLength(2)
    await store.removeUpload(key)
    expect(await store.findUploadsByFingerprint('fp-a')).toHaveLength(0)
  })

  it('ignores foreign localStorage keys and corrupt values', async () => {
    window.localStorage.setItem('fitf-guest-session', '{"t":"x"}')
    window.localStorage.setItem('fitf-tus::bad::1', 'not json')
    const store = new SafeTusUrlStorage()
    expect(await store.findAllUploads()).toEqual([])
  })
})
