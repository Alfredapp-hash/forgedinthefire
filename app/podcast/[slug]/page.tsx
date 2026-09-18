import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDuration, getPublishedEpisode, PODCAST } from '@/lib/podcast'
import { BreadcrumbStructuredData } from '@/components/structured-data'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const episode = await getPublishedEpisode(slug)
  if (!episode) return { title: 'Episode not found | Forged in the Fire' }
  return {
    title: `${episode.title} | Forged in the Fire Podcast`,
    description: episode.summary || PODCAST.description,
    alternates: { canonical: `${PODCAST.site}/podcast/${episode.slug}` },
    openGraph: {
      title: episode.title,
      description: episode.summary || PODCAST.description,
      type: 'article',
      url: `${PODCAST.site}/podcast/${episode.slug}`,
    },
  }
}

export default async function PodcastEpisodePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const episode = await getPublishedEpisode(slug)
  if (!episode) notFound()

  return (
    <div className="min-h-screen">
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: `${PODCAST.site}/` },
          { name: 'Podcast', url: PODCAST.page },
          { name: episode.title, url: `${PODCAST.site}/podcast/${episode.slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'PodcastEpisode',
            name: episode.title,
            description: episode.summary,
            datePublished: episode.published_at,
            url: `${PODCAST.site}/podcast/${episode.slug}`,
            partOfSeries: { '@type': 'PodcastSeries', name: PODCAST.title, url: PODCAST.page },
            associatedMedia: episode.audio_url
              ? { '@type': 'AudioObject', contentUrl: episode.audio_url, encodingFormat: episode.audio_mime }
              : undefined,
          }),
        }}
      />

      <article className="container-wide section-padding py-16 md:py-24 max-w-3xl mx-auto">
        <Link href="/podcast" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF] mb-8">
          <ArrowLeft className="w-4 h-4" />
          All episodes
        </Link>
        <p className="text-xs uppercase tracking-widest text-[#53D6FF] mb-3">
          Season {episode.season}
          {episode.episode_number != null ? ` · Episode ${episode.episode_number}` : ''}
          {episode.duration_seconds ? ` · ${formatDuration(episode.duration_seconds)}` : ''}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC] mb-6">{episode.title}</h1>
        {episode.summary && <p className="text-lg text-[#B8C4CF] leading-relaxed mb-8">{episode.summary}</p>}
        {episode.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={episode.cover_url} alt="" className="w-full max-h-80 object-cover rounded-2xl mb-8" />
        )}
        {episode.audio_url ? (
          <audio className="w-full mb-10" controls preload="metadata" src={episode.audio_url}>
            <track kind="captions" />
          </audio>
        ) : null}
        {episode.transcript && (
          <section className="rounded-2xl border border-[#27313B] bg-[#11161C] p-6 md:p-8">
            <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4">Transcript</h2>
            <p className="whitespace-pre-wrap text-[#B8C4CF] leading-relaxed">{episode.transcript}</p>
          </section>
        )}
      </article>
    </div>
  )
}
