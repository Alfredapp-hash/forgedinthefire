'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Chip, SegmentedControl, Select } from '@/components/studio-ui'
import { findProtectedHits, type ProtectedHit } from '@/lib/podcast/safety/protected-words'
import { REDACTION_LABELS, TERM_KINDS, TERM_KIND_LABEL, type Decision, type ProtectedTerm, type TermKind } from '@/lib/podcast/safety/record'
import { BLEEP_MODE_LABEL, type Bleep, type BleepMode } from '@/lib/podcast/safety/render'
import type { TranscriptWord } from '@/lib/studio/transcript'
import { cn } from '@/lib/utils'
import { Advanced, Btn, DecisionButtons, Note, PlayAt, clock, inputCls, labelCls, parseClock } from './ui'

export type ProtectState = {
  terms: ProtectedTerm[]
  /** Hit id → decision. Hits are recomputed from the transcript; decisions persist by id. */
  decisions: Record<string, Decision>
  manual: Bleep[]
  mode: BleepMode
  pad: number
}

export const initialProtect: ProtectState = { terms: [], decisions: {}, manual: [], mode: 'tone', pad: 0.08 }

/** Every plausible mention of every term in the current transcript (pure, cheap). */
export function useProtectedHits(words: TranscriptWord[], terms: ProtectedTerm[]) {
  return useMemo(() => (words.length && terms.length ? findProtectedHits(words, terms) : []), [words, terms])
}

type Props = {
  words: TranscriptWord[]
  hits: ProtectedHit[]
  state: ProtectState
  onChange: (next: ProtectState) => void
  play: (id: string, start: number, end: number) => void
  playing: string | null
  reviewedAt: string | null | undefined
  canMarkReviewed: boolean
  onMarkReviewed: (nothingFound: boolean) => void
  /** False when the private safety table is missing (terms would be lost on reload). */
  persisted: boolean
  disabled: boolean
}

const REASON: Record<ProtectedHit['reason'], string> = {
  exact: 'exact',
  possessive: 'possessive / plural',
  partial: 'part of the word',
  spelling: 'similar spelling',
  'sound-alike': 'sounds similar',
}

export function ProtectSection({ words, hits, state, onChange, play, playing, reviewedAt, canMarkReviewed, onMarkReviewed, persisted, disabled }: Props) {
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState<TermKind>('name')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const set = (patch: Partial<ProtectState>) => onChange({ ...state, ...patch })

  function addTerms(raw: string) {
    const parts = raw.split(/[,\n;]/).map((t) => t.trim()).filter(Boolean)
    if (!parts.length) return
    const have = new Set(state.terms.map((t) => t.text.toLowerCase()))
    const next = [...state.terms]
    for (const p of parts) {
      if (have.has(p.toLowerCase())) continue
      have.add(p.toLowerCase())
      next.push({ text: p, kind })
    }
    set({ terms: next })
    setTerm('')
  }

  function addManual() {
    const s = parseClock(manualStart)
    const e = parseClock(manualEnd)
    if (s == null || e == null || e <= s) {
      setManualError('Enter a start and end like 12:03.5 and 12:04.2 (end after start).')
      return
    }
    if (e - s > 30) {
      setManualError('That is longer than 30 seconds. For long passages use voice disguise or cut the section in the editor.')
      return
    }
    setManualError(null)
    set({ manual: [...state.manual, { start: s, end: e }].sort((a, b) => a.start - b.start) })
    setManualStart('')
    setManualEnd('')
  }

  const pending = hits.filter((h) => !state.decisions[h.id]).length
  const accepted = hits.filter((h) => state.decisions[h.id] === 'accept').length
  const setAll = (d: Decision) => {
    const decisions = { ...state.decisions }
    for (const h of hits) if (!decisions[h.id]) decisions[h.id] = d
    set({ decisions })
  }

  return (
    <div className="space-y-3">
      {!persisted && (
        <Note tone="block">This list is not being saved (database update 20260924000002 missing) — it disappears when you leave the page.</Note>
      )}

      <div className="space-y-2">
        <label className={labelCls} htmlFor="protect-term">
          Words or phrases to protect (press Enter or use commas)
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="protect-term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTerms(term)
              }
            }}
            onBlur={() => term.trim() && addTerms(term)}
            placeholder="e.g. Maria, Lincoln High, Dayton, Kroger"
            autoComplete="off"
            spellCheck={false}
            className={cn(inputCls, 'min-w-[12rem] flex-1')}
            disabled={disabled}
          />
          <Select value={kind} onChange={(e) => setKind(e.target.value as TermKind)} aria-label="What kind of detail" disabled={disabled} wrapperClassName="w-auto" className="h-auto py-2">
            {TERM_KINDS.map((k) => <option key={k} value={k}>{TERM_KIND_LABEL[k]}</option>)}
          </Select>
          <Btn tone="accent" disabled={disabled || !term.trim()} onClick={() => addTerms(term)}>Add</Btn>
        </div>
        {state.terms.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Protected words">
            {state.terms.map((t) => (
              <li key={t.text}>
                <Chip tone="neutral" className="gap-1 normal-case tracking-normal text-[12px] text-white">
                  {t.text}
                  <span className="text-silver">· {TERM_KIND_LABEL[t.kind].toLowerCase()}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${t.text}`}
                    onClick={() => set({ terms: state.terms.filter((x) => x.text !== t.text) })}
                    className="rounded-full p-0.5 text-silver hover:text-heart focus-visible:outline-none"
                    disabled={disabled}
                  >
                    <X size={12} />
                  </button>
                </Chip>
              </li>
            ))}
          </ul>
        )}
        {!words.length && state.terms.length > 0 && (
          <Note>Transcribe first (step 1) to find these in the audio — or bleep a time range by hand under “More options”.</Note>
        )}
      </div>

      {words.length > 0 && state.terms.length > 0 && (
        <div className="space-y-2">
          <p className="studio-type-body text-[13px] text-white" aria-live="polite">
            {hits.length === 0
              ? 'No matches found in the transcript. Listen through anyway — automatic transcripts often misspell names.'
              : `${hits.length} possible match${hits.length === 1 ? '' : 'es'} · ${accepted} to bleep · ${pending} still to check`}
          </p>
          {hits.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pending > 0 && <Btn onClick={() => setAll('accept')} disabled={disabled}>Bleep all remaining</Btn>}
              {pending > 0 && <Btn onClick={() => setAll('reject')} disabled={disabled}>Keep all remaining</Btn>}
              {Object.keys(state.decisions).length > 0 && <Btn onClick={() => set({ decisions: {} })} disabled={disabled}>Clear decisions</Btn>}
            </div>
          )}
          {hits.length > 0 && (
            <ol className="divide-y divide-divider rounded-control border border-divider bg-obsidian/60">
              {hits.map((h) => {
                const d = state.decisions[h.id]
                const context = words.slice(Math.max(0, h.from - 5), h.to + 6)
                return (
                  <li key={h.id} className={cn('flex flex-col gap-2 p-3 md:flex-row md:items-center', d === 'accept' && 'bg-lane-cohost-2/5', d === 'reject' && 'opacity-60')}>
                    <PlayAt id={h.id} start={h.start} end={h.end} play={play} playing={playing} />
                    <div className="studio-type-body min-w-0 flex-1 text-[13px] text-silver-body">
                      <p>
                        {context.map((w, i) => {
                          const idx = Math.max(0, h.from - 5) + i
                          const hit = idx >= h.from && idx <= h.to
                          return (
                            <span key={idx} className={hit ? 'rounded-sm bg-forged/20 px-0.5 font-semibold text-ice' : ''}>
                              {w.w}{' '}
                            </span>
                          )
                        })}
                      </p>
                      <p className="text-[11px] text-silver">
                        matches “{h.term}” · {REASON[h.reason]} · becomes “{REDACTION_LABELS[h.kind]}”
                      </p>
                    </div>
                    <DecisionButtons
                      label={`${h.heard} at ${clock(h.start)}`}
                      value={d}
                      acceptLabel="Bleep"
                      rejectLabel="Keep"
                      onChange={(v) => {
                        const decisions = { ...state.decisions }
                        if (v) decisions[h.id] = v
                        else delete decisions[h.id]
                        set({ decisions })
                      }}
                    />
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <Advanced title="More options: bleep sound, cover, time ranges by hand" count={state.manual.length}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Replace protected words with</span>
            <SegmentedControl
              aria-label="How to hide protected words"
              size="dense"
              value={state.mode}
              onValueChange={(m) => set({ mode: m })}
              options={(['tone', 'silence', 'roomtone'] as const).map((m) => ({ value: m, label: BLEEP_MODE_LABEL[m].replace(' (1 kHz)', '').replace(' (sounds natural)', '') }))}
            />
          </div>
          <Select label="Extra cover around each word" value={state.pad} onChange={(e) => set({ pad: Number(e.target.value) })}>
            <option value={0.04}>Tight (0.04 s)</option>
            <option value={0.08}>Normal (0.08 s)</option>
            <option value={0.15}>Safe (0.15 s) — recommended for fast speakers</option>
            <option value={0.25}>Very safe (0.25 s)</option>
          </Select>
        </div>
        <p className="studio-type-body text-[12px] text-silver">
          In every mode the word itself is removed completely — it is never just turned down. Bleeped words are also replaced with “[name]”, “[place]” or “[detail]” in the transcript.
        </p>

        <div className="space-y-2 border-t border-divider pt-3">
          <p className="studio-type-body text-[13px] text-white">Bleep a time range by hand</p>
          <p className="studio-type-body text-[12px] text-silver">For anything the transcript missed. Times are on the current episode audio.</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className={labelCls}>Start</span>
              <input value={manualStart} onChange={(e) => setManualStart(e.target.value)} placeholder="12:03.5" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>End</span>
              <input value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} placeholder="12:04.2" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && addManual()} />
            </label>
            <div className="self-end"><Btn tone="accent" onClick={addManual} disabled={disabled}>Add range</Btn></div>
          </div>
          {manualError && <p className="studio-type-body text-[12px] text-heart" role="alert">{manualError}</p>}
          {state.manual.length > 0 && (
            <ul className="space-y-1">
              {state.manual.map((m, i) => (
                <li key={`${m.start}-${i}`} className="studio-type-body flex items-center gap-2 text-[12px] text-silver-body">
                  <PlayAt id={`m${i}`} start={m.start} end={m.end} play={play} playing={playing} />
                  – {clock(m.end)}
                  <button type="button" onClick={() => set({ manual: state.manual.filter((_, j) => j !== i) })} className="text-silver hover:text-heart" aria-label="Remove range">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Advanced>

      <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
        {reviewedAt ? (
          <span className="studio-type-body text-[13px] text-lane-cohost-2">Protected terms reviewed {new Date(reviewedAt).toLocaleString()}.</span>
        ) : (
          <>
            <Btn
              tone="good"
              disabled={disabled || !canMarkReviewed}
              onClick={() => onMarkReviewed(false)}
              title={canMarkReviewed ? undefined : 'Add the terms and decide every match first'}
            >
              Mark review done (nothing to bleep)
            </Btn>
            <Btn tone="default" disabled={disabled} onClick={() => onMarkReviewed(true)}>
              This episode names no one — mark reviewed
            </Btn>
            <span className="studio-type-body text-[12px] text-silver">If you bleep anything, the review is recorded when you replace the episode audio.</span>
          </>
        )}
      </div>
    </div>
  )
}
