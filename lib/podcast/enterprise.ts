/**
 * Pure rules for the enterprise sprint: which edits reopen a guest sign-off,
 * and when an episode file has to live in the private bucket.
 */
import { parseStorageObject } from '@/lib/podcast/safety/audio-hash'

export const PRIVATE_MEDIA_BUCKET = 'podcast-private'
export const PRIVATE_MEDIA_PREFIX = `private://${PRIVATE_MEDIA_BUCKET}/`
export const PUBLIC_MEDIA_BUCKET = 'media'

/** Columns that change what a guest approved or what the public file is. */
export const RELEASE_SENSITIVE_FIELDS = [
  'audio_url',
  'audio_sha256',
  'transcript',
  'guest_name',
  'guest_review_required',
  'guest_final_cut_approved',
  'guest_final_cut_audio_url',
  'guest_final_cut_audio_hash',
  'protected_words_reviewed_at',
  'transcript_reviewed_hash',
] as const

export type ReleaseSensitiveField = (typeof RELEASE_SENSITIVE_FIELDS)[number]

export function isReleasedStatus(status: string | null | undefined) {
  return status === 'scheduled' || status === 'published'
}

function same(a: unknown, b: unknown) {
  return (a ?? null) === (b ?? null)
}

/** True when a released episode's file, transcript, guest, or sign-off changed. */
export function releaseSensitiveChanged(
  previous: Partial<Record<ReleaseSensitiveField, unknown>>,
  next: Partial<Record<ReleaseSensitiveField, unknown>>,
) {
  return RELEASE_SENSITIVE_FIELDS.some((key) => !same(previous[key], next[key]))
}

/** Path inside podcast-private, or null when the value is not a private ref. */
export function parsePrivateMediaRef(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(PRIVATE_MEDIA_PREFIX)) return null
  const path = url.slice(PRIVATE_MEDIA_PREFIX.length)
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) return null
  return path
}

export function privateMediaRef(path: string) {
  return `${PRIVATE_MEDIA_PREFIX}${path}`
}

export type MediaPlacement = 'keep' | 'to-private' | 'to-public' | 'reject'

/**
 * Private episodes must not keep a permanent public object URL.
 * Public episodes must not keep a private:// ref, or the feed cannot serve them.
 */
export function mediaPlacement(visibility: string | null | undefined, url: string | null | undefined): MediaPlacement {
  const ref = parsePrivateMediaRef(url)
  if (visibility === 'private') {
    if (!url || ref) return 'keep'
    if (parseStorageObject(url)?.bucket === PUBLIC_MEDIA_BUCKET) return 'to-private'
    return 'reject'
  }
  if (ref) return 'to-public'
  return 'keep'
}
