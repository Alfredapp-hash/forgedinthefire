'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type StudioStep = 'setup' | 'record' | 'edit' | 'publish'

export const STUDIO_STEPS: { id: StudioStep; n: number; label: string; hint: string }[] = [
  { id: 'setup', n: 1, label: 'Set up', hint: 'Invite the guest, pick microphones and cameras, check levels.' },
  { id: 'record', n: 2, label: 'Record', hint: 'Record takes. Safe pause silences the guest instantly.' },
  { id: 'edit', n: 3, label: 'Edit', hint: 'Trim, remove mistakes, balance voices and music.' },
  { id: 'publish', n: 4, label: 'Publish', hint: 'Save the finished mix to the episode, then review it for publishing.' },
]

/** Boolean preference remembered in localStorage (per browser). Storage failures are ignored. */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === '1' || raw === '0') setValue(raw === '1')
    } catch {
      /* private mode / blocked storage */
    }
  }, [key])
  const update = (next: boolean) => {
    setValue(next)
    try {
      window.localStorage.setItem(key, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  return [value, update]
}

export function StepNav({
  step,
  onStep,
  advanced,
  onAdvanced,
  shortcutsOn,
  onShortcuts,
  onShowShortcuts,
}: {
  step: StudioStep
  onStep: (step: StudioStep) => void
  advanced: boolean
  onAdvanced: (next: boolean) => void
  shortcutsOn: boolean
  onShortcuts: (next: boolean) => void
  onShowShortcuts: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Production steps">
        <ol className="flex flex-wrap items-center gap-1.5">
          {STUDIO_STEPS.map((s, i) => {
            const active = s.id === step
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  title={s.hint}
                  onClick={() => onStep(s.id)}
                  className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8DEBFF] ${
                    active
                      ? 'border-[#53D6FF] bg-[#53D6FF] text-[#061016] font-semibold'
                      : 'border-[#4A5968] text-[#D5DEE6] hover:border-[#8DEBFF]'
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      active ? 'bg-[#061016] text-[#53D6FF]' : 'bg-[#1A232C] text-[#D5DEE6]'
                    }`}
                  >
                    {s.n}
                  </span>
                  {s.label}
                </button>
                {i < STUDIO_STEPS.length - 1 && <span aria-hidden className="text-[#4A5968]">·</span>}
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#D5DEE6]">
        <label className="inline-flex min-h-[36px] items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={advanced} onChange={(e) => onAdvanced(e.target.checked)} />
          Advanced tools
        </label>
        <label className="inline-flex min-h-[36px] items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={shortcutsOn} onChange={(e) => onShortcuts(e.target.checked)} />
          Keyboard shortcuts
        </label>
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label="Show keyboard shortcuts"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#4A5968] text-sm text-[#D5DEE6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8DEBFF]"
        >
          ?
        </button>
      </div>
    </div>
  )
}

/** Small "?" button that reveals help text — replaces long always-visible paragraphs. */
export function InfoTip({ label = 'More info', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#4A5968] text-[11px] text-[#D5DEE6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8DEBFF]"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-7 z-40 w-72 max-w-[80vw] rounded-lg border border-[#4A5968] bg-[#0A1016] p-3 text-xs leading-relaxed text-[#D5DEE6] shadow-xl normal-case tracking-normal"
        >
          {children}
        </span>
      )}
    </span>
  )
}
