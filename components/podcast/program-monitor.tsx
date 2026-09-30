'use client'

import { useEffect, useRef } from 'react'
import {
  cameraKind,
  cameraLayer,
  camerasAtTime,
  cameraSourceTime,
  clipOpacity,
  clipTranslate,
  type CameraClip,
} from '@/lib/podcast/camera'
import {
  paintProgramFrame,
  sceneFromPictureMode,
  type PictureMode,
  type PictureScene,
  type TimedPaint,
} from '@/lib/podcast/picture'
import { Button, SegmentedControl } from '@/components/studio-ui'

type Props = {
  clips: CameraClip[]
  playhead: number
  mode?: PictureMode
  scene?: PictureScene
  fromScene?: PictureScene
  mix?: number
  /** While Record is rolling, this is the punched camera (OBS Program). */
  liveStream?: MediaStream | null
  livePersonId?: string | null
  recording?: boolean
}

const VIEW_W = 320
const VIEW_H = 180

function asTimed(clip: CameraClip, source: CanvasImageSource | null, sessionTime: number): TimedPaint {
  const { x, y } = clipTranslate(clip, sessionTime)
  return {
    clip,
    source: source as TimedPaint['source'],
    opacity: clipOpacity(clip, sessionTime),
    x,
    y,
  }
}

const SCENES: { id: PictureScene; label: string }[] = [
  { id: 'host', label: 'Host' },
  { id: 'guest', label: 'Guest' },
  { id: 'pip', label: 'PIP' },
]

export function ProgramSwitcher({
  pvw,
  pgm,
  fading,
  fadeArmed,
  onPvw,
  onCut,
  onFade,
}: {
  pvw: PictureScene
  pgm: PictureScene
  fading?: boolean
  fadeArmed?: boolean
  onPvw: (scene: PictureScene) => void
  onCut: () => void
  onFade: () => void
}) {
  const pgmLabel = SCENES.find((s) => s.id === pgm)?.label ?? pgm
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="studio-type-label text-silver-label">Preview scene</p>
        <span className="studio-type-label inline-flex items-center gap-1 text-ice">
          <span className="h-1.5 w-1.5 rounded-full bg-forged shadow-glow-subtle" />
          PGM {pgmLabel}
        </span>
      </div>
      <SegmentedControl
        aria-label="Preview scene"
        value={pvw}
        onValueChange={onPvw}
        options={SCENES.map((s) => ({ value: s.id, label: s.label }))}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="dense"
          variant="secondary"
          disabled={pvw === pgm && !fading}
          title="Cut Preview scene to Program"
          onClick={onCut}
        >
          Cut
        </Button>
        <Button
          size="dense"
          variant={fading || fadeArmed ? 'primary' : 'secondary'}
          title="Fade to Program (~0.45s). If Program already matches Preview, the next scene click dissolves."
          onClick={onFade}
        >
          Fade
        </Button>
      </div>
    </div>
  )
}

export function ProgramMonitor({
  clips,
  playhead,
  mode = 'a-roll',
  scene,
  fromScene,
  mix = 1,
  liveStream,
  livePersonId,
  recording,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const liveRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const urls = new Set(clips.map((c) => c.url).filter(Boolean))
    const map = videosRef.current
    for (const [url, el] of map) {
      if (!urls.has(url)) {
        el.pause()
        el.removeAttribute('src')
        el.load()
        map.delete(url)
      }
    }
    for (const url of urls) {
      if (map.has(url)) continue
      const el = document.createElement('video')
      el.muted = true
      el.playsInline = true
      el.preload = 'auto'
      el.src = url
      map.set(url, el)
    }
  }, [clips])

  useEffect(() => {
    if (!liveStream) {
      if (liveRef.current) {
        liveRef.current.srcObject = null
        liveRef.current = null
      }
      return
    }
    const el = liveRef.current || document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.srcObject = liveStream
    void el.play().catch(() => {})
    liveRef.current = el
    return () => {
      el.srcObject = null
      if (liveRef.current === el) liveRef.current = null
    }
  }, [liveStream])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    let raf = 0
    let alive = true

    const tick = () => {
      if (!alive) return
      const host: TimedPaint[] = []
      const guest: TimedPaint[] = []
      const overlays: TimedPaint[] = []
      for (const clip of camerasAtTime(clips, playhead)) {
        const opacity = clipOpacity(clip, playhead)
        if (opacity <= 0) continue
        const video = clip.url ? videosRef.current.get(clip.url) || null : null
        if (video && cameraKind(clip) !== 'title') {
          const want = cameraSourceTime(clip, playhead)
          if (Math.abs(video.currentTime - want) > 0.08) {
            try {
              video.currentTime = Math.max(0, want)
            } catch {
              /* seek can fail mid-load */
            }
          }
        }
        const layer = asTimed(clip, cameraKind(clip) === 'title' ? null : video, playhead)
        if (cameraLayer(clip) === 'overlay' || cameraKind(clip) !== 'camera') overlays.push(layer)
        else if (clip.personId === 'guest') guest.push(layer)
        else host.push(layer)
      }
      if (recording && liveRef.current && liveRef.current.readyState >= 1) {
        const liveClip: CameraClip = {
          id: 'live-program',
          personId: livePersonId || 'host',
          url: '',
          mime: 'video/live',
          offset: playhead,
          duration: 1,
          trimStart: 0,
          sourceStart: 0,
          sourceDuration: 1,
          bytes: 0,
          kind: 'camera',
          layer: 'base',
        }
        const liveLayer = {
          clip: liveClip,
          source: liveRef.current as unknown as TimedPaint['source'],
          opacity: 1,
          x: 0,
          y: 0,
        }
        if (livePersonId === 'guest') guest.splice(0, guest.length, liveLayer)
        else host.splice(0, host.length, liveLayer)
      }
      paintProgramFrame(ctx, {
        mode,
        scene: scene || sceneFromPictureMode(mode),
        fromScene,
        mix,
        host,
        guest,
        overlays,
        width: VIEW_W,
        height: VIEW_H,
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [clips, fromScene, livePersonId, mix, mode, playhead, recording, scene])

  useEffect(() => {
    return () => {
      videosRef.current.forEach((el) => {
        el.pause()
        el.removeAttribute('src')
        el.load()
      })
      videosRef.current.clear()
    }
  }, [])

  const hasPicture = clips.some((c) => !c.muted) || Boolean(recording && liveStream)

  return (
    <div className="space-y-1">
      <p className="studio-type-label text-ice">Program</p>
      <div className="relative overflow-hidden rounded-tile border border-forged/40 bg-obsidian h-[90px] w-[160px] shadow-depth-md">
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="h-full w-full" />
        {!hasPicture && (
          <p className="studio-type-label absolute inset-0 flex items-center justify-center px-2 text-center text-silver-label">
            No punched picture
          </p>
        )}
        <span className="studio-type-label absolute left-1 top-1 rounded-clip bg-obsidian/80 px-1 text-ice">
          PGM {scene === 'guest' ? 'Guest' : scene === 'pip' || mode === 'pip' ? 'PIP' : 'Host'}
        </span>
      </div>
    </div>
  )
}
