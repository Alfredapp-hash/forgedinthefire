/**
 * Pure layout helpers for the Sound Booth (inline stage) and the full-screen
 * Recording Booth overlay. No DOM, no React — unit-tested in isolation.
 */

export type BoothLaneRole = 'host' | 'cohost' | 'guest'

/**
 * Responsive grid class for an equal tile layout that stays balanced from 1 up
 * to ~6 participants (beyond that it wraps to a dense 3-wide grid).
 *   1 → full · 2 → side-by-side · 3-4 → 2×2 · 5-6 → 3×2
 *
 * On phones (<640px) every case collapses to a SINGLE column so tiles stay
 * tappable; the stage scrolls vertically rather than cramming 3-across into a
 * narrow viewport.
 */
export function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 sm:grid-rows-1'
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 sm:grid-rows-1'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
}

/**
 * Stable lane hue per participant, GarageBand-style. Host → lane 0 (forged
 * blue), the sole guest → lane 1 (ice), and everyone else fans out across the
 * remaining cohost lanes (2…) by encounter order so each person keeps a
 * distinct, consistent accent.
 */
export function laneIndexById(participants: ReadonlyArray<{ id: string; role: BoothLaneRole }>): Map<string, number> {
  const map = new Map<string, number>()
  let next = 2
  let guestTaken = false
  for (const p of participants) {
    if (p.role === 'host') {
      map.set(p.id, 0)
    } else if (p.role === 'guest' && !guestTaken) {
      map.set(p.id, 1)
      guestTaken = true
    } else {
      map.set(p.id, next++)
    }
  }
  return map
}

/** mm:ss for the transport clock; hours roll into minutes (a 90 min take reads 90:00). */
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

export type BoothTakeSummary = {
  id: string
  /** Who recorded it (person name). */
  person: string
  /** Seconds of audio in the take. */
  durationSec: number
  /** Where it sits on the timeline (seconds). */
  offsetSec: number
  /** Persistent lane hue index for the person (see laneIndexById). */
  laneIndex: number
}

/** "3 takes · 12:40" — count plus total recorded length. Empty list → "No takes yet". */
export function takesSummary(takes: ReadonlyArray<Pick<BoothTakeSummary, 'durationSec'>>): string {
  if (takes.length === 0) return 'No takes yet'
  const total = takes.reduce((sum, t) => sum + Math.max(0, t.durationSec || 0), 0)
  return `${takes.length} take${takes.length === 1 ? '' : 's'} · ${mmss(total)}`
}

/** The most recent takes first, capped for the compact drawer list. */
export function recentTakes<T extends { offsetSec: number }>(takes: ReadonlyArray<T>, limit = 6): T[] {
  return [...takes].sort((a, b) => b.offsetSec - a.offsetSec).slice(0, Math.max(0, limit))
}

export type BoothStatus = 'idle' | 'count-in' | 'rec' | 'saving'

/** Header status chip text: Idle / Count-in / REC 00:00 / Saving. */
export function statusChipLabel(status: BoothStatus, elapsedSec: number): string {
  switch (status) {
    case 'count-in':
      return 'Count-in'
    case 'rec':
      return `REC ${mmss(elapsedSec)}`
    case 'saving':
      return 'Saving'
    default:
      return 'Idle'
  }
}

/** Fold the editor's live signals into the one header status. Recording wins over saving. */
export function deriveBoothStatus(input: { recording: boolean; countIn: boolean; saving: boolean }): BoothStatus {
  if (input.recording) return input.countIn ? 'count-in' : 'rec'
  if (input.saving) return 'saving'
  return 'idle'
}
