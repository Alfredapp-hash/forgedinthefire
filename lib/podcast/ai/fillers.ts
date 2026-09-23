/**
 * Filler-word and long-pause suggestions from word timings. Staff accept or reject each;
 * accepted ones become cuts. Long pauses are shortened (not removed) so the conversation
 * keeps its breathing room — important in survivor interviews. Pure.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'
import type { Cut } from '@/lib/podcast/safety/render'

export const DEFAULT_FILLERS = ['um', 'uh', 'erm', 'er', 'uhm', 'hmm', 'you know']
export const LONG_PAUSE_S = 1.2
export const PAUSE_TARGET_S = 0.6

export type Suggestion = {
  id: string
  kind: 'filler' | 'pause'
  label: string
  /** Region to play for context. */
  start: number
  end: number
  /** What gets removed. */
  cut: Cut
}

const clean = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

export function findFillers(words: TranscriptWord[], fillers: string[] = DEFAULT_FILLERS): Suggestion[] {
  const phrases = Array.from(new Set(fillers.map((f) => f.trim().toLowerCase()).filter(Boolean)))
    .map((f) => f.split(/\s+/).map(clean))
    .sort((a, b) => b.length - a.length)
  const out: Suggestion[] = []
  for (let i = 0; i < words.length; i++) {
    for (const p of phrases) {
      if (i + p.length > words.length) continue
      let ok = true
      for (let k = 0; k < p.length && ok; k++) ok = clean(words[i + k].w) === p[k]
      if (!ok) continue
      const first = words[i]
      const last = words[i + p.length - 1]
      // Cut from the filler start to the next word (swallows the filler's own trailing gap),
      // but never more than 0.25 s past the filler.
      const next = words[i + p.length]
      const end = next ? Math.min(next.s, last.e + 0.25) : last.e
      out.push({
        id: `f:${i}`,
        kind: 'filler',
        label: `“${words.slice(i, i + p.length).map((w) => w.w).join(' ')}”`,
        start: first.s,
        end: last.e,
        cut: { start: first.s, end: Math.max(end, last.e) },
      })
      i += p.length - 1
      break
    }
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
      id: `p:${i}`,
      kind: 'pause',
      label: `${gap.toFixed(1)} s pause → ${target.toFixed(1)} s`,
      start: words[i - 1].e,
      end: words[i].s,
      cut: { start: words[i - 1].e + half, end: words[i].s - half },
    })
  }
  return out
}
