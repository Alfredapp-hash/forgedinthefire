'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { STUDIO_SHORTCUTS } from '@/lib/podcast/shortcuts'

/** Store that never emits — used only to distinguish server vs client render. */
function subscribeNoop(): () => void {
  return () => {}
}

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Keyboard-shortcuts help. Renders as a native modal `<dialog>` driven by
 * `showModal()` — the same pattern as recording-booth.tsx — so it sits in the
 * browser top layer (above native <select> popups and everything else) and the
 * page behind goes inert. Portaled to <body>; returns null when closed. Esc
 * closes via the dialog's native cancel event.
 */
export function ShortcutsHelpModal({ open, onClose }: Props): React.JSX.Element | null {
  // SSR-safe "are we on the client" flag without a setState-in-effect: the store
  // never changes, so this returns false during SSR/first paint and true after.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )

  // Drive the native modal so the dialog enters the top layer and the page
  // behind it goes inert. Opened in an effect (never during render).
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  useEffect(() => {
    const dlg = dialogRef.current
    if (open && mounted && dlg && !dlg.open) dlg.showModal()
  }, [open, mounted])

  if (!open || !mounted) return null

  const overlay = (
    <dialog
      ref={dialogRef}
      aria-label="Keyboard shortcuts"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-2xl rounded-2xl border border-[#27313B] bg-[#0B0F14] p-0 text-[#F6FAFC] backdrop:bg-[#05070A]/70"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#27313B] px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8DEBFF]">Studio</p>
          <h2 className="mt-0.5 text-base font-semibold text-[#F6FAFC]">Keyboard shortcuts</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shortcuts"
          className="flex h-8 items-center rounded-lg border border-[#27313B] bg-[#05070A] px-3 text-sm text-[#A9B8C6] transition-colors hover:border-[#3A4652] hover:text-[#F6FAFC]"
        >
          Close
        </button>
      </div>

      <div className="grid gap-x-8 gap-y-6 px-5 py-5 sm:grid-cols-2">
        {STUDIO_SHORTCUTS.map((group) => (
          <section key={group.group}>
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">{group.group}</p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.keys} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#A9B8C6]">{item.action}</span>
                  <kbd className="shrink-0 rounded-md border border-[#27313B] bg-[#05070A] px-2 py-0.5 font-mono text-[11px] text-[#F6FAFC]">
                    {item.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  )

  return createPortal(overlay, document.body)
}
