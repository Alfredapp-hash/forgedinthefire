/**
 * Clip captions: pick the transcript words inside a range, hide anything redacted, group them into
 * short on-screen phrases, wrap them into lines, and write the clip's SRT. Pure.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'
import type { ProtectedTerm } from '@/lib/podcast/safety/record'
import { asTerms, normalizeToken } from '@/lib/podcast/safety/protected-words'
import { CLIP_MAX_SEC, CLIP_MIN_SEC, type CaptionGroup, type ClipRange, type ClipWord, type RedactedRange } from './types'

export const REMOVED = '[removed]'

/** Labels the safety pass writes into transcript_words; they are already safe but never shown verbatim. */
const REDACTION_TOKEN = /^\[(name|place|address|detail|removed|bleep|redacted)\][.,!?;:]*$/i

// ── Range validation ─────────────────────────────────────────────────────────

export type RangeCheck = { ok: true; range: ClipRange } | { ok: false; error: string }

/** Validate and tidy a clip range against the episode length. */
export function validateClipRange(range: ClipRange, durationSec: number | null | undefined): RangeCheck {
  const start = Number(range.startSec)
  const end = Number(range.endSec)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: 'Pick a start and end time.' }
  if (start < 0) return { ok: false, error: 'The clip cannot start before the episode does.' }
  if (end <= start) return { ok: false, error: 'The clip has to end after it starts.' }
  const duration = Number(durationSec)
  if (Number.isFinite(duration) && duration > 0 && end > duration + 0.05) {
    return { ok: false, error: 'The clip runs past the end of the episode.' }
  }
  const len = end - start
  if (len < CLIP_MIN_SEC - 1e-6) return { ok: false, error: `Clips need to be at least ${CLIP_MIN_SEC} seconds.` }
  if (len > CLIP_MAX_SEC + 1e-6) return { ok: false, error: `Clips can be at most ${CLIP_MAX_SEC} seconds.` }
  return { ok: true, range: { startSec: round2(start), endSec: round2(end) } }
}

/** Nudge a dragged range into the allowed length without moving its anchor. */
export function clampClipRange(range: ClipRange, durationSec: number, anchor: 'start' | 'end' = 'start'): ClipRange {
  const duration = Math.max(0, durationSec)
  let start = Math.max(0, Math.min(range.startSec, duration))
  let end = Math.max(0, Math.min(range.endSec, duration))
  if (end < start) [start, end] = [end, start]
  const len = Math.min(CLIP_MAX_SEC, Math.max(CLIP_MIN_SEC, end - start))
  if (anchor === 'start') {
    end = start + len
    if (end > duration) {
      end = duration
      start = Math.max(0, end - len)
    }
  } else {
    start = end - len
    if (start < 0) {
      start = 0
      end = Math.min(duration, len)
    }
  }
  return { startSec: round2(start), endSec: round2(end) }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// ── Redaction ────────────────────────────────────────────────────────────────

function overlaps(a: { start: number; end: number }, s: number, e: number) {
  return a.start < e && s < a.end
}

/** Does this transcript word need hiding: inside a bleep, a redaction label, or a protected term. */
export function isRedactedWord(
  word: TranscriptWord,
  redactions: RedactedRange[],
  terms: Set<string>,
): boolean {
  if (REDACTION_TOKEN.test(word.w)) return true
  if (redactions.some((r) => overlaps(r, word.s, word.e))) return true
  if (terms.size) {
    const token = normalizeToken(word.w).replace(/'s$|'$/g, '')
    if (token && terms.has(token)) return true
  }
  return false
}

function termTokens(terms: (string | ProtectedTerm)[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const term of asTerms(terms || [])) {
    for (const part of term.text.split(/\s+/)) {
      const token = normalizeToken(part)
      if (token.length >= 3) out.add(token)
    }
  }
  return out
}

/**
 * Words inside the clip, re-timed from the clip start, with every redacted word (and any word
 * that overlaps a bleep) replaced by one "[removed]". Consecutive removed words collapse.
 *
 * `terms` is belt and braces: if the safety pass has not run yet, a protected name still never
 * reaches a share clip.
 */
export function clipWords(
  words: TranscriptWord[],
  range: ClipRange,
  redactions: RedactedRange[] = [],
  terms: (string | ProtectedTerm)[] = [],
): ClipWord[] {
  const tokens = termTokens(terms)
  const out: ClipWord[] = []
  const { startSec, endSec } = range
  for (const w of words) {
    if (w.e <= startSec || w.s >= endSec) continue
    const s = Math.max(0, w.s - startSec)
    const e = Math.max(s, Math.min(endSec - startSec, w.e - startSec))
    if (isRedactedWord(w, redactions, tokens)) {
      const prev = out[out.length - 1]
      if (prev?.redacted) {
        prev.e = Math.max(prev.e, e)
        continue
      }
      out.push({ text: REMOVED, s, e, redacted: true })
      continue
    }
    out.push({ text: w.w, s, e, redacted: false })
  }
  return out
}

/** Redacted ranges that fall inside the clip, re-timed from the clip start (for bleeping the audio). */
export function redactionsInClip(redactions: RedactedRange[], range: ClipRange): RedactedRange[] {
  const len = range.endSec - range.startSec
  return redactions
    .filter((r) => overlaps(r, range.startSec, range.endSec))
    .map((r) => ({ start: Math.max(0, r.start - range.startSec), end: Math.min(len, r.end - range.startSec) }))
    .sort((a, b) => a.start - b.start)
}

// ── Grouping + wrapping ──────────────────────────────────────────────────────

export type GroupOptions = { maxChars?: number; maxSeconds?: number; pause?: number; minSeconds?: number }

/**
 * Group words into short on-screen phrases: break at sentence ends, pauses, `maxChars` or
 * `maxSeconds`. Each group is shown from its first word until its last word ends (or the next
 * group starts), so the screen is never blank mid-sentence.
 */
export function captionGroups(words: ClipWord[], opts: GroupOptions = {}): CaptionGroup[] {
  const maxChars = opts.maxChars ?? 44
  const maxSeconds = opts.maxSeconds ?? 4
  const pause = opts.pause ?? 0.8
  const minSeconds = opts.minSeconds ?? 0.6
  const groups: CaptionGroup[] = []
  let cur: ClipWord[] = []
  const flush = () => {
    if (!cur.length) return
    groups.push({ words: cur, s: cur[0].s, e: Math.max(cur[cur.length - 1].e, cur[0].s + minSeconds) })
    cur = []
  }
  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1]
      const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length
      if (w.s - prev.e >= pause || chars > maxChars || w.e - cur[0].s > maxSeconds || /[.?!]$/.test(prev.text)) flush()
    }
    cur.push(w)
  }
  flush()
  // A group never runs into the next one.
  for (let i = 0; i < groups.length - 1; i++) {
    groups[i].e = Math.min(groups[i].e, groups[i + 1].s)
    if (groups[i].e < groups[i].s) groups[i].e = groups[i].s
  }
  return groups
}

/** Index of the group on screen at `t` (seconds from clip start), or -1. */
export function groupAt(groups: CaptionGroup[], t: number): number {
  for (let i = 0; i < groups.length; i++) {
    if (t >= groups[i].s && t < groups[i].e) return i
  }
  return -1
}

/** Index (within the group) of the word being spoken at `t`: the last word that has started. */
export function activeWordIndex(group: CaptionGroup, t: number): number {
  let active = -1
  for (let i = 0; i < group.words.length; i++) {
    if (group.words[i].s <= t) active = i
    else break
  }
  return active
}

export type CaptionLine = { words: ClipWord[]; text: string }

/**
 * Greedy word wrap by character count (canvas measurement happens in the painter; character
 * count keeps this pure and deterministic). A word longer than a line stands alone.
 */
export function wrapWords(words: ClipWord[], maxChars: number, maxLines = Infinity): CaptionLine[] {
  const lines: CaptionLine[] = []
  let cur: ClipWord[] = []
  let len = 0
  for (const w of words) {
    const add = w.text.length
    if (cur.length && len + 1 + add > maxChars) {
      lines.push({ words: cur, text: cur.map((x) => x.text).join(' ') })
      cur = []
      len = 0
    }
    cur.push(w)
    len += (len ? 1 : 0) + add
  }
  if (cur.length) lines.push({ words: cur, text: cur.map((x) => x.text).join(' ') })
  if (lines.length > maxLines) {
    // Keep the lines around the middle so the phrase still reads; the group sizing normally
    // prevents this, but a run of long words can exceed it.
    return lines.slice(0, maxLines)
  }
  return lines
}

/**
 * Split a group so every piece fits `maxLines` of `maxChars` — used by the grouping step for
 * layouts with little vertical room.
 */
export function fitGroups(groups: CaptionGroup[], maxChars: number, maxLines: number): CaptionGroup[] {
  const out: CaptionGroup[] = []
  for (const g of groups) {
    const lines = wrapWords(g.words, maxChars)
    if (lines.length <= maxLines) {
      out.push(g)
      continue
    }
    for (let i = 0; i < lines.length; i += maxLines) {
      const words = lines.slice(i, i + maxLines).flatMap((l) => l.words)
      const next = lines[i + maxLines]?.words[0]
      out.push({ words, s: words[0].s, e: next ? next.s : g.e })
    }
  }
  return out
}

// ── SRT ──────────────────────────────────────────────────────────────────────

function srtStamp(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const f = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`
}

/** SRT for the clip (timestamps from the clip start), one cue per caption group. */
export function clipSrt(groups: CaptionGroup[], maxChars = 42): string {
  return groups
    .map((g, i) => {
      const text = wrapWords(g.words, maxChars).map((l) => l.text).join('\n')
      return `${i + 1}\n${srtStamp(g.s)} --> ${srtStamp(g.e)}\n${text}\n`
    })
    .join('\n')
}

/** Sentence-ish spans of the transcript for the "pick a sentence" list. Episode timeline. */
export type SentenceSpan = { startSec: number; endSec: number; text: string }

export function transcriptSentences(words: TranscriptWord[], opts: { maxWords?: number; pause?: number } = {}): SentenceSpan[] {
  const maxWords = opts.maxWords ?? 40
  const pause = opts.pause ?? 1.2
  const out: SentenceSpan[] = []
  let cur: TranscriptWord[] = []
  const flush = () => {
    if (!cur.length) return
    out.push({ startSec: cur[0].s, endSec: cur[cur.length - 1].e, text: cur.map((w) => w.w).join(' ') })
    cur = []
  }
  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1]
      if (/[.?!]$/.test(prev.w) || w.s - prev.e >= pause || cur.length >= maxWords) flush()
    }
    cur.push(w)
  }
  flush()
  return out
}
