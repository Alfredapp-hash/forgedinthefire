/**
 * Pure state → label helpers for the live room's transport strip, so the
 * "Record, but broadcasting" mental model is testable without a DOM.
 *
 * The strip reuses the studio RecordButton:
 *   idle      — something blocks going live (no show, no camera, provider down…)
 *   armed     — ready: pressing it runs the pre-flight checklist
 *   recording — on air (or connecting / ending): pressing it ends the show
 */

export type LivePhase = 'off' | 'connecting' | 'live' | 'ending' | 'ended'
export type TransportRecordState = 'idle' | 'armed' | 'recording'

export function isOnAir(phase: LivePhase): boolean {
  return phase === 'connecting' || phase === 'live' || phase === 'ending'
}

export function transportRecordState(input: {
  phase: LivePhase
  blockers: number
  hasActiveShow: boolean
}): TransportRecordState {
  if (isOnAir(input.phase)) return 'recording'
  return input.blockers === 0 && input.hasActiveShow ? 'armed' : 'idle'
}

/** Accessible name for the transport button; says WHY it is unavailable, not just that it is. */
export function transportLabel(input: {
  phase: LivePhase
  blockers: number
  preflightOpen: boolean
}): string {
  switch (input.phase) {
    case 'live':
      return 'End show'
    case 'connecting':
      return 'Connecting to ingest'
    case 'ending':
      return 'Ending'
    default:
      if (input.preflightOpen) return 'Pre-flight in progress'
      if (input.blockers > 0) return 'Go live (unavailable — see why below)'
      return 'Go live — runs the pre-flight checklist first'
  }
}

/** Whether the transport button is disabled. On air it only works while fully live. */
export function transportDisabled(input: {
  phase: LivePhase
  blockers: number
  preflightOpen: boolean
}): boolean {
  if (isOnAir(input.phase)) return input.phase !== 'live'
  return input.blockers > 0 || input.preflightOpen
}

/** The "What viewers see now" badge next to the on-air monitor. */
export function viewerBadge(input: {
  phase: LivePhase
  dumped: boolean
  activeDelaySec: number
  rebuildingSec: number
}): string {
  if (!isOnAir(input.phase)) return 'Off air'
  if (input.dumped) return 'DUMPED · slate + silence'
  if (input.activeDelaySec === 0) return 'No delay'
  if (input.rebuildingSec > 0) return `Refilling · slate for ${input.rebuildingSec} s`
  return `${input.activeDelaySec} s behind`
}
