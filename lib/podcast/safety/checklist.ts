/**
 * Survivor-safety items of the pre-publish checklist, built from the episode row alone so the
 * server can enforce them (lib/studio/release.ts → guestSafetyChecks / releaseChecks). Pure.
 *
 *  - "Guest approved the final cut": date + how they told us, pinned to the exact audio file
 *    (URL, plus a SHA-256 fingerprint recorded at approval time).
 *  - "Protected terms reviewed": someone searched the transcript for names/places and decided
 *    every hit (or attested there is nothing to bleep).
 *  - "Transcript reviewed": someone read the final transcript; any later edit needs a re-read.
 */
import { APPROVAL_METHOD_LABEL, isApprovalMethod, textHash } from './record'

type Level = 'ok' | 'warn' | 'block'
export type SafetyCheck = { id: string; label: string; level: Level; fix?: string; detail?: string }

/** Columns from 20260924000002_podcast_ai_safety.sql. Optional: absent before the migration runs. */
export type SafetyColumns = {
  audio_url?: string | null
  transcript?: string | null
  protected_words_reviewed_at?: string | null
  protected_words_reviewed_by?: string | null
  guest_final_cut_approved?: boolean | null
  guest_final_cut_approved_by?: string | null
  guest_final_cut_approved_at?: string | null
  guest_final_cut_audio_url?: string | null
  guest_final_cut_approved_on?: string | null
  guest_final_cut_method?: string | null
  guest_final_cut_note?: string | null
  guest_final_cut_audio_hash?: string | null
  /** SHA-256 of the current audio file when known (recorded alongside an approval). */
  audio_sha256?: string | null
  transcript_reviewed_at?: string | null
  transcript_reviewed_by?: string | null
  transcript_reviewed_hash?: string | null
}

const has = (ep: object, key: string) => key in ep

export function when(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export type FinalCutStatus = {
  approved: boolean
  /** Approval exists but describes a different audio file (URL or fingerprint changed). */
  stale: boolean
  /** The row has the date/method columns (migration applied) but the approval lacks them. */
  incomplete: boolean
}

export function finalCutStatus(ep: SafetyColumns): FinalCutStatus {
  const approved = Boolean(ep.guest_final_cut_approved)
  const urlStale = approved && Boolean(ep.guest_final_cut_audio_url) && ep.guest_final_cut_audio_url !== (ep.audio_url ?? null)
  const hashStale =
    approved &&
    Boolean(ep.guest_final_cut_audio_hash) &&
    Boolean(ep.audio_sha256) &&
    ep.guest_final_cut_audio_hash !== ep.audio_sha256
  const detailed = has(ep, 'guest_final_cut_approved_on') || has(ep, 'guest_final_cut_method')
  const incomplete = approved && detailed && !(ep.guest_final_cut_approved_on && isApprovalMethod(ep.guest_final_cut_method))
  return { approved, stale: urlStale || hashStale, incomplete }
}

export function finalCutCheck(ep: SafetyColumns, opts: { needsGuestApproval?: boolean } = {}): SafetyCheck {
  const st = finalCutStatus(ep)
  const ok = st.approved && !st.stale && !st.incomplete
  const method = isApprovalMethod(ep.guest_final_cut_method) ? APPROVAL_METHOD_LABEL[ep.guest_final_cut_method] : null
  const detail = ok
    ? [ep.guest_final_cut_approved_by, ep.guest_final_cut_approved_on || when(ep.guest_final_cut_approved_at), method, ep.guest_final_cut_audio_hash ? `file ${ep.guest_final_cut_audio_hash.slice(0, 8)}…` : null]
        .filter(Boolean)
        .join(' · ') || undefined
    : opts.needsGuestApproval
      ? 'guest asked to approve first'
      : undefined
  return {
    id: 'guest_final_cut',
    label: 'Guest approved the final cut',
    level: ok ? 'ok' : 'block',
    detail,
    fix: st.stale
      ? 'The audio changed after the guest approved it. Share the new version and record their approval again.'
      : st.incomplete
        ? 'Add the date the guest approved and how they told you (in Guest sign-offs).'
        : opts.needsGuestApproval
          ? 'The guest asked to hear the episode before it goes out. Share the finished audio and record their approval with the date and how they told you.'
          : 'Let the guest hear the finished episode, then record their approval with the date and how they told you.',
  }
}

export function protectedWordsCheck(ep: SafetyColumns): SafetyCheck {
  const reviewed = Boolean(ep.protected_words_reviewed_at)
  return {
    id: 'protected_words',
    label: 'Protected terms reviewed',
    level: reviewed ? 'ok' : 'block',
    detail: reviewed ? [ep.protected_words_reviewed_by, when(ep.protected_words_reviewed_at)].filter(Boolean).join(' · ') || undefined : undefined,
    fix: 'In Clean-up & safety, list the guest’s real name, towns, schools and workplaces, search the transcript, and bleep every mention that could identify someone.',
  }
}

export type TranscriptReviewStatus = 'no_transcript' | 'unreviewed' | 'changed' | 'reviewed' | 'unsupported'

export function transcriptReviewStatus(ep: SafetyColumns): TranscriptReviewStatus {
  const text = (ep.transcript || '').trim()
  if (!text) return 'no_transcript'
  if (!has(ep, 'transcript_reviewed_hash')) return 'unsupported'
  if (!ep.transcript_reviewed_hash) return 'unreviewed'
  return ep.transcript_reviewed_hash === textHash(text) ? 'reviewed' : 'changed'
}

/**
 * Reading the transcript is how names the search missed get caught. Blocks release for guest
 * episodes; a warning for host-only ones. Before the migration there is nowhere to record it.
 */
export function transcriptReviewCheck(ep: SafetyColumns, hasGuest: boolean): SafetyCheck | null {
  const st = transcriptReviewStatus(ep)
  if (st === 'unsupported') return null
  const strict = hasGuest ? 'block' : 'warn'
  if (st === 'no_transcript') {
    return {
      id: 'transcript_review',
      label: 'Transcript reviewed',
      level: 'warn',
      detail: 'no transcript',
      fix: 'Without a transcript, names and details can only be caught by listening. Transcribing is free and stays on this computer.',
    }
  }
  if (st === 'reviewed') {
    return {
      id: 'transcript_review',
      label: 'Transcript reviewed',
      level: 'ok',
      detail: [ep.transcript_reviewed_by, when(ep.transcript_reviewed_at)].filter(Boolean).join(' · ') || undefined,
    }
  }
  return {
    id: 'transcript_review',
    label: 'Transcript reviewed',
    level: strict,
    detail: st === 'changed' ? 'changed since review' : undefined,
    fix:
      st === 'changed'
        ? 'The transcript changed after it was reviewed. Read it through again and press “Mark transcript reviewed”.'
        : 'Read the transcript once for anything that could identify the guest, then press “Mark transcript reviewed” in Clean-up & safety.',
  }
}
