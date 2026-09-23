'use client'

/**
 * Small components that subscribe to the live store so only they re-render (≤15 Hz) while the
 * playhead moves, the record clock ticks or input meters bounce.
 */
import { memo, useCallback } from 'react'
import { formatClock } from '@/lib/podcast/audio'
import { programStateAt, type CameraClip, type ProgramCut } from '@/lib/podcast/camera'
import type { PictureScene } from '@/lib/podcast/picture'
import { ProgramMonitor, ProgramSwitcher } from '@/components/podcast/program-monitor'
import { useLiveStore, useLiveValue } from './live-store'

export function LiveClock({ source = 'playhead' }: { source?: 'playhead' | 'recClock' }) {
  const t = useLiveValue((s) => (source === 'recClock' ? s.recClock : s.playhead), 0)
  return <>{formatClock(t)}</>
}

/** Header status line: REC clock, busy text, or playhead / duration. */
export const LiveStatusLine = memo(function LiveStatusLine({
  recording,
  busy,
  ready,
  durationLabel,
  camBytesLabel,
}: {
  recording: boolean
  busy: string | null
  ready: boolean
  durationLabel: string
  camBytesLabel: string | null
}) {
  const rec = useLiveValue((s) => s.recClock, 0)
  const head = useLiveValue((s) => s.playhead, 0)
  if (recording) return <>{`● REC ${formatClock(rec)}${camBytesLabel ? ` · cam ${camBytesLabel}` : ''}`}</>
  return <>{busy || (ready ? `${formatClock(head)} / ${durationLabel}` : 'Idle')}</>
})

/** Input meters keyed by device key; labels come from the editor. */
export const LiveMeters = memo(function LiveMeters({
  labels,
  recording,
}: {
  labels: Record<string, string>
  recording: boolean
}) {
  const peaks = useLiveValue((s) => s.peaks, {} as Record<string, number>)
  const clips = useLiveValue((s) => s.clips, {} as Record<string, boolean>)
  const rec = useLiveValue((s) => s.recClock, 0)
  const keys = Object.keys(peaks)
  const status = (key: string) => (clips[key] ? 'CLIP' : recording ? `in ${formatClock(rec)}` : 'idle')
  if (keys.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-[#151B22] overflow-hidden" aria-hidden />
        <span className="text-xs font-mono text-[#A9B8C6]">{recording ? `in ${formatClock(rec)}` : 'idle'}</span>
      </div>
    )
  }
  return (
    <>
      {keys.map((key) => {
        const label = labels[key] || (key === 'remote:guest' ? 'Guest' : 'Mic')
        const peak = peaks[key] || 0
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-20 truncate text-[10px] uppercase tracking-wider text-[#A9B8C6]">{label}</span>
            <div
              className="h-2 flex-1 rounded-full bg-[#151B22] overflow-hidden"
              role="meter"
              aria-label={`${label} input level`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(100, peak * 100))}
            >
              <div
                className={`h-full ${clips[key] ? 'bg-[#FF5B73]' : 'bg-[#53D6FF]'}`}
                style={{ width: `${Math.min(100, peak * 140)}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${clips[key] ? 'text-[#FF7A9A]' : 'text-[#A9B8C6]'}`}>{status(key)}</span>
          </div>
        )
      })}
    </>
  )
})

/** Playhead marker on the overview bar (percent of session length). */
export function LiveOverviewHead({ sessionLen }: { sessionLen: number }) {
  const head = useLiveValue((s) => s.playhead, 0)
  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-[#8DEBFF]"
      style={{ left: sessionLen > 0 ? `${Math.min(100, (head / sessionLen) * 100)}%` : 0 }}
    />
  )
}

type PgmAnim = { from: PictureScene; to: PictureScene; mix: number } | null

/** Output (Program) monitor + scene switcher driven by the live playhead. */
export const LiveProgram = memo(function LiveProgram({
  clips,
  cuts,
  startScene,
  pgmAnim,
  playing,
  recording,
  liveStreams,
  pvwScene,
  fadeNext,
  onPvw,
  onCut,
  onFade,
}: {
  clips: CameraClip[]
  cuts: ProgramCut[]
  startScene: PictureScene
  pgmAnim: PgmAnim
  playing: boolean
  recording: boolean
  liveStreams: { host: MediaStream | null; guest: MediaStream | null }
  pvwScene: PictureScene
  fadeNext: boolean
  onPvw: (scene: PictureScene) => void
  onCut: () => void
  onFade: (currentPgm: PictureScene) => void
}) {
  const store = useLiveStore()
  const head = useLiveValue((s) => s.playhead, 0)
  const cutState = programStateAt(cuts, head, startScene)
  const view = pgmAnim
    ? { scene: pgmAnim.to, fromScene: pgmAnim.from, mix: pgmAnim.mix }
    : { scene: cutState.scene, fromScene: cutState.fromScene, mix: cutState.mix }
  const getPlayhead = useCallback(() => store?.get().playhead ?? 0, [store])
  const viewAt = useCallback(
    (t: number) => {
      if (pgmAnim) return { scene: pgmAnim.to, fromScene: pgmAnim.from, mix: pgmAnim.mix }
      const s = programStateAt(cuts, t, startScene)
      return { scene: s.scene, fromScene: s.fromScene, mix: s.mix }
    },
    [cuts, startScene, pgmAnim],
  )
  return (
    <>
      <ProgramMonitor
        clips={clips}
        getPlayhead={getPlayhead}
        viewAt={viewAt}
        playing={playing}
        scene={view.scene}
        fromScene={view.fromScene}
        mix={view.mix}
        recording={recording}
        liveStreams={liveStreams}
      />
      <div className="space-y-1 pt-4">
        <ProgramSwitcher
          pvw={pvwScene}
          pgm={view.scene}
          fading={view.mix < 0.999 && view.fromScene !== view.scene}
          fadeArmed={fadeNext}
          recording={recording}
          cutCount={cuts.length}
          onPvw={onPvw}
          onCut={onCut}
          onFade={() => onFade(view.scene)}
        />
      </div>
    </>
  )
})
