/**
 * Go-live gating and the pre-flight checklist (pure; unit-tested).
 *
 * `goLiveBlockers` explains exactly why "Go live" is disabled. Warnings never block.
 * `evaluatePreflight` turns probe results into the checklist shown before going live;
 * any `fail` blocks "Go live now".
 */

import type { LiveProviderStatus, LiveSessionRow } from '@/lib/podcast/live/types'

export type GoLiveInput = {
  active: Pick<LiveSessionRow, 'status'> | null
  hostStreamOpen: boolean
  provider: LiveProviderStatus | null
  providerError: string | null
  guestConnected: boolean
  playbackMissing: boolean
}

export function goLiveBlockers(input: GoLiveInput): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = []
  const warnings: string[] = []
  if (!input.active) blockers.push('No show selected — pick or schedule one under Shows.')
  else if (input.active.status === 'ended') blockers.push('This show has ended — schedule a new one.')
  if (!input.hostStreamOpen) blockers.push('Camera + mic not opened — use “Open camera + mic”.')
  if (input.providerError) blockers.push(`Live provider check failed: ${input.providerError}`)
  else if (!input.provider) blockers.push('Checking the live provider…')
  else if (!input.provider.configured) blockers.push('Live provider not configured — set LIVE_WHIP_URL on the server.')
  if (!input.guestConnected) warnings.push('Guest not connected (you can still go live).')
  if (input.playbackMissing) warnings.push('No playback URL — viewers will see “being set up”.')
  return { blockers, warnings }
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
