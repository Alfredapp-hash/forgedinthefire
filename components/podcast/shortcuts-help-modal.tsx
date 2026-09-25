'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { Button, Kbd, Panel } from '@/components/studio-ui'
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
      className="m-auto w-full max-w-2xl bg-transparent p-0 text-white backdrop:bg-obsidian/70"
    >
      <Panel elevation="floating" className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-divider px-5 py-4">
          <div>
            <p className="studio-type-label text-ice">Studio</p>
            <h2 className="studio-type-section mt-0.5 !text-[18px]">Keyboard shortcuts</h2>
          </div>
          <Button variant="secondary" size="compact" onClick={onClose} aria-label="Close shortcuts">
            Close
          </Button>
        </div>

        <div className="grid gap-x-8 gap-y-6 px-5 py-5 sm:grid-cols-2">
          {STUDIO_SHORTCUTS.map((group) => (
            <section key={group.group}>
              <p className="studio-type-column mb-2.5 text-ice">{group.group}</p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.keys} className="flex items-center justify-between gap-3">
                    <span className="studio-type-body text-silver-body">{item.action}</span>
                    <Kbd className="shrink-0">{item.keys}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
    </dialog>
  )

  return createPortal(overlay, document.body)
}
