import { Metadata } from 'next'
import Link from 'next/link'
import { formatDuration, getPublishedEpisodes, PODCAST } from '@/lib/podcast'
import { BreadcrumbStructuredData } from '@/components/structured-data'
import { Rss } from 'lucide-react'
import { LiveBanner } from '@/components/podcast/live-banner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Podcast | Forged in the Fire',
  description: PODCAST.description,
  alternates: {
    canonical: PODCAST.page,
    types: { 'application/rss+xml': PODCAST.feed },
  },
  openGraph: {
    title: 'Podcast | Forged in the Fire',
    description: PODCAST.description,
    type: 'website',
    url: PODCAST.page,
  },
}

export default async function PodcastIndexPage() {
  const episodes = await getPublishedEpisodes()

  return (
    <div className="min-h-screen">
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: 'https://forgedinthefireohio.org/' },
          { name: 'Podcast', url: PODCAST.page },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'PodcastSeries',
            name: PODCAST.title,
            description: PODCAST.description,
            url: PODCAST.page,
            webFeed: PODCAST.feed,
            author: { '@type': 'Person', name: 'Tracy', email: PODCAST.email },
            publisher: { '@type': 'NGO', name: PODCAST.title },
          }),
        }}
      />

      <section className="relative py-16 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#53D6FF]/5 via-transparent to-transparent" />
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#53D6FF] font-medium text-sm tracking-widest uppercase mb-4 block">
              Listen
            </span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              Forged in the Fire Podcast
            </h1>
            <p className="text-lg text-[#B8C4CF] leading-relaxed mb-8">
              {PODCAST.description}
            </p>
            <a
              href="/podcast/rss.xml"
              className="inline-flex items-center gap-2 text-sm text-[#8DEBFF] hover:text-[#53D6FF]"
            >
              <Rss className="w-4 h-4" />
              RSS feed for Apple Podcasts, Spotify, and other directories
            </a>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-wide section-padding max-w-3xl mx-auto space-y-6">
          <LiveBanner />
          {episodes.length === 0 ? (
            <div className="rounded-2xl border border-[#27313B] bg-[#151B22] p-10 text-center">
              <p className="text-[#F6FAFC] font-medium mb-2">Episodes are being prepared.</p>
              <p className="text-sm text-[#A9B8C6]">
                Subscribe to the RSS feed now. New conversations will appear here as they are published.
              </p>
            </div>
          ) : (
            episodes.map((ep) => (
              <article key={ep.id} className="rounded-2xl border border-[#27313B] bg-[#11161C] p-6 md:p-8">
                <p className="text-xs uppercase tracking-widest text-[#8DEBFF] mb-2">
                  Season {ep.season}
                  {ep.episode_number != null ? ` · Episode ${ep.episode_number}` : ''}
                  {ep.duration_seconds ? ` · ${formatDuration(ep.duration_seconds)}` : ''}
                </p>
                <h2 className="font-serif text-2xl text-[#F6FAFC] mb-3">
                  <Link href={`/podcast/${ep.slug}`} className="hover:text-[#8DEBFF]">
                    {ep.title}
                  </Link>
                </h2>
                {ep.summary && <p className="text-[#B8C4CF] mb-5 leading-relaxed">{ep.summary}</p>}
                {ep.audio_url ? (
                  <audio className="w-full" controls preload="none" src={ep.audio_url}>
                    <track kind="captions" />
                  </audio>
                ) : (
                  <p className="text-sm text-[#A9B8C6]">Audio will be posted with this episode.</p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
