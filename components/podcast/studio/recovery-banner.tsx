'use client'

import { useState } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { loadRecoverableTakes, type CheckpointMeta, type SessionPeek } from '@/lib/podcast/session-store'
import { Button, Panel } from '@/components/studio-ui'

type Props = {
  episodeId?: string | null
  /** Autosaved session (takes laid on the timeline) found on this computer. */
  saved: SessionPeek | null
  /** Crash survivors: checkpointed-but-unfinalized takes from a previous tab. */
  crashTakes: CheckpointMeta[]
  busy?: boolean
  /** Lay the crash survivors onto the timeline. */
  onRestoreCrashTakes: () => void
  /** Restore the autosaved session. */
  onRestoreSession: () => void
  /** "Decide later": keep everything on this computer, hide the banner for this visit. */
  onDecideLater: () => void
  /** Confirmed delete of the autosave + checkpoints. */
  onDelete: () => void
  onOk?: (message: string) => void
  onError?: (message: string) => void
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Crash-safe recovery offer: interrupted recordings (tab closed, browser crash, power loss)
 * and the last autosaved session are offered back when the episode opens. Delete always
 * asks first — these may be the only copy. Plain language for non-technical hosts.
 */
export function RecoveryBanner({
  episodeId,
  saved,
  crashTakes,
  busy = false,
  onRestoreCrashTakes,
  onRestoreSession,
  onDecideLater,
  onDelete,
  onOk,
  onError,
}: Props) {
  const [working, setWorking] = useState(false)
  const hasCrash = crashTakes.length > 0
  if (!hasCrash && !saved) return null

  const newest = hasCrash ? Math.max(...crashTakes.map((t) => t.updatedAt || t.startedAt || 0)) : saved?.savedAt || 0
  const when = newest ? new Date(newest).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'earlier'
  const crashLabels = [...new Set(crashTakes.map((t) => t.label).filter(Boolean))].join(', ')
  const disabled = busy || working

  async function saveCrashTakesAsFiles() {
    if (!episodeId) return
    setWorking(true)
    try {
      const recovered = await loadRecoverableTakes(episodeId)
      const audio = recovered.filter((r) => r.meta.kind !== 'camera')
      if (audio.length === 0) {
        onError?.('No recording data could be read from the unfinished takes')
        return
      }
      for (const { meta, blob } of audio) {
        const stamp = new Date(meta.startedAt || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
        const ext = meta.kind === 'worklet' ? 'wav' : blob.type.includes('mp4') ? 'm4a' : 'webm'
        downloadBlob(blob, `${(meta.label || 'recording').replace(/[^\w]+/g, '-')}-${stamp}.${ext}`)
      }
      onOk?.(`Saved ${audio.length} unfinished recording${audio.length === 1 ? '' : 's'} as file${audio.length === 1 ? '' : 's'}`)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not save the unfinished recordings')
    } finally {
      setWorking(false)
    }
  }

  function confirmDelete() {
    const what = hasCrash
      ? `${crashTakes.length} unfinished recording${crashTakes.length === 1 ? '' : 's'}${saved ? ' and the saved session' : ''}`
      : 'the saved session'
    const ok = window.confirm(
      `Delete ${what} from this computer? This cannot be undone. Choose Cancel, then “Save as file” or “Restore” first if you might need them.`,
    )
    if (!ok) return
    onDelete()
  }

  return (
    <Panel
      elevation="floating"
      role="alert"
      className={`px-4 py-3 flex flex-wrap items-center gap-3 ${hasCrash ? 'border-[#FFB86B]/70' : 'border-forged/40'}`}
    >
      <div className="flex-1 min-w-[14rem] space-y-1">
        {hasCrash && (
          <p className="text-sm text-[#FFB86B]">
            We found {crashTakes.length} unfinished recording{crashTakes.length === 1 ? '' : 's'}
            {crashLabels ? ` (${crashLabels})` : ''} from {when}. The browser closed before{' '}
            {crashTakes.length === 1 ? 'it was' : 'they were'} saved — {crashTakes.length === 1 ? 'it is' : 'they are'} still on this computer.
          </p>
        )}
        {saved && (
          <p className="text-sm text-white">
            {saved.takeCount} take{saved.takeCount === 1 ? '' : 's'}
            {saved.cameraCount ? ` + ${saved.cameraCount} camera file${saved.cameraCount === 1 ? '' : 's'}` : ''} (
            {formatClock(saved.durationSec)}) were saved {new Date(saved.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} on this computer.
          </p>
        )}
      </div>
      {hasCrash && (
        <Button variant="primary" size="compact" disabled={disabled} onClick={onRestoreCrashTakes}>
          Restore recording{crashTakes.length === 1 ? '' : 's'}
        </Button>
      )}
      {saved && (
        <Button variant={hasCrash ? 'secondary' : 'primary'} size="compact" disabled={disabled} onClick={onRestoreSession}>
          Restore session
        </Button>
      )}
      {hasCrash && (
        <Button size="compact" disabled={disabled} loading={working} onClick={() => void saveCrashTakesAsFiles()}>
          Save as file
        </Button>
      )}
      <Button
        variant="ghost"
        size="compact"
        disabled={disabled}
        title="Keep everything on this computer and ask again next time this episode opens"
        onClick={onDecideLater}
      >
        Decide later
      </Button>
      <Button variant="danger" size="compact" disabled={disabled} onClick={confirmDelete}>
        Delete…
      </Button>
    </Panel>
  )
}
