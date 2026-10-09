/**
 * Filler-word, repeated-word and long-pause suggestions from word timings. Staff accept or
 * reject each; accepted ones become cuts. Long pauses are shortened (not removed) so the
 * conversation keeps its breathing room — important in survivor interviews. Pure.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'
import type { Cut } from '@/lib/podcast/safety/render'

/** Always-safe fillers. "like", "you know", "sort of" are only flagged when set off by a pause or comma. */
export const DEFAULT_FILLERS = ['um', 'uh', 'erm', 'er', 'uhm', 'hmm', 'like', 'you know']
/** Words that are fillers wherever they appear. */
export const UM_WORDS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'eh', 'hmm', 'mm', 'mhm'])
/** Hedges that are only filler when set off by a comma or a pause ("it was, like, hard" — not "I like dogs"). */
export const SET_OFF_HEDGES = new Set(['like', 'sort of', 'kind of'])
/** Phrases worth a listen before cutting, wherever they appear. */
export const CHECK_PHRASES = new Set(['you know', 'i mean'])
export const LONG_PAUSE_S = 1.2
export const PAUSE_TARGET_S = 0.6
/** A hedge preceded by a gap this long counts as set off. */
const HEDGE_GAP_S = 0.25

export type SuggestionKind = 'filler' | 'repeat' | 'pause'

export type Suggestion = {
  /** Stable across re-runs and reloads: `<kind>@<start ms>`. */
  id: string
  kind: SuggestionKind
  label: string
  /** 'high' = almost always safe to remove; 'check' = listen first ("like", "you know"). */
  confidence: 'high' | 'check'
  /** Region to play for context. */
  start: number
  end: number
  /** What gets removed. */
  cut: Cut
}

const clean = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')
const endsWithComma = (w: TranscriptWord) => /[,;]$/.test(w.w)

export function suggestionId(kind: SuggestionKind, start: number) {
  return `${kind}@${Math.round(start * 1000)}`
}

/** Is a filler match at [i, i+len) a real filler, or a hedge used as a normal word ("I like dogs")? */
function setOff(words: TranscriptWord[], i: number, len: number) {
  const first = words[i]
  const last = words[i + len - 1]
  const prev = words[i - 1]
  if (endsWithComma(last)) return true
  if (prev && endsWithComma(prev)) return true
  if (!prev) return false
  return first.s - prev.e >= HEDGE_GAP_S
}

function cutTo(words: TranscriptWord[], i: number, last: number): Cut {
  // Cut from the filler start to the next word (swallows the filler's own trailing gap),
  // but never more than 0.25 s past the filler.
  const next = words[last + 1]
  const end = next ? Math.min(next.s, words[last].e + 0.25) : words[last].e
  return { start: words[i].s, end: Math.max(end, words[last].e) }
}

export function findFillers(words: TranscriptWord[], fillers: string[] = DEFAULT_FILLERS): Suggestion[] {
  const phrases = Array.from(new Set(fillers.map((f) => f.trim().toLowerCase()).filter(Boolean)))
    .map((f) => f.split(/\s+/).map(clean))
    .filter((p) => p.length && p.every(Boolean))
    .sort((a, b) => b.length - a.length)
  const out: Suggestion[] = []
  for (let i = 0; i < words.length; i++) {
    for (const p of phrases) {
      if (i + p.length > words.length) continue
      let ok = true
      for (let k = 0; k < p.length && ok; k++) ok = clean(words[i + k].w) === p[k]
      if (!ok) continue
      const phrase = p.join(' ')
      const hedge = SET_OFF_HEDGES.has(phrase)
      if (hedge && !setOff(words, i, p.length)) continue
      // Only the um/uh class is safe to accept in bulk; anything else deserves a listen.
      const check = hedge || CHECK_PHRASES.has(phrase) || !p.every((w) => UM_WORDS.has(w))
      const first = words[i]
      const last = words[i + p.length - 1]
      out.push({
        id: suggestionId('filler', first.s),
        kind: 'filler',
        confidence: check ? 'check' : 'high',
        label: `“${words.slice(i, i + p.length).map((w) => w.w.replace(/[.,!?;:]+$/, '')).join(' ')}”`,
        start: first.s,
        end: last.e,
        cut: cutTo(words, i, i + p.length - 1),
      })
      i += p.length - 1
      break
    }
  }
  return out
}

/** Stutters and doubled words ("I I I think", "the the"): keep the last, cut the earlier ones. */
export function findRepeats(words: TranscriptWord[], maxGap = 1): Suggestion[] {
  const out: Suggestion[] = []
  for (let i = 0; i < words.length; i++) {
    const w = clean(words[i].w)
    if (!w || UM_WORDS.has(w)) continue
    let j = i
    while (j + 1 < words.length && clean(words[j + 1].w) === w && words[j + 1].s - words[j].e < maxGap) j++
    if (j === i) continue
    out.push({
      id: suggestionId('repeat', words[i].s),
      kind: 'repeat',
      confidence: 'high',
      label: `Repeated “${words[i].w.replace(/[.,!?;:]+$/, '')}” ×${j - i + 1}`,
      start: words[i].s,
      end: words[j].e,
      // Remove words i..j-1 (and their gaps); the last copy stays.
      cut: { start: words[i].s, end: words[j].s },
    })
    i = j
  }
  return out
}

export function findLongPauses(words: TranscriptWord[], min = LONG_PAUSE_S, target = PAUSE_TARGET_S): Suggestion[] {
  const out: Suggestion[] = []
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].s - words[i - 1].e
    if (gap <= min) continue
    const half = target / 2
    out.push({
      id: suggestionId('pause', words[i - 1].e),
      kind: 'pause',
      confidence: 'high',
      label: `${gap.toFixed(1)} s pause → ${target.toFixed(1)} s`,
      start: words[i - 1].e,
      end: words[i].s,
      cut: { start: words[i - 1].e + half, end: words[i].s - half },
    })
  }
  return out
}

export type SuggestOptions = { fillers?: string[]; repeats?: boolean; pauses?: boolean }

/** All suggestions, sorted by time, with overlapping ones dropped (first wins). */
export function findSuggestions(words: TranscriptWord[], opts: SuggestOptions = {}): Suggestion[] {
  const all = [
    ...findFillers(words, opts.fillers ?? DEFAULT_FILLERS),
    ...(opts.repeats === false ? [] : findRepeats(words)),
    ...(opts.pauses === false ? [] : findLongPauses(words)),
  ].sort((a, b) => a.cut.start - b.cut.start || a.cut.end - b.cut.end)
  const out: Suggestion[] = []
  for (const s of all) {
    const last = out[out.length - 1]
    if (last && s.cut.start < last.cut.end && s.id !== last.id) continue
    out.push(s)
  }
  return out
}

/** True for the "um / uh" class of fillers that are safe to accept in bulk. */
export function isUmUh(s: Suggestion) {
  return s.kind === 'filler' && s.confidence === 'high'
}
