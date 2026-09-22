/** Non-destructive per-take insert chain. Original PCM stays on the track. */

import { applyEffect, cloneBuffer, type EffectId } from '@/lib/podcast/effects'
import type { StudioTrack } from '@/lib/podcast/multitrack'

export type InsertSlot = {
  id: EffectId
  bypass: boolean
  wet: number
}

export const INSERT_FX: EffectId[] = [
  'normalize',
  'noise_gate',
  'highpass',
  'isolate',
  'presence',
  'deess',
  'compress',
  'limit',
  'room',
  'hall',
  'echo',
  'chorus',
  'telephone',
  'warmth',
]

export const VOICE_CLEANUP_INSERTS: InsertSlot[] = [
  { id: 'highpass', bypass: false, wet: 1 },
  { id: 'isolate', bypass: false, wet: 1 },
]

export const RENDER_ONLY_FX: EffectId[] = ['strip_silence', 'reverse']

export function isInsertFx(id: EffectId) {
  return INSERT_FX.includes(id)
}

export function insertSignature(track: StudioTrack) {
  const slots = (track.inserts || []).map((s) => `${s.id}:${s.bypass ? 1 : 0}:${s.wet.toFixed(2)}`).join('|')
  return `${track.id}:${track.buffer?.length || 0}:${slots}`
}

const cache = new Map<string, AudioBuffer>()

export function invalidateInsertCache(trackId?: string) {
  if (!trackId) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${trackId}:`)) cache.delete(key)
  }
}

function mixWetDry(dry: AudioBuffer, wet: AudioBuffer, wetAmt: number): AudioBuffer {
  const amount = Math.max(0, Math.min(1, wetAmt))
  if (amount >= 0.999) return wet
  if (amount <= 0.001) return dry
  const dryAmt = 1 - amount
  const out = cloneBuffer(dry)
  const channels = Math.min(out.numberOfChannels, wet.numberOfChannels)
  const length = Math.min(out.length, wet.length)
  for (let ch = 0; ch < channels; ch++) {
    const d = out.getChannelData(ch)
    const w = wet.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      d[i] = Math.max(-1, Math.min(1, d[i] * dryAmt + w[i] * amount))
    }
  }
  return out
}

export async function playbackBuffer(track: StudioTrack): Promise<AudioBuffer | null> {
  if (!track.buffer) return null
  const live = (track.inserts || []).filter((s) => !s.bypass && s.wet > 0)
  if (live.length === 0) return track.buffer
  const key = insertSignature(track)
  const hit = cache.get(key)
  if (hit) return hit

  let current = cloneBuffer(track.buffer)
  for (const slot of live) {
    const wet = await applyEffect(cloneBuffer(current), slot.id)
    current = mixWetDry(current, wet, slot.wet)
  }
  if (cache.size > 24) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  cache.set(key, current)
  return current
}

export async function tracksWithInserts(tracks: StudioTrack[]): Promise<StudioTrack[]> {
  const next: StudioTrack[] = []
  for (const track of tracks) {
    const buffer = await playbackBuffer(track)
    next.push(buffer && buffer !== track.buffer ? { ...track, buffer } : track)
  }
  return next
}
