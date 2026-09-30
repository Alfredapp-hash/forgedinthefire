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
 *
 * Face blur (lib/podcast/vision/face-blur.ts) is applied per person *here*, before
 * the broadcast delay captures the canvas, so Live, On-air and the local recording
 * are all blurred. While the detector loads, stalls or fails, that person's box is
 * a silhouette card (fail-safe).
 */

import { PICTURE_HEIGHT, PICTURE_WIDTH } from '@/lib/podcast/picture'
import { isCameraScene, type LiveScene } from '@/lib/podcast/live/types'
import { gridCells } from '@/lib/podcast/rooms/layout'
import {
  createFaceBlurrer,
  paintPrivacyCard,
  type FaceBlurrer,
  type FaceBlurState,
} from '@/lib/podcast/vision/face-blur'

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

export type LivePerson = 'host' | 'guest'
export type VisionState = 'off' | FaceBlurState

/** One room guest for the `grid` scene (see GuestRoomPanel's RemoteGuestLane). */
export type LiveGuestTile = {
  /** Stable key (the invite id) so a guest who drops and rejoins keeps their tile and blurrer. */
  id: string
  stream: MediaStream | null
  label: string
}

type Source = {
  who: LivePerson
  el: HTMLVideoElement
  stream: MediaStream | null
  label: string
  blur: boolean
  blurrer: FaceBlurrer | null
  /** Bumped on every toggle so a slow load for an old toggle is discarded. */
  blurGen: number
  vision: VisionState
}

function makeSource(who: LivePerson, label: string): Source {
  return { who, el: makeVideo(), stream: null, label, blur: false, blurrer: null, blurGen: 0, vision: 'off' }
}

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

/** Slates carry no overlays (a pinned question must not sit on "We'll be right back"). */
export function isSlateScene(scene: LiveScene) {
  return scene === 'starting' || scene === 'slate' || scene === 'ended'
}

export class LiveCompositor {
  readonly canvas: HTMLCanvasElement
  readonly width = PICTURE_WIDTH
  readonly height = PICTURE_HEIGHT
  private ctx: CanvasRenderingContext2D
  private host: Source = makeSource('host', 'Host')
  private guest: Source = makeSource('guest', 'Guest')
  /** Room guests for the `grid` scene, in lane order. Empty on the one-guest P2P path. */
  private guests: Source[] = []
  private guestIds: string[] = []
  /** Called after every Program paint (drives the broadcast delay from the same tick). */
  onFrame: (() => void) | null = null
  /** Face-blur state changes per person (loading / ok / stalled / failed / off). */
  onVision: ((who: LivePerson, state: VisionState, detail?: string) => void) | null = null
  /**
   * Optional overlay painted after every camera scene (never on slates), e.g. a pinned
   * chat question as a lower third (lib/podcast/live/chat-overlay.ts). Additive hook so
   * any later scene gets it for free.
   */
  overlay: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null = null
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

  /**
   * Room guests for the `grid` scene, in lane order. Tiles are keyed by `id` so a guest
   * keeps their (blurred) tile across reconnects; a new tile inherits the guest blur setting.
   */
  setGuests(tiles: LiveGuestTile[]) {
    const next: Source[] = []
    const nextIds: string[] = []
    for (const tile of tiles) {
      const idx = this.guestIds.indexOf(tile.id)
      let src = idx >= 0 ? this.guests[idx] : null
      if (!src) {
        src = makeSource('guest', tile.label)
        if (this.guest.blur) this.applyBlur(src, true)
      }
      this.attach(src, tile.stream, tile.label)
      next.push(src)
      nextIds.push(tile.id)
    }
    for (let i = 0; i < this.guests.length; i++) {
      if (!nextIds.includes(this.guestIds[i])) this.releaseSource(this.guests[i])
    }
    this.guests = next
    this.guestIds = nextIds
  }

  setCopy(copy: Partial<SlateCopy>) {
    this.copy = { ...this.copy, ...copy }
  }

  getScene() {
    return this.scene
  }

  /**
   * Turn face blur on/off for one person. While the detector loads the person is a
   * silhouette card; if it fails to load they stay a card (never an unblurred face).
   */
  setFaceBlur(who: LivePerson, on: boolean) {
    const src = who === 'host' ? this.host : this.guest
    if (src.blur !== on) this.applyBlur(src, on)
    // `guest` covers every guest tile on the grid, never just the first lane.
    if (who === 'guest') for (const g of this.guests) if (g.blur !== on) this.applyBlur(g, on)
  }

  /** Blur one source. */
  private applyBlur(src: Source, on: boolean) {
    src.blur = on
    src.blurGen += 1
    src.blurrer?.close()
    src.blurrer = null
    if (!on) {
      this.setVision(src, 'off')
      return
    }
    const gen = src.blurGen
    this.setVision(src, 'loading')
    createFaceBlurrer({
      label: `${src.label} · camera hidden for privacy`,
      onState: (state, detail) => {
        if (src.blurGen === gen) this.setVision(src, state, detail)
      },
    })
      .then((blurrer) => {
        if (src.blurGen !== gen || !src.blur) {
          blurrer.close()
          return
        }
        src.blurrer = blurrer
      })
      .catch((err) => {
        if (src.blurGen === gen) {
          this.setVision(src, 'failed', err instanceof Error ? err.message : 'Face detector did not load')
        }
      })
  }

  getFaceBlur(who: LivePerson) {
    const src = who === 'host' ? this.host : this.guest
    return { on: src.blur, state: who === 'guest' ? this.worstGuestVision() : src.vision }
  }

  /** Paint a hold slate into another context (the air canvas while the delay (re)builds). */
  paintHold(ctx: CanvasRenderingContext2D, reason: 'filling' | 'dump') {
    if (reason === 'filling') this.paintSlate('Starting soon', this.copy.episodeTitle || '', false, ctx)
    else this.paintSlate('We’ll be right back', 'Please stay with us.', false, ctx)
  }

  /** Cut (or short fade between camera layouts). Slates always cut. */
  setScene(next: LiveScene, fade = false) {
    if (next === this.scene) return
    this.fromScene = fade && isCameraScene(next) && isCameraScene(this.scene) ? this.scene : null
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
    for (const src of [this.host, this.guest, ...this.guests]) this.releaseSource(src)
    this.guests = []
    this.guestIds = []
    this.output?.getTracks().forEach((t) => t.stop())
    this.output = null
  }

  private releaseSource(src: Source) {
    src.blurGen += 1
    src.blurrer?.close()
    src.blurrer = null
    src.el.pause()
    src.el.srcObject = null
  }

  private setVision(src: Source, state: VisionState, detail?: string) {
    if (src.vision === state && state !== 'failed') return
    src.vision = state
    // Every guest tile reports through the `guest` person: the worst state wins so a
    // silhouette on any guest shows in the control room.
    this.onVision?.(src.who, src.who === 'guest' ? this.worstGuestVision() : state, detail)
  }

  private worstGuestVision(): VisionState {
    const rank: VisionState[] = ['off', 'ok', 'loading', 'stalled', 'failed']
    let worst: VisionState = this.guest.vision
    for (const g of this.guests) if (rank.indexOf(g.vision) > rank.indexOf(worst)) worst = g.vision
    return worst
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
    if (this.overlay && !isSlateScene(this.scene)) {
      ctx.save()
      try {
        this.overlay(ctx, this.width, this.height)
      } catch {
        /* an overlay bug must never stop Program */
      }
      ctx.restore()
    }
    ctx.restore()
    try {
      this.onFrame?.()
    } catch {
      /* the delay reports its own errors */
    }
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
      case 'grid':
        this.paintGrid()
        this.paintLowerThird()
        return
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

  /**
   * Host + every guest in equal tiles: 1 → full, 2 → side by side, 3 → two up + one
   * centred, 4 → 2×2. Without room guests the single P2P guest fills the second tile.
   */
  private paintGrid() {
    const people: Source[] = [this.host, ...(this.guests.length ? this.guests : this.guest.stream ? [this.guest] : [])]
    const cells = gridCells(people.length, this.width, this.height)
    const ctx = this.ctx
    ctx.fillStyle = '#0A1016'
    ctx.fillRect(0, 0, this.width, this.height)
    cells.forEach((cell, i) => this.paintSource(people[i], cell.x, cell.y, cell.w, cell.h))
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
    if (src.blur) {
      if (src.blurrer) src.blurrer.process(src.el, ctx, x, y, w, h)
      else
        paintPrivacyCard(
          ctx,
          x,
          y,
          w,
          h,
          src.vision === 'failed' ? `${src.label} · face blur failed, camera hidden` : `${src.label} · starting face blur…`,
        )
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

  private paintSlate(headline: string, sub: string, countdown: boolean, ctx: CanvasRenderingContext2D = this.ctx) {
    ctx.save()
    ctx.globalAlpha = 1
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
    ctx.restore()
  }
}
