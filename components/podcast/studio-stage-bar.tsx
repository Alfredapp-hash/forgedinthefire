'use client'

import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'

import { Chip } from '@/components/studio-ui'
import { statusChipLabel, type BoothStatus } from '@/lib/podcast/booth-layout'
import { STUDIO_STAGES, STUDIO_STAGE_LABEL, type StudioStage } from '@/lib/podcast/stage'

type StageBarEpisode = {
  title: string
}

/** Live transport status threaded from the editor for the header chip. */
export type StageBarStatus = {
  phase: BoothStatus
  elapsedSec: number
}

type Props = {
  episode: StageBarEpisode
  stage: StudioStage
  onStageChange: (stage: StudioStage) => void
  status?: StageBarStatus
}

/** The one-line explanation of how the room works — Brian's sentence, verbatim. */
export const PRODUCTION_ROOM_SUBTITLE =
  'One lane per person. After the mix puts the guest after the host. Takes autosave on this computer.'

const CHIP_TONE: Record<BoothStatus, 'neutral' | 'accent' | 'record'> = {
  idle: 'neutral',
  'count-in': 'accent',
  rec: 'record',
  saving: 'accent',
}

/**
 * Production-room header: eyebrow, episode title, the one-line subtitle, the
 * live status chip and the stage tabs (Plan · Sound Booth · Edit · Publish).
 * Nothing else lives here. It publishes its own height as `--studio-header-h`
 * so the Sound Booth stage can fill the rest of the viewport.
 */
export function StudioStageBar({ episode, stage, onStageChange, status }: Props) {
  const activeIndex = STUDIO_STAGES.indexOf(stage)
  const phase = status?.phase ?? 'idle'
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      document.documentElement.style.setProperty('--studio-header-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--studio-header-h')
    }
  }, [])

  return (
    <header
      ref={ref}
      className="sticky top-0 z-20 -mx-1 rounded-panel border border-divider bg-obsidian/95 px-4 py-3 shadow-depth-md backdrop-blur supports-[backdrop-filter]:bg-obsidian/80 sm:px-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="studio-type-label text-ice">Podcast production room</p>
          <h1 className="studio-type-section mt-1 truncate !text-[18px]">{episode.title || 'Untitled episode'}</h1>
          <p className="studio-type-body mt-0.5 text-silver-body">{PRODUCTION_ROOM_SUBTITLE}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Chip
            tone={CHIP_TONE[phase]}
            dot={phase !== 'idle'}
            className="w-fit tabular-nums"
            role="status"
            aria-live={phase === 'rec' ? 'off' : 'polite'}
            data-testid="studio-status-chip"
          >
            {statusChipLabel(phase, status?.elapsedSec ?? 0)}
          </Chip>

          {/* Stage tabs: the current stage sits elevated with an accent fill, past
              stages carry a check, future stages are ghosted but still tappable.
              On phones it scrolls horizontally with the active stage in view. */}
          <nav
            aria-label="Studio stages"
            className="-mx-1 flex w-full shrink-0 gap-1.5 overflow-x-auto rounded-control border border-divider bg-obsidian p-1.5 shadow-inset-well [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible lg:w-auto"
          >
            {STUDIO_STAGES.map((s, i) => {
              const active = s === stage
              const done = i < activeIndex
              const future = i > activeIndex
              return (
                <button
                  key={s}
                  type="button"
                  ref={active ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                  aria-current={active ? 'step' : undefined}
                  // Stable accessible name: the visible label swaps its number for a
                  // check mark as steps complete, but the name never changes.
                  aria-label={`${STUDIO_STAGE_LABEL[s]} — step ${i + 1}`}
                  title={done ? `${STUDIO_STAGE_LABEL[s]} — done` : undefined}
                  onClick={() => onStageChange(s)}
                  className={`studio-type-button flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 py-2 transition-[background-color,color,box-shadow,transform] duration-150 ease-calm sm:flex-1 lg:flex-none lg:px-4 ${
                    active
                      ? '-translate-y-px bg-forged text-forged-on shadow-depth-md shadow-glow-subtle'
                      : done
                        ? 'bg-surface-raised text-white hover:shadow-glow-subtle'
                        : 'text-silver-label hover:bg-surface-raised hover:text-white'
                  } ${future ? 'opacity-70 hover:opacity-100' : ''}`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                      active ? 'bg-forged-on/20 text-forged-on' : done ? 'bg-forged/15 text-forged' : 'bg-surface-raised text-ice'
                    }`}
                  >
                    {done ? <Check size={11} strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  {STUDIO_STAGE_LABEL[s]}
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
