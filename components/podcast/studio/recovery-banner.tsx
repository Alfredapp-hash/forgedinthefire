'use client'

import { useEffect, useState } from 'react'
import { encodeWav, formatClock } from '@/lib/podcast/audio'
import { deleteTake, listUnfinishedTakes, recoverTake, type UnfinishedTake } from '@/lib/podcast/take-journal'

type Props = {
  episodeId?: string | null
  /** Lay a recovered take on the timeline (the editor drops the journal copy once the session autosaves). */
  onRestore: (take: UnfinishedTake, buffer: AudioBuffer) => void
  onError: (message: string) => void
  onOk: (message: string) => void
  btn: string
  primary: string
  danger: string
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
 * Crash-safe take journal recovery: interrupted recordings (tab closed, browser crash, power
 * loss) are offered back on mount. Delete always asks first — these may be the only copy.
 */
export function JournalRecoveryBanner({ episodeId, onRestore, onError, onOk, btn, primary, danger }: Props) {
  const [takes, setTakes] = useState<UnfinishedTake[]>([])
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!episodeId) return
    let cancelled = false
    void listUnfinishedTakes(episodeId)
      .then((list) => {
        if (!cancelled) setTakes(list.filter((t) => !t.complete))
      })
      .catch(() => {
        /* journal unavailable (private window) — nothing to offer */
      })
    return () => {
      cancelled = true
    }
  }, [episodeId])

  if (!episodeId || takes.length === 0) return null

  const total = takes.reduce((n, t) => n + (t.durationSec || 0), 0)
  const newest = Math.max(...takes.map((t) => t.updatedAt || t.startedAt || 0))
  const when = newest ? new Date(newest).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'earlier'

  async function run(label: string, fn: (take: UnfinishedTake) => Promise<void>) {
    setWorking(true)
    const failed: UnfinishedTake[] = []
    for (const take of takes) {
      try {
        await fn(take)
      } catch {
        failed.push(take)
      }
    }
    setWorking(false)
    if (failed.length) onError(`${label}: ${failed.length} recording${failed.length === 1 ? '' : 's'} could not be read`)
    return failed
  }

  async function restoreAll() {
    const failed = await run('Restore', async (take) => {
      const buffer = await recoverTake(take.id)
      onRestore(take, buffer)
    })
    const n = takes.length - failed.length
    if (n > 0) onOk(`Restored ${n} unfinished recording${n === 1 ? '' : 's'} onto the timeline.`)
    setTakes(failed)
  }

  async function saveFiles() {
    const failed = await run('Save as file', async (take) => {
      const buffer = await recoverTake(take.id)
      const stamp = new Date(take.startedAt || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
      downloadBlob(encodeWav(buffer), `${(take.label || 'recording').replace(/[^\w]+/g, '-')}-${stamp}.wav`)
    })
    if (failed.length < takes.length) onOk('Saved unfinished recordings as WAV files')
  }

  async function deleteAll() {
    const ok = window.confirm(
      `Delete ${takes.length} unfinished recording${takes.length === 1 ? '' : 's'} (${formatClock(total)}) from this computer? This cannot be undone. Choose Cancel, then "Save as file" first if you might need them.`,
    )
    if (!ok) return
    const failed = await run('Delete', (take) => deleteTake(take.id))
    setTakes(failed)
    if (!failed.length) onOk('Deleted unfinished recordings')
  }

  return (
    <div
      className="rounded-xl border-2 border-[#FFB86B] bg-[#20180C] px-4 py-3 flex flex-wrap items-center gap-3"
      role="alert"
    >
      <p className="text-sm text-[#F6FAFC] flex-1 min-w-[12rem]">
        We found {takes.length} unfinished recording{takes.length === 1 ? '' : 's'} ({formatClock(total)}) from {when}.
        The browser closed before {takes.length === 1 ? 'it was' : 'they were'} saved.
      </p>
      <button type="button" className={primary} disabled={working} onClick={() => void restoreAll()}>
        Restore
      </button>
      <button type="button" className={btn} disabled={working} onClick={() => void saveFiles()}>
        Save as file
      </button>
      <button type="button" className={danger} disabled={working} onClick={() => void deleteAll()}>
        Delete…
      </button>
    </div>
  )
}
