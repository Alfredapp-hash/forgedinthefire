/**
 * Host <-> guest control plane on an RTCDataChannel.
 *
 * Offer/answer/ICE stay on the HTTP signal table (they are needed before the
 * channel exists). Once the peer is up, control signals (mute, record, talkback,
 * cue, tally, camera, pause, reconnect, hangup) go over the channel at once, and
 * the HTTP poll drops to a slow fallback. Safety/recording-critical kinds
 * (GUEST_DURABLE_KINDS) are ALSO written to the signal table; every control
 * signal carries a `cid` + `seq` so the receiver applies it once and never lets
 * an older state overwrite a newer one.
 *
 * The channel also runs a tiny NTP-style ping so the guest can convert its own
 * clock to the host's (used to place the guest backup on the session timeline).
 */

import { parseSignal } from '@/lib/podcast/guest-signal-schema'
import { GUEST_CONTROL_KINDS } from '@/lib/podcast/guest-types'

export const CONTROL_CHANNEL_LABEL = 'fitf-ctl'

/** Poll delays (ms). Fast while negotiating, slow once the data channel carries control. */
export const POLL_FAST_MS = 900
export const POLL_IDLE_MAX_MS = 4000
export const POLL_FALLBACK_MS = 10_000
export const POLL_ERROR_MAX_MS = 15_000

type SigMessage = { t: 'sig'; kind: string; payload: Record<string, unknown> }
type PingMessage = { t: 'ping'; id: number; a: number }
type PongMessage = { t: 'pong'; id: number; a: number; b: number }
type ControlMessage = SigMessage | PingMessage | PongMessage

let lastSeq = 0

/** Monotonic per page, and across a host reload (ms-based), so `seq` ordering survives refreshes. */
export function nextSignalSeq() {
  lastSeq = Math.max(Date.now(), lastSeq + 1)
  return lastSeq
}

export function newSignalCid() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Attach cid/seq to a control payload (idempotent: keeps an existing cid). */
export function stampControl(payload: Record<string, unknown> = {}) {
  if (typeof payload.cid === 'string' && typeof payload.seq === 'number') return payload
  return { ...payload, cid: newSignalCid(), seq: nextSignalSeq() }
}

/**
 * Applies each control signal once. State kinds are last-writer-wins by `seq`:
 * an older mute/record/pause that arrives late (e.g. the slow HTTP copy) is dropped.
 */
export class SignalDeduper {
  private seen = new Set<string>()
  private order: string[] = []
  private lastByKind = new Map<string, number>()

  accept(kind: string, payload: Record<string, unknown>) {
    const cid = typeof payload.cid === 'string' ? payload.cid : null
    if (cid) {
      if (this.seen.has(cid)) return false
      this.seen.add(cid)
      this.order.push(cid)
      if (this.order.length > 600) {
        const drop = this.order.splice(0, 200)
        drop.forEach((id) => this.seen.delete(id))
      }
    }
    const seq = typeof payload.seq === 'number' ? payload.seq : null
    if (seq != null && GUEST_CONTROL_KINDS.has(kind) && kind !== 'reconnect' && kind !== 'hangup') {
      const prev = this.lastByKind.get(kind) || 0
      if (seq < prev) return false
      this.lastByKind.set(kind, seq)
    }
    return true
  }

  reset() {
    this.seen.clear()
    this.order = []
    this.lastByKind.clear()
  }
}

export type ControlChannel = {
  /** Send one control signal. Returns false if the channel is not open. */
  send: (kind: string, payload: Record<string, unknown>) => boolean
  isOpen: () => boolean
  /** Host clock minus guest clock (ms), best (lowest-RTT) sample; null until measured. Guest side only. */
  offsetMs: () => number | null
  rttMs: () => number | null
  close: () => void
}

type WireOptions = {
  /** Role of the REMOTE side: incoming signals are validated as that role. */
  remoteRole: 'admin' | 'guest'
  onSignal: (kind: string, payload: Record<string, unknown>) => void
  onOpenChange?: (open: boolean) => void
  /** Guest side pings the host to learn the clock offset. */
  measureClock?: boolean
}

/** Guest (offerer) creates the channel before createOffer so it is in the first SDP. */
export function createControlChannel(peer: RTCPeerConnection) {
  try {
    return peer.createDataChannel(CONTROL_CHANNEL_LABEL, { ordered: true })
  } catch {
    return null
  }
}

export function wireControlChannel(channel: RTCDataChannel, opts: WireOptions): ControlChannel {
  let open = channel.readyState === 'open'
  let pingTimer: number | null = null
  let pingId = 0
  const samples: { rtt: number; offset: number }[] = []

  const post = (msg: ControlMessage) => {
    if (channel.readyState !== 'open') return false
    try {
      channel.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  const ping = () => post({ t: 'ping', id: ++pingId, a: Date.now() })

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    opts.onOpenChange?.(next)
    if (opts.measureClock) {
      if (pingTimer != null) window.clearInterval(pingTimer)
      pingTimer = null
      if (next) {
        // A quick burst for a first estimate, then a slow refresh.
        let burst = 0
        const burstTimer = window.setInterval(() => {
          ping()
          if (++burst >= 5) window.clearInterval(burstTimer)
        }, 250)
        pingTimer = window.setInterval(ping, 20_000)
      }
    }
  }

  channel.onopen = () => setOpen(true)
  channel.onclose = () => setOpen(false)
  channel.onerror = () => setOpen(channel.readyState === 'open')
  channel.onmessage = (event) => {
    if (typeof event.data !== 'string' || event.data.length > 16 * 1024) return
    let msg: ControlMessage
    try {
      msg = JSON.parse(event.data) as ControlMessage
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'ping' && Number.isFinite(msg.a)) {
      post({ t: 'pong', id: Number(msg.id) || 0, a: Number(msg.a), b: Date.now() })
      return
    }
    if (msg.t === 'pong' && Number.isFinite(msg.a) && Number.isFinite(msg.b)) {
      const c = Date.now()
      const rtt = c - msg.a
      if (rtt < 0 || rtt > 10_000) return
      samples.push({ rtt, offset: msg.b - (msg.a + c) / 2 })
      if (samples.length > 12) samples.shift()
      return
    }
    if (msg.t === 'sig') {
      if (!GUEST_CONTROL_KINDS.has(String(msg.kind))) return
      const parsed = parseSignal(opts.remoteRole, msg.kind, msg.payload)
      if (parsed) opts.onSignal(parsed.kind, parsed.payload)
    }
  }
  if (open) setOpen(true)

  const best = () => (samples.length ? samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)) : null)

  return {
    send(kind, payload) {
      if (!GUEST_CONTROL_KINDS.has(kind)) return false
      return post({ t: 'sig', kind, payload })
    },
    isOpen: () => channel.readyState === 'open',
    offsetMs: () => best()?.offset ?? null,
    rttMs: () => best()?.rtt ?? null,
    close() {
      if (pingTimer != null) window.clearInterval(pingTimer)
      pingTimer = null
      channel.onopen = null
      channel.onclose = null
      channel.onmessage = null
      channel.onerror = null
      try {
        channel.close()
      } catch {
        /* already closed */
      }
    },
  }
}

/**
 * Next poll delay for a setTimeout chain (never overlapping).
 * - control on the data channel + ICE up: slow fallback poll
 * - signals just arrived: fast (negotiation in progress)
 * - quiet: back off gradually to POLL_IDLE_MAX_MS
 */
export function nextPollDelay(opts: { channelUp: boolean; gotSignals: boolean; idleTicks: number }) {
  if (opts.channelUp) return POLL_FALLBACK_MS
  if (opts.gotSignals) return POLL_FAST_MS
  return Math.min(POLL_IDLE_MAX_MS, Math.round(POLL_FAST_MS * Math.pow(1.35, opts.idleTicks)))
}

export function errorPollDelay(prev: number) {
  return Math.min(POLL_ERROR_MAX_MS, Math.max(1500, prev * 2))
}
