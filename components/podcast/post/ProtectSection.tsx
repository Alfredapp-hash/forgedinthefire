'use client'

import { useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { findProtectedHits, type ProtectedHit } from '@/lib/podcast/safety/protected-words'
import type { Bleep, BleepMode } from '@/lib/podcast/safety/render'
import type { TranscriptWord } from '@/lib/studio/transcript'
import { Btn, DecisionButtons, StepHeading, cardCls, clock, inputCls, labelCls, parseClock, type Decision } from './ui'

export type ProtectState = {
  terms: string[]
  /** Terms the current hit list was built from (null = never searched). */
  searchedTerms: string[] | null
  hits: ProtectedHit[]
  decisions: Record<string, Decision>
  manual: Bleep[]
  mode: BleepMode
  pad: number
}

export const initialProtect: ProtectState = { terms: [], searchedTerms: null, hits: [], decisions: {}, manual: [], mode: 'tone', pad: 0.08 }

type Props = {
  words: TranscriptWord[]
  state: ProtectState
  onChange: (next: ProtectState) => void
  play: (id: string, start: number, end: number) => void
  playing: string | null
  reviewedAt: string | null | undefined
  canMarkReviewed: boolean
  onMarkReviewed: (nothingFound: boolean) => void
  disabled: boolean
}

export function ProtectSection({ words, state, onChange, play, playing, reviewedAt, canMarkReviewed, onMarkReviewed, disabled }: Props) {
  const [term, setTerm] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const set = (patch: Partial<ProtectState>) => onChange({ ...state, ...patch })

  function addTerms(raw: string) {
    const parts = raw.split(/[,\n;]/).map((t) => t.trim()).filter(Boolean)
    if (!parts.length) return
    const next = Array.from(new Set([...state.terms, ...parts]))
    set({ terms: next })
    setTerm('')
  }

  function search() {
    const hits = findProtectedHits(words, state.terms)
    // Keep earlier decisions for hits that still exist.
    const decisions: Record<string, Decision> = {}
    for (const h of hits) if (state.decisions[h.id]) decisions[h.id] = state.decisions[h.id]
    set({ hits, decisions, searchedTerms: [...state.terms] })
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

  const pending = state.hits.filter((h) => !state.decisions[h.id]).length
  const accepted = state.hits.filter((h) => state.decisions[h.id] === 'accept').length
  const stale = state.searchedTerms != null && state.searchedTerms.join('\n') !== state.terms.join('\n')

  return (
    <div className={cardCls} id="protect">
      <StepHeading
        n={2}
        title="Protect identities"
        hint="List anything that could identify a survivor or guest: first and last names, nicknames, family members, towns, streets, schools, workplaces, churches, social handles. Every possible match is shown for you to check — nothing is bleeped until you accept it. This list is not saved anywhere; it disappears when you leave the page."
      />

      <div className="space-y-2">
        <label className="block" htmlFor="protect-term">
          <span className={labelCls}>Words or phrases to protect (press Enter or use commas)</span>
        </label>
        <div className="flex gap-2">
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
            className={inputCls}
            disabled={disabled}
          />
          <Btn tone="accent" disabled={disabled || !term.trim()} onClick={() => addTerms(term)}>Add</Btn>
        </div>
        {state.terms.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Protected words">
            {state.terms.map((t) => (
              <li key={t} className="inline-flex items-center gap-1 rounded-full border border-[#27313B] bg-[#151B22] px-2 py-0.5 text-xs text-[#F6FAFC]">
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => set({ terms: state.terms.filter((x) => x !== t) })}
                  className="rounded-full p-0.5 text-[#A9B8C6] hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="primary" disabled={disabled || !state.terms.length || !words.length} onClick={search}>
            {state.searchedTerms ? 'Search again' : 'Find in transcript'}
          </Btn>
          {!words.length && <span className="text-xs text-[#FFB86B]">Transcribe first (step 1) — or add time ranges by hand below.</span>}
          {stale && <span className="text-xs text-[#FFB86B]">The list changed — search again.</span>}
        </div>
      </div>

      {state.searchedTerms && (
        <div className="space-y-2">
          <p className="text-sm text-[#F6FAFC]" aria-live="polite">
            {state.hits.length === 0
              ? 'No matches found in the transcript. Listen through anyway — automatic transcripts often misspell names.'
              : `${state.hits.length} possible match${state.hits.length === 1 ? '' : 'es'} · ${accepted} to bleep · ${pending} still to check`}
          </p>
          {state.hits.length > 0 && (
            <ol className="divide-y divide-[#27313B] rounded-lg border border-[#27313B]">
              {state.hits.map((h) => {
                const d = state.decisions[h.id]
                const context = words.slice(Math.max(0, h.from - 5), h.to + 6)
                return (
                  <li key={h.id} className={`flex flex-col gap-2 p-3 md:flex-row md:items-center ${d === 'accept' ? 'bg-emerald-500/5' : d === 'reject' ? 'opacity-60' : ''}`}>
                    <button
                      type="button"
                      onClick={() => play(h.id, h.start, h.end)}
                      aria-label={`${playing === h.id ? 'Stop' : 'Play'} ${clock(h.start)} in context`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#27313B] px-2 py-1 text-xs tabular-nums text-[#8DEBFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8DEBFF]"
                    >
                      {playing === h.id ? <Square size={12} /> : <Play size={12} />} {clock(h.start)}
                    </button>
                    <div className="min-w-0 flex-1 text-sm text-[#B8C4CF]">
                      <p>
                        {context.map((w, i) => {
                          const idx = Math.max(0, h.from - 5) + i
                          const hit = idx >= h.from && idx <= h.to
                          return (
                            <span key={idx} className={hit ? 'rounded bg-[#FFB86B]/20 px-0.5 font-semibold text-[#FFB86B]' : ''}>
                              {w.w}{' '}
                            </span>
                          )
                        })}
                      </p>
                      <p className="text-[11px] text-[#A9B8C6]">
                        matches “{h.term}” · {h.reason === 'exact' ? 'exact' : h.reason === 'possessive' ? 'possessive / plural' : h.reason === 'partial' ? 'part of the word' : h.reason === 'spelling' ? 'similar spelling' : 'sounds similar'}
                      </p>
                    </div>
                    <DecisionButtons label={`${h.heard} at ${clock(h.start)}`} value={d} onChange={(v) => {
                      const decisions = { ...state.decisions }
                      if (v) decisions[h.id] = v
                      else delete decisions[h.id]
                      set({ decisions })
                    }} />
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <details className="rounded-lg border border-[#27313B] p-3">
        <summary className="cursor-pointer text-xs text-[#F6FAFC]">Bleep a time range by hand ({state.manual.length})</summary>
        <p className="mt-2 text-xs text-[#A9B8C6]">For anything the transcript missed. Times are on the current episode audio.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className={labelCls}>Start</span>
            <input value={manualStart} onChange={(e) => setManualStart(e.target.value)} placeholder="12:03.5" className={inputCls} />
          </label>
          <label>
            <span className={labelCls}>End</span>
            <input value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} placeholder="12:04.2" className={inputCls} onKeyDown={(e) => e.key === 'Enter' && addManual()} />
          </label>
          <div className="self-end"><Btn tone="accent" onClick={addManual}>Add range</Btn></div>
        </div>
        {manualError && <p className="mt-1 text-xs text-red-200" role="alert">{manualError}</p>}
        {state.manual.length > 0 && (
          <ul className="mt-2 space-y-1">
            {state.manual.map((m, i) => (
              <li key={`${m.start}-${i}`} className="flex items-center gap-2 text-xs text-[#B8C4CF]">
                <button type="button" onClick={() => play(`m${i}`, m.start, m.end)} className="text-[#8DEBFF]" aria-label={`Play ${clock(m.start)} in context`}>
                  <Play size={12} />
                </button>
                {clock(m.start)} – {clock(m.end)}
                <button type="button" onClick={() => set({ manual: state.manual.filter((_, j) => j !== i) })} className="text-red-200" aria-label="Remove range">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <div role="radiogroup" aria-label="How to hide protected words">
          <span className={labelCls}>Replace with</span>
          <div className="flex gap-2">
            {(['tone', 'silence'] as const).map((m) => (
              <label key={m} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${state.mode === m ? 'border-[#53D6FF] bg-[#1A232C] text-[#F6FAFC]' : 'border-[#27313B] text-[#B8C4CF]'}`}>
                <input type="radio" name="bleep-mode" className="sr-only" checked={state.mode === m} onChange={() => set({ mode: m })} />
                {m === 'tone' ? 'Bleep tone (1 kHz)' : 'Silence'}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className={labelCls}>Extra cover around each word</span>
          <select value={state.pad} onChange={(e) => set({ pad: Number(e.target.value) })} className={inputCls}>
            <option value={0.04}>Tight (0.04 s)</option>
            <option value={0.08}>Normal (0.08 s)</option>
            <option value={0.15}>Safe (0.15 s) — recommended for fast speakers</option>
            <option value={0.25}>Very safe (0.25 s)</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-[#A9B8C6]">Accepted words are also replaced with “[name]” in the transcript.</p>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#27313B] pt-3">
        {reviewedAt ? (
          <span className="text-xs text-emerald-200">Protected words reviewed {new Date(reviewedAt).toLocaleString()}.</span>
        ) : (
          <>
            <Btn
              tone="good"
              disabled={disabled || !canMarkReviewed}
              onClick={() => onMarkReviewed(false)}
              title={canMarkReviewed ? undefined : 'Search and decide every match first'}
            >
              Mark review done (nothing to bleep)
            </Btn>
            <Btn tone="default" disabled={disabled} onClick={() => onMarkReviewed(true)}>
              This episode names no one — mark reviewed
            </Btn>
            <span className="text-xs text-[#A9B8C6]">If you accept bleeps, the review is recorded when you replace the episode audio (step 5).</span>
          </>
        )}
      </div>
    </div>
  )
}
