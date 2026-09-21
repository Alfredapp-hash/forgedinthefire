import { formatCents } from '@/lib/fundraising/progress'
import { publicGift } from '@/lib/fundraising/public'

export function DonorWall({ gifts }: { gifts: ReturnType<typeof publicGift>[] }) {
  if (!gifts.length) {
    return <p className="text-sm text-[#A9B8C6]">Be the first gift on this campaign.</p>
  }
  return (
    <ul className="space-y-3">
      {gifts.map((g) => (
        <li key={g.id} className="rounded-xl border border-[#27313B] bg-[#11161C] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#F6FAFC]">
              {g.is_anonymous || !g.donor_display_name ? 'Anonymous' : g.donor_display_name}
            </p>
            <p className="text-sm text-[#53D6FF]">{formatCents(g.amount_cents)}</p>
          </div>
          {(g.honor_of || g.memory_of) && (
            <p className="text-xs text-[#8DEBFF] mt-1">
              {g.honor_of ? `In honor of ${g.honor_of}` : `In memory of ${g.memory_of}`}
            </p>
          )}
          {g.message && <p className="text-sm text-[#B8C4CF] mt-1">{g.message}</p>}
        </li>
      ))}
    </ul>
  )
}
