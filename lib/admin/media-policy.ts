/**
 * Upload policy for the public `media` bucket (site images, podcast audio, PDFs).
 * Only these types/extensions are accepted; SVG, HTML, JS and friends are refused
 * because the bucket is served publicly and could host active content.
 */
const TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'audio/mpeg': ['mp3'],
  'audio/mp3': ['mp3'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/x-m4a': ['m4a'],
  'audio/aac': ['aac', 'm4a'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/wave': ['wav'],
  'audio/webm': ['webm'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
  'audio/flac': ['flac'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
  'application/pdf': ['pdf'],
}

export const MEDIA_MAX_BYTES = 200 * 1024 * 1024

export function baseMediaMime(mime: unknown) {
  return String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
}

/** Returns a safe extension for (mime, filename) or null if the pair is not allowed. */
export function mediaExtension(mime: unknown, filename: unknown): string | null {
  const base = baseMediaMime(mime)
  const allowed = TYPES[base]
  if (!allowed) return null
  const fromName = String(filename || '')
    .split(/[\\/]/)
    .pop()!
    .split('.')
    .pop()!
    .toLowerCase()
  return allowed.includes(fromName) ? fromName : allowed[0]
}

/** Server-generated object key: no user-controlled path segments. */
export function mediaObjectPath(ext: string) {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${Date.now()}-${rand}.${ext}`
}

/** Matches keys produced by mediaObjectPath (used to validate /complete). */
export const MEDIA_PATH_PATTERN = /^\d{10,16}-[0-9a-z]{8,16}\.[a-z0-9]{2,5}$/
