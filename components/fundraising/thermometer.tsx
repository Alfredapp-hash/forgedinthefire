import { formatCents } from '@/lib/fundraising/progress'
import type { CampaignProgress } from '@/lib/fundraising/types'

export function CampaignThermometer({
  progress,
  goalCents,
  stretchGoalCents,
  matchingLabel,
}: {
  progress: CampaignProgress
  goalCents: number
  stretchGoalCents?: number | null
  matchingLabel?: string | null
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-serif text-4xl font-bold text-[#F6FAFC]">{formatCents(progress.combined_cents)}</p>
          <p className="text-sm text-[#A9B8C6]">
            of {formatCents(goalCents)} goal
            {progress.matched_cents > 0 ? ` · ${formatCents(progress.raised_cents)} given + ${formatCents(progress.matched_cents)} matched` : ''}
          </p>
        </div>
        <p className="text-2xl font-bold text-[#53D6FF]">{progress.pct}%</p>
      </div>
      <div className="h-3 rounded-full bg-[#1A232C] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#53D6FF] to-[#8DEBFF] transition-all"
          style={{ width: `${Math.max(progress.pct, progress.combined_cents > 0 ? 2 : 0)}%` }}
        />
      </div>
      {stretchGoalCents && progress.stretch_pct != null && (
        <p className="text-xs text-[#A9B8C6]">Stretch {formatCents(stretchGoalCents)} · {progress.stretch_pct}%</p>
      )}
      {matchingLabel && (
        <p className="text-xs text-[#8DEBFF]">{matchingLabel}</p>
      )}
      <p className="text-xs text-[#A9B8C6]">
        {progress.gift_count} gift{progress.gift_count === 1 ? '' : 's'}
        {progress.avg_gift_cents ? ` · avg ${formatCents(progress.avg_gift_cents)}` : ''}
      </p>
    </div>
  )
}
