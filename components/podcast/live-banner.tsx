'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Radio } from 'lucide-react'
import { fetchPublicLive } from '@/lib/podcast/live/client'
import type { LivePublicPayload } from '@/lib/podcast/live/types'

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Small "Live now" / "Next live show" strip for /podcast. Renders nothing when idle. */
export function LiveBanner() {
  const [data, setData] = useState<LivePublicPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchPublicLive()
        .then((next) => {
          if (!cancelled) setData(next)
        })
        .catch(() => {})
    void load()
    const id = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (data?.live) {
    return (
      <Link
        href="/podcast/live"
        className="flex items-center justify-center gap-3 rounded-xl border border-[#FF3B5C]/50 bg-[#FF3B5C]/10 px-4 py-3 text-sm text-[#F6FAFC] hover:bg-[#FF3B5C]/20"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF3B5C] px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-white">
          <Radio className="w-3 h-3" aria-hidden />
          Live now
        </span>
        <span className="truncate">{data.live.title}</span>
        <span className="text-[#8DEBFF]">Watch →</span>
      </Link>
    )
  }

  const next = data?.next
  if (next?.scheduled_for) {
    const at = new Date(next.scheduled_for)
    if (at.getTime() - Date.now() > UPCOMING_WINDOW_MS) return null
    return (
      <Link
        href="/podcast/live"
        className="flex items-center justify-center gap-3 rounded-xl border border-[#27313B] bg-[#11161C] px-4 py-3 text-sm text-[#B8C4CF] hover:border-[#53D6FF]"
      >
        <CalendarClock className="w-4 h-4 text-[#8DEBFF]" aria-hidden />
        <span className="truncate">
          Next live show: <span className="text-[#F6FAFC]">{next.title}</span> ·{' '}
          {at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
      </Link>
    )
  }

  return null
}
