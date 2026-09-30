'use client'

import { useMemo, useState } from 'react'
import { Checkbox, Input } from '@/components/studio-ui'
import { DEFAULT_FILLERS, LONG_PAUSE_S, PAUSE_TARGET_S, findSuggestions, isUmUh, type Suggestion } from '@/lib/podcast/ai/fillers'
import type { Decision } from '@/lib/podcast/safety/record'
import type { TranscriptWord } from '@/lib/studio/transcript'
import { cn } from '@/lib/utils'
import { Advanced, Btn, DecisionButtons, Note, PlayAt, clock } from './ui'

export type FillerState = {
  /** Suggestion id → decision (persisted; suggestions themselves are recomputed from the transcript). */
  decisions: Record<string, Decision>
  /** Empty → DEFAULT_FILLERS. */
  fillerWords: string[]
  includePauses: boolean
}
export const initialFillers: FillerState = { decisions: {}, fillerWords: [], includePauses: true }

/** Suggestions for the current transcript and settings (pure, cheap). */
export function useFillerSuggestions(words: TranscriptWord[], state: FillerState): Suggestion[] {
  return useMemo(
    () => (words.length ? findSuggestions(words, { fillers: state.fillerWords.length ? state.fillerWords : DEFAULT_FILLERS, pauses: state.includePauses }) : []),
    [words, state.fillerWords, state.includePauses],
  )
}

type Props = {
  words: TranscriptWord[]
  suggestions: Suggestion[]
  state: FillerState
  onChange: (next: FillerState) => void
  play: (id: string, start: number, end: number) => void
  playing: string | null
  disabled: boolean
}

export function FillerSection({ words, suggestions, state, onChange, play, playing, disabled }: Props) {
  const [draft, setDraft] = useState((state.fillerWords.length ? state.fillerWords : DEFAULT_FILLERS).join(', '))

  function applyWords() {
    const list = draft.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean)
    onChange({ ...state, fillerWords: list.join(',') === DEFAULT_FILLERS.join(',') ? [] : list })
  }

  const setMany = (pick: (s: Suggestion) => boolean, d: Decision) => {
    const decisions = { ...state.decisions }
    for (const s of suggestions) if (pick(s)) decisions[s.id] = d
    onChange({ ...state, decisions })
  }

  const accepted = suggestions.filter((s) => state.decisions[s.id] === 'accept')
  const saved = accepted.reduce((n, s) => n + (s.cut.end - s.cut.start), 0)
  const counts = { umuh: 0, check: 0, repeat: 0, pause: 0 }
  for (const s of suggestions) {
    if (s.kind === 'pause') counts.pause++
    else if (s.kind === 'repeat') counts.repeat++
    else if (isUmUh(s)) counts.umuh++
    else counts.check++
  }

  if (!words.length) return <Note>Transcribe first (step 1) to get suggestions.</Note>

  return (
    <div className="space-y-3">
      <p className="studio-type-body text-[13px] text-white" aria-live="polite">
        {counts.umuh} um/uh · {counts.check} to listen to · {counts.repeat} repeats · {counts.pause} long pauses · {accepted.length} accepted (saves {saved.toFixed(1)} s)
      </p>
      {suggestions.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {counts.umuh > 0 && <Btn tone="accent" onClick={() => setMany(isUmUh, 'accept')} disabled={disabled}>Accept all um/uh</Btn>}
            {counts.repeat > 0 && <Btn onClick={() => setMany((s) => s.kind === 'repeat', 'accept')} disabled={disabled}>Accept all repeats</Btn>}
            {counts.pause > 0 && <Btn onClick={() => setMany((s) => s.kind === 'pause', 'accept')} disabled={disabled}>Accept all pauses</Btn>}
            {Object.keys(state.decisions).length > 0 && <Btn onClick={() => onChange({ ...state, decisions: {} })} disabled={disabled}>Clear decisions</Btn>}
          </div>
          <ol className="max-h-80 divide-y divide-divider overflow-y-auto rounded-control border border-divider bg-obsidian/60">
            {suggestions.map((s) => (
              <li key={s.id} className={cn('flex flex-wrap items-center gap-2 p-2', state.decisions[s.id] === 'reject' && 'opacity-60')}>
                <PlayAt id={s.id} start={s.start} end={s.end} play={play} playing={playing} />
                <span className="studio-type-body flex-1 text-[13px] text-silver-body">
                  {s.kind === 'filler' ? `Filler ${s.label}` : s.label}
                  {s.confidence === 'check' && <span className="ml-2 text-[11px] text-ice">listen first</span>}
                </span>
                <DecisionButtons
                  label={`${s.label} at ${clock(s.start)}`}
                  value={state.decisions[s.id]}
                  onChange={(v) => {
                    const decisions = { ...state.decisions }
                    if (v) decisions[s.id] = v
                    else delete decisions[s.id]
                    onChange({ ...state, decisions })
                  }}
                />
              </li>
            ))}
          </ol>
        </>
      )}
      <Advanced title="Options: which words count as fillers">
        <p className="studio-type-body text-[12px] text-silver">
          Hedges like “like” and “you know” are only flagged when set off by a pause. Pauses longer than {LONG_PAUSE_S} s are shortened to {PAUSE_TARGET_S} s, not removed — silence can matter in a hard story. Automatic transcripts leave out many fillers, so this list is never complete.
        </p>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Input label="Filler words (comma-separated)" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={applyWords} onKeyDown={(e) => e.key === 'Enter' && applyWords()} disabled={disabled} />
          <Checkbox label="Include long pauses" checked={state.includePauses} onChange={(e) => onChange({ ...state, includePauses: e.target.checked })} disabled={disabled} wrapperClassName="pb-3" />
        </div>
      </Advanced>
    </div>
  )
}
