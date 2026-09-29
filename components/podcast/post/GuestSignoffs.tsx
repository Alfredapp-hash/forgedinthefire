'use client'

import { useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Checkbox, Input, Select } from '@/components/studio-ui'
import { finalCutStatus } from '@/lib/podcast/safety/checklist'
import type { SafetyPatch } from '@/lib/podcast/safety/client'
import { APPROVAL_METHODS, APPROVAL_METHOD_LABEL, isApprovalMethod, todayIso, type ApprovalMethod } from '@/lib/podcast/safety/record'
import type { EpisodeSafetyFields, GuestConsentStatus } from '@/lib/studio/release'
import type { PodcastEpisode } from '@/lib/studio/types'
import { Btn, Note } from './ui'

type Props = {
  episode: PodcastEpisode & EpisodeSafetyFields
  disabled: boolean
  /** Sign-offs go through /api/admin/podcast/safety (stamped and hashed server-side). */
  signOff: (patch: SafetyPatch, label: string) => Promise<unknown>
  /** Consent recorded in the guest booth; null → only the manual confirmation counts. */
  consent?: GuestConsentStatus | null
}

/** True when the episode has a guest (named, flagged, or with booth consent). */
export function signoffsApply(episode: PodcastEpisode & EpisodeSafetyFields, consent: GuestConsentStatus | null | undefined) {
  const recorded = consent?.available ? consent : null
  const flagged = Boolean(episode.guest_review_required) || Boolean(recorded?.guestReviewRequired)
  return Boolean((episode.guest_name || '').trim()) || flagged || Boolean(recorded?.consents?.length)
}

/**
 * Guest sign-offs. Consent given in the guest booth ticks "consent on file" automatically; the
 * manual confirmation stays for a paper release. The final-cut approval records the date and
 * how the guest told us, and is pinned to the exact audio file (URL + SHA-256 fingerprint).
 */
export function GuestSignoffs({ episode, disabled, signOff, consent = null }: Props) {
  const [date, setDate] = useState(todayIso())
  const [method, setMethod] = useState<ApprovalMethod | ''>('')
  const [note, setNote] = useState('')
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)

  const recorded = consent?.available ? consent : null
  const flagged = Boolean(episode.guest_review_required) || Boolean(recorded?.guestReviewRequired)
  if (!signoffsApply(episode, consent)) return null
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
      <Note tone="block">
        Guest consent and final-cut approval can be recorded once the 20260924000002_podcast_ai_safety.sql database update is applied.
      </Note>
    )
  }
  const cut = finalCutStatus(episode)
  const cutOk = cut.approved && !cut.stale && !cut.incomplete
  const boothConsent = recorded?.hasConsent ? (recorded.consents || []).find((c) => !c.withdrawnAt) : undefined
  const consentRow = boothConsent || recorded?.hasConsent
    ? {
        label: `${guestName} gave consent in the guest booth`,
        done: true,
        auto: true,
        by: boothConsent?.referenceCode ? `Reference ${boothConsent.referenceCode}` : null,
        at: boothConsent?.acceptedAt,
      }
    : {
        label: `Signed release from ${guestName} is on file`,
        done: Boolean(episode.guest_consent_confirmed),
        auto: false,
        by: episode.guest_consent_confirmed_by,
        at: episode.guest_consent_confirmed_at,
      }

  async function recordApproval() {
    if (!isApprovalMethod(method)) return
    setBusy(true)
    try {
      await signOff({ guest_final_cut: { approved: true, on: date, method, note } }, 'Guest approval recorded')
      setTicked(false)
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    if (!window.confirm('Withdraw the guest’s approval? The episode cannot be released until it is recorded again.')) return
    setBusy(true)
    try {
      await signOff({ guest_final_cut: { approved: false } }, 'Guest approval withdrawn')
    } finally {
      setBusy(false)
    }
  }

  const off = disabled || busy
  const approvedDetail = [
    episode.guest_final_cut_approved_on || (episode.guest_final_cut_approved_at ? new Date(episode.guest_final_cut_approved_at).toLocaleDateString() : ''),
    isApprovalMethod(episode.guest_final_cut_method) ? APPROVAL_METHOD_LABEL[episode.guest_final_cut_method] : '',
    episode.guest_final_cut_approved_by ? `recorded by ${episode.guest_final_cut_approved_by}` : '',
    episode.guest_final_cut_audio_hash ? `file ${episode.guest_final_cut_audio_hash.slice(0, 12)}…` : 'file fingerprint not recorded',
  ].filter(Boolean).join(' · ')

  const Done = ({ ok }: { ok: boolean }) =>
    ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-lane-cohost-2" aria-label="Done" /> : <Circle size={16} className="mt-0.5 shrink-0 text-silver" aria-label="Not yet" />

  return (
    <div id="guest-signoffs" className="space-y-3">
      {alerts.length > 0 && (
        <ul className="space-y-1" role="status">
          {alerts.map((a) => (
            <li key={a}><Note tone="block">{a}</Note></li>
          ))}
        </ul>
      )}

      {/* Consent */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="studio-type-body flex flex-1 items-start gap-2 text-[13px] text-white">
          <Done ok={consentRow.done} />
          <span>
            {consentRow.label}
            {consentRow.done && (consentRow.by || consentRow.at) && (
              <span className="block text-[12px] text-silver">{[consentRow.by, consentRow.at && new Date(consentRow.at).toLocaleString()].filter(Boolean).join(' · ')}</span>
            )}
          </span>
        </span>
        {consentRow.auto ? (
          <span className="studio-type-body text-[12px] text-silver">Recorded automatically</span>
        ) : consentRow.done ? (
          <Btn disabled={off} onClick={() => void signOff({ guest_consent_confirmed: false }, 'Sign-off removed')}>Undo</Btn>
        ) : (
          <Btn tone="accent" disabled={off} onClick={() => window.confirm(`Confirm you have seen ${guestName}’s signed release form for this episode?`) && void signOff({ guest_consent_confirmed: true }, 'Sign-off recorded')}>
            Record
          </Btn>
        )}
      </div>

      {/* Final cut */}
      <div id="guest-approval" className="space-y-2 border-t border-divider pt-3">
        <span className="studio-type-body flex items-start gap-2 text-[13px] text-white">
          <Done ok={cutOk} />
          <span>
            {guestName} heard and approved this final cut
            {cutOk && <span className="block text-[12px] text-silver">{approvedDetail}</span>}
            {cut.stale && <span className="block text-[12px] text-ice">The audio changed after the guest approved it (they approved {episode.guest_final_cut_approved_on || 'an earlier version'}) — play them the current version and record their approval again.</span>}
            {cut.incomplete && <span className="block text-[12px] text-ice">An earlier approval has no date or method — record it again below.</span>}
          </span>
        </span>
        <p className="studio-type-body max-w-2xl text-[12px] text-silver">
          Before anything is published, the guest hears the finished episode — including how their voice sounds and what was cut — and says it is OK.
          The approval is pinned to this exact audio file; a new file needs a new approval.
        </p>
        {cutOk ? (
          <Btn tone="danger" disabled={off} onClick={() => void withdraw()}>Withdraw approval</Btn>
        ) : (
          <div className="space-y-2">
            {!episode.audio_url && <Note>Upload or make the final audio first — approval is recorded for that exact file.</Note>}
            <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
              <Input label="Date approved" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} disabled={off} />
              <Select label="How they approved" value={method} onChange={(e) => setMethod(e.target.value as ApprovalMethod)} disabled={off}>
                <option value="">Choose…</option>
                {APPROVAL_METHODS.map((m) => <option key={m} value={m}>{APPROVAL_METHOD_LABEL[m]}</option>)}
              </Select>
            </div>
            <Input label="Note (optional, private)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. asked to keep the part about their daughter out — done" disabled={off} maxLength={1000} />
            <Checkbox
              label={`${guestName} heard this final version and agreed to it being published.`}
              checked={ticked}
              onChange={(e) => setTicked(e.target.checked)}
              disabled={off || !episode.audio_url}
            />
            <Btn tone="primary" loading={busy} disabled={off || !ticked || !date || !method || !episode.audio_url} onClick={() => void recordApproval()}>
              Record guest approval
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}
