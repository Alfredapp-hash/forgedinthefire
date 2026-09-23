'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cameraLayer, camerasAtTime, type CameraClip } from '@/lib/podcast/camera'
import {
  paintProgramFrame,
  programLayers,
  sceneFromPictureMode,
  timedLayersFromVideos,
  type PictureMode,
  type PictureScene,
  type TimedPaint,
} from '@/lib/podcast/picture'

type LiveStreams = { host?: MediaStream | null; guest?: MediaStream | null }

type Props = {
  clips: CameraClip[]
  playhead?: number
  /** Unthrottled playhead sampler for the paint loop (live store). Wins over `playhead`. */
  getPlayhead?: () => number
  /** Per-frame scene sampler (e.g. Program lane at the live playhead). Wins over scene/fromScene/mix. */
  viewAt?: (t: number) => { scene: PictureScene; fromScene?: PictureScene; mix?: number }
  /** Timeline is playing — camera files play instead of seeking every frame. */
  playing?: boolean
  mode?: PictureMode
  scene?: PictureScene
  fromScene?: PictureScene
  mix?: number
  /** @deprecated single live camera — use `liveStreams`. */
  liveStream?: MediaStream | null
  /** @deprecated use `liveStreams`. */
  livePersonId?: string | null
  /** Live Host / Guest cameras (OBS sources). Shown while recording, or when paused with no picture at the playhead. */
  liveStreams?: LiveStreams
  recording?: boolean
}

const VIEW_W = 640
const VIEW_H = 360

const SCENES: { id: PictureScene; label: string; key: string }[] = [
  { id: 'host', label: 'Host', key: '⌥1' },
  { id: 'guest', label: 'Guest', key: '⌥2' },
  { id: 'pip', label: 'PIP', key: '⌥3' },
]

export function ProgramSwitcher({
  pvw,
  pgm,
  fading,
  fadeArmed,
  onPvw,
  onCut,
  onFade,
  recording,
  cutCount,
}: {
  pvw: PictureScene
  pgm: PictureScene
  fading?: boolean
  fadeArmed?: boolean
  onPvw: (scene: PictureScene) => void
  onCut: () => void
  onFade: () => void
  /** Cuts land on the record clock while rolling. */
  recording?: boolean
  /** Scene cuts on the timeline, for the hint line. */
  cutCount?: number
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-[#7C8B97]">Scene</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Program scene">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={pgm === s.id}
            className={`inline-flex items-center justify-center h-6 px-1.5 rounded border text-[10px] uppercase tracking-wider ${
              pgm === s.id
                ? 'border-[#FF5B73]/70 text-[#FFB3C0]'
                : pvw === s.id
                  ? 'border-[#7CFFB2]/50 text-[#B8FFD6]'
                  : 'border-[#27313B] text-[#B8C4CF]'
            }`}
            title={`${s.label} (${s.key}) — ${
              recording ? 'cuts Program now, on the record clock' : 'cuts Program at the playhead'
            }. Arm Fade first to dissolve.`}
            onClick={() => onPvw(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="inline-flex items-center justify-center h-6 px-1.5 rounded border border-[#27313B] text-[10px] uppercase tracking-wider text-[#B8C4CF] disabled:opacity-40"
          disabled={pvw === pgm && !fading}
          title="Cut Preview scene to Program"
          onClick={onCut}
        >
          Cut
        </button>
        <button
          type="button"
          className={`inline-flex items-center justify-center h-6 px-1.5 rounded border text-[10px] uppercase tracking-wider ${
            fading || fadeArmed ? 'border-[#53D6FF]/60 text-[#8DEBFF]' : 'border-[#27313B] text-[#B8C4CF]'
          }`}
          aria-pressed={Boolean(fadeArmed)}
          title="Fade to Program (~0.45s). If Program already matches Preview, the next scene click dissolves."
          onClick={onFade}
        >
          Fade
        </button>
      </div>
      <p className="max-w-[9rem] text-[9px] leading-tight text-[#7C8B97]">
        {recording
          ? 'Switching is recorded on the take.'
          : cutCount
            ? `${cutCount} scene cut${cutCount === 1 ? '' : 's'} on the timeline`
            : 'Cuts go on the Program lane.'}
      </p>
    </div>
  )
}

function useLiveVideo(stream: MediaStream | null | undefined) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (!stream) {
      ref.current = null
      return
    }
    const el = document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.autoplay = true
    el.srcObject = stream
    void el.play().catch(() => {})
    ref.current = el
    return () => {
      el.pause()
      el.srcObject = null
      if (ref.current === el) ref.current = null
    }
  }, [stream])
  return ref
}

const LIVE_CLIP: Omit<CameraClip, 'id' | 'personId'> = {
  url: '',
  mime: 'video/live',
  offset: 0,
  duration: Number.MAX_SAFE_INTEGER,
  trimStart: 0,
  sourceStart: 0,
  sourceDuration: Number.MAX_SAFE_INTEGER,
  bytes: 0,
  kind: 'camera',
  layer: 'base',
}

export function ProgramMonitor(props: Props) {
  const { clips, recording, liveStream, livePersonId, liveStreams } = props
  const [large, setLarge] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const propsRef = useRef(props)
  const [showingLive, setShowingLive] = useState(false)
  const showingLiveRef = useRef(false)

  useLayoutEffect(() => {
    propsRef.current = props
  })

  const hostStream = liveStreams?.host ?? (liveStream && livePersonId !== 'guest' ? liveStream : null)
  const guestStream = liveStreams?.guest ?? (liveStream && livePersonId === 'guest' ? liveStream : null)
  const hostLive = useLiveVideo(hostStream)
  const guestLive = useLiveVideo(guestStream)

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
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    let raf = 0
    const hostClip: CameraClip = { ...LIVE_CLIP, id: 'live-host', personId: 'host' }
    const guestClip: CameraClip = { ...LIVE_CLIP, id: 'live-guest', personId: 'guest' }
    const liveLayer = (clip: CameraClip, el: HTMLVideoElement | null): TimedPaint[] =>
      el && el.readyState >= 2 ? [{ clip, source: el, opacity: 1, x: 0, y: 0 }] : []

    const tick = () => {
      const p = propsRef.current
      const t = p.getPlayhead ? p.getPlayhead() : p.playhead ?? 0
      const view = p.viewAt ? p.viewAt(t) : null
      const layers = programLayers(p.clips)
      const hasBaseAtHead = camerasAtTime(
        p.clips.filter((c) => cameraLayer(c) === 'base'),
        t,
      ).length > 0
      const anyLive = Boolean(hostLive.current || guestLive.current)
      const live = anyLive && (Boolean(p.recording) || (!p.playing && !hasBaseAtHead))
      if (live !== showingLiveRef.current) {
        showingLiveRef.current = live
        setShowingLive(live)
      }
      const playing = Boolean(p.playing) && !p.recording
      // Live cameras replace that person's files; files are only steered when they are painted.
      const hostLiveLayer = live ? liveLayer(hostClip, hostLive.current) : []
      const guestLiveLayer = live ? liveLayer(guestClip, guestLive.current) : []
      const host = hostLiveLayer.length
        ? hostLiveLayer
        : timedLayersFromVideos(layers.host, videosRef.current, t, playing)
      const guest = guestLiveLayer.length
        ? guestLiveLayer
        : timedLayersFromVideos(layers.guest, videosRef.current, t, playing)
      const overlays = timedLayersFromVideos(layers.overlays, videosRef.current, t, playing)
      // Pause any file that is not on screen so it stops decoding.
      const onScreen = new Set([...host, ...guest, ...overlays].map((l) => l.source))
      videosRef.current.forEach((el) => {
        if (!onScreen.has(el) && !el.paused) el.pause()
      })
      paintProgramFrame(ctx, {
        mode: p.mode,
        scene: view?.scene || p.scene || sceneFromPictureMode(p.mode || 'a-roll'),
        fromScene: view ? view.fromScene : p.fromScene,
        mix: view ? view.mix : p.mix,
        host,
        guest,
        overlays,
        width: VIEW_W,
        height: VIEW_H,
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hostLive, guestLive])

  useEffect(() => {
    const map = videosRef.current
    return () => {
      map.forEach((el) => {
        el.pause()
        el.removeAttribute('src')
        el.load()
      })
      map.clear()
    }
  }, [])

  const hasPicture = clips.some((c) => !c.muted) || Boolean(hostStream || guestStream)
  const scene = props.scene || sceneFromPictureMode(props.mode || 'a-roll')
  const fading = props.fromScene && props.fromScene !== scene && (props.mix ?? 1) < 0.999

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-[#8DEBFF]">Program</p>
        <button
          type="button"
          className="text-[9px] uppercase tracking-wider text-[#7C8B97] hover:text-[#B8C4CF]"
          onClick={() => setLarge((v) => !v)}
          aria-label={large ? 'Shrink Program monitor' : 'Enlarge Program monitor'}
        >
          {large ? 'Small' : 'Large'}
        </button>
      </div>
      <div
        className={`relative overflow-hidden rounded-lg border bg-[#05070A] ${
          recording ? 'border-[#FF5B73]/70' : 'border-[#53D6FF]/40'
        } ${large ? 'h-[180px] w-[320px]' : 'h-[90px] w-[160px]'}`}
      >
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="h-full w-full" />
        {!hasPicture && (
          <p className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] leading-tight text-[#7C8B97]">
            No picture yet. Turn on Cam for Host or Guest, or add a lower third.
          </p>
        )}
        <span className="absolute left-1 top-1 rounded bg-[#05070A]/80 px-1 text-[9px] uppercase tracking-wider text-[#8DEBFF]">
          PGM {scene === 'guest' ? 'Guest' : scene === 'pip' ? 'PIP' : 'Host'}
          {fading ? ' · fade' : ''}
        </span>
        {showingLive && (
          <span className="absolute right-1 top-1 inline-flex items-center gap-1 rounded bg-[#05070A]/80 px-1 text-[9px] uppercase tracking-wider text-[#FF8FA3]">
            <span className={`h-1.5 w-1.5 rounded-full ${recording ? 'bg-[#FF5B73]' : 'bg-[#7C8B97]'}`} />
            {recording ? 'Live · rec' : 'Live'}
          </span>
        )}
      </div>
    </div>
  )
}
