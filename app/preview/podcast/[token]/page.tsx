import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { formatDuration } from '@/lib/podcast'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Episode preview',
}

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function PodcastPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = adminDb()
  if (!supabase) notFound()
  const { data: episode } = await supabase
    .from('podcast_episodes')
    .select('*')
    .eq('preview_token', token)
    .maybeSingle()
  if (!episode) notFound()

  return (
    <div className="min-h-screen bg-[#05070A] text-[#F6FAFC]">
      <div className="border-b border-[#27313B] bg-[#11161C] px-4 py-3 text-xs text-[#8DEBFF]">
        Unpublished episode preview · not indexed · not in public RSS
      </div>
      <article className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs uppercase tracking-widest text-[#53D6FF] mb-3">
          {episode.status}
          {episode.duration_seconds ? ` · ${formatDuration(episode.duration_seconds)}` : ''}
        </p>
        <h1 className="font-serif text-4xl font-bold mb-6">{episode.title}</h1>
        {episode.summary ? <p className="text-lg text-[#B8C4CF] mb-8">{episode.summary}</p> : null}
        {episode.audio_url ? (
          <audio controls className="w-full mb-8" src={episode.audio_url} preload="metadata" />
        ) : (
          <p className="text-sm text-[#A9B8C6] mb-8">No audio uploaded yet.</p>
        )}
        {episode.show_notes ? (
          <div className="prose prose-invert max-w-none whitespace-pre-wrap text-[#B8C4CF]">{episode.show_notes}</div>
        ) : null}
      </article>
    </div>
  )
}
