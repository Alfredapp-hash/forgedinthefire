'use client'

import { useState } from 'react'
import { showNotesDraft, suggestChapters, type ChapterSuggestion } from '@/lib/podcast/ai/chapters'
import type { TranscriptWord } from '@/lib/studio/transcript'
import type { PodcastChapter } from '@/lib/studio/types'
import { Btn, StepHeading, cardCls, clock, inputCls, labelCls } from './ui'

type Row = ChapterSuggestion & { keep: boolean }

type Props = {
  words: TranscriptWord[]
  existing: PodcastChapter[]
  showNotes: string
  exclude: string[]
  disabled: boolean
  onSaveChapters: (chapters: PodcastChapter[]) => Promise<void>
  onAppendNotes: (text: string) => Promise<void>
}

export function ChaptersSection({ words, existing, showNotes, exclude, disabled, onSaveChapters, onAppendNotes }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [notes, setNotes] = useState('')

  function suggest() {
    const found = suggestChapters(words, { exclude })
    const next = found.map((c) => ({ ...c, keep: true }))
    setRows(next)
    setNotes(showNotesDraft(found, Array.from(new Set(found.flatMap((c) => c.keywords))).slice(0, 10)))
  }

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const kept = (rows || []).filter((r) => r.keep && r.title.trim())

  async function save() {
    if (!kept.length) return
    if (existing.length && !window.confirm(`Replace the ${existing.length} existing chapter${existing.length === 1 ? '' : 's'} with these ${kept.length}?`)) return
    await onSaveChapters(kept.map((r) => ({ start_ms: r.start_ms, title: r.title.trim() })))
  }

  return (
    <div className={cardCls}>
      <StepHeading
        n={6}
        title="Suggest chapters & show notes (optional)"
        hint="Finds where the conversation changes topic, using only the transcript (no outside AI). Titles are rough keyword guesses — rewrite them. Protected words are never used in titles."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Btn tone="primary" disabled={disabled || words.length < 120} onClick={suggest}>{rows ? 'Suggest again' : 'Suggest chapters'}</Btn>
        {words.length < 120 && <span className="text-xs text-[#A9B8C6]">Needs a transcript of at least a few minutes.</span>}
      </div>
      {rows && rows.length === 0 && <p className="text-sm text-[#A9B8C6]">No clear topic changes found.</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className="space-y-2" aria-label="Suggested chapters">
            {rows.map((r, i) => (
              <li key={`${r.start_ms}-${i}`} className="grid items-center gap-2 sm:grid-cols-[auto_80px_1fr]">
                <input type="checkbox" checked={r.keep} onChange={(e) => update(i, { keep: e.target.checked })} aria-label={`Keep chapter at ${clock(r.start_ms / 1000)}`} />
                <span className="text-xs tabular-nums text-[#A9B8C6]">{clock(r.start_ms / 1000)}</span>
                <input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Title for chapter at ${clock(r.start_ms / 1000)}`} className={inputCls} />
              </li>
            ))}
          </ul>
          <Btn tone="accent" disabled={disabled || !kept.length} onClick={() => void save()}>Save {kept.length} chapter{kept.length === 1 ? '' : 's'}</Btn>
          <label className="block">
            <span className={labelCls}>Show-notes draft (edit before adding)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} className={`${inputCls} text-xs`} />
          </label>
          <Btn tone="accent" disabled={disabled || !notes.trim()} onClick={() => void onAppendNotes(notes.trim())}>
            {showNotes.trim() ? 'Add below existing show notes' : 'Use as show notes'}
          </Btn>
        </>
      )}
    </div>
  )
}
