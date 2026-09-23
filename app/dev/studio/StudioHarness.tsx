'use client'

import { PodcastAudioEditor } from '@/components/podcast/audio-editor'
import { e2eLog, e2eRecord } from '../e2e-log'

export function StudioHarness({ episodeId }: { episodeId: string }) {
  return (
    <main className="mx-auto max-w-7xl p-4" data-testid="dev-studio">
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
