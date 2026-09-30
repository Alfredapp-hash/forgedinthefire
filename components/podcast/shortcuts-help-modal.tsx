'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { Button, Kbd, Panel } from '@/components/studio-ui'
import { SHORTCUT_SCOPE_NOTE, STUDIO_HOW_IT_WORKS, STUDIO_SHORTCUTS } from '@/lib/podcast/shortcuts'

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
  // `<dialog showModal>` traps Tab within the dialog natively; we only add
  // focus RETURN (native dialogs do not restore focus to the trigger on close).
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dlg = dialogRef.current
    if (open && mounted && dlg && !dlg.open) {
      // Remember what had focus so we can restore it when the dialog closes.
      triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
      dlg.showModal()
      // Move initial focus into the dialog (onto the Close button) so keyboard
      // users start inside the trap rather than on the <body>.
      const initial = dlg.querySelector<HTMLElement>('[data-autofocus]')
      initial?.focus()
    }
    return () => {
      // On close/unmount, return focus to the element that opened the dialog.
      const trigger = triggerRef.current
      if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) {
        trigger.focus()
      }
      triggerRef.current = null
    }
  }, [open, mounted])

  if (!open || !mounted) return null

  const overlay = (
    <dialog
      ref={dialogRef}
      aria-label="Keyboard shortcuts and help"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-2xl bg-transparent p-0 text-white backdrop:bg-obsidian/70"
    >
      <Panel elevation="floating" className="max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 border-b border-divider px-5 py-4">
          <div>
            <p className="studio-type-label text-ice">Studio</p>
            <h2 className="studio-type-section mt-0.5 !text-[18px]">Shortcuts &amp; how it works</h2>
          </div>
          <Button
            variant="secondary"
            size="compact"
            onClick={onClose}
            aria-label="Close shortcuts"
            data-autofocus
          >
            Close
          </Button>
        </div>

        <p className="studio-type-body border-b border-divider px-5 py-3 text-silver-body">{SHORTCUT_SCOPE_NOTE}</p>

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

        <section className="border-t border-divider px-5 py-5" aria-labelledby="studio-how-it-works">
          <h3 id="studio-how-it-works" className="studio-type-column mb-2.5 text-ice">
            How the studio works
          </h3>
          <div className="space-y-2">
            {STUDIO_HOW_IT_WORKS.map((item) => (
              <details key={item.title} className="rounded-control border border-divider bg-obsidian px-3 py-2">
                <summary className="studio-type-body cursor-pointer text-white">{item.title}</summary>
                <p className="studio-type-body mt-2 text-silver-body">{item.body}</p>
              </details>
            ))}
          </div>
        </section>
      </Panel>
    </dialog>
  )

  return createPortal(overlay, document.body)
}
