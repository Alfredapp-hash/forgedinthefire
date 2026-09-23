'use client'

/**
 * Leave guard for the production room. The editor reports whether it is recording or holds
 * edits that are not saved to the episode; hosts (RecordingStudio, PodcastDesk) call
 * `confirmLeaveStudio()` before anything that would unmount the editor. While guarded, the
 * browser's beforeunload prompt is armed and same-origin link clicks (incl. Next <Link>) confirm.
 */
import { useEffect } from 'react'

export type StudioGuardState = {
  recording: boolean
  /** Edits since the last saved mix (takes are still backed up on this computer). */
  unsaved: boolean
}

let state: StudioGuardState = { recording: false, unsaved: false }

export function setStudioGuard(next: StudioGuardState) {
  state = next
}

export function studioGuard(): StudioGuardState {
  return state
}

export function leaveMessage(s: StudioGuardState = state): string | null {
  if (s.recording) return 'Recording is in progress. Leaving now stops it and the current take may be lost. Leave anyway?'
  if (s.unsaved)
    return 'Your latest edits are backed up on this computer, but the mix is not saved to the episode yet. Leave anyway?'
  return null
}

/** True when it is fine to leave (nothing to lose, or the person confirmed). */
export function confirmLeaveStudio(): boolean {
  const msg = leaveMessage()
  if (!msg) return true
  return typeof window === 'undefined' ? true : window.confirm(msg)
}

/** Arms beforeunload + in-app link interception while `active`. */
export function useLeaveGuard({ recording, unsaved }: StudioGuardState) {
  const active = recording || unsaved
  useEffect(() => {
    setStudioGuard({ recording, unsaved })
  }, [recording, unsaved])

  useEffect(
    () => () => {
      setStudioGuard({ recording: false, unsaved: false })
    },
    [],
  )

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Legacy browsers need returnValue set.
      event.returnValue = ''
    }
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return // beforeunload covers full navigations
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!confirmLeaveStudio()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [active])
}
