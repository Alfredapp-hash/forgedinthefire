'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Pause, Play, Redo2, RotateCcw, Scissors, Search, Undo2, UserRound } from 'lucide-react'
import {
  canRedo,
  canUndo,
  combineCuts,
  createHistory,
  cutSeconds,
  deleteWordRange,
  deletedWords,
  describeDelete,
  nextMatch,
  paragraphs as splitParagraphs,
  pushHistory,
  rangesToMatches,
  redo,
  resetHistory,
  restoreWordRange,
  searchWords,
  setSpeaker,
  speakerCues,
  speakerNames,
  undo,
  wordIndexAt,
  type History,
  type Paragraph,
  type TextEditState,
  type WordMatch,
} from '@/lib/podcast/ai/text-edit'
import type { Cut } from '@/lib/podcast/safety/render'
import { cuesToVtt, type TranscriptWord } from '@/lib/studio/transcript'
import { Kbd } from '@/components/studio-ui'
import { Btn, Note, clock, inputCls } from '@/components/podcast/post/ui'
import { EditPlayer } from './edit-player'

type Range = { start: number; end: number }

type Props = {
  words: TranscriptWord[]
  /** Text cuts + speaker labels (persisted in the safety row by the parent). */
  state: TextEditState
  onChange: (next: TextEditState) => void
  /** Cuts already accepted in the filler step — shown struck through, not editable here. */
  fillerCuts: Cut[]
  /** Every filler / repeat / pause suggestion, for "next filler". */
  fillerRanges: Range[]
  /** Accepted protected-term covers — highlighted, and silent in the preview. */
  protectedRanges: Range[]
  getSource: () => Promise<AudioBuffer>
  /** Build the new audio with the existing pipeline (step "Apply changes"). */
  onApply: () => void
  disabled: boolean
  onError: (msg: string) => void
  fileBase?: string
}

type Selection = { anchor: number; focus: number }

const WORD_BASE = 'inline rounded-sm px-[1px] py-[1px] cursor-text select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice'

/** Rendered per paragraph and memoised: a selection or playhead change only redraws the paragraphs it touches. */
const ParagraphView = memo(function ParagraphView({
  words,
  para,
  index,
  deleted,
  fillerDeleted,
  protectedMask,
  selFrom,
  selTo,
  focusIndex,
  playIndex,
  matchFrom,
  matchTo,
  onSpeaker,
}: {
  words: TranscriptWord[]
  para: Paragraph
  index: number
  deleted: Uint8Array
  fillerDeleted: Uint8Array
  protectedMask: Uint8Array
  selFrom: number
  selTo: number
  focusIndex: number
  playIndex: number
  matchFrom: number
  matchTo: number
  onSpeaker: (index: number) => void
}) {
  const spans: React.ReactNode[] = []
  for (let i = para.from; i <= para.to; i++) {
    const w = words[i]
    const selected = i >= selFrom && i <= selTo
    const isDeleted = deleted[i] === 1
    const cls = [
      WORD_BASE,
      isDeleted ? 'line-through decoration-heart/70 text-silver/60' : 'text-white',
      selected ? 'bg-forged/30' : '',
      i === playIndex ? 'bg-ice/40 text-white' : '',
      protectedMask[i] ? 'bg-heart/15 text-heart' : '',
      i >= matchFrom && i <= matchTo ? 'ring-1 ring-ice' : '',
    ].join(' ')
    spans.push(
      <span
        key={i}
        role="option"
        data-i={i}
        tabIndex={i === focusIndex ? 0 : -1}
        aria-selected={selected}
        aria-label={isDeleted ? `${w.w} (deleted${fillerDeleted[i] ? ' by filler tidy-up' : ''})` : undefined}
        title={fillerDeleted[i] ? 'Removed by the filler / pause step' : undefined}
        className={cls}
      >
        {w.w}
      </span>,
      ' ',
    )
  }
  return (
    <div className="group/para" data-para={index}>
      <div className="mb-1 flex items-center gap-2 text-[11px] text-silver">
        <span className="tabular-nums">{clock(para.start)}</span>
        <button
          type="button"
          onClick={() => onSpeaker(index)}
          className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface-raised px-2 py-0.5 hover:border-forged/60 focus-visible:outline-none"
          aria-label={`${para.speaker ? `Speaker ${para.speaker} — change` : 'Set speaker'} for the paragraph at ${clock(para.start)}`}
        >
          <UserRound size={11} aria-hidden /> {para.speaker || 'Speaker?'}
        </button>
      </div>
      <p className="studio-type-body text-[15px] leading-7">{spans}</p>
    </div>
  )
})

export function TranscriptEditor({ words, state, onChange, fillerCuts, fillerRanges, protectedRanges, getSource, onApply, disabled, onError, fileBase = 'episode' }: Props) {
  // ── History (undo / redo) mirrors the persisted state ──────────────────
  const [history, setHistory] = useState<History<TextEditState>>(() => createHistory(state))
  const emitted = useRef(JSON.stringify(state))
  useEffect(() => {
    const json = JSON.stringify(state)
    if (json === emitted.current) return
    emitted.current = json
    setHistory(resetHistory(state)) // hydrated / reset from outside: not undoable
  }, [state])
  const commit = useCallback(
    (next: TextEditState) => {
      setHistory((h) => pushHistory(h, next))
      emitted.current = JSON.stringify(next)
      onChange(next)
    },
    [onChange],
  )
  const applyHistory = useCallback(
    (fn: (h: History<TextEditState>) => History<TextEditState>) => {
      setHistory((h) => {
        const n = fn(h)
        if (n !== h) {
          emitted.current = JSON.stringify(n.present)
          queueMicrotask(() => onChange(n.present))
        }
        return n
      })
    },
    [onChange],
  )
  const edit = history.present

  // ── Derived views ──────────────────────────────────────────────────────
  const paras = useMemo(() => splitParagraphs(words, edit.speakers), [words, edit.speakers])
  const allCuts = useMemo(() => combineCuts(edit.cuts, fillerCuts), [edit.cuts, fillerCuts])
  const deleted = useMemo(() => deletedWords(words, allCuts), [words, allCuts])
  const fillerDeleted = useMemo(() => deletedWords(words, fillerCuts), [words, fillerCuts])
  const protectedMask = useMemo(() => {
    const m = new Uint8Array(words.length)
    for (const r of rangesToMatches(words, protectedRanges)) for (let i = r.from; i <= r.to; i++) m[i] = 1
    return m
  }, [words, protectedRanges])
  const fillerMatches = useMemo(() => rangesToMatches(words, fillerRanges), [words, fillerRanges])
  const protectedMatches = useMemo(() => rangesToMatches(words, protectedRanges), [words, protectedRanges])
  const deletedCount = useMemo(() => deleted.reduce((n, d) => n + d, 0), [deleted])
  const textSeconds = cutSeconds(edit.cuts)

  // ── Selection / focus ──────────────────────────────────────────────────
  const [sel, setSel] = useState<Selection | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const wantFocus = useRef(false)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState('')
  const selFrom = sel ? Math.min(sel.anchor, sel.focus) : -1
  const selTo = sel ? Math.max(sel.anchor, sel.focus) : -1

  useEffect(() => {
    if (focusIndex >= words.length) setFocusIndex(Math.max(0, words.length - 1))
  }, [words.length, focusIndex])

  useEffect(() => {
    if (!wantFocus.current) return
    wantFocus.current = false
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-i="${focusIndex}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusIndex, sel])

  const moveFocus = useCallback(
    (to: number, extend: boolean) => {
      const i = Math.max(0, Math.min(words.length - 1, to))
      wantFocus.current = true
      setFocusIndex(i)
      setSel((s) => (extend ? { anchor: s?.anchor ?? focusIndex, focus: i } : { anchor: i, focus: i }))
    },
    [words.length, focusIndex],
  )

  const selectRange = useCallback((m: WordMatch, takeFocus = true) => {
    wantFocus.current = takeFocus
    setFocusIndex(m.from)
    setSel({ anchor: m.from, focus: m.to })
    if (!takeFocus) containerRef.current?.querySelector(`[data-i="${m.from}"]`)?.scrollIntoView({ block: 'center' })
  }, [])

  const paraOf = useCallback((i: number) => paras.findIndex((p) => i >= p.from && i <= p.to), [paras])

  // ── Editing ────────────────────────────────────────────────────────────
  const currentRange = useCallback((): WordMatch | null => {
    if (!words.length) return null
    if (sel) return { from: Math.min(sel.anchor, sel.focus), to: Math.max(sel.anchor, sel.focus) }
    return { from: focusIndex, to: focusIndex }
  }, [sel, focusIndex, words.length])

  const doDelete = useCallback(() => {
    const r = currentRange()
    if (!r || disabled) return
    let allDeleted = true
    for (let i = r.from; i <= r.to && allDeleted; i++) allDeleted = deleted[i] === 1
    if (allDeleted) {
      // Backspace on something already deleted puts it back.
      const next = restoreWordRange(edit, words, r.from, r.to)
      commit(next)
      const n = r.to - r.from + 1
      setLive(`Restored ${n} word${n === 1 ? '' : 's'}`)
      return
    }
    const res = deleteWordRange(edit, words, r.from, r.to)
    if (!res) return
    commit(res.state)
    setLive(describeDelete(res.words, res.seconds))
    // Move on to the next word that is still there.
    let next = r.to + 1
    while (next < words.length && deleted[next]) next++
    moveFocus(Math.min(next, words.length - 1), false)
  }, [currentRange, disabled, deleted, edit, words, commit, moveFocus])

  const doRestore = useCallback(() => {
    const r = currentRange()
    if (!r || disabled) return
    commit(restoreWordRange(edit, words, r.from, r.to))
    const n = r.to - r.from + 1
    setLive(`Restored ${n} word${n === 1 ? '' : 's'}`)
  }, [currentRange, disabled, edit, words, commit])

  const doUndo = useCallback(() => {
    if (!canUndo(history)) return
    applyHistory(undo)
    setLive('Undone')
  }, [history, applyHistory])
  const doRedo = useCallback(() => {
    if (!canRedo(history)) return
    applyHistory(redo)
    setLive('Redone')
  }, [history, applyHistory])

  // ── Speakers ───────────────────────────────────────────────────────────
  const [speakerEdit, setSpeakerEdit] = useState<{ para: number; name: string } | null>(null)
  const names = useMemo(() => speakerNames(edit.speakers), [edit.speakers])
  const openSpeaker = useCallback(
    (index: number) => {
      const p = paras[index]
      if (!p) return
      setSpeakerEdit({ para: index, name: p.speaker || '' })
    },
    [paras],
  )
  function saveSpeaker(name = speakerEdit?.name ?? '') {
    if (!speakerEdit) return
    const p = paras[speakerEdit.para]
    if (!p) return setSpeakerEdit(null)
    commit({ ...edit, speakers: setSpeaker(edit.speakers, p.start, name) })
    setLive(name.trim() ? `Speaker set to ${name.trim()}` : 'Speaker label removed')
    setSpeakerEdit(null)
  }

  // ── Search ─────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => searchWords(words, query), [words, query])
  const [current, setCurrent] = useState<WordMatch | null>(null)
  useEffect(() => setCurrent(null), [query])
  const jump = useCallback(
    (list: WordMatch[], dir: 1 | -1, what: string, takeFocus = true) => {
      const m = nextMatch(list, current?.from ?? focusIndex, dir)
      if (!m) {
        setLive(`No ${what}`)
        return
      }
      setCurrent(m)
      selectRange(m, takeFocus)
      const pos = list.indexOf(m) + 1
      setLive(`${what} ${pos} of ${list.length}: ${words.slice(m.from, m.to + 1).map((w) => w.w).join(' ')} at ${clock(words[m.from].s)}`)
    },
    [current, focusIndex, selectRange, words],
  )

  // ── Preview player ─────────────────────────────────────────────────────
  const playerRef = useRef<EditPlayer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(-1)
  const [playhead, setPlayhead] = useState(0)
  const [follow, setFollow] = useState(true)
  const [loading, setLoading] = useState(false)
  const wordsRef = useRef(words)
  wordsRef.current = words
  const planRef = useRef({ cuts: allCuts, mutes: protectedRanges })
  planRef.current = { cuts: allCuts, mutes: protectedRanges }
  const lastIdx = useRef(-1)

  useEffect(() => () => playerRef.current?.dispose(), [])
  useEffect(() => {
    playerRef.current?.setPlan(allCuts, protectedRanges)
  }, [allCuts, protectedRanges])

  const player = useCallback(async () => {
    if (playerRef.current) return playerRef.current
    setLoading(true)
    try {
      const buffer = await getSource()
      if (playerRef.current) return playerRef.current
      const p = new EditPlayer(buffer)
      p.setPlan(planRef.current.cuts, planRef.current.mutes)
      p.onState = setPlaying
      p.onTime = (t) => {
        setPlayhead(t)
        const i = wordIndexAt(wordsRef.current, t)
        if (i !== lastIdx.current) {
          lastIdx.current = i
          setPlayIndex(i)
        }
      }
      p.onEnd = () => setLive('Reached the end')
      playerRef.current = p
      return p
    } finally {
      setLoading(false)
    }
  }, [getSource])

  const playFrom = useCallback(
    async (index: number) => {
      try {
        const p = await player()
        const w = words[index]
        p.play(w ? w.s : 0)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not start playback')
      }
    },
    [player, words, onError],
  )
  const togglePlay = useCallback(async () => {
    try {
      const p = await player()
      p.toggle(words[focusIndex]?.s ?? 0)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not start playback')
    }
  }, [player, words, focusIndex, onError])

  useEffect(() => {
    if (!follow || !playing || playIndex < 0) return
    containerRef.current?.querySelector(`[data-i="${playIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [playIndex, follow, playing])

  // ── Keyboard ───────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!words.length) return
    const mod = e.metaKey || e.ctrlKey
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
      if (mod && e.key.toLowerCase() === 'z' && target.tagName === 'BUTTON') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      }
      return
    }
    const p = paraOf(focusIndex)
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        moveFocus(focusIndex + 1, e.shiftKey)
        break
      case 'ArrowLeft':
        e.preventDefault()
        moveFocus(focusIndex - 1, e.shiftKey)
        break
      case 'ArrowDown':
        e.preventDefault()
        moveFocus(paras[p + 1]?.from ?? words.length - 1, e.shiftKey)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveFocus(paras[p]?.from === focusIndex ? (paras[p - 1]?.from ?? 0) : (paras[p]?.from ?? 0), e.shiftKey)
        break
      case 'Home':
        e.preventDefault()
        moveFocus(mod ? 0 : (paras[p]?.from ?? 0), e.shiftKey)
        break
      case 'End':
        e.preventDefault()
        moveFocus(mod ? words.length - 1 : (paras[p]?.to ?? words.length - 1), e.shiftKey)
        break
      case 'Backspace':
      case 'Delete':
        e.preventDefault()
        doDelete()
        break
      case 'Escape':
        setSel(null)
        break
      case 'Enter':
        e.preventDefault()
        void playFrom(focusIndex)
        break
      case ' ':
        e.preventDefault()
        void togglePlay()
        break
      case 'a':
      case 'A':
        if (mod) {
          e.preventDefault()
          setSel({ anchor: 0, focus: words.length - 1 })
        }
        break
      case 'f':
      case 'F':
        if (mod) {
          e.preventDefault()
          searchRef.current?.focus()
        }
        break
      case 'z':
      case 'Z':
        if (mod) {
          e.preventDefault()
          if (e.shiftKey) doRedo()
          else doUndo()
        }
        break
      case 'y':
      case 'Y':
        if (mod) {
          e.preventDefault()
          doRedo()
        }
        break
      default:
        break
    }
  }

  // ── Mouse selection ────────────────────────────────────────────────────
  const wordAt = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    return el ? Number(el.dataset.i) : null
  }
  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const i = wordAt(e)
    if (i == null) return
    dragging.current = true
    if (e.shiftKey) {
      setSel((s) => ({ anchor: s?.anchor ?? focusIndex, focus: i }))
      setFocusIndex(i)
    } else moveFocus(i, false)
  }
  function onMouseOver(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const i = wordAt(e)
    if (i == null) return
    setSel((s) => (s ? { anchor: s.anchor, focus: i } : { anchor: i, focus: i }))
    setFocusIndex(i)
  }
  useEffect(() => {
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  function downloadVtt() {
    const body = cuesToVtt(speakerCues(words, edit.speakers))
    const url = URL.createObjectURL(new Blob([body], { type: 'text/vtt' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBase}-transcript-speakers.vtt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const selCount = sel ? selTo - selFrom + 1 : 0
  const selSeconds = sel && words[selTo] ? Math.max(0, words[selTo].e - words[selFrom].s) : 0
  const pending = edit.cuts.length > 0

  return (
    <div className="space-y-3" id="text-editor">
      {!words.length ? (
        <Note>Transcribe first (step 1) to edit by text.</Note>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Transcript editing">
            <Btn tone="primary" onClick={() => void togglePlay()} disabled={disabled || loading} title="Space">
              {playing ? <Pause size={12} /> : <Play size={12} />} {loading ? 'Loading audio…' : playing ? 'Pause' : 'Play with edits'}
            </Btn>
            <Btn onClick={() => void playFrom(focusIndex)} disabled={disabled || loading} title="Enter">
              <Play size={12} /> Play from here
            </Btn>
            <label className="studio-type-body flex items-center gap-1 text-[12px] text-silver-body">
              <input type="checkbox" className="accent-forged" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow playback
            </label>
            <span className="studio-type-timecode" aria-live="off">{clock(playhead)}</span>
            <span className="mx-1 h-4 w-px bg-divider" aria-hidden />
            <Btn tone="danger" onClick={doDelete} disabled={disabled || !words.length} title="Backspace / Delete">
              <Scissors size={12} /> Delete{selCount > 1 ? ` ${selCount} words` : ''}
            </Btn>
            <Btn onClick={doRestore} disabled={disabled || !words.length} title="Put the selected words back">
              <RotateCcw size={12} /> Restore
            </Btn>
            <Btn onClick={doUndo} disabled={disabled || !canUndo(history)} title="Ctrl/Cmd+Z">
              <Undo2 size={12} /> Undo
            </Btn>
            <Btn onClick={doRedo} disabled={disabled || !canRedo(history)} title="Ctrl/Cmd+Shift+Z">
              <Redo2 size={12} /> Redo
            </Btn>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[12rem]">
              <span className="sr-only">Find a word or phrase</span>
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-silver" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    jump(matches, e.shiftKey ? -1 : 1, 'Match', false)
                  } else if (e.key === 'Escape') setQuery('')
                }}
                placeholder="Find a word or phrase (Enter = next)"
                className={`${inputCls} pl-7`}
                disabled={disabled}
              />
            </label>
            <span className="studio-type-timecode">{query ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : ''}</span>
            <Btn onClick={() => jump(matches, -1, 'Match')} disabled={!matches.length} title="Previous match (Shift+Enter)"><ChevronLeft size={12} /></Btn>
            <Btn onClick={() => jump(matches, 1, 'Match')} disabled={!matches.length} title="Next match (Enter)"><ChevronRight size={12} /></Btn>
            <span className="mx-1 h-4 w-px bg-divider" aria-hidden />
            <Btn onClick={() => jump(fillerMatches, 1, 'Filler')} disabled={!fillerMatches.length}>Next filler ({fillerMatches.length})</Btn>
            <Btn onClick={() => jump(protectedMatches, 1, 'Protected term')} disabled={!protectedMatches.length}>Next protected term ({protectedMatches.length})</Btn>
          </div>

          <div
            ref={containerRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Transcript words. Arrow keys move, Shift plus arrows select, Backspace deletes, Enter plays from here."
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onMouseDown={onMouseDown}
            onMouseOver={onMouseOver}
            className="max-h-[28rem] space-y-4 overflow-y-auto rounded-control border border-divider bg-obsidian p-4 shadow-inset-well"
          >
            {paras.map((p, idx) => (
              <ParagraphView
                key={p.from}
                words={words}
                para={p}
                index={idx}
                deleted={deleted}
                fillerDeleted={fillerDeleted}
                protectedMask={protectedMask}
                selFrom={sel && selTo >= p.from && selFrom <= p.to ? Math.max(selFrom, p.from) : -1}
                selTo={sel && selTo >= p.from && selFrom <= p.to ? Math.min(selTo, p.to) : -2}
                focusIndex={focusIndex >= p.from && focusIndex <= p.to ? focusIndex : -1}
                playIndex={playIndex >= p.from && playIndex <= p.to ? playIndex : -1}
                matchFrom={current && current.to >= p.from && current.from <= p.to ? Math.max(current.from, p.from) : -1}
                matchTo={current && current.to >= p.from && current.from <= p.to ? Math.min(current.to, p.to) : -2}
                onSpeaker={openSpeaker}
              />
            ))}
          </div>

          {speakerEdit && paras[speakerEdit.para] && (
            <form
              className="flex flex-wrap items-end gap-2 rounded-control border border-forged/40 bg-obsidian p-3"
              onSubmit={(e) => {
                e.preventDefault()
                saveSpeaker()
              }}
            >
              <label className="flex-1 min-w-[12rem]">
                <span className="studio-type-label mb-1 block">
                  Who is speaking from {clock(paras[speakerEdit.para].start)}?
                </span>
                <input
                  autoFocus
                  list="speaker-names"
                  value={speakerEdit.name}
                  onChange={(e) => setSpeakerEdit({ ...speakerEdit, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Escape' && setSpeakerEdit(null)}
                  placeholder="e.g. Host, Guest, Sam"
                  className={inputCls}
                  maxLength={80}
                />
                <datalist id="speaker-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
              </label>
              <Btn tone="accent" type="submit">Save</Btn>
              {paras[speakerEdit.para].speaker && (
                <Btn onClick={() => saveSpeaker('')}>Remove label</Btn>
              )}
              <Btn onClick={() => setSpeakerEdit(null)}>Cancel</Btn>
              <p className="studio-type-body w-full text-[12px] text-silver">The name applies from this paragraph until the next labelled one. Use first names or roles only — never a surname the guest would not want published.</p>
            </form>
          )}

          <p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>
          <div className="studio-type-body flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-silver" aria-live="polite">
            <span>{sel && selCount > 0 ? `${selCount} word${selCount === 1 ? '' : 's'} selected (${selSeconds.toFixed(1)} s)` : 'Nothing selected'}</span>
            <span>·</span>
            <span>{deletedCount} word{deletedCount === 1 ? '' : 's'} struck through · {edit.cuts.length} text cut{edit.cuts.length === 1 ? '' : 's'} ({textSeconds.toFixed(1)} s) · {fillerCuts.length} from filler tidy-up</span>
            {live && <span className="text-ice">· {live}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
            <Btn tone="accent" onClick={onApply} disabled={disabled || (!pending && !fillerCuts.length)} title="Builds the new audio in the Apply step with 10 ms crossfades">
              <Scissors size={12} /> Apply edits (build new audio)
            </Btn>
            <Btn onClick={downloadVtt} disabled={disabled}><Download size={12} /> VTT with speaker names</Btn>
            <span className="studio-type-body text-[12px] text-silver">Nothing is cut from the file until you build and replace the episode audio in the Apply step.</span>
          </div>
          <p className="studio-type-body flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-silver">
            <span><Kbd>←</Kbd> <Kbd>→</Kbd> move</span>
            <span><Kbd>Shift</Kbd> + arrows select</span>
            <span><Kbd>Backspace</Kbd> delete / restore</span>
            <span><Kbd>Enter</Kbd> play from here</span>
            <span><Kbd>Space</Kbd> play / pause</span>
            <span><Kbd>⌘Z</Kbd> undo</span>
          </p>
        </>
      )}
    </div>
  )
}
