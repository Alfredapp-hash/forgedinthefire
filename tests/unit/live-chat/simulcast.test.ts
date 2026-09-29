import { describe, expect, it } from 'vitest'
import {
  buildIngestTarget,
  mapCloudflareOutputState,
  maskIngestUrl,
  maskSecret,
  parseDestinationInput,
  parseIngestUrl,
  summarizeDestinations,
} from '@/lib/podcast/live/simulcast'
import { applyModerationEvent, mergeMessages, type ChatMessagePublic, type ChatSettings } from '@/lib/podcast/live/chat'

describe('masking', () => {
  it('shows only the last 4 characters of a key', () => {
    expect(maskSecret('abcd-1234-efgh-5678')).toBe('••••5678')
    expect(maskSecret('short')).toBe('••••••')
    expect(maskSecret(null)).toBeNull()
    expect(maskSecret('')).toBeNull()
  })

  it('keeps scheme, host and app; hides anything that can be a key', () => {
    expect(maskIngestUrl('rtmps://a.rtmps.youtube.com:443/live2')).toBe('rtmps://a.rtmps.youtube.com:443/live2')
    expect(maskIngestUrl('rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh')).toBe('rtmps://a.rtmps.youtube.com:443/live2/••••')
    expect(maskIngestUrl('https://customer-x.cloudflarestream.com/SECRETKEY/webRTC/publish')).toBe(
      'https://customer-x.cloudflarestream.com/SECRETKEY/••••',
    )
    expect(maskIngestUrl('https://whip.example.org/publish?token=abc')).toBe('https://whip.example.org/publish?••••')
    expect(maskIngestUrl('not a url')).toBe('••••')
  })
})

describe('destination input', () => {
  it('fills the YouTube preset and requires a key', () => {
    const r = parseDestinationInput({ label: 'YT', kind: 'youtube', streamKey: 'abcd-1234' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ protocol: 'rtmps', url: 'rtmps://a.rtmps.youtube.com:443/live2', streamKey: 'abcd-1234' })
    expect(parseDestinationInput({ label: 'YT', kind: 'youtube' })).toMatchObject({ ok: false })
  })
  it('accepts a key already in the RTMP path, and WHIP URLs without a key', () => {
    expect(parseDestinationInput({ label: 'x', kind: 'custom', url: 'rtmp://relay.example.org/live/key123' }).ok).toBe(true)
    expect(parseDestinationInput({ label: 'x', kind: 'custom', url: 'https://relay.example.org/whip' }).ok).toBe(true)
    expect(parseIngestUrl('ftp://nope')).toBeNull()
    expect(parseIngestUrl('rtmp://')).toBeNull()
  })
  it('rejects empty labels and bad urls', () => {
    expect(parseDestinationInput({ label: '', kind: 'custom', url: 'rtmp://x/y/z' })).toMatchObject({ ok: false })
    expect(parseDestinationInput({ label: 'x', kind: 'custom', url: 'nope' })).toMatchObject({ ok: false })
    expect(parseDestinationInput({ label: 'x', kind: 'tiktok', url: 'rtmp://x/y/z' })).toMatchObject({ ok: false })
  })
  it('builds the provider target', () => {
    expect(buildIngestTarget('rtmps://a/live2/', 'k')).toEqual({ url: 'rtmps://a/live2', streamKey: 'k' })
    expect(buildIngestTarget('https://w/whip', null)).toEqual({ url: 'https://w/whip', streamKey: null })
  })
})

describe('Cloudflare output state mapping', () => {
  const t0 = 1_000_000
  it('connected → live, error → failed with the reason', () => {
    expect(mapCloudflareOutputState({ enabled: true, status: { current: { state: 'connected' } } })).toEqual({ state: 'live', detail: null })
    expect(mapCloudflareOutputState({ enabled: true, status: { current: { state: 'error', reason: 'bad key' } } })).toEqual({
      state: 'failed',
      detail: 'bad key',
    })
  })
  it('disconnected is "queued" inside the grace window, "failed" after it', () => {
    const out = { enabled: true, status: { current: { state: 'disconnected' } } }
    expect(mapCloudflareOutputState(out, { sinceMs: t0, nowMs: t0 + 10_000 }).state).toBe('queued')
    expect(mapCloudflareOutputState(out, { sinceMs: t0, nowMs: t0 + 60_000 }).state).toBe('failed')
    expect(mapCloudflareOutputState({ enabled: true, status: null }, { sinceMs: t0, nowMs: t0 + 1000 }).state).toBe('queued')
  })
  it('a drop after having connected is failed; disabled and missing outputs are reported', () => {
    expect(
      mapCloudflareOutputState({ enabled: true, status: { current: { state: 'disconnected' }, last: { state: 'connected' } } }).state,
    ).toBe('failed')
    expect(mapCloudflareOutputState({ enabled: false }).state).toBe('disabled')
    expect(mapCloudflareOutputState(null).state).toBe('failed')
  })
  it('summarises for the card', () => {
    expect(
      summarizeDestinations([
        { state: 'live', enabled: true },
        { state: 'failed', enabled: true },
        { state: 'live', enabled: false },
      ]),
    ).toEqual({ enabled: 2, failed: 1, live: 1, text: '1 live · 1 failed' })
    expect(summarizeDestinations([]).text).toBe('none enabled')
  })
})

const msg = (id: string, at: number): ChatMessagePublic => ({
  id,
  session_id: 's',
  display_name: 'A',
  body: 'hi',
  kind: 'message',
  created_at: new Date(at).toISOString(),
})

describe('viewer-side event application', () => {
  const settings: ChatSettings = { enabled: true, mode: 'all', slowModeSec: 0, pinned: msg('p', 1) }
  it('hide removes messages and clears a hidden pin', () => {
    const next = applyModerationEvent({ messages: [msg('a', 1), msg('p', 1)], settings }, { type: 'hide', ids: ['p'] })
    expect(next.messages.map((m) => m.id)).toEqual(['a'])
    expect(next.settings.pinned).toBeNull()
  })
  it('settings merge keeps the pin; pin replaces it', () => {
    const next = applyModerationEvent({ messages: [], settings }, { type: 'settings', settings: { enabled: true, mode: 'questions', slowModeSec: 30 } })
    expect(next.settings).toMatchObject({ mode: 'questions', slowModeSec: 30, pinned: settings.pinned })
    expect(applyModerationEvent({ messages: [], settings }, { type: 'pin', message: null }).settings.pinned).toBeNull()
  })
  it('merge de-duplicates, orders and caps', () => {
    const merged = mergeMessages([msg('b', 2), msg('a', 1)], [msg('b', 2), msg('c', 3)], 2)
    expect(merged.map((m) => m.id)).toEqual(['b', 'c'])
  })
})
