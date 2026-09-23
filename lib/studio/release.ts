/**
 * Release readiness for a podcast episode — shared by the editor (full checklist)
 * and the episodes API (server-enforced subset). Pure: no DOM, no Node APIs.
 */
import type { PodcastEpisode, PodcastShow } from '@/lib/studio/types'

export type ReleaseLevel = 'ok' | 'block' | 'warn'

export type ReleaseCheck = {
  id: string
  label: string
  level: ReleaseLevel
  /** Plain-language next step for a non-technical staffer. */
  fix?: string
  /** Optional measured value to show beside the label. */
  detail?: string
}

/**
 * Survivor-safety fields (20260924000002_podcast_ai_safety.sql). Optional so the checklist
 * degrades gracefully before the migration runs (the key is simply absent from the row).
 */
export type EpisodeSafetyFields = {
  transcript_words?: unknown
  audio_url_previous?: string | null
  post_edit_snapshot?: unknown
  protected_words_reviewed_at?: string | null
  protected_words_reviewed_by?: string | null
  guest_consent_confirmed?: boolean | null
  guest_consent_confirmed_by?: string | null
  guest_consent_confirmed_at?: string | null
  guest_final_cut_approved?: boolean | null
  guest_final_cut_approved_by?: string | null
  guest_final_cut_approved_at?: string | null
  guest_final_cut_audio_url?: string | null
}

/** Minimal consent shape; matches what lib/podcast/guest-consent.ts is expected to return. */
export type GuestConsentSummary = { status: string; revoked_at?: string | null }

export type ReleaseContext = {
  show?: Pick<PodcastShow, 'cover_url'> | null
  /** Measured client-side from the hosted file; omit on the server. */
  loudness?: { lufs: number; peakDb: number; channels: number } | null
  /** True when loudness measurement was attempted and failed (CORS, decode). */
  loudnessUnavailable?: boolean
  /** Natural size of the effective cover art; omit on the server. */
  cover?: { width: number; height: number } | null
  coverUnavailable?: boolean
  /** Other episodes in the show, to catch duplicate season/episode numbers. */
  siblings?: Pick<PodcastEpisode, 'id' | 'season' | 'episode_number' | 'episode_type'>[]
  /** Server mode: only checks that can be proven from the row. */
  server?: boolean
  /**
   * Guest consent records when available (Stream C: getEpisodeConsents(episodeId)).
   * undefined → fall back to the manual "consent on file" confirmation column.
   * TODO(guest-consent): pass getEpisodeConsents(ep.id) from the editor and the PATCH route.
   */
  guestConsents?: GuestConsentSummary[] | null
}

/** Formats Apple Podcasts, Spotify, and YouTube Music ingest reliably. */
export const SUPPORTED_AUDIO_MIME = ['audio/mpeg', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'video/mp4'] as const

export const LOUDNESS_TOLERANCE = 1.5
export const LOUDNESS_BLOCK = 3

export function loudnessTarget(channels: number | null | undefined) {
  return (channels ?? 2) >= 2 ? -16 : -19
}

/** Normalise the stored MIME (browsers report audio/mp3, audio/x-wav, etc.). */
export function normalizeAudioMime(mime: string | null | undefined, url?: string | null) {
  const m = (mime || '').toLowerCase().split(';')[0].trim()
  if (m === 'audio/mp3' || m === 'audio/mpeg3' || m === 'audio/x-mpeg' || m === 'audio/mpeg') return 'audio/mpeg'
  if (m === 'audio/m4a' || m === 'audio/x-m4a') return 'audio/x-m4a'
  if (m) return m
  const ext = (url || '').split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a') return 'audio/x-m4a'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'webm') return 'audio/webm'
  return 'audio/mpeg'
}

export function audioExtension(mime: string) {
  if (mime === 'audio/x-m4a' || mime === 'audio/mp4' || mime === 'audio/aac') return 'm4a'
  if (mime === 'video/mp4') return 'mp4'
  if (mime === 'audio/wav') return 'wav'
  if (mime === 'audio/webm') return 'webm'
  return 'mp3'
}

export function isSupportedAudio(mime: string | null | undefined, url?: string | null) {
  return (SUPPORTED_AUDIO_MIME as readonly string[]).includes(normalizeAudioMime(mime, url))
}

export function releaseChecks(ep: PodcastEpisode & EpisodeSafetyFields, ctx: ReleaseContext = {}): ReleaseCheck[] {
  const checks: ReleaseCheck[] = []
  const add = (c: ReleaseCheck) => checks.push(c)

  add({
    id: 'title',
    label: 'Episode title',
    level: ep.title?.trim() ? 'ok' : 'block',
    fix: 'Type a title at the top of the page.',
  })

  const notes = (ep.show_notes || '').trim()
  const summary = (ep.summary || '').trim()
  add({
    id: 'summary',
    label: 'Summary (one or two sentences)',
    level: summary ? 'ok' : notes ? 'warn' : 'block',
    fix: 'Write a short summary — it is the description apps show under the title.',
  })
  add({
    id: 'show_notes',
    label: 'Show notes',
    level: notes ? 'ok' : summary ? 'warn' : 'block',
    fix: 'Add show notes: what the episode covers, resources, and the help line. Links become clickable.',
  })

  const mime = normalizeAudioMime(ep.audio_mime, ep.audio_url)
  add({
    id: 'audio',
    label: 'Audio uploaded',
    level: ep.audio_url ? 'ok' : 'block',
    fix: 'Upload the finished MP3, or export a mix from the production room.',
  })
  if (ep.audio_url) {
    add({
      id: 'audio_format',
      label: 'Audio format (MP3 or M4A)',
      level: isSupportedAudio(ep.audio_mime, ep.audio_url) ? 'ok' : 'block',
      detail: mime,
      fix: 'Apple and Spotify need MP3 or M4A. Use “Normalize & convert to MP3” below.',
    })
    add({
      id: 'file_size',
      label: 'File size known (RSS enclosure length)',
      level: ep.file_size && ep.file_size > 0 ? 'ok' : 'block',
      detail: ep.file_size ? `${(ep.file_size / 1024 / 1024).toFixed(1)} MB` : undefined,
      fix: 'Re-upload the audio file so its size is recorded.',
    })
    add({
      id: 'duration',
      label: 'Duration known',
      level: ep.duration_seconds && ep.duration_seconds > 0 ? 'ok' : 'block',
      fix: 'Re-upload the audio (duration is read automatically).',
    })
  }

  if (!ctx.server && ep.audio_url) {
    const lufs = ctx.loudness?.lufs ?? ep.loudness_lufs ?? null
    const channels = ctx.loudness?.channels ?? ep.audio_channels ?? 2
    const target = loudnessTarget(channels)
    if (lufs == null || !Number.isFinite(lufs)) {
      add({
        id: 'loudness',
        label: `Loudness near ${target} LUFS`,
        level: ctx.loudnessUnavailable ? 'warn' : 'block',
        fix: ctx.loudnessUnavailable
          ? 'Could not measure this file in the browser. Export from the production room with “Match −16 LUFS” on.'
          : 'Click “Measure loudness”.',
      })
    } else {
      const off = Math.abs(lufs - target)
      add({
        id: 'loudness',
        label: `Loudness near ${target} LUFS (${channels >= 2 ? 'stereo' : 'mono'})`,
        level: off <= LOUDNESS_TOLERANCE ? 'ok' : off <= LOUDNESS_BLOCK ? 'warn' : 'block',
        detail: `${lufs.toFixed(1)} LUFS`,
        fix: 'Click “Normalize loudness” — it re-levels the file and re-hosts it as MP3.',
      })
      const peak = ctx.loudness?.peakDb ?? ep.loudness_peak_db ?? null
      if (peak != null && Number.isFinite(peak) && peak > -1) {
        add({
          id: 'peak',
          label: 'Peaks below −1 dBFS',
          level: 'warn',
          detail: `${peak.toFixed(1)} dBFS`,
          fix: 'Normalize loudness — the limiter keeps peaks under −1 dBFS.',
        })
      }
    }
  }

  const coverUrl = ep.cover_url || ctx.show?.cover_url || null
  if (!coverUrl) {
    add({
      id: 'cover',
      label: 'Cover art (square, 1400–3000 px)',
      level: 'block',
      fix: 'Upload square artwork — 3000×3000 JPG or PNG is ideal.',
    })
  } else if (!ctx.server) {
    const size = ctx.cover
    if (!size) {
      add({
        id: 'cover',
        label: 'Cover art (square, 1400–3000 px)',
        level: 'warn',
        detail: ep.cover_url ? 'episode art' : 'show art',
        fix: ctx.coverUnavailable ? 'Could not load the image to check its size.' : 'Checking size…',
      })
    } else {
      const square = Math.abs(size.width - size.height) <= 2
      const big = Math.min(size.width, size.height) >= 1400
      add({
        id: 'cover',
        label: 'Cover art (square, 1400–3000 px)',
        level: square && big ? (size.width >= 3000 ? 'ok' : 'warn') : 'block',
        detail: `${size.width}×${size.height}${ep.cover_url ? '' : ' · show art'}`,
        fix: !square
          ? 'Artwork must be square. Upload a square image.'
          : !big
            ? 'Artwork is too small for Apple (min 1400×1400). Upload 3000×3000.'
            : 'Works. 3000×3000 looks sharpest on phones and TVs.',
      })
    }
    if (!/\.(jpe?g|png)(\?|$)/i.test(coverUrl)) {
      add({
        id: 'cover_format',
        label: 'Cover art is JPG or PNG',
        level: 'warn',
        fix: 'Apple only accepts JPG or PNG artwork.',
      })
    }
  }

  add({
    id: 'explicit',
    label: 'Content rating set',
    level: 'ok',
    detail: ep.explicit ? 'Explicit' : 'Clean',
  })

  const type = ep.episode_type || 'full'
  const numbered = ep.episode_number != null && Number(ep.episode_number) > 0
  const dup =
    numbered &&
    (ctx.siblings || []).some(
      (s) =>
        s.id !== ep.id &&
        (s.season || 1) === (ep.season || 1) &&
        s.episode_number === ep.episode_number &&
        (s.episode_type || 'full') === 'full' &&
        type === 'full',
    )
  add({
    id: 'numbering',
    label: 'Season & episode number',
    level: type !== 'full' ? 'ok' : !numbered ? 'block' : dup ? 'warn' : 'ok',
    detail: `S${ep.season || 1}${numbered ? `E${ep.episode_number}` : ''}${type !== 'full' ? ` · ${type}` : ''}`,
    fix: dup
      ? `Another episode already uses S${ep.season || 1}E${ep.episode_number}. Pick a new number.`
      : 'Set the episode number (trailers and bonus episodes can skip it).',
  })

  guestSafetyChecks(ep, ctx).forEach(add)

  if (!ctx.server) {
    const t = (ep.transcript || '').trim()
    const timedWords = Array.isArray(ep.transcript_words) && ep.transcript_words.length > 0
    const kind = t ? transcriptKind(t) : null
    add({
      id: 'transcript',
      label: 'Transcript present',
      level: t ? 'ok' : 'warn',
      detail: !t ? undefined : kind !== 'text' ? kind!.toUpperCase() : timedWords ? 'timed (browser transcription)' : 'text only',
      fix: 'Recommended: use “Transcribe” in Clean-up & safety, or paste a transcript (VTT or SRT gives apps timed captions).',
    })

    const chapters = ep.chapters || []
    const duration = ep.duration_seconds || 0
    const beyond = duration > 0 && chapters.some((c) => c.start_ms / 1000 > duration)
    add({
      id: 'chapters',
      label: 'Chapters (optional)',
      level: beyond ? 'warn' : 'ok',
      detail: chapters.length ? `${chapters.length}` : 'none',
      fix: beyond
        ? 'A chapter starts after the audio ends — fix or remove it.'
        : chapters.length && chapters[0].start_ms > 0
          ? 'Tip: start the first chapter at 0:00.'
          : undefined,
    })
  }

  return checks
}

const has = (ep: object, key: string) => key in ep

function when(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Guest episodes: consent, the guest's sign-off on the final cut, and a protected-words
 * review are release blockers. Enforced on the server too once the columns exist.
 */
export function guestSafetyChecks(ep: PodcastEpisode & EpisodeSafetyFields, ctx: ReleaseContext = {}): ReleaseCheck[] {
  const hasGuest = Boolean((ep.guest_name || '').trim())
  if (!hasGuest) return []
  const checks: ReleaseCheck[] = []
  const migrated = has(ep, 'guest_final_cut_approved')
  if (!migrated) {
    // Before 20260924000002_podcast_ai_safety.sql there is nowhere to record approvals.
    if (!ctx.server) {
      checks.push({
        id: 'guest_safety_setup',
        label: 'Guest safety sign-offs',
        level: 'warn',
        fix: 'Ask an admin to run the 20260924000002_podcast_ai_safety.sql database update so consent and final-cut approval can be recorded.',
      })
    }
    return checks
  }

  let consentOk = false
  let consentDetail: string | undefined
  if (ctx.guestConsents) {
    const active = ctx.guestConsents.filter((c) => !c.revoked_at && /^(signed|granted|active|approved)$/i.test(c.status))
    consentOk = active.length > 0
    consentDetail = consentOk ? `${active.length} signed` : ctx.guestConsents.some((c) => c.revoked_at) ? 'revoked' : 'not signed'
  } else {
    consentOk = Boolean(ep.guest_consent_confirmed)
    consentDetail = consentOk ? [ep.guest_consent_confirmed_by, when(ep.guest_consent_confirmed_at)].filter(Boolean).join(' · ') : undefined
  }
  checks.push({
    id: 'guest_consent',
    label: 'Guest consent on file',
    level: consentOk ? 'ok' : 'block',
    detail: consentDetail,
    fix: consentDetail === 'revoked'
      ? 'The guest withdrew consent. Do not release this episode.'
      : 'Confirm the guest’s signed release form is on file before this episode can go out.',
  })

  const approved = Boolean(ep.guest_final_cut_approved)
  const stale = approved && Boolean(ep.guest_final_cut_audio_url) && ep.guest_final_cut_audio_url !== ep.audio_url
  checks.push({
    id: 'guest_final_cut',
    label: 'Guest approved final cut',
    level: approved && !stale ? 'ok' : 'block',
    detail: approved ? [ep.guest_final_cut_approved_by, when(ep.guest_final_cut_approved_at)].filter(Boolean).join(' · ') || undefined : undefined,
    fix: stale
      ? 'The audio changed after the guest approved it. Share the new version and record their approval again.'
      : 'Let the guest hear the finished episode, then record their approval.',
  })

  const reviewed = Boolean(ep.protected_words_reviewed_at)
  checks.push({
    id: 'protected_words',
    label: 'Protected words reviewed',
    level: reviewed ? 'ok' : 'block',
    detail: reviewed ? [ep.protected_words_reviewed_by, when(ep.protected_words_reviewed_at)].filter(Boolean).join(' · ') || undefined : undefined,
    fix: 'In Clean-up & safety, search the transcript for names, towns, schools and workplaces, and bleep every one that could identify someone.',
  })
  return checks
}

export function releaseBlockers(checks: ReleaseCheck[]) {
  return checks.filter((c) => c.level === 'block')
}

export function transcriptKind(text: string): 'vtt' | 'srt' | 'text' {
  const t = text.replace(/^﻿/, '').trimStart()
  if (/^WEBVTT/.test(t)) return 'vtt'
  if (/^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(t)) return 'srt'
  return 'text'
}
