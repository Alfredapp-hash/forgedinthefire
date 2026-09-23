'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import type { EpisodeSafetyFields, GuestConsentStatus } from '@/lib/studio/release'
import type { PodcastEpisode } from '@/lib/studio/types'
import { Btn } from './ui'

type Props = {
  episode: PodcastEpisode & EpisodeSafetyFields
  disabled: boolean
  save: (patch: Record<string, unknown>, label?: string) => Promise<unknown>
  /** Consent recorded in the guest booth; null → only the manual confirmation counts. */
  consent?: GuestConsentStatus | null
}

/**
 * Guest sign-offs. Consent given in the guest booth ticks "consent on file" automatically; the
 * manual confirmation stays for a paper release. Withdrawals and review flags are shown first.
 */
export function GuestSignoffs({ episode, disabled, save, consent = null }: Props) {
  const recorded = consent?.available ? consent : null
  const flagged = Boolean(episode.guest_review_required) || Boolean(recorded?.guestReviewRequired)
  const hasGuest = Boolean((episode.guest_name || '').trim()) || flagged || Boolean(recorded?.consents?.length)
  if (!hasGuest) return null
  const guestName = (episode.guest_name || '').trim() || 'The guest'
  const alerts = [
    recorded?.anyWithdrawn && 'A guest withdrew consent. Do not release this episode — talk to the guest and your safeguarding lead first.',
    flagged && !recorded?.anyWithdrawn && 'This episode is flagged for guest review.',
    recorded?.needsGuestApproval && 'The guest asked to hear the finished episode before it goes out.',
    recorded?.requirements?.voiceAltered && 'The guest asked for their voice to be disguised.',
    recorded?.requirements?.faceBlurred && 'The guest asked for their face to be blurred in any video.',
    recorded?.requirements?.firstNameOnly && 'Use the guest’s first name only.',
    recorded?.requirements?.audioOnly && 'Audio only — do not publish the guest’s video.',
  ].filter((a): a is string => Boolean(a))
  if (!('guest_final_cut_approved' in episode)) {
    return (
      <p className="rounded-lg border border-[#FFB86B]/40 bg-[#FFB86B]/10 px-3 py-2 text-xs text-[#FFE0B8]">
        Guest consent and final-cut approval can be recorded once the 20260924000002_podcast_ai_safety.sql database update is applied.
      </p>
    )
  }
  const stale = Boolean(episode.guest_final_cut_approved && episode.guest_final_cut_audio_url && episode.guest_final_cut_audio_url !== episode.audio_url)
  const boothConsent = recorded?.hasConsent ? (recorded.consents || []).find((c) => !c.withdrawnAt) : undefined
  const rows: { key: string; label: string; done: boolean; auto?: boolean; by?: string | null; at?: string | null; confirm: string; field: string; note?: string }[] = [
    boothConsent || recorded?.hasConsent
      ? {
          key: 'consent',
          label: `${guestName} gave consent in the guest booth`,
          done: true,
          auto: true,
          by: boothConsent?.referenceCode ? `Reference ${boothConsent.referenceCode}` : null,
          at: boothConsent?.acceptedAt,
          field: 'guest_consent_confirmed',
          confirm: '',
        }
      : {
          key: 'consent',
          label: `Signed release from ${guestName} is on file`,
          done: Boolean(episode.guest_consent_confirmed),
          by: episode.guest_consent_confirmed_by,
          at: episode.guest_consent_confirmed_at,
          field: 'guest_consent_confirmed',
          confirm: `Confirm you have seen ${guestName}’s signed release form for this episode?`,
        },
    {
      key: 'cut',
      label: `${guestName} heard and approved this final cut`,
      done: Boolean(episode.guest_final_cut_approved) && !stale,
      by: episode.guest_final_cut_approved_by,
      at: episode.guest_final_cut_approved_at,
      field: 'guest_final_cut_approved',
      confirm: `Confirm ${guestName} listened to the current audio and approved it? If the audio changes later you will need to ask again.`,
      note: stale ? 'The audio changed after approval — ask again.' : undefined,
    },
  ]
  return (
    <div id="guest-signoffs" className="rounded-xl border border-[#27313B] bg-[#05070A] p-4 space-y-2">
      <p className="text-sm font-semibold text-[#F6FAFC]">Guest sign-offs</p>
      {alerts.length > 0 && (
        <ul className="space-y-1" role="status">
          {alerts.map((a) => (
            <li key={a} className="rounded-lg border border-[#FFB86B]/40 bg-[#FFB86B]/10 px-3 py-1.5 text-xs text-[#FFE0B8]">
              {a}
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="flex flex-1 items-start gap-2 text-sm text-[#F6FAFC]">
              {r.done ? <CheckCircle2 size={16} className="mt-0.5 text-[#53D6FF]" aria-label="Done" /> : <Circle size={16} className="mt-0.5 text-[#A9B8C6]" aria-label="Not yet" />}
              <span>
                {r.label}
                {r.done && (r.by || r.at) && <span className="block text-xs text-[#A9B8C6]">{[r.by, r.at && new Date(r.at).toLocaleString()].filter(Boolean).join(' · ')}</span>}
                {r.note && <span className="block text-xs text-[#FFB86B]">{r.note}</span>}
              </span>
            </span>
            {r.auto ? (
              <span className="text-xs text-[#A9B8C6]">Recorded automatically</span>
            ) : r.done ? (
              <Btn disabled={disabled} onClick={() => void save({ [r.field]: false }, 'Sign-off removed')}>Undo</Btn>
            ) : (
              <Btn tone="accent" disabled={disabled || (r.key === 'cut' && !episode.audio_url)} onClick={() => window.confirm(r.confirm) && void save({ [r.field]: true }, 'Sign-off recorded')}>
                Record
              </Btn>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
