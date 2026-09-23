import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  formatDuration,
  getDefaultShow,
  getPublishedEpisode,
  isoDuration,
  isSafeHttpUrl,
  showToMeta,
  sortedChapters,
} from '@/lib/podcast'
import { enclosureUrl, showNotesHtml } from '@/lib/podcast-rss'
import { normalizeAudioMime } from '@/lib/studio/release'
import { episodeCues, stripVoiceTags } from '@/lib/studio/transcript'
import { BreadcrumbStructuredData } from '@/components/structured-data'
import { EpisodePlayer, type PlayerTranscript } from './EpisodePlayer'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const [episode, show] = await Promise.all([getPublishedEpisode(slug), getDefaultShow()])
  if (!episode) return { title: 'Episode not found | Forged in the Fire' }
  const meta = showToMeta(show)
  const url = `${meta.site}/podcast/${episode.slug}`
  const description = (episode.summary || meta.description).slice(0, 300)
  const image = isSafeHttpUrl(episode.cover_url) ? episode.cover_url : meta.image
  return {
    title: `${episode.title} | ${meta.title} Podcast`,
    description,
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': meta.feed },
    },
    // Unlisted episodes are reachable by link but stay out of search.
    robots: episode.visibility === 'unlisted' ? { index: false, follow: true } : undefined,
    openGraph: {
      title: episode.title,
      description,
      type: 'website',
      url,
      siteName: meta.title,
      images: [{ url: image, width: 3000, height: 3000, alt: `${meta.title} podcast artwork` }],
      audio: episode.audio_url
        ? [{ url: episode.audio_url, type: normalizeAudioMime(episode.audio_mime, episode.audio_url) }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: episode.title,
      description,
      images: [image],
    },
  }
}

function jsonLd(data: unknown) {
  // Escape "<" so show notes can never close the script tag.
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') }
}

export default async function PodcastEpisodePage({ params }: Props) {
  const { slug } = await params
  const [episode, show] = await Promise.all([getPublishedEpisode(slug), getDefaultShow()])
  if (!episode || !episode.audio_url) notFound()

  const meta = showToMeta(show)
  const url = `${meta.site}/podcast/${episode.slug}`
  const image = isSafeHttpUrl(episode.cover_url) ? episode.cover_url : meta.image
  const mime = normalizeAudioMime(episode.audio_mime, episode.audio_url)
  const chapters = sortedChapters(episode.chapters).map((c) => ({
    start: c.start_ms / 1000,
    title: c.title,
    url: isSafeHttpUrl(c.url) ? c.url : null,
    img: isSafeHttpUrl(c.img) ? c.img : null,
  }))
  const text = (episode.transcript || '').trim()
  const cues = text ? episodeCues(episode) : []
  const transcript: PlayerTranscript = !text
    ? null
    : cues.length
      ? { kind: 'cues', cues: cues.map((c) => ({ start: c.start, text: stripVoiceTags(c.text) })) }
      : { kind: 'text', text }
  const notesHtml = showNotesHtml(episode.show_notes || '')

  return (
    <div className="min-h-screen">
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: `${meta.site}/` },
          { name: 'Podcast', url: meta.page },
          { name: episode.title, url },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          '@context': 'https://schema.org',
          '@type': 'PodcastEpisode',
          '@id': url,
          url,
          name: episode.title,
          description: episode.summary || undefined,
          datePublished: episode.published_at || undefined,
          episodeNumber: episode.episode_number ?? undefined,
          timeRequired: isoDuration(episode.duration_seconds),
          image,
          inLanguage: meta.language,
          isAccessibleForFree: true,
          partOfSeason: {
            '@type': 'PodcastSeason',
            seasonNumber: episode.season || 1,
            partOfSeries: { '@type': 'PodcastSeries', name: meta.title, url: meta.page },
          },
          partOfSeries: { '@type': 'PodcastSeries', name: meta.title, url: meta.page, webFeed: meta.feed },
          associatedMedia: {
            '@type': 'MediaObject',
            contentUrl: episode.audio_url,
            encodingFormat: mime,
            duration: isoDuration(episode.duration_seconds),
            contentSize: episode.file_size ? String(episode.file_size) : undefined,
          },
          actor: episode.guest_name ? [{ '@type': 'Person', name: episode.guest_name }] : undefined,
          publisher: { '@type': 'NGO', name: meta.title, url: meta.site },
        })}
      />

      <article className="container-wide section-padding py-16 md:py-24 max-w-3xl mx-auto">
        <Link href="/podcast" className="inline-flex items-center gap-2 text-sm text-[#8DEBFF] hover:text-[#53D6FF] mb-8">
          <ArrowLeft className="w-4 h-4" />
          All episodes
        </Link>

        <div className="flex flex-col sm:flex-row gap-6 sm:items-end mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            width={160}
            height={160}
            className="h-32 w-32 sm:h-40 sm:w-40 shrink-0 rounded-2xl border border-[#27313B] object-cover"
          />
          <div>
            <p className="text-xs uppercase tracking-widest text-[#53D6FF] mb-3">
              {episode.episode_type === 'trailer' ? 'Trailer' : episode.episode_type === 'bonus' ? 'Bonus' : `Season ${episode.season}`}
              {episode.episode_type === 'full' && episode.episode_number != null ? ` · Episode ${episode.episode_number}` : ''}
              {episode.duration_seconds ? ` · ${formatDuration(episode.duration_seconds)}` : ''}
              {episode.published_at
                ? ` · ${new Date(episode.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}`
                : ''}
            </p>
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[#F6FAFC] leading-tight">{episode.title}</h1>
          </div>
        </div>

        {episode.summary && <p className="text-lg text-[#B8C4CF] leading-relaxed mb-8">{episode.summary}</p>}

        {episode.guest_name && (
          <p className="text-sm text-[#8DEBFF] mb-6">
            Guest: {episode.guest_name}
            {episode.guest_bio ? ` — ${episode.guest_bio}` : ''}
          </p>
        )}

        <EpisodePlayer
          episodeId={episode.id}
          showId={episode.show_id}
          title={episode.title}
          audioUrl={episode.audio_url}
          downloadUrl={enclosureUrl(meta.site, episode)}
          shareUrl={url}
          durationSeconds={episode.duration_seconds}
          chapters={chapters}
          transcript={transcript}
        />

        {notesHtml && (
          <section className="rounded-2xl border border-[#27313B] bg-[#11161C] p-6 md:p-8 mb-8">
            <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4">Show notes</h2>
            {/* Show notes are staff-authored in the admin; plain text is escaped + linkified. */}
            <div
              className="space-y-4 text-[#B8C4CF] leading-relaxed [&_a]:text-[#8DEBFF] [&_a]:underline [&_a:hover]:text-[#53D6FF] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: sanitizeNotes(notesHtml) }}
            />
          </section>
        )}

        <p className="text-sm text-[#A9B8C6]">
          If you or someone you know needs help, <Link href="/get-help" className="text-[#8DEBFF] underline hover:text-[#53D6FF]">find support here</Link>.
        </p>
      </article>
    </div>
  )
}

/** Allow only simple formatting tags; strip scripts, handlers, and non-http links. */
function sanitizeNotes(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?!\/?(p|br|a|ul|ol|li|strong|em|b|i|h[2-4])\b)[^>]*>/gi, '')
    .replace(/\s(on\w+|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*("|')\s*(?!https?:|mailto:|\/)[^"']*\1/gi, 'href="#"')
    // Unquoted href (href=javascript:…) slips past the quoted form above.
    .replace(/href\s*=\s*(?!["'])(?!https?:|mailto:|\/)[^\s>]*/gi, 'href="#"')
}
