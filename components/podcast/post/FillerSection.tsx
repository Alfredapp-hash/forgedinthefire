'use client'

import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { DEFAULT_FILLERS, LONG_PAUSE_S, PAUSE_TARGET_S, findFillers, findLongPauses, type Suggestion } from '@/lib/podcast/ai/fillers'
import type { TranscriptWord } from '@/lib/studio/transcript'
import { Btn, DecisionButtons, StepHeading, cardCls, clock, inputCls, labelCls, type Decision } from './ui'

export type FillerState = { suggestions: Suggestion[]; decisions: Record<string, Decision>; searched: boolean }
export const initialFillers: FillerState = { suggestions: [], decisions: {}, searched: false }

type Props = {
  words: TranscriptWord[]
  state: FillerState
  onChange: (next: FillerState) => void
  play: (id: string, start: number, end: number) => void
  playing: string | null
  disabled: boolean
}

export function FillerSection({ words, state, onChange, play, playing, disabled }: Props) {
  const [fillers, setFillers] = useState(DEFAULT_FILLERS.join(', '))
  const [pauses, setPauses] = useState(true)

  function find() {
    const list = fillers.split(',').map((f) => f.trim()).filter(Boolean)
    const suggestions = [...findFillers(words, list), ...(pauses ? findLongPauses(words) : [])].sort((a, b) => a.start - b.start)
    onChange({ suggestions, decisions: {}, searched: true })
  }

  const setAll = (kind: Suggestion['kind'], d: Decision) => {
    const decisions = { ...state.decisions }
    for (const s of state.suggestions) if (s.kind === kind) decisions[s.id] = d
    onChange({ ...state, decisions })
  }

  const accepted = state.suggestions.filter((s) => state.decisions[s.id] === 'accept')
  const saved = accepted.reduce((n, s) => n + (s.cut.end - s.cut.start), 0)
  const counts = { filler: 0, pause: 0 }
  state.suggestions.forEach((s) => counts[s.kind]++)

  return (
    <div className={cardCls}>
      <StepHeading
        n={4}
        title="Tidy fillers and long pauses (optional)"
        hint={`Suggests “um”, “uh” and similar, and pauses longer than ${LONG_PAUSE_S} s. Pauses are shortened to ${PAUSE_TARGET_S} s, not removed — silence can matter in a hard story. Note: automatic transcripts leave out many fillers, so this list is never complete.`}
      />
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className={labelCls}>Filler words (comma-separated)</span>
          <input value={fillers} onChange={(e) => setFillers(e.target.value)} className={inputCls} disabled={disabled} />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#F6FAFC]">
          <input type="checkbox" checked={pauses} onChange={(e) => setPauses(e.target.checked)} />
          Include long pauses
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Btn tone="primary" disabled={disabled || !words.length} onClick={find}>{state.searched ? 'Find again' : 'Find suggestions'}</Btn>
        {!words.length && <span className="text-xs text-[#FFB86B]">Transcribe first (step 1).</span>}
        {state.searched && (
          <span className="text-xs text-[#A9B8C6]" aria-live="polite">
            {counts.filler} fillers · {counts.pause} long pauses · {accepted.length} accepted (saves {saved.toFixed(1)} s)
          </span>
        )}
      </div>
      {state.suggestions.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {counts.filler > 0 && <Btn onClick={() => setAll('filler', 'accept')}>Accept all fillers</Btn>}
            {counts.pause > 0 && <Btn onClick={() => setAll('pause', 'accept')}>Accept all pauses</Btn>}
            <Btn onClick={() => onChange({ ...state, decisions: {} })}>Clear decisions</Btn>
          </div>
          <ol className="max-h-80 divide-y divide-[#27313B] overflow-y-auto rounded-lg border border-[#27313B]">
            {state.suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <button
                  type="button"
                  onClick={() => play(s.id, s.start, s.end)}
                  aria-label={`${playing === s.id ? 'Stop' : 'Play'} ${clock(s.start)} in context`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#27313B] px-2 py-1 text-xs tabular-nums text-[#8DEBFF]"
                >
                  {playing === s.id ? <Square size={12} /> : <Play size={12} />} {clock(s.start)}
                </button>
                <span className="flex-1 text-[#B8C4CF]">{s.kind === 'filler' ? `Filler ${s.label}` : s.label}</span>
                <DecisionButtons label={`${s.label} at ${clock(s.start)}`} value={state.decisions[s.id]} onChange={(v) => {
                  const decisions = { ...state.decisions }
                  if (v) decisions[s.id] = v
                  else delete decisions[s.id]
                  onChange({ ...state, decisions })
                }} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
