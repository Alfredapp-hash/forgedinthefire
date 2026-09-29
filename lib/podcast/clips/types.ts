/**
 * Share clips / audiograms: types shared by the pure helpers (captions, waveform, layout), the
 * renderer (main thread + worker) and the UI. Nothing in here touches the DOM.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'

export type ClipAspect = '9:16' | '1:1' | '16:9'
export type ClipStyle = 'waveform' | 'bars'

export const CLIP_ASPECTS: ClipAspect[] = ['9:16', '1:1', '16:9']
export const CLIP_ASPECT_LABEL: Record<ClipAspect, string> = {
  '9:16': 'Vertical (Reels, TikTok, Shorts)',
  '1:1': 'Square (feed posts)',
  '16:9': 'Wide (YouTube, X)',
}

export const CLIP_MIN_SEC = 15
export const CLIP_MAX_SEC = 90
export const CLIP_FPS = 30

/** A range on the episode's timeline, in seconds. */
export type ClipRange = { startSec: number; endSec: number }

/** A bleeped / redacted stretch on the episode timeline (seconds). Captions inside show "[removed]". */
export type RedactedRange = { start: number; end: number }

/** What a caption shows on screen: the text and where the transcript word came from. */
export type ClipWord = {
  /** Text to draw. "[removed]" when the word is (or overlaps) a redaction. */
  text: string
  /** Seconds from the clip start. */
  s: number
  e: number
  redacted: boolean
}

export type CaptionGroup = {
  words: ClipWord[]
  /** Seconds from the clip start. */
  s: number
  e: number
}

export type ClipBrand = {
  background: string
  surface: string
  accent: string
  accentBright: string
  ink: string
  body: string
  muted: string
}

/** Site theme tokens (tailwind.config.ts / app/globals.css). The heart red is reserved: never used here. */
export const CLIP_BRAND: ClipBrand = {
  background: '#05070A',
  surface: '#151B22',
  accent: '#53D6FF',
  accentBright: '#8DEBFF',
  ink: '#F6FAFC',
  body: '#B8C4CF',
  muted: '#A9B8C6',
}

/** Everything the painter needs that is not a pixel source. Serialisable (crosses to the worker). */
export type ClipSpec = {
  range: ClipRange
  aspect: ClipAspect
  style: ClipStyle
  /** Episode title (first line). */
  title: string
  /** Show name (second line). */
  showTitle: string
  /** Word captions relative to the clip (already redacted via `clipWords`). */
  words: ClipWord[]
  brand?: ClipBrand
}

export type ClipRenderInput = {
  spec: Omit<ClipSpec, 'words'>
  /** Word timings on the episode timeline. */
  words: TranscriptWord[]
  /** Bleeped / redacted stretches on the episode timeline. */
  redactions: RedactedRange[]
  /** Decoded episode audio (the picker decodes it once for the waveform). */
  audio: AudioBuffer
  /** Cover art (episode or show). */
  coverUrl: string
  /** Protected terms — belt and braces so a name never reaches a clip caption even before the safety pass. */
  terms?: { text: string; kind: string }[]
  /** Optional program video: replaces the cover art as the picture. */
  video?: Blob | null
  signal?: AbortSignal
  onProgress?: (p: ClipProgress) => void
}

export type ClipProgress = { stage: string; fraction: number | null; realtime?: boolean }

export type ClipRenderResult = {
  video: Blob
  mime: string
  ext: 'mp4' | 'webm'
  poster: Blob
  srt: string
  /** Seconds. */
  duration: number
  /** True only for the MediaRecorder fallback (wall-clock 1x). */
  realtime: boolean
  /** Where the encode ran. */
  path: 'worker' | 'main' | 'realtime'
  /** How many redacted stretches the clip overlapped (bleeped in the audio, "[removed]" on screen). */
  redactedCount: number
}

/** Saved row (podcast_episode_clips). */
export type EpisodeClip = {
  id: string
  episode_id: string
  title: string
  start_sec: number
  end_sec: number
  aspect: ClipAspect
  url: string
  poster_url: string | null
  created_at: string
}
