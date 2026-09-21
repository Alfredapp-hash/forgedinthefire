'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock, Loader2, RotateCcw } from 'lucide-react'

type RevisionRow = {
  id: string
  created_at: string
  created_by: string | null
}

export function RevisionHistory({
  listUrl,
  onRestored,
}: {
  listUrl: string
  onRestored: () => void
}) {
  const [rows, setRows] = useState<RevisionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(listUrl)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load revisions')
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load revisions')
    } finally {
      setLoading(false)
    }
  }, [listUrl])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(id: string) {
    if (!window.confirm('Restore this version? The current copy is snapshotted on the next save.')) return
    setRestoring(id)
    setError(null)
    try {
      const res = await fetch(listUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      onRestored()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoring(null)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-[#A9B8C6] flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading revision history…
      </p>
    )
  }

  return (
    <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#53D6FF]" />
        <h3 className="font-medium text-[#F6FAFC]">Revision history</h3>
      </div>
      <p className="text-xs text-[#A9B8C6]">
        Last {rows.length} snapshot{rows.length === 1 ? '' : 's'} from saves. Restore replaces the current draft.
      </p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!rows.length && <p className="text-sm text-[#A9B8C6]">No snapshots yet. Save once to start history.</p>}
      <ul className="divide-y divide-[#27313B]">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="text-sm text-[#F6FAFC]">
                {new Date(row.created_at).toLocaleString()}
              </p>
              {row.created_by && <p className="text-xs text-[#A9B8C6]">{row.created_by}</p>}
            </div>
            <button
              type="button"
              onClick={() => void restore(row.id)}
              disabled={restoring === row.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#27313B] text-xs text-[#53D6FF] disabled:opacity-40"
            >
              {restoring === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
