import { Metadata } from 'next'
import Link from 'next/link'
import { Rss } from 'lucide-react'
import {
  formatDuration,
  getDefaultShow,
  getPublishedEpisodes,
  getSubscribeLinks,
  isSafeHttpUrl,
  showToMeta,
} from '@/lib/podcast'
import { DISTRIBUTION_LABELS } from '@/lib/studio/types'
import { BreadcrumbStructuredData } from '@/components/structured-data'
import { InlineAudio } from './InlineAudio'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const meta = showToMeta(await getDefaultShow())
  return {
    title: `Podcast | ${meta.title}`,
    description: meta.description,
    alternates: {
      canonical: meta.page,
      types: { 'application/rss+xml': meta.feed },
    },
    openGraph: {
      title: `${meta.title} Podcast`,
      description: meta.description,
      type: 'website',
      url: meta.page,
      images: [{ url: meta.image, width: 3000, height: 3000, alt: `${meta.title} podcast artwork` }],
    },
    twitter: { card: 'summary_large_image', title: `${meta.title} Podcast`, description: meta.description, images: [meta.image] },
  }
}

/** Preferred order for "Listen on" buttons. */
const PLATFORM_ORDER = ['apple', 'spotify', 'youtube', 'amazon', 'pocket_casts', 'overcast', 'iheart'] as const

export default async function PodcastIndexPage() {
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const [episodes, links] = await Promise.all([getPublishedEpisodes(), getSubscribeLinks(show?.id)])
  const subscribe = links.slice().sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform as (typeof PLATFORM_ORDER)[number]) - PLATFORM_ORDER.indexOf(b.platform as (typeof PLATFORM_ORDER)[number]),
  )

  return (
    <div className="min-h-screen">
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: `${meta.site}/` },
          { name: 'Podcast', url: meta.page },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'PodcastSeries',
            name: meta.title,
            description: meta.description,
            url: meta.page,
            webFeed: meta.feed,
            image: meta.image,
            inLanguage: meta.language,
            author: { '@type': 'Person', name: meta.author },
            publisher: { '@type': 'NGO', name: meta.title, url: meta.site },
            sameAs: subscribe.map((l) => l.url),
          }).replace(/</g, '\\u003c'),
        }}
      />

      <section className="relative py-16 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#53D6FF]/5 via-transparent to-transparent" />
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-10 text-center md:text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meta.image}
              alt={`${meta.title} podcast artwork`}
              width={224}
              height={224}
              className="h-44 w-44 md:h-56 md:w-56 shrink-0 rounded-2xl border border-[#27313B] object-cover shadow-[0_0_60px_rgba(83,214,255,0.12)]"
            />
            <div>
              <span className="text-[#53D6FF] font-medium text-sm tracking-widest uppercase mb-4 block">Listen</span>
              <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC] mb-5 leading-tight">
                {meta.title} Podcast
              </h1>
              <p className="text-lg text-[#B8C4CF] leading-relaxed mb-6">{meta.description}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {subscribe.map((l) => (
                  <a
                    key={l.platform}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-[#27313B] bg-[#11161C] px-4 py-2 text-sm text-[#F6FAFC] hover:border-[#53D6FF] hover:text-[#8DEBFF] transition-colors"
                  >
                    {DISTRIBUTION_LABELS[l.platform] || l.platform}
                  </a>
                ))}
                <a
                  href="/podcast/rss.xml"
                  className="inline-flex items-center gap-2 rounded-full border border-[#27313B] bg-[#11161C] px-4 py-2 text-sm text-[#F6FAFC] hover:border-[#53D6FF] hover:text-[#8DEBFF] transition-colors"
                >
                  <Rss className="w-4 h-4" /> RSS
                </a>
              </div>
              <p className="mt-3 text-xs text-[#A9B8C6]">
                Any podcast app: paste <span className="text-[#8DEBFF] break-all">{meta.feed}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-wide section-padding max-w-3xl mx-auto space-y-6">
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
                <div className="flex gap-5">
                  {isSafeHttpUrl(ep.cover_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ep.cover_url}
                      alt=""
                      width={96}
                      height={96}
                      loading="lazy"
                      className="hidden sm:block h-24 w-24 shrink-0 rounded-xl border border-[#27313B] object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-widest text-[#8DEBFF] mb-2">
                      {ep.episode_type === 'trailer' ? 'Trailer' : ep.episode_type === 'bonus' ? 'Bonus' : `Season ${ep.season}`}
                      {ep.episode_type === 'full' && ep.episode_number != null ? ` · Episode ${ep.episode_number}` : ''}
                      {ep.duration_seconds ? ` · ${formatDuration(ep.duration_seconds)}` : ''}
                      {ep.published_at
                        ? ` · ${new Date(ep.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}`
                        : ''}
                    </p>
                    <h2 className="font-serif text-2xl text-[#F6FAFC] mb-3">
                      <Link href={`/podcast/${ep.slug}`} className="hover:text-[#8DEBFF]">
                        {ep.title}
                      </Link>
                    </h2>
                    {ep.summary && <p className="text-[#B8C4CF] mb-5 leading-relaxed">{ep.summary}</p>}
                  </div>
                </div>
                {ep.audio_url && <InlineAudio episodeId={ep.id} showId={ep.show_id} src={ep.audio_url} title={ep.title} />}
                <Link href={`/podcast/${ep.slug}`} className="mt-4 inline-block text-sm text-[#8DEBFF] hover:text-[#53D6FF]">
                  Show notes{ep.chapters?.length ? ', chapters' : ''}{ep.transcript ? ' & transcript' : ''} →
                </Link>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
