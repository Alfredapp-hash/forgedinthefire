'use client'

/**
 * Simulcast card for the Live control room: manage restream destinations (YouTube Live,
 * Facebook Live, custom RTMP(S)/WHIP) and watch their state while on air.
 *
 * Secrets are typed here once and sent to the server, which stores them encrypted; the
 * list only ever shows masked values. Nothing here can stop the main stream — a failed
 * destination is a warning, not an error.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button, Checkbox, Chip, IconButton, Input, Select, type ChipTone } from '@/components/studio-ui'
import { cn } from '@/lib/utils'
import {
  DESTINATION_KINDS,
  DESTINATION_PRESETS,
  summarizeDestinations,
  type DestinationKind,
  type DestinationPublic,
  type DestinationState,
} from '@/lib/podcast/live/simulcast'
import {
  createDestination,
  deleteDestination,
  listDestinations,
  patchDestination,
  pollSimulcastStatus,
  type SimulcastCapabilityPublic,
} from '@/lib/podcast/live/simulcast-client'

const POLL_MS = 10_000

const hint = 'studio-type-body text-[12px] leading-snug text-silver-label'

const STATE_TONE: Record<DestinationState, ChipTone> = {
  idle: 'neutral',
  queued: 'accent',
  live: 'success',
  failed: 'record',
  disabled: 'neutral',
  unsupported: 'neutral',
}
const STATE_WORD: Record<DestinationState, string> = {
  idle: 'idle',
  queued: 'connecting',
  live: 'live',
  failed: 'FAILED',
  disabled: 'off',
  unsupported: 'manual',
}

type Props = {
  /** Session id while on air (polls provider state); null otherwise. */
  liveSessionId: string | null
  /** Destinations returned by the start call (so the card updates without waiting for a poll). */
  startResult?: { destinations: DestinationPublic[]; warning: string | null } | null
  onWarning?: (message: string | null) => void
}

export function LiveSimulcastCard({ liveSessionId, startResult, onWarning }: Props) {
  const [rows, setRows] = useState<DestinationPublic[]>([])
  const [capability, setCapability] = useState<SimulcastCapabilityPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [fKind, setFKind] = useState<DestinationKind>('youtube')
  const [fLabel, setFLabel] = useState('')
  const [fUrl, setFUrl] = useState('')
  const [fKey, setFKey] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await listDestinations()
      setRows(data.destinations)
      setCapability(data.capability)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load destinations')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (startResult) setRows(startResult.destinations)
  }, [startResult])

  // Poll provider state while on air.
  useEffect(() => {
    if (!liveSessionId) return
    let cancelled = false
    const tick = async () => {
      try {
        const data = await pollSimulcastStatus(liveSessionId)
        if (cancelled) return
        setRows(data.destinations)
        setCapability(data.capability)
        const summary = summarizeDestinations(data.destinations)
        onWarning?.(
          summary.failed > 0
            ? `Simulcast: ${summary.failed} destination${summary.failed > 1 ? 's' : ''} failed (${data.destinations
                .filter((d) => d.enabled && d.state === 'failed')
                .map((d) => d.label)
                .join(', ')}). The main stream continues.`
            : null,
        )
      } catch {
        /* keep the last state */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [liveSessionId, onWarning])

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const { destination } = await createDestination({
        label: fLabel.trim() || DESTINATION_PRESETS[fKind].label,
        kind: fKind,
        url: fUrl.trim() || DESTINATION_PRESETS[fKind].url,
        streamKey: fKey.trim() || null,
      })
      setRows((prev) => [...prev, destination])
      setAdding(false)
      setFLabel('')
      setFUrl('')
      setFKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add destination')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: DestinationPublic, enabled: boolean) {
    setBusy(true)
    try {
      const { destination } = await patchDestination(row.id, { enabled })
      setRows((prev) => prev.map((r) => (r.id === row.id ? destination : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update destination')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row: DestinationPublic) {
    if (!window.confirm(`Remove “${row.label}”? The stream key is deleted from the server.`)) return
    setBusy(true)
    try {
      await deleteDestination(row.id)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove destination')
    } finally {
      setBusy(false)
    }
  }

  const summary = summarizeDestinations(rows)
  const preset = DESTINATION_PRESETS[fKind]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="studio-type-body text-white">
          {summary.enabled === 0 ? 'No destinations enabled' : liveSessionId ? summary.text : `${summary.enabled} enabled`}
        </span>
        <IconButton size="dense" aria-label="Refresh destinations" onClick={() => void load()}>
          <RefreshCw />
        </IconButton>
      </div>
      {capability && !capability.automatic && (
        <p className={cn(hint, 'flex gap-1 text-lane-cohost-1')}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
          {capability.provider === 'cloudflare'
            ? `Cloudflare restreaming is not set up: ${capability.reason}`
            : capability.reason || 'Automatic restreaming is not available for this provider.'}
        </p>
      )}
      {error && (
        <p className={cn(hint, 'text-heart')} role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="rounded-control border border-divider px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="studio-type-body min-w-0 flex-1 truncate text-white">{r.label}</span>
              <Chip
                tone={STATE_TONE[r.state]}
                dot={r.state === 'live' || r.state === 'queued'}
                className={cn(r.state === 'unsupported' && 'border-lane-cohost-1/60 text-lane-cohost-1', r.state === 'disabled' && 'opacity-60')}
                role="status"
              >
                {STATE_WORD[r.state]}
              </Chip>
              <Checkbox label="on" checked={r.enabled} disabled={busy} onChange={(e) => void toggle(r, e.target.checked)} />
              <IconButton size="dense" disabled={busy || Boolean(liveSessionId)} onClick={() => void remove(r)} aria-label={`Remove ${r.label}`}>
                <Trash2 />
              </IconButton>
            </div>
            <p className="truncate font-mono text-[11px] text-silver-label">
              {r.protocol.toUpperCase()} · {r.urlMasked}
              {r.keyMasked ? ` · key ${r.keyMasked}` : ''}
            </p>
            {r.stateDetail && r.enabled && <p className={cn(hint, r.state === 'failed' && 'text-heart')}>{r.stateDetail}</p>}
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="space-y-2 rounded-control border border-forged/40 bg-obsidian p-3">
          <Select label="Destination type" value={fKind} onChange={(e) => setFKind(e.target.value as DestinationKind)}>
            {DESTINATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {DESTINATION_PRESETS[k].label}
              </option>
            ))}
          </Select>
          <Input label="Destination name" placeholder={`e.g. ${preset.label}`} value={fLabel} onChange={(e) => setFLabel(e.target.value)} />
          <Input
            label="Ingest URL"
            placeholder={preset.url || 'rtmps://… or https://…/whip'}
            value={fUrl}
            onChange={(e) => setFUrl(e.target.value)}
          />
          <Input
            label="Stream key"
            type="password"
            autoComplete="off"
            value={fKey}
            onChange={(e) => setFKey(e.target.value)}
            hint={preset.help}
          />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} loading={busy} onClick={() => void add()}>
              <Plus size={14} aria-hidden /> Save destination
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button disabled={busy} onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden /> Add destination
        </Button>
      )}
      <p className={hint}>
        Your browser sends one stream; the provider fans it out to these platforms when you go live and removes the
        restreams when you end. Keys are stored encrypted and shown masked. If a platform drops, the main show and the
        other platforms keep going.
      </p>
    </div>
  )
}
