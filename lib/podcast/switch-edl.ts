/**
 * Switch edit-decision-list (EDL): camera-switch cuts as a movable, non-destructive
 * list of decisions over the raw per-participant camera sources.
 *
 * A cut says "at `atSec` on the session clock, participant/camera `mainId` becomes the
 * MAIN (full-frame) camera." The compositor in picture.ts consumes this to render a
 * "main + PIP follows the active speaker" program without touching the source files.
 *
 * All operations are pure: they return a NEW array kept sorted by `atSec`, never mutate
 * the input, and are deterministic (ids are passed in or derived from index + atSec —
 * never random), so they are trivially testable in a Node harness.
 */

export type CameraSwitchEvent = {
  id: string
  /** Session-clock time (seconds) the cut happens. */
  atSec: number
  /** Participant/camera id that becomes MAIN at/after this time. */
  mainId: string
  reason: 'auto' | 'manual'
}

/** Kept sorted by atSec (ascending). Stable ordering for equal atSec by insertion. */
export type SwitchEDL = CameraSwitchEvent[]

/** Deterministic id from the cut's position + time (no randomness). */
export function switchId(atSec: number, mainId: string, index: number): string {
  const ms = Math.max(0, Math.round(atSec * 1000))
  return `sw_${index}_${ms}_${mainId}`
}

function clampSec(sec: number): number {
  return Number.isFinite(sec) ? Math.max(0, sec) : 0
}

/**
 * Sort by atSec ascending. For equal atSec, preserve the incoming relative order
 * (stable) so a later-added cut at the same instant wins as "most recent decision".
 */
function sortEdl(edl: SwitchEDL): SwitchEDL {
  return edl
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => a.ev.atSec - b.ev.atSec || a.i - b.i)
    .map(({ ev }) => ev)
}

/**
 * Which camera is MAIN at `sec`. The active cut is the last one whose atSec <= sec.
 * Before the first cut (or with an empty EDL) the `fallbackId` is main.
 */
export function mainAt(edl: SwitchEDL, sec: number, fallbackId: string): string {
  let main = fallbackId
  for (const ev of edl) {
    if (ev.atSec <= sec + 1e-9) main = ev.mainId
    else break // edl is sorted; nothing further can apply
  }
  return main
}

/** Add a cut. Id is derived deterministically from its sorted index + time. */
export function addSwitch(edl: SwitchEDL, ev: Omit<CameraSwitchEvent, 'id'>): SwitchEDL {
  const atSec = clampSec(ev.atSec)
  const withNew = sortEdl([
    ...edl,
    { id: '__pending__', atSec, mainId: ev.mainId, reason: ev.reason },
  ])
  // Re-derive ids from final sorted position so ids are stable/deterministic.
  return withNew.map((e, i) =>
    e.id === '__pending__'
      ? { ...e, id: switchId(e.atSec, e.mainId, i) }
      : e,
  )
}

/** Drag a cut in time. Kept sorted, clamped >= 0. Other cuts and their ids are untouched. */
export function moveSwitch(edl: SwitchEDL, id: string, toSec: number): SwitchEDL {
  const to = clampSec(toSec)
  const moved = edl.map((ev) => (ev.id === id ? { ...ev, atSec: to } : ev))
  return sortEdl(moved)
}

export function removeSwitch(edl: SwitchEDL, id: string): SwitchEDL {
  return sortEdl(edl.filter((ev) => ev.id !== id))
}

/** Change which camera a cut selects. */
export function setSwitchMain(edl: SwitchEDL, id: string, mainId: string): SwitchEDL {
  return sortEdl(edl.map((ev) => (ev.id === id ? { ...ev, mainId } : ev)))
}

/**
 * Drop no-op consecutive same-main cuts: if a cut selects the same MAIN as the
 * decision already in effect just before it, it changes nothing and is removed.
 * Input is sorted first so callers can pass any order.
 */
export function dedupeEdl(edl: SwitchEDL): SwitchEDL {
  const sorted = sortEdl(edl)
  const out: SwitchEDL = []
  let current: string | null = null
  for (const ev of sorted) {
    if (ev.mainId === current) continue
    out.push(ev)
    current = ev.mainId
  }
  return out
}
