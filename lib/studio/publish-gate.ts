import type { PodcastEpisode } from '@/lib/studio/types'

export type PublishIssue = { field: string; message: string }

const TARGET_LUFS = -16
const LUFS_TOLERANCE = 2.5

export function episodePublishIssues(ep: Partial<PodcastEpisode> & Record<string, unknown>): PublishIssue[] {
  const issues: PublishIssue[] = []
  if (!String(ep.title || '').trim()) issues.push({ field: 'title', message: 'Title is required' })
  if (!String(ep.summary || '').trim()) issues.push({ field: 'summary', message: 'Summary is required for directories' })
  if (!ep.audio_url) issues.push({ field: 'audio_url', message: 'Upload or mix audio before publishing' })
  if (!ep.file_size || Number(ep.file_size) < 1) {
    issues.push({ field: 'file_size', message: 'Audio is missing file size (Apple enclosure length)' })
  }
  if (!ep.duration_seconds || Number(ep.duration_seconds) < 1) {
    issues.push({ field: 'duration_seconds', message: 'Duration must be measured' })
  }
  if (!ep.cover_url) {
    issues.push({ field: 'cover_url', message: 'Add square cover art (Apple ≥1400px; aim 3000×3000)' })
  }
  if (ep.episode_number == null) {
    issues.push({ field: 'episode_number', message: 'Episode number is required' })
  }
  if (!ep.consent_confirmed) {
    issues.push({ field: 'consent_confirmed', message: 'Confirm survivor consent / no identifying details before publish' })
  }
  const lufs = ep.lufs_integrated == null ? null : Number(ep.lufs_integrated)
  if (lufs != null && Number.isFinite(lufs) && Math.abs(lufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    issues.push({
      field: 'lufs_integrated',
      message: `Loudness is ${lufs.toFixed(1)} LUFS; remix toward −16 LUFS (±${LUFS_TOLERANCE})`,
    })
  }
  if (ep.status === 'scheduled' && !ep.scheduled_for) {
    issues.push({ field: 'scheduled_for', message: 'Set a schedule time before scheduling' })
  }
  return issues
}

export function formatPublishIssues(issues: PublishIssue[]) {
  return issues.map((i) => i.message).join('; ')
}
