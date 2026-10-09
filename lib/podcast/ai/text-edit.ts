/**
 * Text-based editing (Descript-style) on top of the browser-Whisper word timings.
 *
 * Staff select words in the transcript and delete them; each deletion becomes a cut region on
 * the ORIGINAL timeline, merged with the filler-suggestion cuts and rendered by the same
 * crossfaded pipeline (lib/podcast/safety/render.ts). Speaker labels are times on the same
 * timeline. Everything here is pure so it can be unit-tested without a DOM.
 */
import type { TranscriptWord, TranscriptCue } from '@/lib/studio/transcript'
import { wordsToCues } from '@/lib/studio/transcript'
import { CUT_XFADE_S, makeTimeMap, mergeRanges, type Cut } from '@/lib/podcast/safety/render'
import { cleanSpeakers, type Speaker } from '@/lib/podcast/safety/record'

export { cleanSpeakers }
export type { Speaker }

/** The persisted part of the text editor (podcast_episode_safety.plan.text_cuts / .speakers). */
export type TextEditState = { cuts: Cut[]; speakers: Speaker[] }

export const EMPTY_TEXT_EDIT: TextEditState = { cuts: [], speakers: [] }

/** A word deletion may swallow at most this much of the gap after the last word (as fillers do). */
export const TRAILING_GAP_S = 0.25
/** Break a paragraph at a pause this long after a sentence end… */
export const PARAGRAPH_PAUSE_S = 1.2
/** …or at any pause this long. */
export const PARAGRAPH_HARD_PAUSE_S = 2.5
/** Also break very long runs of speech so a paragraph never becomes a wall. */
export const PARAGRAPH_MAX_WORDS = 120

// ── Word ranges ↔ cut regions ────────────────────────────────────────────────

/**
 * Cut region for words[from..to] (inclusive): from the first word's start to the next word's
 * start (so the deleted words' own trailing gap goes too), but never more than TRAILING_GAP_S
 * past the last deleted word — long pauses stay untouched.
 */
export function wordRangeToCut(words: TranscriptWord[], from: number, to: number): Cut | null {
  if (!words.length) return null
  const a = Math.max(0, Math.min(from, to))
  const b = Math.min(words.length - 1, Math.max(from, to))
  if (a > b) return null
  const first = words[a]
  const last = words[b]
  const next = words[b + 1]
  const end = next ? Math.min(next.s, last.e + TRAILING_GAP_S) : last.e
  return { start: first.s, end: Math.max(end, last.e) }
}

/** Sorted, merged (touching ranges join). */
export function mergeCuts(cuts: Cut[], gap = 0): Cut[] {
  return mergeRanges(cuts, gap)
}

/** Add a cut, merging with what is there. */
export function addCut(cuts: Cut[], cut: Cut): Cut[] {
  return mergeCuts([...cuts, cut])
}

/** Remove [start, end) from the cut set (restore that stretch), trimming/splitting as needed. */
export function subtractRange(cuts: Cut[], start: number, end: number): Cut[] {
  if (!(end > start)) return mergeCuts(cuts)
  const out: Cut[] = []
  for (const c of mergeCuts(cuts)) {
    if (c.end <= start || c.start >= end) {
      out.push(c)
      continue
    }
    if (c.start < start) out.push({ start: c.start, end: start })
    if (c.end > end) out.push({ start: end, end: c.end })
  }
  return out
}

/** Which words are removed by the cuts (mostly inside one). Index → true. */
export function deletedWords(words: TranscriptWord[], cuts: Cut[]): Uint8Array {
  const out = new Uint8Array(words.length)
  const merged = mergeCuts(cuts)
  if (!merged.length) return out
  let k = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    while (k < merged.length && merged[k].end <= w.s) k++
    if (w.e <= w.s) {
      // Zero-length word: deleted when a cut spans its instant.
      const c = merged[k]
      out[i] = c && c.start <= w.s && w.s < c.end ? 1 : 0
      continue
    }
    // Overlap with every cut that can touch this word (cuts are sorted and disjoint).
    let inside = 0
    for (let j = k; j < merged.length && merged[j].start < w.e; j++) {
      inside += Math.max(0, Math.min(w.e, merged[j].end) - Math.max(w.s, merged[j].start))
    }
    if (inside / (w.e - w.s) > 0.5) out[i] = 1
  }
  return out
}

/** Word indexes of the cut range's contents, for announcements. */
export function wordsInRange(words: TranscriptWord[], cut: Cut): number[] {
  const out: number[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const len = Math.max(1e-6, w.e - w.s)
    const inside = Math.max(0, Math.min(w.e, cut.end) - Math.max(w.s, cut.start))
    if (inside / len > 0.5) out.push(i)
  }
  return out
}

export type DeleteResult = { state: TextEditState; words: number; seconds: number; cut: Cut }

/** Delete words[from..to]: the state with the new cut merged in, plus what to announce. */
export function deleteWordRange(state: TextEditState, words: TranscriptWord[], from: number, to: number): DeleteResult | null {
  const cut = wordRangeToCut(words, from, to)
  if (!cut) return null
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  const before = deletedWords(words, state.cuts)
  let fresh = 0
  for (let i = a; i <= b; i++) if (!before[i]) fresh++
  return { state: { ...state, cuts: addCut(state.cuts, cut) }, words: fresh, seconds: cut.end - cut.start, cut }
}

/** Put words[from..to] back (they may have been deleted in several operations). */
export function restoreWordRange(state: TextEditState, words: TranscriptWord[], from: number, to: number): TextEditState {
  const cut = wordRangeToCut(words, from, to)
  if (!cut) return state
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  // Restore the words themselves and the gap up to the next word, but leave a neighbouring
  // deletion's own words alone.
  const start = words[a].s
  const end = words[b + 1] ? Math.min(words[b + 1].s, cut.end) : cut.end
  return { ...state, cuts: subtractRange(state.cuts, start, Math.max(end, words[b].e)) }
}

/** Seconds removed by a cut set. */
export function cutSeconds(cuts: Cut[]) {
  return mergeCuts(cuts).reduce((n, c) => n + (c.end - c.start), 0)
}

/** Text cuts, filler cuts and anything else, as one merged plan. */
export function combineCuts(...sets: Cut[][]): Cut[] {
  return mergeCuts(sets.flat())
}

// ── Undo / redo ──────────────────────────────────────────────────────────────

export type History<T> = { past: T[]; present: T; future: T[] }

export const HISTORY_LIMIT = 200

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Record a new state. Identical states (by JSON) are not recorded. */
export function pushHistory<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h
  const past = [...h.past, h.present]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h
  const present = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present, future }
}

/** Replace the present without touching the stacks (e.g. after hydration from the server). */
export function resetHistory<T>(present: T): History<T> {
  return createHistory(present)
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0
export const canRedo = <T>(h: History<T>) => h.future.length > 0

// ── Paragraphs and speakers ──────────────────────────────────────────────────

export type Paragraph = {
  /** Inclusive word index range. */
  from: number
  to: number
  start: number
  end: number
  /** Speaker label in force at this paragraph's start, if any. */
  speaker: string | null
}

const SENTENCE_END = /[.?!]["')\]]?$/

/** The speaker label in force at time t (the last label at or before t). */
export function speakerAt(speakers: Speaker[], t: number): string | null {
  let name: string | null = null
  for (const s of speakers) {
    if (s.start <= t + 1e-6) name = s.name
    else break
  }
  return name
}

/** Set (or clear, with an empty name) the label starting at `start`. */
export function setSpeaker(speakers: Speaker[], start: number, name: string): Speaker[] {
  return cleanSpeakers([...speakers, { start, name: name.trim() }])
}

/** Distinct names, in order of first use. */
export function speakerNames(speakers: Speaker[]): string[] {
  const out: string[] = []
  for (const s of speakers) if (!out.includes(s.name)) out.push(s.name)
  return out
}

/**
 * Group words into paragraphs: a new one starts at a speaker label, after a long pause, after
 * a sentence-ending pause, or when a run gets very long.
 */
export function paragraphs(words: TranscriptWord[], speakers: Speaker[] = []): Paragraph[] {
  const out: Paragraph[] = []
  if (!words.length) return out
  const starts = new Set(speakers.map((s) => s.start))
  let from = 0
  let k = 0
  for (let i = 1; i <= words.length; i++) {
    const prev = words[i - 1]
    const cur = words[i]
    let brk = !cur
    if (cur && !brk) {
      // A speaker label at (or in the gap before) this word starts a paragraph.
      while (k < speakers.length && speakers[k].start <= prev.e) k++
      if (k < speakers.length && speakers[k].start <= cur.s + 1e-6) {
        brk = true
        k++
      } else if (starts.has(cur.s)) brk = true
      const gap = cur.s - prev.e
      if (gap >= PARAGRAPH_HARD_PAUSE_S) brk = true
      else if (gap >= PARAGRAPH_PAUSE_S && SENTENCE_END.test(prev.w)) brk = true
      else if (i - from >= PARAGRAPH_MAX_WORDS && SENTENCE_END.test(prev.w)) brk = true
    }
    if (brk) {
      out.push({ from, to: i - 1, start: words[from].s, end: words[i - 1].e, speaker: speakerAt(speakers, words[from].s) })
      from = i
    }
  }
  return out
}

/** Speaker labels on the new timeline after cuts; labels that land on the same instant collapse. */
export function remapSpeakers(speakers: Speaker[], cuts: Cut[], duration: number): Speaker[] {
  const tm = makeTimeMap(cuts, duration)
  if (!tm.cuts.length) return cleanSpeakers(speakers)
  return cleanSpeakers(speakers.map((s) => ({ start: Math.round(tm.map(s.start) * 100) / 100, name: s.name })))
}

/**
 * Caption cues that never straddle a speaker change, each prefixed with a WebVTT voice tag
 * (`<v Name>`) when a speaker is known. Same grouping as the public transcript.vtt route.
 */
export function speakerCues(words: TranscriptWord[], speakers: Speaker[]): TranscriptCue[] {
  if (!speakers.length) return wordsToCues(words)
  const out: TranscriptCue[] = []
  let block: TranscriptWord[] = []
  let name: string | null = null
  const flush = () => {
    if (!block.length) return
    for (const c of wordsToCues(block)) out.push(name ? { ...c, text: `<v ${name.replace(/[<>]/g, '')}>${c.text}` } : c)
    block = []
  }
  for (const w of words) {
    const at = speakerAt(speakers, w.s)
    if (block.length && at !== name) flush()
    name = at
    block.push(w)
  }
  flush()
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.min(out[i].end, out[i + 1].start)
  return out
}

// ── Search and navigation ────────────────────────────────────────────────────

const norm = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}']/gu, '')

export type WordMatch = { from: number; to: number }

/** Every place the phrase occurs (punctuation- and case-insensitive), in order. */
export function searchWords(words: TranscriptWord[], query: string): WordMatch[] {
  const q = query.split(/\s+/).map(norm).filter(Boolean)
  if (!q.length) return []
  const out: WordMatch[] = []
  for (let i = 0; i + q.length <= words.length; i++) {
    let ok = true
    for (let k = 0; k < q.length && ok; k++) ok = norm(words[i + k].w) === q[k]
    if (ok) out.push({ from: i, to: i + q.length - 1 })
  }
  return out
}

/** The first match strictly after `index` (wrapping to the start), or null when there are none. */
export function nextMatch(matches: WordMatch[], index: number, direction: 1 | -1 = 1): WordMatch | null {
  if (!matches.length) return null
  if (direction === 1) return matches.find((m) => m.from > index) ?? matches[0]
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].from < index) return matches[i]
  return matches[matches.length - 1]
}

/** Word index whose time contains t, else the last word that starts before t (−1 before the first). */
export function wordIndexAt(words: TranscriptWord[], t: number): number {
  let lo = 0
  let hi = words.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid].s <= t) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return best
}

/** Time-range matches (fillers, protected hits) as word-index ranges, for "jump to next". */
export function rangesToMatches(words: TranscriptWord[], ranges: { start: number; end: number }[]): WordMatch[] {
  const out: WordMatch[] = []
  for (const r of ranges) {
    let from = -1
    let to = -1
    for (let i = Math.max(0, wordIndexAt(words, r.start)); i < words.length && words[i].s < r.end; i++) {
      if (words[i].e <= r.start) continue
      if (from < 0) from = i
      to = i
    }
    if (from >= 0) out.push({ from, to })
  }
  return out.sort((a, b) => a.from - b.from)
}

// ── Live preview ("play with edits") ─────────────────────────────────────────

export type Segment = { start: number; end: number }

/** Kept stretches of the original timeline once the cuts are removed. */
export function keptSegments(duration: number, cuts: Cut[]): Segment[] {
  const out: Segment[] = []
  let pos = 0
  for (const c of mergeCuts(cuts)) {
    if (c.start >= duration) break
    if (c.start > pos) out.push({ start: pos, end: c.start })
    pos = Math.max(pos, Math.min(c.end, duration))
  }
  if (pos < duration) out.push({ start: pos, end: duration })
  return out
}

/** Original → edited time (what the listener hears), matching the render's crossfade shortening. */
export function editedTime(t: number, cuts: Cut[], duration: number) {
  return makeTimeMap(cuts, duration).map(t)
}

/** Edited → original time (for seeking in the preview). */
export function originalTime(edited: number, cuts: Cut[], duration: number) {
  const segs = keptSegments(duration, cuts)
  // Each segment after the first is written CUT_XFADE_S before the previous one ends (the overlap).
  let w = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const len = s.end - s.start
    if (edited < w + len || i === segs.length - 1) return Math.min(s.end, s.start + Math.max(0, edited - w))
    w += len - CUT_XFADE_S
  }
  return 0
}

/** If t sits inside a cut, the start of the next kept segment (or `duration` when nothing is left). */
export function skipCuts(t: number, cuts: Cut[], duration: number) {
  for (const c of mergeCuts(cuts)) {
    if (t >= c.start && t < c.end) return Math.min(duration, c.end)
    if (c.start > t) break
  }
  return t
}

/** Human summary for the live region: "Deleted 4 words (2.3 s)". */
export function describeDelete(count: number, seconds: number) {
  return `Deleted ${count} word${count === 1 ? '' : 's'} (${seconds.toFixed(1)} s)`
}
