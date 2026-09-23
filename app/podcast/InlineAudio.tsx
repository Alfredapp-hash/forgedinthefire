'use client'

import { useRef } from 'react'

/** Compact native player for the episode list; sends one play beacon per page view. */
export function InlineAudio({ episodeId, showId, src, title }: { episodeId: string; showId: string | null; src: string; title: string }) {
  const sent = useRef(false)
  return (
    <audio
      className="w-full"
      controls
      preload="none"
      src={src}
      aria-label={`Play ${title}`}
      onPlay={() => {
        if (sent.current) return
        sent.current = true
        void fetch('/api/podcast/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode_id: episodeId, show_id: showId, event_type: 'play' }),
          keepalive: true,
        }).catch(() => {})
      }}
    />
  )
}
