'use client'

import { useRef } from 'react'

/** Fires one analytics play event the first time the listener starts audio */
export function PodcastPlayTracker({
  episodeId,
  showId,
  audioUrl,
}: {
  episodeId: string
  showId?: string | null
  audioUrl: string
}) {
  const sent = useRef(false)

  function track() {
    if (sent.current) return
    sent.current = true
    void fetch('/api/podcast/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episode_id: episodeId,
        show_id: showId || null,
        event_type: 'play',
      }),
      keepalive: true,
    }).catch(() => {})
  }

  return (
    <audio
      className="w-full mb-10"
      controls
      preload="metadata"
      src={audioUrl}
      onPlay={track}
    >
      <track kind="captions" />
    </audio>
  )
}
