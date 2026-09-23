import type { Metadata } from 'next'
import { LivePlayer } from '@/components/podcast/live-player'
import { PODCAST } from '@/lib/podcast'

export const metadata: Metadata = {
  title: 'Live | Forged in the Fire Podcast',
  description: `Watch ${PODCAST.title} live.`,
  alternates: { canonical: `${PODCAST.page.replace(/\/$/, '')}/live` },
  openGraph: {
    title: 'Live | Forged in the Fire Podcast',
    description: `Watch ${PODCAST.title} live.`,
    type: 'website',
    url: `${PODCAST.page.replace(/\/$/, '')}/live`,
  },
}

export default function PodcastLivePage() {
  return (
    <div className="min-h-screen">
      <section className="py-12 md:py-20">
        <div className="container-wide section-padding max-w-4xl mx-auto space-y-6">
          <div className="text-center">
            <span className="text-[#53D6FF] font-medium text-sm tracking-widest uppercase mb-3 block">Watch live</span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC]">Forged in the Fire Live</h1>
          </div>
          <LivePlayer />
          <p className="text-xs text-center text-[#7C8B97]">
            If anything in this conversation brings up difficult feelings, the National Human Trafficking Hotline is
            available 24/7 at 1-888-373-7888 (text 233733).
          </p>
        </div>
      </section>
    </div>
  )
}
