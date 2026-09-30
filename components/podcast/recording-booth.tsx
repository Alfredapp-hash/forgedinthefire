'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

import { BoothStage, isTypingTarget, type BoothStageProps } from './booth-stage'

export type {
  BoothConnection,
  BoothLayout,
  BoothParticipant,
  BoothParticipantRole,
  BoothStageProps,
  BoothTally,
} from './booth-stage'

/**
 * Full-screen overlay version of the Sound Booth ("Expand to full screen").
 * It is the same BoothStage the inline stage renders, hosted in a native
 * `<dialog showModal>` so it sits in the browser top layer and the page behind
 * goes inert. All recording/takes/stream state stays with the editor.
 */
export type RecordingBoothProps = Omit<BoothStageProps, 'variant' | 'onExit' | 'onExpand' | 'autoFocusRecord'> & {
  open: boolean
  onClose: () => void
}

/** Store that never emits — used only to distinguish server vs client render. */
function subscribeNoop(): () => void {
  return () => {}
}

export function RecordingBooth(props: RecordingBoothProps): React.JSX.Element | null {
  const { open, onClose, onToggleRecord, canRecord, title, ...stage } = props

  // SSR-safe "are we on the client" flag without a setState-in-effect.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )

  const toggleRecordRef = useRef(onToggleRecord)
  const canRecordRef = useRef(canRecord)
  const closeRef = useRef(onClose)
  useEffect(() => {
    toggleRecordRef.current = onToggleRecord
    canRecordRef.current = canRecord
    closeRef.current = onClose
  }, [onToggleRecord, canRecord, onClose])

  // Lock background scroll while the overlay is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // R toggles record inside the overlay (the editor's own shortcut scope stops at
  // its root, and the dialog is portaled outside it). Esc is the dialog's cancel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        toggleRecordRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Drive the native modal; restore focus to the trigger on close and move
  // initial focus to the RecordButton (data-autofocus) so keyboard users start
  // inside the trap.
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dlg = dialogRef.current
    if (open && mounted && dlg && !dlg.open) {
      triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
      dlg.showModal()
      dlg.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return () => {
      const trigger = triggerRef.current
      if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) trigger.focus()
      triggerRef.current = null
    }
  }, [open, mounted])

  if (!open || !mounted) return null

  const overlay = (
    <dialog
      ref={dialogRef}
      aria-label={title ? `Sound Booth — ${title}` : 'Sound Booth'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="admin-portal fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none flex-col border-0 bg-obsidian p-0 text-white backdrop:bg-obsidian"
    >
      <BoothStage
        {...stage}
        variant="modal"
        title={title}
        canRecord={canRecord}
        onToggleRecord={onToggleRecord}
        onExit={onClose}
      />
    </dialog>
  )

  return createPortal(overlay, document.body)
}
