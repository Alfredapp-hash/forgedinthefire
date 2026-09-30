'use client'

import { useState } from 'react'
import { RecordingStudio } from '@/app/admin/podcast/RecordingStudio'
import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import type { ContentTopic, PodcastEpisode } from '@/lib/studio/types'
import { e2eLog, e2eRecord } from '../e2e-log'

export type StudioHarnessMode = 'studio' | 'editor'

const NOW = '2026-09-23T00:00:00.000Z'

/** A plausible in-progress episode: title + summary present, no mix yet. */
export function fakeEpisode(id: string, patch: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id,
    guid: null,
    topic_id: null,
    show_id: 'show-e2e',
    title: 'E2E Harness Episode',
    slug: 'e2e-harness-episode',
    summary: 'A fake episode the dev harness loads so the studio runs without Supabase.',
    show_notes: null,
    guest_name: null,
    guest_bio: null,
    audio_url: null,
    audio_mime: null,
    duration_seconds: null,
    file_size: null,
    cover_url: null,
    transcript: null,
    season: 1,
    episode_number: null,
    episode_type: 'full',
    visibility: 'public',
    explicit: false,
    status: 'recording',
    scheduled_for: null,
    published_at: null,
    chapters: [],
    keywords: [],
    ad_markers: [],
    created_by: null,
    created_at: NOW,
    updated_at: NOW,
    ...patch,
  }
}

const FAKE_TOPICS: ContentTopic[] = [
  {
    id: 'topic-e2e-1',
    title: 'Aftercare that actually lasts',
    slug: 'aftercare-that-actually-lasts',
    summary: 'What survivors say helps in year two.',
    talking_points: ['Housing first', 'Peer mentors', 'Paperwork help'],
    scheduled_on: null,
    status: 'planned',
    blog_post_id: null,
    created_by: null,
    created_at: NOW,
    updated_at: NOW,
  },
]

/**
 * Dev-only harness for the production room.
 *
 * - mode=studio (default): the real admin `RecordingStudio` (Plan → Record → Edit → Publish)
 *   with a fake episode list held in React state. Saves go to /api/admin/studio/episodes;
 *   Playwright mocks that route (see e2e/studio.spec.ts).
 * - mode=editor: the bare `PodcastAudioEditor` with every stage visible and the export
 *   handed to the browser as a download, plus `window.__e2e` hooks for assertions.
 */
export function StudioHarness({ episodeId, mode }: { episodeId: string; mode: StudioHarnessMode }) {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>(() => [
    fakeEpisode(episodeId),
    fakeEpisode(`${episodeId}-queued`, {
      title: 'Second queued episode',
      slug: 'second-queued-episode',
      status: 'draft',
      summary: null,
    }),
  ])
  const [selectedId, setSelectedId] = useState(episodeId)

  if (mode === 'editor') {
    return (
      <main className="mx-auto max-w-7xl p-4" data-testid="dev-studio" data-mode="editor">
        <PodcastAudioEditor
          episodeId={episodeId}
          audioUrl={null}
          title="E2E Harness Episode"
          chapters={[]}
          onExported={async (file, durationSeconds) => {
            e2eLog().exports.push({ name: file.name, size: file.size, type: file.type, durationSeconds })
            e2eRecord('exported', { name: file.name, size: file.size })
            // The real room uploads to Supabase; the harness hands the file to the browser instead.
            const url = URL.createObjectURL(file)
            const a = document.createElement('a')
            a.href = url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
          }}
          onPublished={async () => {
            e2eRecord('published')
          }}
          onMarkChapter={(seconds) => {
            e2eLog().chapters.push(seconds)
            e2eRecord('chapter', seconds)
          }}
        />
      </main>
    )
  }

  return (
    <main className="admin-portal mx-auto max-w-7xl p-4" data-testid="dev-studio" data-mode="studio" style={{ colorScheme: 'dark' }}>
      <RecordingStudio
        episodes={episodes}
        topics={FAKE_TOPICS}
        selectedId={selectedId}
        onSelect={(id) => {
          e2eRecord('select', id)
          setSelectedId(id)
        }}
        onEpisodesChange={(next) => {
          e2eRecord('episodes', next.map((ep) => ({ id: ep.id, status: ep.status, audio_url: ep.audio_url })))
          setEpisodes(next)
        }}
      />
    </main>
  )
}
