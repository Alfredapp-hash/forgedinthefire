import type { TranscriptWord } from '@/lib/studio/transcript'

/** Words spaced `step` s apart, each `dur` s long, starting at `start`. */
export function words(text: string, start = 0, step = 0.4, dur = 0.3): TranscriptWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ w, s: +(start + i * step).toFixed(3), e: +(start + i * step + dur).toFixed(3) }))
}

export const joined = (ws: TranscriptWord[]) => ws.map((w) => w.w).join(' ')
