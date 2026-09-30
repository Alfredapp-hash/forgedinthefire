import { describe, expect, it } from 'vitest'
import type { TranscriptWord } from '@/lib/studio/transcript'
import {
  activeWordIndex,
  captionGroups,
  clampClipRange,
  clipSrt,
  clipWords,
  fitGroups,
  groupAt,
  redactionsInClip,
  REMOVED,
  transcriptSentences,
  validateClipRange,
  wrapWords,
} from '@/lib/podcast/clips/captions'
import { CLIP_MAX_SEC, CLIP_MIN_SEC } from '@/lib/podcast/clips/types'

/** Evenly spaced words, `each` seconds apart starting at `start`. */
function speech(text: string, start = 0, each = 0.4): TranscriptWord[] {
  return text.split(/\s+/).map((w, i) => ({ w, s: start + i * each, e: start + i * each + each * 0.8 }))
}

const asClip = (words: TranscriptWord[]) => words.map((w) => ({ text: w.w, s: w.s, e: w.e, redacted: false }))

describe('validateClipRange', () => {
  it('accepts a range inside the limits', () => {
    const r = validateClipRange({ startSec: 10, endSec: 40 }, 3600)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.range).toEqual({ startSec: 10, endSec: 40 })
  })
  it('rejects too short, too long, reversed, negative and out-of-episode ranges', () => {
    expect(validateClipRange({ startSec: 0, endSec: CLIP_MIN_SEC - 1 }, 100).ok).toBe(false)
    expect(validateClipRange({ startSec: 0, endSec: CLIP_MAX_SEC + 1 }, 1000).ok).toBe(false)
    expect(validateClipRange({ startSec: 50, endSec: 20 }, 100).ok).toBe(false)
    expect(validateClipRange({ startSec: -1, endSec: 30 }, 100).ok).toBe(false)
    expect(validateClipRange({ startSec: 80, endSec: 110 }, 100).ok).toBe(false)
    expect(validateClipRange({ startSec: NaN, endSec: 30 }, 100).ok).toBe(false)
  })
  it('allows the very end of the episode with float slack, and unknown duration', () => {
    expect(validateClipRange({ startSec: 70, endSec: 100.02 }, 100).ok).toBe(true)
    expect(validateClipRange({ startSec: 70, endSec: 100 }, null).ok).toBe(true)
  })
  it('rounds to centiseconds', () => {
    const r = validateClipRange({ startSec: 1.23456, endSec: 31.98765 }, 100)
    expect(r.ok && r.range).toEqual({ startSec: 1.23, endSec: 31.99 })
  })
})

describe('clampClipRange', () => {
  it('stretches a short drag to the minimum from the start', () => {
    expect(clampClipRange({ startSec: 10, endSec: 12 }, 600)).toEqual({ startSec: 10, endSec: 10 + CLIP_MIN_SEC })
  })
  it('caps a long drag at the maximum', () => {
    expect(clampClipRange({ startSec: 10, endSec: 500 }, 600)).toEqual({ startSec: 10, endSec: 10 + CLIP_MAX_SEC })
  })
  it('slides back when the end would pass the episode', () => {
    expect(clampClipRange({ startSec: 95, endSec: 99 }, 100)).toEqual({ startSec: 85, endSec: 100 })
  })
  it('anchors on the end when asked', () => {
    expect(clampClipRange({ startSec: 50, endSec: 60 }, 100, 'end')).toEqual({ startSec: 45, endSec: 60 })
    expect(clampClipRange({ startSec: 2, endSec: 5 }, 100, 'end')).toEqual({ startSec: 0, endSec: 15 })
  })
  it('swaps a reversed drag', () => {
    expect(clampClipRange({ startSec: 40, endSec: 20 }, 100)).toEqual({ startSec: 20, endSec: 40 })
  })
})

describe('clipWords + redaction', () => {
  const words = speech('My name is Jane Smith and I live in Springfield now.', 100)

  it('keeps only words inside the range and re-times them from the clip start', () => {
    // "name" 100.4–100.72 straddles the start; "and" starts at 102.0 and is out.
    const out = clipWords(words, { startSec: 100.5, endSec: 102 })
    expect(out.map((w) => w.text)).toEqual(['name', 'is', 'Jane', 'Smith'])
    expect(out[0].s).toBe(0)
    expect(out[0].e).toBeCloseTo(0.22, 5)
    expect(out[1].s).toBeCloseTo(0.3, 5)
  })

  it('replaces words overlapping a bleeped range with one [removed]', () => {
    // "Jane" 101.2–101.52, "Smith" 101.6–101.92 → one bleep across both.
    const out = clipWords(words, { startSec: 100, endSec: 105 }, [{ start: 101.3, end: 101.7 }])
    const texts = out.map((w) => w.text)
    expect(texts).toEqual(['My', 'name', 'is', REMOVED, 'and', 'I', 'live', 'in', 'Springfield', 'now.'])
    const removed = out.find((w) => w.redacted)!
    expect(removed.s).toBeCloseTo(1.2, 5)
    expect(removed.e).toBeCloseTo(1.92, 5)
  })

  it('never shows a word that already carries a redaction label', () => {
    const redacted: TranscriptWord[] = [
      { w: 'I', s: 0, e: 0.2 },
      { w: 'met', s: 0.3, e: 0.5 },
      { w: '[name].', s: 0.6, e: 1.0 },
      { w: '[place]', s: 1.05, e: 1.1 },
      { w: 'Then', s: 1.2, e: 1.4 },
    ]
    const out = clipWords(redacted, { startSec: 0, endSec: 10 })
    expect(out.map((w) => w.text)).toEqual(['I', 'met', REMOVED, 'Then'])
  })

  it('hides protected terms even when nothing has been bleeped yet (belt and braces)', () => {
    const out = clipWords(words, { startSec: 100, endSec: 105 }, [], [{ text: 'Springfield', kind: 'place' }, 'Jane Smith'])
    const texts = out.map((w) => w.text)
    expect(texts).not.toContain('Jane')
    expect(texts).not.toContain('Smith')
    expect(texts).not.toContain('Springfield')
    expect(texts.filter((t) => t === REMOVED)).toHaveLength(2)
  })

  it('a bleep that only touches the edge of the clip still redacts the overlapping word', () => {
    const out = clipWords(words, { startSec: 100, endSec: 120 }, [{ start: 99.5, end: 100.1 }])
    expect(out[0].text).toBe(REMOVED)
    expect(out[0].s).toBe(0)
  })

  it('does not redact when the bleep is outside the clip', () => {
    const out = clipWords(words, { startSec: 100, endSec: 120 }, [{ start: 200, end: 201 }])
    expect(out.some((w) => w.redacted)).toBe(false)
  })
})

describe('redactionsInClip', () => {
  it('re-times overlapping ranges and clamps them to the clip', () => {
    const out = redactionsInClip([{ start: 5, end: 8 }, { start: 18, end: 25 }, { start: 40, end: 41 }], { startSec: 6, endSec: 20 })
    expect(out).toEqual([
      { start: 0, end: 2 },
      { start: 12, end: 14 },
    ])
  })
})

describe('captionGroups timing', () => {
  it('breaks at sentence ends and long pauses, and groups never overlap', () => {
    const words = asClip([...speech('Hello there friends.', 0), ...speech('This is the next one', 1.3), ...speech('after a long pause', 6)])
    const groups = captionGroups(words, { maxChars: 60, maxSeconds: 10 })
    expect(groups.map((g) => g.words.map((w) => w.text).join(' '))).toEqual([
      'Hello there friends.',
      'This is the next one',
      'after a long pause',
    ])
    for (let i = 1; i < groups.length; i++) expect(groups[i].s).toBeGreaterThanOrEqual(groups[i - 1].e)
  })

  it('breaks at maxChars and maxSeconds', () => {
    const words = asClip(speech('one two three four five six seven eight nine ten', 0, 1))
    const byChars = captionGroups(words, { maxChars: 14, maxSeconds: 100, pause: 100 })
    expect(byChars.every((g) => g.words.map((w) => w.text).join(' ').length <= 14)).toBe(true)
    const bySeconds = captionGroups(words, { maxChars: 1000, maxSeconds: 3, pause: 100 })
    expect(bySeconds.every((g) => g.words[g.words.length - 1].e - g.words[0].s <= 3 + 1e-9)).toBe(true)
    expect(bySeconds.length).toBeGreaterThan(2)
  })

  it('shows a one-word group for at least the minimum time', () => {
    const groups = captionGroups([{ text: 'Hi', s: 1, e: 1.05, redacted: false }], { minSeconds: 0.6 })
    expect(groups[0].e - groups[0].s).toBeCloseTo(0.6, 5)
  })

  it('groupAt and activeWordIndex follow the clock', () => {
    const groups = captionGroups(asClip(speech('alpha beta gamma delta', 0, 1)), { maxChars: 100, maxSeconds: 100 })
    expect(groups).toHaveLength(1)
    expect(groupAt(groups, 0.5)).toBe(0)
    expect(groupAt(groups, 99)).toBe(-1)
    expect(activeWordIndex(groups[0], 0.5)).toBe(0)
    expect(activeWordIndex(groups[0], 2.9)).toBe(2)
    expect(activeWordIndex(groups[0], 3.5)).toBe(3)
  })
})

describe('wrapWords + fitGroups', () => {
  const clip = (text: string) => text.split(' ').map((t, i) => ({ text: t, s: i, e: i + 0.5, redacted: false }))

  it('wraps greedily by characters and keeps word objects', () => {
    const words = clip('the quick brown fox jumps over the lazy dog')
    const lines = wrapWords(words, 15)
    expect(lines.map((l) => l.text)).toEqual(['the quick brown', 'fox jumps over', 'the lazy dog'])
    expect(lines.flatMap((l) => l.words)).toHaveLength(words.length)
  })
  it('a word longer than a line stands alone', () => {
    expect(wrapWords(clip('a supercalifragilistic b'), 5).map((l) => l.text)).toEqual(['a', 'supercalifragilistic', 'b'])
  })
  it('caps the number of lines', () => {
    expect(wrapWords(clip('one two three four five six'), 5, 2)).toHaveLength(2)
  })
  it('fitGroups splits groups that need more lines than the layout has', () => {
    const words = clip('one two three four five six seven eight')
    const groups = fitGroups([{ words, s: 0, e: 8 }], 9, 2)
    expect(groups.length).toBeGreaterThan(1)
    for (const g of groups) expect(wrapWords(g.words, 9).length).toBeLessThanOrEqual(2)
    for (let i = 1; i < groups.length; i++) expect(groups[i].s).toBe(groups[i - 1].e)
    expect(groups[groups.length - 1].e).toBe(8)
  })
})

describe('clipSrt', () => {
  it('writes numbered cues from the clip start with [removed] intact', () => {
    const words = speech('Hello there my friend', 0, 0.5)
    const clipped = clipWords(words, { startSec: 0, endSec: 20 }, [{ start: 1.0, end: 1.2 }])
    const srt = clipSrt(captionGroups(clipped), 40)
    expect(srt).toMatch(/^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nHello there \[removed\] friend\n/)
    expect(srt).not.toMatch(/\bmy\b/)
  })
})

describe('transcriptSentences', () => {
  it('splits at sentence punctuation and pauses with episode-timeline times', () => {
    const words = [...speech('First sentence here.', 10), ...speech('Second one', 12), ...speech('third after gap', 20)]
    const s = transcriptSentences(words)
    expect(s.map((x) => x.text)).toEqual(['First sentence here.', 'Second one', 'third after gap'])
    expect(s[0].startSec).toBe(10)
    expect(s[2].startSec).toBe(20)
  })
})
