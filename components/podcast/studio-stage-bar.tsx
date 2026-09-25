'use client'

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

  return (
    <header className="sticky top-0 z-20 -mx-1 rounded-2xl border border-[#27313B] bg-[#0B0F14]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#0B0F14]/80 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Episode identity */}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8DEBFF]">Now in the studio</p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-semibold text-[#F6FAFC] sm:text-lg">{episode.title}</span>
            {seLabel && (
              <span className="shrink-0 rounded-md border border-[#27313B] bg-[#05070A] px-1.5 py-0.5 text-[11px] text-[#A9B8C6]">
                {seLabel}
              </span>
            )}
            <span className="shrink-0 rounded-md bg-[#1A232C] px-1.5 py-0.5 text-[11px] capitalize text-[#8DEBFF]">
              {episode.status}
            </span>
          </div>
        </div>

        {/* Segmented stage switcher. On phones it scrolls horizontally instead of
            cramming four buttons — the active stage is scrolled into view so it's
            never clipped off-screen. */}
        <nav
          aria-label="Studio stages"
          className="-mx-1 flex w-full shrink-0 gap-1 overflow-x-auto rounded-xl border border-[#27313B] bg-[#05070A] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible lg:w-auto"
        >
          {STUDIO_STAGES.map((s, i) => {
            const active = s === stage
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
                onClick={() => onStageChange(s)}
                className={`flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:flex-1 lg:flex-none lg:px-4 ${
                  active
                    ? 'bg-[#53D6FF] text-[#061016] shadow-[0_0_0_1px_rgba(83,214,255,0.4)]'
                    : 'text-[#A9B8C6] hover:bg-[#1A232C] hover:text-[#F6FAFC]'
                }`}
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                    active ? 'bg-[#061016]/20 text-[#061016]' : 'bg-[#1A232C] text-[#8DEBFF]'
                  }`}
                >
                  {i + 1}
                </span>
                {STUDIO_STAGE_LABEL[s]}
              </button>
            )
          })}
        </nav>
      </div>

      {nextLine && (
        <p className="mt-2 text-[12px] text-[#A9B8C6]">
          <span className="text-[#8DEBFF]">Next</span> · {nextLine}
        </p>
      )}
    </header>
  )
}
