import { describe, expect, it } from 'vitest'
import {
  addCut,
  canRedo,
  canUndo,
  combineCuts,
  createHistory,
  cutSeconds,
  deleteWordRange,
  deletedWords,
  describeDelete,
  editedTime,
  keptSegments,
  mergeCuts,
  nextMatch,
  originalTime,
  paragraphs,
  pushHistory,
  rangesToMatches,
  redo,
  remapSpeakers,
  restoreWordRange,
  searchWords,
  setSpeaker,
  skipCuts,
  speakerAt,
  speakerCues,
  subtractRange,
  undo,
  wordIndexAt,
  wordRangeToCut,
  wordsInRange,
  type TextEditState,
} from '@/lib/podcast/ai/text-edit'
import { findFillers } from '@/lib/podcast/ai/fillers'
import { cleanPlan, cleanSpeakers, DEFAULT_PLAN } from '@/lib/podcast/safety/record'
import { CUT_XFADE_S, remapWords } from '@/lib/podcast/safety/render'
import { words } from '../safety/helpers'

const empty: TextEditState = { cuts: [], speakers: [] }

describe('word range → cut region', () => {
  // words every 0.4 s, each 0.3 s long: "the" 0–0.3, "quick" 0.4–0.7, "brown" 0.8–1.1, "fox" 1.2–1.5
  const ws = words('the quick brown fox jumps')

  it('spans from the first word to the next word start, swallowing the trailing gap', () => {
    expect(wordRangeToCut(ws, 1, 2)).toEqual({ start: 0.4, end: 1.2 })
  })

  it('accepts a reversed range and clamps to the transcript', () => {
    expect(wordRangeToCut(ws, 2, 1)).toEqual({ start: 0.4, end: 1.2 })
    expect(wordRangeToCut(ws, -3, 99)).toEqual({ start: 0, end: 1.9 })
    expect(wordRangeToCut([], 0, 0)).toBeNull()
  })

  it('never takes more than 0.25 s of a long pause after the last deleted word', () => {
    const gap = [...ws.slice(0, 2), { w: 'later', s: 5, e: 5.3 }]
    expect(wordRangeToCut(gap, 1, 1)).toEqual({ start: 0.4, end: 0.95 })
  })

  it('marks the words removed by a set of cuts', () => {
    const d = deletedWords(ws, [{ start: 0.4, end: 1.2 }])
    expect(Array.from(d)).toEqual([0, 1, 1, 0, 0])
    // A cut that only clips the edge of a word does not remove it.
    expect(Array.from(deletedWords(ws, [{ start: 0.65, end: 0.85 }]))).toEqual([0, 0, 0, 0, 0])
    expect(wordsInRange(ws, { start: 0.4, end: 1.2 })).toEqual([1, 2])
  })
})

describe('merging cut regions', () => {
  it('merges overlapping and touching cuts, drops empty ones and sorts', () => {
    expect(mergeCuts([{ start: 2, end: 3 }, { start: 0, end: 1 }, { start: 1, end: 2 }, { start: 5, end: 5 }])).toEqual([{ start: 0, end: 3 }])
    expect(addCut([{ start: 0, end: 1 }], { start: 0.5, end: 2 })).toEqual([{ start: 0, end: 2 }])
  })

  it('combines text cuts with filler-suggestion cuts into one plan', () => {
    const ws = words('so um the the plan um is fine')
    const fillers = findFillers(ws).map((s) => s.cut)
    expect(fillers.length).toBe(2)
    const text = wordRangeToCut(ws, 0, 1)! // "so um" overlaps the first filler cut
    const plan = combineCuts([text], fillers)
    expect(plan.length).toBe(2)
    expect(plan[0]).toEqual({ start: 0, end: fillers[0].end })
    expect(cutSeconds(plan)).toBeCloseTo(plan.reduce((n, c) => n + c.end - c.start, 0), 6)
  })

  it('subtracts a range: trims, splits and leaves neighbours alone', () => {
    const cuts = [{ start: 0, end: 4 }, { start: 6, end: 7 }]
    expect(subtractRange(cuts, 1, 2)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 4 }, { start: 6, end: 7 }])
    expect(subtractRange(cuts, 3, 6.5)).toEqual([{ start: 0, end: 3 }, { start: 6.5, end: 7 }])
    expect(subtractRange(cuts, 2, 2)).toEqual(cuts)
  })
})

describe('delete and restore', () => {
  const ws = words('one two three four five six')

  it('reports how many words and seconds a deletion removed', () => {
    const r = deleteWordRange(empty, ws, 1, 3)!
    expect(r.words).toBe(3)
    expect(r.seconds).toBeCloseTo(1.2, 6)
    expect(r.state.cuts).toEqual([{ start: 0.4, end: 1.6 }])
    expect(describeDelete(r.words, r.seconds)).toBe('Deleted 3 words (1.2 s)')
    expect(describeDelete(1, 0.35)).toBe('Deleted 1 word (0.3 s)')
  })

  it('only counts words that were not already deleted', () => {
    const first = deleteWordRange(empty, ws, 1, 2)!
    const second = deleteWordRange(first.state, ws, 2, 4)!
    expect(second.words).toBe(2)
    expect(second.state.cuts).toEqual([{ start: 0.4, end: 2 }])
  })

  it('restores a stretch inside a bigger deletion without touching the rest', () => {
    const del = deleteWordRange(empty, ws, 0, 5)!.state
    const back = restoreWordRange(del, ws, 2, 2)
    expect(Array.from(deletedWords(ws, back.cuts))).toEqual([1, 1, 0, 1, 1, 1])
  })
})

describe('re-timing after cuts', () => {
  const ws = words('a b c d e f g h')

  it('drops deleted words and shifts the rest like the render pipeline', () => {
    const cut = wordRangeToCut(ws, 2, 3)! // 0.8 → 1.6
    const out = remapWords(ws, [cut], 3.2)
    expect(out.map((w) => w.w)).toEqual(['a', 'b', 'e', 'f', 'g', 'h'])
    expect(out[2].s).toBeCloseTo(1.6 - 0.8 - CUT_XFADE_S, 2)
  })

  it('moves speaker labels onto the new timeline and collapses labels that land inside a cut', () => {
    const speakers = [{ start: 0, name: 'Host' }, { start: 1.0, name: 'Guest' }, { start: 2.4, name: 'Host' }]
    const out = remapSpeakers(speakers, [{ start: 0.8, end: 1.6 }], 3.2)
    expect(out.map((s) => s.name)).toEqual(['Host', 'Guest', 'Host'])
    expect(out[1].start).toBeCloseTo(0.8 - CUT_XFADE_S / 2, 1) // snapped to the cut point, rounded to 10 ms
    expect(out[2].start).toBeCloseTo(2.4 - 0.8 - CUT_XFADE_S, 2)
    // Two labels inside the same cut: the later one wins.
    const same = remapSpeakers([{ start: 0.9, name: 'A' }, { start: 1.1, name: 'B' }], [{ start: 0.8, end: 1.6 }], 3.2)
    expect(same).toEqual([{ start: same[0].start, name: 'B' }])
  })

  it('maps preview time both ways across cuts', () => {
    const cuts = [{ start: 1, end: 2 }]
    expect(keptSegments(4, cuts)).toEqual([{ start: 0, end: 1 }, { start: 2, end: 4 }])
    expect(editedTime(0.5, cuts, 4)).toBe(0.5)
    expect(editedTime(3, cuts, 4)).toBeCloseTo(2 - CUT_XFADE_S, 6)
    expect(originalTime(0.5, cuts, 4)).toBe(0.5)
    expect(originalTime(editedTime(3, cuts, 4), cuts, 4)).toBeCloseTo(3, 6)
    expect(skipCuts(1.5, cuts, 4)).toBe(2)
    expect(skipCuts(0.5, cuts, 4)).toBe(0.5)
    expect(keptSegments(4, [{ start: 3.5, end: 9 }])).toEqual([{ start: 0, end: 3.5 }])
  })
})

describe('undo stack', () => {
  it('undoes and redoes, and a new edit clears the redo branch', () => {
    let h = createHistory<TextEditState>(empty)
    expect(canUndo(h)).toBe(false)
    h = pushHistory(h, { cuts: [{ start: 0, end: 1 }], speakers: [] })
    h = pushHistory(h, { cuts: [{ start: 0, end: 2 }], speakers: [] })
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present.cuts).toEqual([{ start: 0, end: 1 }])
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present.cuts).toEqual([{ start: 0, end: 2 }])
    h = undo(h)
    h = pushHistory(h, { cuts: [], speakers: [{ start: 0, name: 'Host' }] })
    expect(canRedo(h)).toBe(false)
    expect(undo(undo(undo(h))).present).toEqual(empty)
  })

  it('ignores no-op pushes and caps the stack', () => {
    let h = createHistory<TextEditState>(empty)
    h = pushHistory(h, { cuts: [], speakers: [] })
    expect(h.past.length).toBe(0)
    for (let i = 1; i <= 250; i++) h = pushHistory(h, { cuts: [{ start: 0, end: i }], speakers: [] }, 200)
    expect(h.past.length).toBe(200)
    expect(h.past[0].cuts[0].end).toBe(50)
  })
})

describe('search and navigation', () => {
  const ws = words('She said, "Maria went home." Maria went to Dayton. Then MARIA laughed')

  it('finds words and phrases regardless of case and punctuation', () => {
    expect(searchWords(ws, 'maria').map((m) => m.from)).toEqual([2, 5, 10])
    expect(searchWords(ws, 'Maria went')).toEqual([{ from: 2, to: 3 }, { from: 5, to: 6 }])
    expect(searchWords(ws, '')).toEqual([])
    expect(searchWords(ws, 'nowhere')).toEqual([])
  })

  it('steps to the next / previous match and wraps', () => {
    const m = searchWords(ws, 'maria')
    expect(nextMatch(m, -1)?.from).toBe(2)
    expect(nextMatch(m, 2)?.from).toBe(5)
    expect(nextMatch(m, 10)?.from).toBe(2)
    expect(nextMatch(m, 2, -1)?.from).toBe(10)
    expect(nextMatch(m, 6, -1)?.from).toBe(5)
    expect(nextMatch([], 0)).toBeNull()
  })

  it('finds the word at a time and turns time ranges into word ranges', () => {
    expect(wordIndexAt(ws, 0)).toBe(0)
    expect(wordIndexAt(ws, 0.85)).toBe(2)
    expect(wordIndexAt(ws, -1)).toBe(-1)
    const hits = rangesToMatches(ws, [{ start: 2.0, end: 2.7 }, { start: 0.8, end: 1.1 }])
    expect(hits).toEqual([{ from: 2, to: 2 }, { from: 5, to: 6 }])
  })
})

describe('paragraphs and speakers', () => {
  it('breaks paragraphs at long pauses, sentence-end pauses and speaker labels', () => {
    const ws = [
      ...words('Hello there. How are you?', 0), // ends ~1.9
      ...words('Fine thanks.', 3.5), // 1.6 s pause after a sentence end
      ...words('and you', 5.0), // 1.2 s pause, but no sentence end before → same paragraph
      ...words('Later on', 9), // long pause
    ]
    const p = paragraphs(ws)
    expect(p.map((x) => [x.from, x.to])).toEqual([[0, 4], [5, 8], [9, 10]])
    const withSpeakers = paragraphs(ws, [{ start: 0, name: 'Host' }, { start: 1.2, name: 'Guest' }])
    expect(withSpeakers.map((x) => [x.from, x.to, x.speaker])).toEqual([[0, 2, 'Host'], [3, 4, 'Guest'], [5, 8, 'Guest'], [9, 10, 'Guest']])
    expect(paragraphs([])).toEqual([])
  })

  it('sets, clears and looks up speaker labels', () => {
    let s = setSpeaker([], 0, ' Host ')
    s = setSpeaker(s, 10, 'Guest')
    expect(speakerAt(s, 5)).toBe('Host')
    expect(speakerAt(s, 10)).toBe('Guest')
    expect(speakerAt([], 3)).toBeNull()
    s = setSpeaker(s, 10, '')
    expect(s).toEqual([{ start: 0, name: 'Host' }])
    expect(cleanSpeakers([{ start: 'x', name: 'A' }, { start: 2, name: 'B' }, { start: 2, name: 'C' }])).toEqual([{ start: 2, name: 'C' }])
  })

  it('writes WebVTT voice tags and never straddles a speaker change in one cue', () => {
    const ws = [...words('Welcome to the show.', 0), ...words('Thanks for having me.', 2)]
    const cues = speakerCues(ws, [{ start: 0, name: 'Host' }, { start: 2, name: 'Guest <x>' }])
    expect(cues.length).toBe(2)
    expect(cues[0].text).toBe('<v Host>Welcome to the show.')
    expect(cues[1].text).toBe('<v Guest x>Thanks for having me.')
    expect(speakerCues(ws, []).every((c) => !c.text.startsWith('<v'))).toBe(true)
  })

  it('round-trips through the safety plan', () => {
    const plan = cleanPlan({ ...DEFAULT_PLAN, text_cuts: [{ start: 2, end: 1 }, { start: 1, end: 2.5 }], speakers: [{ start: 0, name: 'Host' }] })
    expect(plan.text_cuts).toEqual([{ start: 1, end: 2.5 }])
    expect(plan.speakers).toEqual([{ start: 0, name: 'Host' }])
    expect(cleanPlan({}).text_cuts).toEqual([])
    expect(cleanPlan({}).speakers).toEqual([])
  })
})
