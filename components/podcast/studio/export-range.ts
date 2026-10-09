/**
 * What "Save mix" exports. The whole session is always the default; a drag selection is only
 * exported when the host explicitly picks "Export selection only" (audit P0: a stray 2-second
 * selection used to replace the whole episode).
 */

import { formatClock } from '@/lib/podcast/audio'

export type ExportScope = 'full' | 'selection'

export type ExportRange = {
  scope: ExportScope
  start: number
  end: number
  duration: number
  /** True when the export covers the whole session (always true for scope 'full'). */
  isFull: boolean
}

/** Shortest selection we treat as a real range (matches the timeline's own threshold). */
export const MIN_SELECTION_SEC = 0.05

/** A normalized selection inside the session, or null when nothing meaningful is selected. */
export function selectionOf(
  range: { start: number; end: number } | null | undefined,
  sessionLen: number
): { start: number; end: number; duration: number } | null {
  if (!range || !(sessionLen > 0)) return null
  const start = Math.max(0, Math.min(range.start, range.end, sessionLen))
  const end = Math.min(sessionLen, Math.max(range.start, range.end))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_SELECTION_SEC) return null
  return { start, end, duration: end - start }
}

/**
 * Resolve the export window. `scope` defaults to 'full'; 'selection' without a usable selection
 * also falls back to the full session rather than exporting nothing (or a sliver).
 */
export function resolveExportRange(
  scope: ExportScope | undefined,
  range: { start: number; end: number } | null | undefined,
  sessionLen: number
): ExportRange {
  const total = Math.max(0, sessionLen || 0)
  const sel = scope === 'selection' ? selectionOf(range, total) : null
  if (!sel) return { scope: 'full', start: 0, end: total, duration: total, isFull: true }
  const isFull = sel.start <= MIN_SELECTION_SEC && sel.end >= total - MIN_SELECTION_SEC
  return { scope: 'selection', start: sel.start, end: sel.end, duration: sel.duration, isFull }
}

/** Plain-language duration: "2 seconds", "1 min 05 s", "1 h 02 min". */
export function describeDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return `${m} min ${String(rest).padStart(2, '0')} s`
}

export function describeExportRange(r: ExportRange): string {
  if (r.scope === 'full' || r.isFull) return `Whole episode · ${formatClock(r.duration)} (${describeDuration(r.duration)})`
  return `Selection only · ${formatClock(r.start)}–${formatClock(r.end)} (${describeDuration(r.duration)})`
}

/**
 * A selection export far shorter than the session is almost always a mistake — say so in the
 * dialog. Returns null when the selection looks intentional.
 */
export function shortExportWarning(r: ExportRange, sessionLen: number): string | null {
  if (r.scope !== 'selection' || r.isFull) return null
  if (sessionLen <= 0) return null
  if (r.duration < 60 || r.duration < sessionLen * 0.5) {
    return `This saves only ${describeDuration(r.duration)} of a ${describeDuration(sessionLen)} session. The rest will not be in the episode.`
  }
  return null
}

export type ReplaceWarning = 'published' | 'replace' | null

/** Saving over existing episode audio needs a confirm; over a published episode, a stronger one. */
export function replaceWarning(opts: { hasExistingAudio: boolean; published: boolean }): ReplaceWarning {
  if (opts.published) return 'published'
  if (opts.hasExistingAudio) return 'replace'
  return null
}

export function isPublishedStatus(status: string | null | undefined): boolean {
  return status === 'published'
}
