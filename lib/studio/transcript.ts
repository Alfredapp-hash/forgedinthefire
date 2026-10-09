/** Transcript helpers: stored text may be WebVTT, SRT, or plain prose. Pure. */
import { transcriptKind } from '@/lib/studio/release'

export { transcriptKind }

export type TranscriptCue = { start: number; end: number; text: string }

/**
 * One timed word (seconds). Stored in podcast_episodes.transcript_words
 * (20260924000002_podcast_ai_safety.sql). Compact keys keep an hour of speech ~250 KB.
 */
export type TranscriptWord = { w: string; s: number; e: number }

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function toSeconds(stamp: string): number | null {
  const m = stamp.match(TIME)
  if (!m) return null
  const [, h, mm, ss, frac] = m
  return Number(h || 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, '0')) / 1000
}

/** Parse VTT or SRT into cues. Returns [] for plain text. */
export function parseCues(text: string): TranscriptCue[] {
  const kind = transcriptKind(text)
  if (kind === 'text') return []
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const cues: TranscriptCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIdx = lines.findIndex((l) => l.includes('-->'))
    if (timingIdx < 0) continue
    const [a, b] = lines[timingIdx].split('-->')
    const start = toSeconds(a)
    const end = toSeconds(b)
    if (start == null || end == null) continue
    const body = lines.slice(timingIdx + 1).join('\n').trim()
    if (body) cues.push({ start, end, text: body })
  }
  return cues
}

function stamp(sec: number, sep: '.' | ',') {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const f = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`
}

export function cuesToVtt(cues: TranscriptCue[]) {
  return ['WEBVTT', '', ...cues.flatMap((c) => [`${stamp(c.start, '.')} --> ${stamp(c.end, '.')}`, c.text, ''])].join('\n')
}

export function cuesToSrt(cues: TranscriptCue[]) {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n')
}

/** Plain text for display / text/plain transcripts (strips timings and <v Speaker> tags). */
export function transcriptPlainText(text: string) {
  const cues = parseCues(text)
  if (!cues.length) return text.trim()
  return cues.map((c) => stripVoiceTags(c.text)).join('\n')
}

export function stripVoiceTags(line: string) {
  return line.replace(/<v\s+([^>]+)>/g, '$1: ').replace(/<\/?[^>]+>/g, '').trim()
}

// ── Word-level transcripts (browser Whisper) ─────────────────────────────────

/** Validate untrusted JSON into sorted, finite words. Returns [] for anything else. */
export function cleanWords(value: unknown, max = 60000): TranscriptWord[] {
  if (!Array.isArray(value)) return []
  const out: TranscriptWord[] = []
  for (const raw of value.slice(0, max)) {
    const r = (raw ?? {}) as Record<string, unknown>
    const w = String(r.w ?? '').trim().slice(0, 80)
    const s = Number(r.s)
    const e = Number(r.e)
    if (!w || !Number.isFinite(s) || !Number.isFinite(e) || s < 0) continue
    out.push({ w, s: round2(s), e: round2(Math.max(s, e)) })
  }
  return out.sort((a, b) => a.s - b.s)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Words joined as readable prose, with a paragraph break at long pauses. */
export function wordsToPlainText(words: TranscriptWord[], paragraphGap = 2.5) {
  let out = ''
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (i > 0) out += w.s - words[i - 1].e >= paragraphGap && /[.?!]$/.test(words[i - 1].w) ? '\n\n' : ' '
    out += w.w
  }
  return out.trim()
}

/**
 * Group words into caption cues: break at sentence ends, pauses, ~84 characters
 * (two 42-char lines) or ~6 seconds, whichever comes first.
 */
export function wordsToCues(words: TranscriptWord[], opts: { maxChars?: number; maxSeconds?: number; pause?: number } = {}): TranscriptCue[] {
  const maxChars = opts.maxChars ?? 84
  const maxSeconds = opts.maxSeconds ?? 6
  const pause = opts.pause ?? 0.9
  const cues: TranscriptCue[] = []
  let cur: TranscriptWord[] = []
  const flush = () => {
    if (!cur.length) return
    cues.push({ start: cur[0].s, end: Math.max(cur[cur.length - 1].e, cur[0].s + 0.3), text: cur.map((w) => w.w).join(' ') })
    cur = []
  }
  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1]
      const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length
      const tooLong = len > maxChars || w.e - cur[0].s > maxSeconds
      const gap = w.s - prev.e > pause
      const sentence = /[.?!]["')\]]?$/.test(prev.w) && cur.reduce((n, x) => n + x.w.length + 1, 0) > 24
      if (tooLong || gap || sentence) flush()
    }
    cur.push(w)
  }
  flush()
  // Never let a cue run into the next one.
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end, cues[i + 1].start)
  return cues
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}\[\]']/gu, '')

/**
 * Carry timings over to an edited transcript. Unchanged words keep their times;
 * inserted or re-spelled words take times interpolated from their neighbours.
 * Greedy resync with a bounded look-ahead — linear time for typical edits.
 */
export function realignWords(words: TranscriptWord[], text: string, window = 25): TranscriptWord[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (!words.length || !tokens.length) return []
  const out: (TranscriptWord | { w: string; s: number | null; e: number | null })[] = []
  let i = 0
  let j = 0
  while (j < tokens.length) {
    if (i < words.length && norm(words[i].w) === norm(tokens[j])) {
      out.push({ w: tokens[j], s: words[i].s, e: words[i].e })
      i++
      j++
      continue
    }
    // Look for the nearest resync point in either sequence.
    let best: { di: number; dj: number } | null = null
    for (let d = 1; d <= window && !best; d++) {
      for (let a = 0; a <= d; a++) {
        const di = a
        const dj = d - a
        if (i + di < words.length && j + dj < tokens.length && norm(words[i + di].w) === norm(tokens[j + dj])) {
          best = { di, dj }
          break
        }
      }
    }
    if (!best) {
      // Treat as a 1:1 substitution when possible, else an insertion.
      if (i < words.length) {
        out.push({ w: tokens[j], s: words[i].s, e: words[i].e })
        i++
      } else out.push({ w: tokens[j], s: null, e: null })
      j++
      continue
    }
    // Map the unmatched stretch of tokens onto the unmatched stretch of words.
    const spanStart = i < words.length ? words[i].s : null
    const spanEnd = best.di > 0 ? words[i + best.di - 1].e : spanStart
    for (let k = 0; k < best.dj; k++) {
      if (spanStart != null && spanEnd != null && best.di > 0) {
        const a = spanStart + ((spanEnd - spanStart) * k) / best.dj
        const b = spanStart + ((spanEnd - spanStart) * (k + 1)) / best.dj
        out.push({ w: tokens[j + k], s: a, e: b })
      } else out.push({ w: tokens[j + k], s: null, e: null })
    }
    i += best.di
    j += best.dj
  }
  // Fill any untimed words between timed neighbours.
  const result: TranscriptWord[] = []
  for (let k = 0; k < out.length; k++) {
    const cur = out[k]
    if (cur.s != null && cur.e != null) {
      result.push({ w: cur.w, s: round2(cur.s), e: round2(cur.e) })
      continue
    }
    const prev = result[result.length - 1]
    let next: number | null = null
    for (let m = k + 1; m < out.length; m++) if (out[m].s != null) { next = out[m].s; break }
    const s = prev ? prev.e : next ?? 0
    const e = next != null ? Math.max(s, Math.min(next, s + 0.4)) : s + 0.3
    result.push({ w: cur.w, s: round2(s), e: round2(e) })
  }
  return result
}

type EpisodeTranscriptFields = { transcript?: string | null; transcript_words?: unknown }

/**
 * Timed cues for an episode. A pasted VTT/SRT wins (staff chose it deliberately);
 * otherwise browser-Whisper word timings build the cues. Plain prose alone → [].
 */
export function episodeCues(ep: EpisodeTranscriptFields | null | undefined): TranscriptCue[] {
  const text = (ep?.transcript || '').trim()
  // The transcript text is the switch: clearing it withdraws captions too.
  if (!text) return []
  if (transcriptKind(text) !== 'text') return parseCues(text)
  const words = cleanWords(ep?.transcript_words)
  return words.length ? wordsToCues(words) : []
}

/** Whether the episode can serve timed captions (VTT/SRT routes, podcast:transcript rel=captions). */
export function episodeHasTimedTranscript(ep: EpisodeTranscriptFields | null | undefined) {
  const text = (ep?.transcript || '').trim()
  if (!text) return false
  if (transcriptKind(text) !== 'text') return true
  return Array.isArray(ep?.transcript_words) && (ep?.transcript_words as unknown[]).length > 0
}
