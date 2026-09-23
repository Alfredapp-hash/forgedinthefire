import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import type { GuestConsentStatus } from '@/lib/studio/release'
import {
  CONSENT_VERSION,
  consentCanonicalText,
  guestReferenceCode,
  normalizeConsentChoices,
  type ConsentChoices,
} from '@/lib/podcast/guest/consent-text'

export { CONSENT_VERSION, guestReferenceCode, type ConsentChoices }

/** Versions this server can still verify (hash of the exact text the guest saw). */
const KNOWN_VERSIONS: Record<string, string> = {
  [CONSENT_VERSION]: createHash('sha256').update(consentCanonicalText(), 'utf8').digest('hex'),
}

export function consentTextHash(version: string) {
  return KNOWN_VERSIONS[version] || null
}

/** One row of podcast_consents, as returned to admins and the release checklist. */
export type ConsentRecord = {
  id: string
  inviteId: string | null
  episodeId: string
  referenceCode: string | null
  consentVersion: string
  consentTextHash: string
  choices: ConsentChoices
  acceptedAt: string
  withdrawnAt: string | null
  withdrawReason: string | null
}

/**
 * Release-checklist view of an episode's guest consent.
 *
 * Shape (stable contract for Stream D):
 * {
 *   episodeId: string
 *   guestReviewRequired: boolean     // podcast_episodes.guest_review_required
 *   hasConsent: boolean              // at least one guest accepted (and it is not withdrawn)
 *   anyWithdrawn: boolean            // any guest withdrew -> block publishing
 *   needsGuestApproval: boolean      // latest active choice has may_publish=false -> guest must hear final cut
 *   requirements: {                  // union over active (not withdrawn) guests' latest records
 *     voiceAltered: boolean, faceBlurred: boolean, firstNameOnly: boolean, audioOnly: boolean
 *   }
 *   consents: ConsentRecord[]        // latest record per invite, newest first (withdrawn included)
 *   history: ConsentRecord[]         // every row, newest first
 * }
 *
 * Returns `available: false` (and empty lists) when the v2 migration is not applied.
 */
export type EpisodeConsentSummary = {
  available: boolean
  episodeId: string
  guestReviewRequired: boolean
  hasConsent: boolean
  anyWithdrawn: boolean
  needsGuestApproval: boolean
  requirements: { voiceAltered: boolean; faceBlurred: boolean; firstNameOnly: boolean; audioOnly: boolean }
  consents: ConsentRecord[]
  history: ConsentRecord[]
}

type ConsentRow = {
  id: string
  invite_id: string | null
  episode_id: string
  consent_version: string
  consent_text_hash: string
  choices: unknown
  accepted_at: string
  withdrawn_at: string | null
  withdraw_reason: string | null
}

function toRecord(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    inviteId: row.invite_id,
    episodeId: row.episode_id,
    referenceCode: row.invite_id ? guestReferenceCode(row.invite_id) : null,
    consentVersion: row.consent_version,
    consentTextHash: row.consent_text_hash,
    choices: normalizeConsentChoices(row.choices),
    acceptedAt: row.accepted_at,
    withdrawnAt: row.withdrawn_at,
    withdrawReason: row.withdraw_reason,
  }
}

/** Postgres "relation does not exist" / PostgREST schema-cache miss: migration not applied. */
export function isMissingTable(err: unknown) {
  const e = err as { code?: string; message?: string } | null
  return Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || '')))
}

export function hashConsentIp(ip: string) {
  const salt = process.env.CONSENT_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) || 'fitf-consent'
  return createHash('sha256').update(`${salt}:${ip}`, 'utf8').digest('hex').slice(0, 40)
}

/** Insert one consent row for a booth join. Returns null when the table does not exist yet. */
export async function recordGuestConsent(
  supabase: SupabaseClient,
  input: { inviteId: string; episodeId: string; version: string; choices: unknown; ip: string },
) {
  const hash = consentTextHash(input.version)
  if (!hash) throw new ConsentVersionError()
  const { data, error } = await supabase
    .from('podcast_consents')
    .insert({
      invite_id: input.inviteId,
      episode_id: input.episodeId,
      consent_version: input.version,
      consent_text_hash: hash,
      choices: normalizeConsentChoices(input.choices),
      ip_hash: hashConsentIp(input.ip),
    })
    .select('*')
    .single()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return toRecord(data as ConsentRow)
}

export class ConsentVersionError extends Error {
  constructor() {
    super('This consent screen is out of date. Please reload the page.')
  }
}

export async function getInviteConsents(inviteId: string, supabase: SupabaseClient = createServiceClient()) {
  const { data, error } = await supabase
    .from('podcast_consents')
    .select('*')
    .eq('invite_id', inviteId)
    .order('accepted_at', { ascending: false })
    .limit(50)
  if (error) {
    if (isMissingTable(error)) return { available: false, consents: [] as ConsentRecord[] }
    throw error
  }
  return { available: true, consents: ((data || []) as ConsentRow[]).map(toRecord) }
}

/** See EpisodeConsentSummary for the contract. Server only (service role). */
export async function getEpisodeConsents(
  episodeId: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<EpisodeConsentSummary> {
  const empty: EpisodeConsentSummary = {
    available: false,
    episodeId,
    guestReviewRequired: false,
    hasConsent: false,
    anyWithdrawn: false,
    needsGuestApproval: false,
    requirements: { voiceAltered: false, faceBlurred: false, firstNameOnly: false, audioOnly: false },
    consents: [],
    history: [],
  }
  const { data, error } = await supabase
    .from('podcast_consents')
    .select('*')
    .eq('episode_id', episodeId)
    .order('accepted_at', { ascending: false })
    .limit(200)
  if (error) {
    if (isMissingTable(error)) return empty
    throw error
  }
  const { data: episode } = await supabase
    .from('podcast_episodes')
    .select('guest_review_required')
    .eq('id', episodeId)
    .maybeSingle()

  const history = ((data || []) as ConsentRow[]).map(toRecord)
  const latest = new Map<string, ConsentRecord>()
  for (const rec of history) {
    const key = rec.inviteId || rec.id
    if (!latest.has(key)) latest.set(key, rec)
  }
  const consents = [...latest.values()]
  const active = consents.filter((c) => !c.withdrawnAt)
  const anyWithdrawn = history.some((c) => Boolean(c.withdrawnAt))
  return {
    available: true,
    episodeId,
    guestReviewRequired: Boolean((episode as { guest_review_required?: boolean } | null)?.guest_review_required),
    hasConsent: active.length > 0,
    anyWithdrawn,
    needsGuestApproval: active.some((c) => !c.choices.may_publish),
    requirements: {
      voiceAltered: active.some((c) => c.choices.voice_altered),
      faceBlurred: active.some((c) => c.choices.face_blurred),
      firstNameOnly: active.some((c) => c.choices.first_name_only),
      audioOnly: active.some((c) => c.choices.audio_only),
    },
    consents,
    history,
  }
}

/**
 * Guest withdrawal: mark every open consent row for the invite withdrawn and
 * flag the episode for review. Works even when no consent row exists (older
 * joins) — the episode flag is what blocks release.
 */
export async function withdrawGuestConsent(
  supabase: SupabaseClient,
  input: { inviteId: string; episodeId: string; reason: string | null },
) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('podcast_consents')
    .update({ withdrawn_at: now, withdraw_reason: input.reason })
    .eq('invite_id', input.inviteId)
    .is('withdrawn_at', null)
  if (error && !isMissingTable(error)) throw error
  const { error: epErr } = await supabase
    .from('podcast_episodes')
    .update({ guest_review_required: true })
    .eq('id', input.episodeId)
  if (epErr && !isMissingTable(epErr) && !/guest_review_required/.test(epErr.message || '')) throw epErr
  return { withdrawnAt: now, referenceCode: guestReferenceCode(input.inviteId) }
}

/**
 * Release-checklist view without personal detail (no choices text, reasons or history): what the
 * editor, the live room and the release gates need.
 */
export function consentStatusForRelease(summary: EpisodeConsentSummary): GuestConsentStatus {
  return {
    available: summary.available,
    guestReviewRequired: summary.guestReviewRequired,
    hasConsent: summary.hasConsent,
    anyWithdrawn: summary.anyWithdrawn,
    needsGuestApproval: summary.needsGuestApproval,
    requirements: summary.requirements,
    consents: summary.consents.map((c) => ({
      referenceCode: c.referenceCode,
      acceptedAt: c.acceptedAt,
      withdrawnAt: c.withdrawnAt,
    })),
  }
}

/** Server release gates: consent status for an episode (throws on a database error — fail closed). */
export async function releaseConsentStatus(episodeId: string, supabase?: SupabaseClient) {
  return consentStatusForRelease(await getEpisodeConsents(episodeId, supabase))
}
