/**
 * Go-live gating and the pre-flight checklist (pure; unit-tested).
 *
 * `goLiveBlockers` explains, in plain language (no protocol names), exactly why "Go live"
 * is disabled. Warnings never block. The check functions turn probe results into the
 * checklist shown before going live; any `fail` blocks "Go live now".
 */

import type { LiveProviderStatus, LiveSessionRow } from '@/lib/podcast/live/types'

export type LivePhase = 'off' | 'connecting' | 'live' | 'ending' | 'ended'

export type GoLiveInput = {
  active: Pick<LiveSessionRow, 'status'> | null
  hostStreamOpen: boolean
  /** Host camera / mic tracks are live and enabled (a device may have been unplugged). */
  hostVideoLive?: boolean
  hostAudioLive?: boolean
  provider: LiveProviderStatus | null
  providerError: string | null
  guestConnected: boolean
  playbackMissing: boolean
  phase?: LivePhase
  busy?: boolean
}

export function goLiveBlockers(input: GoLiveInput): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = []
  const warnings: string[] = []
  if (input.phase === 'connecting' || input.phase === 'live' || input.phase === 'ending') {
    return { blockers: ['The show is already on air.'], warnings }
  }
  if (!input.active) blockers.push('No show selected — pick or schedule one under Shows.')
  else if (input.active.status === 'ended') blockers.push('This show has ended — schedule a new one.')
  if (!input.hostStreamOpen) blockers.push('Camera + mic not opened — use “Open camera + mic”.')
  else {
    if (input.hostAudioLive === false) blockers.push('Your microphone is not sending sound — re-open camera + mic.')
    if (input.hostVideoLive === false) blockers.push('Your camera is not on — re-open camera + mic.')
  }
  if (input.providerError) blockers.push(`Live provider check failed: ${input.providerError}`)
  else if (!input.provider) blockers.push('Checking the streaming service…')
  else if (!input.provider.configured) {
    blockers.push('The streaming service is not set up yet — see Advanced under Live provider.')
  }
  if (input.busy) blockers.push('Please wait for the current action to finish.')
  if (!input.guestConnected) warnings.push('Guest not connected (you can still go live).')
  if (input.playbackMissing) warnings.push('No playback URL — viewers will see “being set up”.')
  return { blockers, warnings }
}

/** True when a MediaStream has at least one live, enabled track of `kind`. */
export function hasLiveTrack(stream: MediaStream | null, kind: 'audio' | 'video'): boolean {
  if (!stream) return false
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
  return tracks.some((t) => t.readyState === 'live' && t.enabled)
}

/**
 * Keep the leave-page warning while on air and afterwards until the local recording
 * has been saved as an episode draft (it only lives in this browser).
 */
export function shouldWarnBeforeUnload(opts: {
  phase: LivePhase
  hasRecording: boolean
  saved: boolean
  saving: boolean
}): boolean {
  if (opts.phase === 'connecting' || opts.phase === 'live' || opts.phase === 'ending') return true
  if (opts.saving) return true
  return opts.phase === 'ended' && opts.hasRecording && !opts.saved
}

export type CheckStatus = 'pending' | 'ok' | 'warn' | 'fail'
export type PreflightCheck = { id: string; label: string; status: CheckStatus; detail: string }

/** Video 2.5 Mbps + audio 128 kbps + overhead. */
export const STREAM_NEEDS_MBPS = 3
export const STREAM_COMFORT_MBPS = 5

export function bitrateCheck(mbps: number | null, error?: string | null): PreflightCheck {
  const label = 'Outgoing bitrate'
  if (error) return { id: 'bitrate', label, status: 'warn', detail: `Could not test upload (${error}).` }
  if (mbps == null) return { id: 'bitrate', label, status: 'pending', detail: 'Testing upload…' }
  if (mbps >= STREAM_COMFORT_MBPS) return { id: 'bitrate', label, status: 'ok', detail: `${mbps} Mbps up — plenty for 720p.` }
  if (mbps >= STREAM_NEEDS_MBPS) {
    return { id: 'bitrate', label, status: 'warn', detail: `${mbps} Mbps up — enough, with little headroom. Close other uploads.` }
  }
  return {
    id: 'bitrate',
    label,
    status: 'warn',
    detail: `${mbps} Mbps up — below the ~${STREAM_NEEDS_MBPS} Mbps the stream needs. Expect stutter; try wired or a hotspot.`,
  }
}

export function delayCheck(delaySec: number): PreflightCheck {
  if (delaySec > 0) {
    return {
      id: 'delay',
      label: 'Broadcast delay',
      status: 'ok',
      detail: `${delaySec} s delay. DUMP (D) discards the last ${delaySec} s before it airs.`,
    }
  }
  return {
    id: 'delay',
    label: 'Broadcast delay',
    status: 'warn',
    detail: 'No delay. DUMP can only cut to the safe slate — anything already said has aired.',
  }
}

export type BlurSummary = { on: boolean; state: string; detail?: string }

export function faceBlurCheck(who: 'Guest' | 'Host', blur: BlurSummary, required: boolean): PreflightCheck {
  const id = `blur-${who.toLowerCase()}`
  const label = `${who} face blur`
  if (!blur.on) {
    return {
      id,
      label,
      status: required ? 'warn' : 'ok',
      detail: required
        ? 'Off. Only go live like this if the guest agreed to show their face.'
        : 'Off.',
    }
  }
  if (blur.state === 'ok') return { id, label, status: 'ok', detail: 'On — faces are pixelated in Program.' }
  if (blur.state === 'failed') {
    return {
      id,
      label,
      status: 'warn',
      detail: `Detector failed (${blur.detail || 'unknown'}). ${who} is shown as a silhouette card instead.`,
    }
  }
  return {
    id,
    label,
    status: 'warn',
    detail: `On, detector ${blur.state}. Until it is running the ${who.toLowerCase()} is a silhouette card.`,
  }
}
