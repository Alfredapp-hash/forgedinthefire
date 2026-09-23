'use client'

import { useEffect, useRef } from 'react'

export const STUDIO_SHORTCUTS: { keys: string; what: string; single?: boolean }[] = [
  { keys: 'Shift + Space', what: 'Safe pause — silence the guest in the recording and headphones (always on)' },
  { keys: 'Space', what: 'Play / pause', single: true },
  { keys: 'R', what: 'Start / stop recording', single: true },
  { keys: 'J / K / L', what: 'Step back 1 s (Shift: 5 s) / stop / play', single: true },
  { keys: 'S', what: 'Split the selected lane at the playhead', single: true },
  { keys: 'V', what: 'Split picture at the playhead', single: true },
  { keys: 'C', what: 'Mark a chapter at the playhead', single: true },
  { keys: '1 – 9, 0', what: 'Drop a sound effect', single: true },
  { keys: 'Delete', what: 'Remove, leave silence (Shift + Delete: remove & close gap)', single: true },
  { keys: 'Shift + M', what: 'Mute the selected range', single: true },
  { keys: '⌘Z / Ctrl+Z', what: 'Undo' },
  { keys: '⇧⌘Z / Ctrl+Y', what: 'Redo' },
  { keys: '⌥1 / ⌥2 / ⌥3', what: 'Output: Host / Guest / Side by side' },
]

export function ShortcutsOverlay({
  open,
  onClose,
  shortcutsOn,
}: {
  open: boolean
  onClose: () => void
  shortcutsOn: boolean
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-shortcuts-title"
        className="w-full max-w-lg rounded-2xl border border-[#4A5968] bg-[#0C141C] p-5 text-[#F6FAFC] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 id="studio-shortcuts-title" className="text-base font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[36px] rounded-lg border border-[#4A5968] px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8DEBFF]"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-[#D5DEE6] mb-3">
          Single-key shortcuts are {shortcutsOn ? 'on' : 'off'} — change this with the “Keyboard shortcuts” switch.
          They never fire while you are typing or while a button or menu has focus.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {STUDIO_SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt className={`font-mono text-[#8DEBFF] whitespace-nowrap ${s.single && !shortcutsOn ? 'opacity-60' : ''}`}>{s.keys}</dt>
              <dd className={`text-[#D5DEE6] ${s.single && !shortcutsOn ? 'opacity-60' : ''}`}>{s.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
