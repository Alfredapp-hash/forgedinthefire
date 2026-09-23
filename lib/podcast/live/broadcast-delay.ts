/**
 * Broadcast delay for the outgoing (on-air) video.
 *
 *   Program canvas ──tick──► capture ──► DelayRing ──(after delayMs)──► Air canvas ──► WHIP + recorder
 *
 * Two capture modes:
 *   - `encoded` (preferred, WebCodecs): each Program frame becomes a VideoFrame, is
 *     encoded (VP8/VP9/H.264, ~6 Mbps intermediate), and the compressed chunks sit in
 *     the ring. After the delay they are decoded and drawn. 30 s ≈ 25 MB of RAM.
 *   - `frames` (fallback): createImageBitmap snapshots at reduced fps/size, chosen by
 *     planRawFrames to stay under ~400 MB, scaled back up on output.
 *   - `off` (delay 0): Air simply mirrors Program.
 *
 * Audio is delayed by the same amount with a DelayNode in LiveAudioMix; both are
 * dumped at the same instant so A/V stays aligned.
 *
 * Fail-safe: any codec error switches to `frames` mode *and* dumps, so the air
 * shows the hold slate while the delay rebuilds — never undelayed Program.
 */

import { DelayRing, planRawFrames, type FramePlan } from '@/lib/podcast/live/delay-ring'

export type DelayMode = 'off' | 'encoded' | 'frames'
export type HoldReason = 'filling' | 'dump'

export type DelayStatus = {
  mode: DelayMode
  delayMs: number
  /** ms until the buffer is full again after start/dump. */
  rebuildingMs: number
  bufferedBytes: number
  dumps: number
  plan: FramePlan | null
  error: string | null
}

type Options = {
  source: HTMLCanvasElement
  delayMs: number
  width: number
  height: number
  /** Paint the hold slate into the air canvas while the delay is filling/rebuilding. */
  paintHold: (ctx: CanvasRenderingContext2D, reason: HoldReason) => void
  onStatus?: (status: DelayStatus) => void
}

const KEY_INTERVAL_MS = 2000
const DECODE_LEAD_MS = 15
const ENCODE_BITRATE = 6_000_000
const MAX_ENCODE_QUEUE = 3
const STATUS_EVERY_MS = 250

type CodecPick = { codec: string; avc?: boolean }

async function pickCodec(width: number, height: number): Promise<CodecPick | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null
  }
  const candidates: CodecPick[] = [{ codec: 'vp8' }, { codec: 'vp09.00.10.08' }, { codec: 'avc1.42E01F', avc: true }]
  for (const c of candidates) {
    try {
      const enc = await VideoEncoder.isConfigSupported(encoderConfig(c, width, height))
      const dec = await VideoDecoder.isConfigSupported({ codec: c.codec, codedWidth: width, codedHeight: height })
      if (enc.supported && dec.supported) return c
    } catch {
      /* try next */
    }
  }
  return null
}

function encoderConfig(c: CodecPick, width: number, height: number): VideoEncoderConfig {
  const cfg: VideoEncoderConfig = {
    codec: c.codec,
    width,
    height,
    bitrate: ENCODE_BITRATE,
    framerate: 30,
    latencyMode: 'realtime',
  }
  if (c.avc) (cfg as VideoEncoderConfig & { avc?: { format: 'annexb' } }).avc = { format: 'annexb' }
  return cfg
}

export class BroadcastVideoDelay {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private opts: Options
  private mode: DelayMode = 'off'
  private running = false
  private error: string | null = null
  private output: MediaStream | null = null
  private lastStatusAt = 0
  private holdReason: HoldReason = 'filling'

  // encoded
  private codec: CodecPick | null = null
  private encoder: VideoEncoder | null = null
  private decoder: VideoDecoder | null = null
  private chunkRing: DelayRing<EncodedVideoChunk> | null = null
  private lastKeyAt = 0
  private forceKey = true

  // frames
  private frameRing: DelayRing<ImageBitmap> | null = null
  private plan: FramePlan | null = null
  private lastCaptureAt = 0
  private shown: ImageBitmap | null = null

  constructor(opts: Options) {
    this.opts = opts
    this.canvas = document.createElement('canvas')
    this.canvas.width = opts.width
    this.canvas.height = opts.height
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available in this browser')
    this.ctx = ctx
    this.opts.paintHold(ctx, 'filling')
  }

  get delayMs() {
    return this.opts.delayMs
  }

  /** Air video track (what WHIP sends). The same track survives dumps and mode switches. */
  captureStream(): MediaStream {
    if (!this.output) this.output = this.canvas.captureStream(30)
    return this.output
  }

  async start() {
    const now = performance.now()
    this.running = true
    this.holdReason = 'filling'
    if (this.opts.delayMs <= 0) {
      this.mode = 'off'
      this.emit(true)
      return
    }
    this.codec = await pickCodec(this.opts.width, this.opts.height)
    if (this.codec && this.setupCodec()) {
      this.mode = 'encoded'
      this.chunkRing = new DelayRing<EncodedVideoChunk>({
        delayMs: this.opts.delayMs,
        sizeOf: (c) => c.byteLength,
        requireKeyAfterReset: true,
      })
      this.chunkRing.start(now)
    } else {
      this.startFrames(now)
    }
    this.emit(true)
  }

  /** Call once per Program paint (the compositor's worker tick). */
  tick() {
    if (!this.running) return
    const now = performance.now()
    try {
      if (this.mode === 'off') this.ctx.drawImage(this.opts.source, 0, 0, this.opts.width, this.opts.height)
      else if (this.mode === 'encoded') this.tickEncoded(now)
      else this.tickFrames(now)
    } catch (err) {
      this.fail(err)
    }
    this.emit(false)
  }

  /**
   * DUMP: throw away everything buffered and show the hold slate until the delay
   * has rebuilt behind it. Safe to call in any mode (in `off` it is a no-op here;
   * the control room also engages the safe slate on Program).
   */
  dump() {
    const now = performance.now()
    this.holdReason = 'dump'
    if (this.mode === 'encoded') {
      this.chunkRing?.dump(now)
      this.forceKey = true
      try {
        // reset() discards queued decodes and pending outputs; reconfigure for the next key frame.
        this.decoder?.reset()
        this.configureDecoder()
      } catch (err) {
        this.fail(err)
        return
      }
    } else if (this.mode === 'frames') {
      this.frameRing?.dump(now)
      this.shown?.close()
      this.shown = null
    }
    if (this.mode !== 'off') this.opts.paintHold(this.ctx, 'dump')
    this.emit(true)
  }

  status(): DelayStatus {
    const now = performance.now()
    const ring = this.mode === 'encoded' ? this.chunkRing : this.mode === 'frames' ? this.frameRing : null
    return {
      mode: this.mode,
      delayMs: this.opts.delayMs,
      rebuildingMs: ring ? ring.rebuildingMs(now) : 0,
      bufferedBytes: ring?.bufferedBytes ?? 0,
      dumps: ring?.dumpCount ?? 0,
      plan: this.mode === 'frames' ? this.plan : null,
      error: this.error,
    }
  }

  stop() {
    this.running = false
    this.teardownCodec()
    this.chunkRing?.clear()
    this.chunkRing = null
    this.frameRing?.clear()
    this.frameRing = null
    this.shown?.close()
    this.shown = null
    this.output?.getTracks().forEach((t) => t.stop())
    this.output = null
  }

  // ---------- encoded ----------

  private setupCodec(): boolean {
    const c = this.codec
    if (!c) return false
    try {
      this.encoder = new VideoEncoder({
        output: (chunk) => {
          // Capture time rides in the timestamp (µs). Pre-dump chunks are rejected by the ring.
          this.chunkRing?.push(chunk.timestamp / 1000, chunk, chunk.type === 'key')
        },
        error: (e) => this.fail(e),
      })
      this.encoder.configure(encoderConfig(c, this.opts.width, this.opts.height))
      this.decoder = new VideoDecoder({
        output: (frame) => this.drawDecoded(frame),
        error: (e) => this.fail(e),
      })
      this.configureDecoder()
      this.forceKey = true
      return true
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'WebCodecs unavailable'
      this.teardownCodec()
      return false
    }
  }

  private configureDecoder() {
    if (!this.decoder || !this.codec) return
    this.decoder.configure({
      codec: this.codec.codec,
      codedWidth: this.opts.width,
      codedHeight: this.opts.height,
      optimizeForLatency: true,
    })
  }

  private teardownCodec() {
    for (const c of [this.encoder, this.decoder]) {
      try {
        if (c && c.state !== 'closed') c.close()
      } catch {
        /* already closed */
      }
    }
    this.encoder = null
    this.decoder = null
  }

  private tickEncoded(now: number) {
    const ring = this.chunkRing
    const enc = this.encoder
    const dec = this.decoder
    if (!ring || !enc || !dec) return
    if (enc.state === 'configured' && enc.encodeQueueSize <= MAX_ENCODE_QUEUE) {
      const frame = new VideoFrame(this.opts.source, { timestamp: Math.round(now * 1000) })
      const keyFrame = this.forceKey || now - this.lastKeyAt >= KEY_INTERVAL_MS
      try {
        enc.encode(frame, { keyFrame })
      } finally {
        frame.close()
      }
      if (keyFrame) {
        this.forceKey = false
        this.lastKeyAt = now
      }
    }
    if (ring.rebuildingMs(now) > 0) {
      this.opts.paintHold(this.ctx, this.holdReason)
      return
    }
    if (dec.state !== 'configured') return
    for (const e of ring.takeDue(now + DECODE_LEAD_MS)) dec.decode(e.item)
  }

  private drawDecoded(frame: VideoFrame) {
    try {
      const ring = this.chunkRing
      const anchor = ring?.anchor
      // Belt and braces: never draw a frame captured before the last dump/start.
      if (!this.running || anchor == null || frame.timestamp / 1000 < anchor) return
      if (ring && ring.rebuildingMs(performance.now()) > 0) return
      this.ctx.drawImage(frame, 0, 0, this.opts.width, this.opts.height)
    } finally {
      frame.close()
    }
  }

  // ---------- frames ----------

  private startFrames(now: number) {
    this.mode = 'frames'
    this.plan = planRawFrames(this.opts.delayMs, this.opts.width, this.opts.height)
    this.frameRing = new DelayRing<ImageBitmap>({
      delayMs: this.opts.delayMs,
      dispose: (b) => b.close(),
      sizeOf: (b) => b.width * b.height * 4,
    })
    this.frameRing.start(now)
    this.lastCaptureAt = 0
  }

  private tickFrames(now: number) {
    const ring = this.frameRing
    const plan = this.plan
    if (!ring || !plan) return
    if (now - this.lastCaptureAt >= 1000 / plan.fps - 2) {
      this.lastCaptureAt = now
      const t = now
      const opts: ImageBitmapOptions =
        plan.scale < 1 ? { resizeWidth: plan.width, resizeHeight: plan.height, resizeQuality: 'low' } : {}
      void createImageBitmap(this.opts.source, opts)
        .then((bmp) => {
          if (!this.running || this.frameRing !== ring) bmp.close()
          else ring.push(t, bmp)
        })
        .catch(() => {})
    }
    if (ring.rebuildingMs(now) > 0) {
      this.opts.paintHold(this.ctx, this.holdReason)
      return
    }
    const next = ring.latestDue(now)
    if (next) {
      this.shown?.close()
      this.shown = next.item
    }
    if (this.shown) this.ctx.drawImage(this.shown, 0, 0, this.opts.width, this.opts.height)
  }

  // ---------- shared ----------

  private fail(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    this.error = `Delay encoder failed (${msg}); switched to frame buffer.`
    if (this.mode !== 'encoded') return
    this.teardownCodec()
    this.chunkRing?.clear()
    this.chunkRing = null
    this.startFrames(performance.now())
    this.holdReason = 'dump'
    this.opts.paintHold(this.ctx, 'dump')
    this.emit(true)
  }

  private emit(force: boolean) {
    const now = performance.now()
    if (!force && now - this.lastStatusAt < STATUS_EVERY_MS) return
    this.lastStatusAt = now
    this.opts.onStatus?.(this.status())
  }
}
