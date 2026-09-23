/**
 * Minimal WHIP publisher (RFC 9725) for the live control room.
 *
 * Written for this project (not a port). Protocol shape follows RFC 9725 and the
 * same approach as @eyevinn/whip-web-client (Apache-2.0): one sendonly
 * RTCPeerConnection, SDP offer POSTed as application/sdp, answer in the 201 body,
 * resource URL in Location, DELETE to tear down, PATCH for late trickle ICE.
 *
 * All HTTP goes through /api/admin/podcast/live/whip so the provider URL and
 * bearer token stay on the server. The proxy hands back a sealed resource token
 * instead of the raw Location.
 *
 * Non-trickle by default: we wait (bounded) for ICE gathering before POSTing,
 * because several providers (incl. Cloudflare Stream) do not accept PATCH.
 * Late candidates are PATCHed best-effort; 405/501 is ignored.
 */

import { EMPTY_HEALTH, type LiveHealth } from '@/lib/podcast/live/types'

export type WhipPublisherOptions = {
  /** Proxy route. Defaults to the admin WHIP proxy. */
  endpoint?: string
  iceServers: RTCIceServer[]
  /** Video encoder cap, bits/s. 2.5 Mbps is plenty for 720p30 talking heads. */
  videoMaxBitrate?: number
  audioMaxBitrate?: number
  /** Prefer H.264 so HLS packagers can remux without transcoding. */
  preferH264?: boolean
  onHealth?: (health: LiveHealth) => void
  /** Called once per successful (re)connect. */
  onConnected?: () => void
}

const GATHER_TIMEOUT_MS = 2500
const DISCONNECT_GRACE_MS = 5000
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]
const STATS_INTERVAL_MS = 2000

type StatsSnapshot = { at: number; bytes: number }

export class WhipPublisher {
  private opts: Required<Omit<WhipPublisherOptions, 'onHealth' | 'onConnected'>> &
    Pick<WhipPublisherOptions, 'onHealth' | 'onConnected'>
  private stream: MediaStream | null = null
  private pc: RTCPeerConnection | null = null
  private resource: string | null = null
  private etag: string | null = null
  private stopped = true
  private attempt = 0
  private reconnectTimer: number | null = null
  private disconnectTimer: number | null = null
  private statsTimer: number | null = null
  private lastStats: StatsSnapshot | null = null
  private pendingCandidates: RTCIceCandidate[] = []
  private patchTimer: number | null = null
  private health: LiveHealth = { ...EMPTY_HEALTH }

  constructor(options: WhipPublisherOptions) {
    this.opts = {
      endpoint: options.endpoint || '/api/admin/podcast/live/whip',
      iceServers: options.iceServers,
      videoMaxBitrate: options.videoMaxBitrate ?? 2_500_000,
      audioMaxBitrate: options.audioMaxBitrate ?? 128_000,
      preferH264: options.preferH264 ?? true,
      onHealth: options.onHealth,
      onConnected: options.onConnected,
    }
  }

  get connected() {
    return this.pc?.connectionState === 'connected'
  }

  /** Start publishing. Resolves after the first successful SDP exchange; reconnects run in the background. */
  async start(stream: MediaStream) {
    this.stream = stream
    this.stopped = false
    this.attempt = 0
    this.emit({ state: 'connecting', lastError: null, reconnects: 0 })
    try {
      await this.connect()
    } catch (err) {
      this.stopped = true
      this.closePeer()
      this.emit({ state: 'idle', lastError: err instanceof Error ? err.message : 'Publish failed' })
      throw err
    }
    this.startStats()
  }

  /** Swap a track without renegotiating (e.g. after re-opening the mixer). */
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    const tx = this.pc?.getTransceivers().find((t) => t.receiver.track?.kind === kind)
    if (tx) await tx.sender.replaceTrack(track)
  }

  async stop() {
    this.stopped = true
    this.clearTimers()
    const resource = this.resource
    this.resource = null
    this.closePeer()
    if (resource) await this.deleteResource(resource)
    this.emit({ ...EMPTY_HEALTH, state: 'idle', reconnects: this.health.reconnects })
  }

  private emit(patch: Partial<LiveHealth>) {
    this.health = { ...this.health, ...patch }
    this.opts.onHealth?.(this.health)
  }

  private clearTimers() {
    for (const id of [this.reconnectTimer, this.disconnectTimer, this.statsTimer, this.patchTimer]) {
      if (id != null) window.clearTimeout(id)
    }
    if (this.statsTimer != null) window.clearInterval(this.statsTimer)
    this.reconnectTimer = null
    this.disconnectTimer = null
    this.statsTimer = null
    this.patchTimer = null
  }

  private closePeer() {
    const pc = this.pc
    this.pc = null
    if (!pc) return
    pc.onconnectionstatechange = null
    pc.onicecandidate = null
    try {
      pc.close()
    } catch {
      /* already closed */
    }
  }

  private async deleteResource(resource: string) {
    try {
      await fetch(`${this.opts.endpoint}?r=${encodeURIComponent(resource)}`, { method: 'DELETE' })
    } catch {
      /* provider will time the session out */
    }
  }

  private async connect() {
    const stream = this.stream
    if (!stream || this.stopped) return
    const pc = new RTCPeerConnection({
      iceServers: this.opts.iceServers,
      bundlePolicy: 'max-bundle',
    })
    this.pc = pc
    this.pendingCandidates = []

    const video = stream.getVideoTracks()[0]
    const audio = stream.getAudioTracks()[0]
    if (video) {
      const tx = pc.addTransceiver(video, {
        direction: 'sendonly',
        streams: [stream],
        sendEncodings: [{ maxBitrate: this.opts.videoMaxBitrate, maxFramerate: 30 }],
      })
      if (this.opts.preferH264) preferCodec(tx, 'video/H264')
    }
    if (audio) {
      pc.addTransceiver(audio, {
        direction: 'sendonly',
        streams: [stream],
        sendEncodings: [{ maxBitrate: this.opts.audioMaxBitrate }],
      })
    }

    pc.onconnectionstatechange = () => this.onPeerState(pc)
    let posted = false
    pc.onicecandidate = (event) => {
      if (!posted || !event.candidate) return
      this.pendingCandidates.push(event.candidate)
      if (this.patchTimer == null) {
        this.patchTimer = window.setTimeout(() => {
          this.patchTimer = null
          void this.flushCandidates(pc)
        }, 250)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForGathering(pc, GATHER_TIMEOUT_MS)
    if (this.stopped || this.pc !== pc) return

    const res = await fetch(this.opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp || offer.sdp || '',
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error || `WHIP publish failed (${res.status})`)
    }
    posted = true
    this.resource = res.headers.get('x-live-resource')
    this.etag = res.headers.get('x-live-etag')
    const answer = await res.text()
    if (this.stopped || this.pc !== pc) {
      if (this.resource) void this.deleteResource(this.resource)
      return
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answer })
  }

  private async flushCandidates(pc: RTCPeerConnection) {
    if (!this.resource || this.pc !== pc || !this.pendingCandidates.length) return
    const frag = sdpFragment(pc, this.pendingCandidates.splice(0))
    if (!frag) return
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/trickle-ice-sdpfrag' }
      if (this.etag) headers['If-Match'] = this.etag
      await fetch(`${this.opts.endpoint}?r=${encodeURIComponent(this.resource)}`, {
        method: 'PATCH',
        headers,
        body: frag,
      })
    } catch {
      /* trickle is best-effort; most candidates went in the offer */
    }
  }

  private onPeerState(pc: RTCPeerConnection) {
    if (this.pc !== pc || this.stopped) return
    const state = pc.connectionState
    this.emit({ state })
    if (state === 'connected') {
      this.attempt = 0
      if (this.disconnectTimer != null) window.clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
      this.opts.onConnected?.()
      return
    }
    if (state === 'failed' || state === 'closed') {
      this.scheduleReconnect(`Ingest ${state}`)
      return
    }
    if (state === 'disconnected' && this.disconnectTimer == null) {
      // ICE often recovers by itself inside a few seconds (Wi-Fi blip).
      this.disconnectTimer = window.setTimeout(() => {
        this.disconnectTimer = null
        if (this.pc === pc && pc.connectionState !== 'connected') this.scheduleReconnect('Ingest disconnected')
      }, DISCONNECT_GRACE_MS)
    }
  }

  private scheduleReconnect(reason: string) {
    if (this.stopped || this.reconnectTimer != null) return
    const old = this.resource
    this.resource = null
    this.closePeer()
    if (old) void this.deleteResource(old)
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]
    this.attempt += 1
    this.emit({ state: 'reconnecting', lastError: reason, reconnects: this.health.reconnects + 1 })
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => {
        this.scheduleReconnect(err instanceof Error ? err.message : 'Reconnect failed')
      })
    }, delay)
  }

  private startStats() {
    if (this.statsTimer != null) window.clearInterval(this.statsTimer)
    this.lastStats = null
    this.statsTimer = window.setInterval(() => void this.sampleStats(), STATS_INTERVAL_MS)
  }

  private async sampleStats() {
    const pc = this.pc
    if (!pc || pc.connectionState !== 'connected') return
    let report: RTCStatsReport
    try {
      report = await pc.getStats()
    } catch {
      return
    }
    let bytes = 0
    let fps: number | null = null
    let frameWidth: number | null = null
    let loss = 0
    let rtt: number | null = null
    report.forEach((stat) => {
      const s = stat as Record<string, unknown> & { type: string }
      if (s.type === 'outbound-rtp') {
        bytes += Number(s.bytesSent) || 0
        if (s.kind === 'video') {
          if (typeof s.framesPerSecond === 'number') fps = s.framesPerSecond
          if (typeof s.frameWidth === 'number') frameWidth = s.frameWidth
        }
      } else if (s.type === 'remote-inbound-rtp') {
        if (typeof s.fractionLost === 'number') loss = Math.max(loss, s.fractionLost)
        if (typeof s.roundTripTime === 'number' && rtt == null) rtt = s.roundTripTime * 1000
      } else if (s.type === 'candidate-pair' && (s.nominated || s.selected) && s.state === 'succeeded') {
        if (typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime * 1000
      }
    })
    const now = performance.now()
    const prev = this.lastStats
    this.lastStats = { at: now, bytes }
    const bitrateKbps =
      prev && now > prev.at && bytes >= prev.bytes ? Math.round(((bytes - prev.bytes) * 8) / (now - prev.at)) : 0
    this.emit({
      bitrateKbps,
      packetLossPct: Math.round(loss * 1000) / 10,
      rttMs: rtt == null ? null : Math.round(rtt),
      fps: fps == null ? null : Math.round(fps),
      frameWidth,
    })
  }
}

function preferCodec(tx: RTCRtpTransceiver, mimeType: string) {
  try {
    const caps = RTCRtpSender.getCapabilities?.('video')
    if (!caps || typeof tx.setCodecPreferences !== 'function') return
    const preferred = caps.codecs.filter((c) => c.mimeType.toLowerCase() === mimeType.toLowerCase())
    if (!preferred.length) return
    const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== mimeType.toLowerCase())
    tx.setCodecPreferences([...preferred, ...rest])
  } catch {
    /* browser picks its default */
  }
}

export function waitForGathering(pc: RTCPeerConnection, timeoutMs: number) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      window.clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    const timer = window.setTimeout(done, timeoutMs)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

/** RFC 8840 trickle fragment: ufrag/pwd + per-mid candidates. */
function sdpFragment(pc: RTCPeerConnection, candidates: RTCIceCandidate[]) {
  const sdp = pc.localDescription?.sdp || ''
  const ufrag = /a=ice-ufrag:(\S+)/.exec(sdp)?.[1]
  const pwd = /a=ice-pwd:(\S+)/.exec(sdp)?.[1]
  if (!ufrag || !pwd) return null
  const byMid = new Map<string, string[]>()
  for (const c of candidates) {
    const mid = c.sdpMid ?? '0'
    const list = byMid.get(mid) || []
    list.push(`a=${c.candidate}`)
    byMid.set(mid, list)
  }
  const lines = [`a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`]
  for (const [mid, list] of byMid) {
    lines.push('m=audio 9 RTP/AVP 0', `a=mid:${mid}`, ...list)
  }
  return `${lines.join('\r\n')}\r\n`
}
