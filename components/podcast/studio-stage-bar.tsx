'use client'

import { Check } from 'lucide-react'

import { Chip } from '@/components/studio-ui'
import { STUDIO_STAGES, STUDIO_STAGE_LABEL, type StudioStage } from '@/lib/podcast/stage'

type StageBarEpisode = {
  title: string
  status: string
  season: number
  episode_number: number | null
}

/** Live episode signals threaded from RecordingStudio so the next-step line can
 *  name the concrete next action instead of a fixed hint. */
type StageProgress = {
  hasTitle: boolean
  hasCover: boolean
  hasAudio: boolean
  hasTranscript: boolean
  /** Feed compliance passes → episode is publishable. */
  complianceOk: boolean
  /** First blocking issue to fix before publish, if any. */
  blockersText: string | null
  isPublished: boolean
}

type Props = {
  episode: StageBarEpisode
  stage: StudioStage
  onStageChange: (stage: StudioStage) => void
  progress: StageProgress
}

/** Compute the one calm next-step line for the current stage from live episode
 *  state, so the host always knows the concrete next move. */
function nextStep(stage: StudioStage, p: StageProgress): string {
  switch (stage) {
    case 'plan': {
      if (!p.hasTitle) return 'Add a title, then Record.'
      if (!p.hasCover) return 'Add a cover, then Record.'
      return 'Basics look good — capture your takes in Record.'
    }
    case 'record': {
      if (!p.hasAudio) return 'Capture your takes, then Edit.'
      return 'Takes captured — trim and mix in Edit.'
    }
    case 'edit': {
      if (!p.hasAudio) return 'Save a mix, then Publish.'
      return 'Trim and mix, then Publish.'
    }
    case 'publish': {
      if (p.isPublished) return 'Published to the site and RSS.'
      if (!p.complianceOk) return p.blockersText ? `Fix ${p.blockersText}, then publish.` : 'Clear the checklist, then publish.'
      if (!p.hasTranscript) return 'Add a transcript, then publish.'
      return 'Ready to publish.'
    }
    default:
      return ''
  }
}

export function StudioStageBar({ episode, stage, onStageChange, progress }: Props) {
  const seLabel = episode.episode_number != null ? `S${episode.season}E${episode.episode_number}` : null
  const nextLine = nextStep(stage, progress)

  const activeIndex = STUDIO_STAGES.indexOf(stage)

  return (
    <header className="sticky top-0 z-20 -mx-1 rounded-panel border border-divider bg-obsidian/95 px-4 py-3 shadow-depth-md backdrop-blur supports-[backdrop-filter]:bg-obsidian/80 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Episode identity */}
        <div className="min-w-0">
          <p className="studio-type-label text-ice">Now in the studio</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="studio-type-section truncate !text-[18px]">{episode.title}</h1>
            {seLabel && (
              <Chip tone="neutral" className="shrink-0">
                {seLabel}
              </Chip>
            )}
            <Chip tone="accent" className="shrink-0 capitalize">
              {episode.status.replace(/_/g, ' ')}
            </Chip>
          </div>
        </div>

        {/* Layered-depth stage switcher: the current stage sits elevated with an
            accent fill, past stages carry a check, and future stages are ghosted
            but still tappable. On phones it scrolls horizontally instead of
            cramming four buttons — the active stage is scrolled into view so it's
            never clipped off-screen. */}
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
                ref={
                  active
                    ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    : undefined
                }
                aria-current={active ? 'step' : undefined}
                // Stable accessible name: the visible label swaps its number for a
                // check mark as steps complete, but the name never changes, so
                // screen-reader users and tests can rely on it.
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
                    active
                      ? 'bg-forged-on/20 text-forged-on'
                      : done
                        ? 'bg-forged/15 text-forged'
                        : 'bg-surface-raised text-ice'
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

      {nextLine && (
        <p className="studio-type-body mt-2.5 text-silver-body">
          <span className="studio-type-label text-ice">Next</span> · {nextLine}
        </p>
      )}
    </header>
  )
}
