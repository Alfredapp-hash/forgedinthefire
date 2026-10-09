/**
 * Minimal hand-written ID3v2.4 tag writer (no third-party code):
 * TIT2 / TPE1 / TALB text, APIC front cover, CHAP + CTOC chapters (ID3v2 Chapter Frame
 * Addendum). UTF-8 text encoding (0x03), sync-safe sizes, no unsynchronisation.
 */

export type Id3Chapter = { title: string; startSec: number; endSec?: number }

export type Id3Tags = {
  title?: string
  artist?: string
  album?: string
  /** JPEG or PNG bytes */
  artwork?: Uint8Array
  artworkMime?: string
  chapters?: Id3Chapter[]
}

const enc = new TextEncoder()

export function syncSafe(n: number): Uint8Array {
  if (n < 0 || n > 0x0fffffff) throw new Error('ID3 size out of range')
  return new Uint8Array([(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f])
}

function u32(n: number) {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function latin1(text: string) {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

export function frame(id: string, body: Uint8Array): Uint8Array {
  if (id.length !== 4) throw new Error('ID3 frame id must be 4 chars')
  return concat([latin1(id), syncSafe(body.length), new Uint8Array([0, 0]), body])
}

export function textFrame(id: string, text: string): Uint8Array {
  return frame(id, concat([new Uint8Array([0x03]), enc.encode(text)]))
}

function sniffMime(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return 'image/jpeg'
}

export function apicFrame(image: Uint8Array, mime?: string): Uint8Array {
  return frame(
    'APIC',
    concat([
      new Uint8Array([0x03]), // UTF-8 description
      latin1(mime || sniffMime(image)),
      new Uint8Array([0x00]),
      new Uint8Array([0x03]), // front cover
      new Uint8Array([0x00]), // empty description
      image,
    ]),
  )
}

export function chapFrame(elementId: string, ch: Id3Chapter, endSec: number): Uint8Array {
  const startMs = Math.max(0, Math.round(ch.startSec * 1000))
  const endMs = Math.max(startMs, Math.round(endSec * 1000))
  return frame(
    'CHAP',
    concat([
      latin1(elementId),
      new Uint8Array([0x00]),
      u32(startMs),
      u32(endMs),
      u32(0xffffffff), // start byte offset unused
      u32(0xffffffff),
      textFrame('TIT2', ch.title),
    ]),
  )
}

export function ctocFrame(childIds: string[]): Uint8Array {
  return frame(
    'CTOC',
    concat([
      latin1('toc'),
      new Uint8Array([0x00]),
      new Uint8Array([0x03]), // top-level + ordered
      new Uint8Array([childIds.length & 0xff]),
      ...childIds.map((id) => concat([latin1(id), new Uint8Array([0x00])])),
    ]),
  )
}

/** Build a complete ID3v2.4 tag. `durationSec` closes the last chapter when endSec is missing. */
export function buildId3v24(tags: Id3Tags, durationSec?: number): Uint8Array {
  const frames: Uint8Array[] = []
  if (tags.title) frames.push(textFrame('TIT2', tags.title))
  if (tags.artist) frames.push(textFrame('TPE1', tags.artist))
  if (tags.album) frames.push(textFrame('TALB', tags.album))
  if (tags.artwork && tags.artwork.length) frames.push(apicFrame(tags.artwork, tags.artworkMime))
  const chapters = [...(tags.chapters || [])].sort((a, b) => a.startSec - b.startSec).slice(0, 255)
  if (chapters.length) {
    const ids = chapters.map((_, i) => `chp${i}`)
    frames.push(ctocFrame(ids))
    chapters.forEach((ch, i) => {
      const end = ch.endSec ?? chapters[i + 1]?.startSec ?? durationSec ?? ch.startSec
      frames.push(chapFrame(ids[i], ch, end))
    })
  }
  const body = concat(frames)
  const header = concat([latin1('ID3'), new Uint8Array([0x04, 0x00, 0x00]), syncSafe(body.length)])
  return concat([header, body])
}
