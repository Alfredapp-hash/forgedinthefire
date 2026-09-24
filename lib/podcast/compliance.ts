import type { PodcastChapter, PodcastEpisode } from '@/lib/studio/types'

/**
 * Podcast feed-compliance checks. Enforced in the publish path (episodes route)
 * and surfaced in the publish UI so a broken enclosure is caught here, not on
 * Apple Podcasts Connect / Spotify.
 *
 * Apple / Spotify hard requirements this covers:
 *  - <enclosure> must carry a byte length (file_size) > 0 and a MIME type
 *  - a reachable audio_url
 *  - <itunes:duration> must be > 0
 *  - cover art must be a square JPEG/PNG >= 1400x1400 (up to 3000x3000)
 *  - chapters (podcast:chapters / psc:chapters) must be well-formed
 */

export type ComplianceCheck = {
  id: string
  label: string
  ok: boolean
  detail?: string
  /** true → blocks publish; false → advisory only */
  required: boolean
}

export type ComplianceResult = {
  ok: boolean
  checks: ComplianceCheck[]
  blockers: ComplianceCheck[]
}

/** Minimal shape needed for compliance — lets the UI pass partial episodes. */
export type CompliancePayload = Omit<
  Pick<
    PodcastEpisode,
    'title' | 'audio_url' | 'audio_mime' | 'duration_seconds' | 'file_size' | 'cover_url' | 'chapters' | 'summary'
  >,
  'chapters'
> & { chapters: PodcastChapter[] | null | undefined }

const AUDIO_MIME_ALLOW = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
])

function chaptersWellFormed(chapters: PodcastChapter[] | null | undefined): { ok: boolean; detail?: string } {
  if (!chapters || chapters.length === 0) return { ok: true } // chapters are optional
  const sorted = [...chapters].sort((a, b) => a.start_ms - b.start_ms)
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i]
    if (typeof ch.start_ms !== 'number' || Number.isNaN(ch.start_ms) || ch.start_ms < 0) {
      return { ok: false, detail: `Chapter ${i + 1} has an invalid start time` }
    }
    if (!ch.title || !String(ch.title).trim()) {
      return { ok: false, detail: `Chapter ${i + 1} is missing a title` }
    }
    if (i > 0 && ch.start_ms === sorted[i - 1].start_ms) {
      return { ok: false, detail: `Chapters ${i} and ${i + 1} share the same start time` }
    }
  }
  return { ok: true }
}

/**
 * Synchronous feed-compliance checks. Cover *dimensions* are validated
 * separately (async, requires fetching the image) via `checkCoverArt`.
 */
export function checkFeedCompliance(ep: CompliancePayload): ComplianceResult {
  const checks: ComplianceCheck[] = []

  checks.push({
    id: 'title',
    label: 'Title',
    ok: Boolean(ep.title && ep.title.trim()),
    required: true,
  })

  checks.push({
    id: 'summary',
    label: 'Summary / description',
    ok: Boolean(ep.summary && ep.summary.trim()),
    required: false,
  })

  const hasAudio = Boolean(ep.audio_url && String(ep.audio_url).trim())
  checks.push({
    id: 'audio_url',
    label: 'Audio enclosure URL',
    ok: hasAudio,
    required: true,
  })

  const size = Number(ep.file_size ?? 0)
  checks.push({
    id: 'file_size',
    label: 'Enclosure byte length (Apple RSS)',
    ok: size > 0,
    detail: size > 0 ? undefined : 'Re-save the mix so the RSS enclosure length is > 0',
    required: true,
  })

  const duration = Number(ep.duration_seconds ?? 0)
  checks.push({
    id: 'duration',
    label: 'Duration measured',
    ok: duration > 0,
    detail: duration > 0 ? undefined : 'Duration must be > 0 seconds',
    required: true,
  })

  const mime = (ep.audio_mime || '').toLowerCase()
  checks.push({
    id: 'audio_mime',
    label: 'Audio MIME type',
    // Only fail when audio exists but the mime is a value directories reject.
    ok: !hasAudio || mime === '' || AUDIO_MIME_ALLOW.has(mime),
    detail: hasAudio && mime && !AUDIO_MIME_ALLOW.has(mime) ? `Unsupported enclosure type: ${mime}` : undefined,
    required: true,
  })

  const cover = chaptersWellFormed(ep.chapters)
  checks.push({
    id: 'chapters',
    label: 'Chapters well-formed',
    ok: cover.ok,
    detail: cover.detail,
    required: true,
  })

  checks.push({
    id: 'cover_url',
    label: 'Cover art present',
    ok: Boolean(ep.cover_url && String(ep.cover_url).trim()),
    detail: ep.cover_url ? undefined : 'Apple/Spotify require square art >= 1400x1400',
    required: true,
  })

  const blockers = checks.filter((c) => c.required && !c.ok)
  return { ok: blockers.length === 0, checks, blockers }
}

export type CoverArtResult = {
  ok: boolean
  width?: number
  height?: number
  detail?: string
}

/**
 * Read JPEG/PNG pixel dimensions from the image bytes (range request when the
 * host supports it). Enforces Apple/Spotify: square, >= 1400x1400, <= 3000x3000.
 * Returns ok:true when the image can't be measured (never block on a transient
 * fetch failure) but flags anything we can positively read as non-compliant.
 */
export async function checkCoverArt(url: string): Promise<CoverArtResult> {
  if (!url) return { ok: false, detail: 'No cover art URL' }
  let bytes: Uint8Array
  try {
    // Most JPEG/PNG headers with SOFn markers land well under 128 KB.
    const res = await fetch(url, { headers: { Range: 'bytes=0-131071' } })
    if (!res.ok && res.status !== 206) {
      return { ok: true, detail: `Could not fetch cover (${res.status}); skipped dimension check` }
    }
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch {
    return { ok: true, detail: 'Cover fetch failed; skipped dimension check' }
  }

  const dims = readImageDimensions(bytes)
  if (!dims) {
    return { ok: true, detail: 'Cover format not recognized; skipped dimension check' }
  }
  const { width, height } = dims
  if (width < 1400 || height < 1400) {
    return { ok: false, width, height, detail: `Cover is ${width}x${height}; Apple requires >= 1400x1400` }
  }
  if (width !== height) {
    return { ok: false, width, height, detail: `Cover is ${width}x${height}; must be square` }
  }
  if (width > 3000 || height > 3000) {
    return { ok: false, width, height, detail: `Cover is ${width}x${height}; Apple max is 3000x3000` }
  }
  return { ok: true, width, height }
}

/** Parse width/height from PNG or JPEG header bytes. Returns null if unknown. */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR at offset 16 (width), 20 (height)
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  // JPEG: starts with FFD8; scan segments for a Start-Of-Frame marker (C0-CF, excl. C4/C8/CC)
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      // SOF markers carry frame dimensions
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        const height = view.getUint16(offset + 5)
        const width = view.getUint16(offset + 7)
        return { width, height }
      }
      // Standalone markers (no length payload)
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      const segLength = view.getUint16(offset + 2)
      if (segLength < 2) break
      offset += 2 + segLength
    }
  }

  return null
}
