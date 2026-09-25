'use client'

import { STUDIO_STAGES, STUDIO_STAGE_LABEL, type StudioStage } from '@/lib/podcast/stage'

type StageBarEpisode = {
  title: string
  status: string
  season: number
  episode_number: number | null
}

type Props = {
  episode: StageBarEpisode
  stage: StudioStage
  onStageChange: (stage: StudioStage) => void
}

/** One-line "what's next" nudge shown under the switcher so a first-time host
 *  always knows the next move without leaving the current stage. */
const NEXT_HINT: Record<StudioStage, string> = {
  plan: 'Fill in the basics and fix any red items, then move to Record.',
  record: 'Capture your takes. When the mix sounds right, move to Edit.',
  edit: 'Trim, add chapters, and polish the mix. Then move to Publish.',
  publish: 'Clear the checklist, then publish to the site and RSS.',
}

export function StudioStageBar({ episode, stage, onStageChange }: Props) {
  const seLabel = episode.episode_number != null ? `S${episode.season}E${episode.episode_number}` : null

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

        {/* Segmented stage switcher */}
        <nav
          aria-label="Studio stages"
          className="flex w-full shrink-0 gap-1 rounded-xl border border-[#27313B] bg-[#05070A] p-1 lg:w-auto"
        >
          {STUDIO_STAGES.map((s, i) => {
            const active = s === stage
            return (
              <button
                key={s}
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onStageChange(s)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors lg:flex-none lg:px-4 ${
                  active
                    ? 'bg-[#53D6FF] text-[#061016] shadow-[0_0_0_1px_rgba(83,214,255,0.4)]'
                    : 'text-[#A9B8C6] hover:bg-[#1A232C] hover:text-[#F6FAFC]'
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold ${
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

      <p className="mt-2 text-[12px] text-[#A9B8C6]">{NEXT_HINT[stage]}</p>
    </header>
  )
}
