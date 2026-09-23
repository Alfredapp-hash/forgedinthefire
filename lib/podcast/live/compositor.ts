/**
 * Live Program compositor: host cam + guest cam → 1280×720 canvas → captureStream(30).
 *
 * Intentionally separate from lib/podcast/picture.ts: paintProgramFrame works on
 * timed CameraClip layers from a recorded session; live sources are raw
 * MediaStreams, so this draws <video> elements directly while matching the same
 * Program geometry (PICTURE_WIDTH/HEIGHT, PIP at 28% with 24px pad).
 *
 * Frames are ticked from a Worker timer, not requestAnimationFrame, so the
 * stream keeps running (at a lower priority) if the host switches tabs.
 * The safe slate is always an instant cut — never a fade.
 */

import { PICTURE_HEIGHT, PICTURE_WIDTH } from '@/lib/podcast/picture'
import type { LiveScene } from '@/lib/podcast/live/types'

const FPS = 30
const FADE_MS = 350
const PIP_SCALE = 0.28
const PIP_PAD = 24

export type SlateCopy = {
  showTitle: string
  episodeTitle?: string
  /** Epoch ms for the "Starting soon" countdown. */
  countdownTo?: number | null
  lowerThird?: string | null
}

type Source = { el: HTMLVideoElement; stream: MediaStream | null; label: string }

function makeVideo(): HTMLVideoElement {
  const el = document.createElement('video')
  el.muted = true
  el.playsInline = true
  el.autoplay = true
  return el
}

function tickerWorker(fps: number): Worker | null {
  try {
    const src = `let id=null;onmessage=(e)=>{if(e.data==='stop'){clearInterval(id);id=null;return}if(id==null)id=setInterval(()=>postMessage(0),${Math.round(1000 / fps)})}`
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    const worker = new Worker(url)
    URL.revokeObjectURL(url)
    return worker
  } catch {
    return null
  }
}

export class LiveCompositor {
  readonly canvas: HTMLCanvasElement
  readonly width = PICTURE_WIDTH
  readonly height = PICTURE_HEIGHT
  private ctx: CanvasRenderingContext2D
  private host: Source = { el: makeVideo(), stream: null, label: 'Host' }
  private guest: Source = { el: makeVideo(), stream: null, label: 'Guest' }
  private scene: LiveScene = 'starting'
  private fromScene: LiveScene | null = null
  private fadeStart = 0
  private copy: SlateCopy = { showTitle: 'Forged in the Fire' }
  private worker: Worker | null = null
  private fallbackTimer: number | null = null
  private output: MediaStream | null = null

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available in this browser')
    this.ctx = ctx
    this.worker = tickerWorker(FPS)
    if (this.worker) {
      this.worker.onmessage = () => this.paint()
      this.worker.postMessage('start')
    } else {
      this.fallbackTimer = window.setInterval(() => this.paint(), Math.round(1000 / FPS))
    }
    this.paint()
  }

  /** Program video track. Call once; the same track survives scene changes. */
  captureStream(): MediaStream {
    if (!this.output) this.output = this.canvas.captureStream(FPS)
    return this.output
  }

  setHost(stream: MediaStream | null, label = 'Host') {
    this.attach(this.host, stream, label)
  }

  setGuest(stream: MediaStream | null, label = 'Guest') {
    this.attach(this.guest, stream, label)
  }

  setCopy(copy: Partial<SlateCopy>) {
    this.copy = { ...this.copy, ...copy }
  }

  getScene() {
    return this.scene
  }

  /** Cut (or short fade between camera layouts). Slates always cut. */
  setScene(next: LiveScene, fade = false) {
    if (next === this.scene) return
    const camera = (s: LiveScene) => s === 'host' || s === 'guest' || s === 'pip'
    this.fromScene = fade && camera(next) && camera(this.scene) ? this.scene : null
    this.fadeStart = performance.now()
    this.scene = next
    this.paint()
  }

  destroy() {
    this.worker?.postMessage('stop')
    this.worker?.terminate()
    this.worker = null
    if (this.fallbackTimer != null) window.clearInterval(this.fallbackTimer)
    this.fallbackTimer = null
    for (const src of [this.host, this.guest]) {
      src.el.pause()
      src.el.srcObject = null
    }
    this.output?.getTracks().forEach((t) => t.stop())
    this.output = null
  }

  private attach(src: Source, stream: MediaStream | null, label: string) {
    src.label = label
    if (src.stream === stream) return
    src.stream = stream
    const videoOnly = stream && stream.getVideoTracks().length ? new MediaStream(stream.getVideoTracks()) : null
    src.el.srcObject = videoOnly
    if (videoOnly) void src.el.play().catch(() => {})
  }

  private ready(src: Source) {
    const track = src.stream?.getVideoTracks()[0]
    return Boolean(
      track && track.readyState === 'live' && !track.muted && src.el.readyState >= 2 && src.el.videoWidth > 0,
    )
  }

  private paint() {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#05070A'
    ctx.fillRect(0, 0, this.width, this.height)
    const mix = this.fromScene ? Math.min(1, (performance.now() - this.fadeStart) / FADE_MS) : 1
    if (this.fromScene && mix < 1) {
      ctx.globalAlpha = 1 - mix
      this.paintScene(this.fromScene)
      ctx.globalAlpha = mix
      this.paintScene(this.scene)
      ctx.globalAlpha = 1
    } else {
      this.fromScene = null
      this.paintScene(this.scene)
    }
    ctx.restore()
  }

  private paintScene(scene: LiveScene) {
    switch (scene) {
      case 'host':
        this.paintFull(this.host)
        this.paintLowerThird()
        return
      case 'guest':
        this.paintFull(this.guest)
        this.paintLowerThird()
        return
      case 'pip': {
        this.paintFull(this.host)
        const w = Math.round(this.width * PIP_SCALE)
        const h = Math.round(this.height * PIP_SCALE)
        const x = this.width - w - PIP_PAD
        const y = this.height - h - PIP_PAD
        this.ctx.fillStyle = '#0A1016'
        this.ctx.fillRect(x - 3, y - 3, w + 6, h + 6)
        this.paintSource(this.guest, x, y, w, h)
        this.paintLowerThird()
        return
      }
      case 'starting':
        this.paintSlate('Starting soon', this.copy.episodeTitle || '', true)
        return
      case 'ended':
        this.paintSlate('Thanks for watching', 'Episodes: forgedinthefireohio.org/podcast', false)
        return
      case 'slate':
      default:
        this.paintSlate('We’ll be right back', 'Please stay with us.', false)
    }
  }

  private paintFull(src: Source) {
    this.paintSource(src, 0, 0, this.width, this.height)
  }

  /** Cover-fit a camera into a box, or a calm placeholder if the camera is off. */
  private paintSource(src: Source, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx
    if (!this.ready(src)) {
      ctx.fillStyle = '#0B1117'
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#7C8B97'
      ctx.font = `${Math.max(14, Math.round(h / 16))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${src.label} · camera off`, x + w / 2, y + h / 2)
      return
    }
    const vw = src.el.videoWidth
    const vh = src.el.videoHeight
    const scale = Math.max(w / vw, h / vh)
    const sw = w / scale
    const sh = h / scale
    ctx.drawImage(src.el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h)
  }

  private paintLowerThird() {
    const text = this.copy.lowerThird
    if (!text) return
    const ctx = this.ctx
    ctx.font = '600 26px system-ui, sans-serif'
    const pad = 18
    const w = Math.min(this.width - 96, ctx.measureText(text).width + pad * 2)
    const x = 48
    const y = this.height - 48 - 52
    ctx.fillStyle = 'rgba(5,7,10,0.78)'
    ctx.fillRect(x, y, w, 52)
    ctx.fillStyle = '#53D6FF'
    ctx.fillRect(x, y, 5, 52)
    ctx.fillStyle = '#F6FAFC'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + pad, y + 27, w - pad * 2)
  }

  private paintSlate(headline: string, sub: string, countdown: boolean) {
    const ctx = this.ctx
    const { width: W, height: H } = this
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#05070A')
    bg.addColorStop(1, '#0B1620')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    const ember = ctx.createRadialGradient(W / 2, H * 1.05, 20, W / 2, H * 1.05, H * 0.9)
    ember.addColorStop(0, 'rgba(255,122,61,0.35)')
    ember.addColorStop(0.5, 'rgba(255,122,61,0.08)')
    ember.addColorStop(1, 'rgba(255,122,61,0)')
    ctx.fillStyle = ember
    ctx.fillRect(0, 0, W, H)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8DEBFF'
    ctx.font = '600 22px system-ui, sans-serif'
    ctx.fillText((this.copy.showTitle || 'Forged in the Fire').toUpperCase(), W / 2, H * 0.3)
    ctx.fillStyle = '#F6FAFC'
    ctx.font = 'bold 72px Georgia, "Times New Roman", serif'
    ctx.fillText(headline, W / 2, H * 0.45, W - 160)
    if (sub) {
      ctx.fillStyle = '#B8C4CF'
      ctx.font = '28px system-ui, sans-serif'
      ctx.fillText(sub, W / 2, H * 0.56, W - 200)
    }
    if (countdown && this.copy.countdownTo) {
      const left = Math.max(0, Math.ceil((this.copy.countdownTo - Date.now()) / 1000))
      const mm = String(Math.floor(left / 60)).padStart(2, '0')
      const ss = String(left % 60).padStart(2, '0')
      ctx.fillStyle = '#53D6FF'
      ctx.font = 'bold 64px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(`${mm}:${ss}`, W / 2, H * 0.7)
    }
  }
}
