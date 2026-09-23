/**
 * Guest consent v2 — the exact words the guest reads, and the choices they make.
 * Client-safe (no node imports). The server hashes CONSENT_POINTS for the
 * record (lib/podcast/guest-consent.ts), so changing any wording below MUST
 * bump CONSENT_VERSION.
 */

export const CONSENT_VERSION = '2026-09-24.v2'

export const CONSENT_POINTS: readonly { title: string; body: string }[] = [
  {
    title: 'Who is recording',
    body: 'The Forged in the Fire host who sent you this link. Only the host can start or stop recording. You will see a clear “Recording” sign when it is on.',
  },
  {
    title: 'What happens to it',
    body: 'The conversation is recorded. It may be edited and published as a public podcast episode, following the choices you make below.',
  },
  {
    title: 'You choose what to share',
    body: 'A first name or a nickname is fine. You do not have to answer every question. You can ask for a pause at any time, or ask the host to leave something out.',
  },
  {
    title: 'Your microphone and camera',
    body: 'Your microphone turns on only after you press Join. Your camera stays off unless you choose it and turn it on yourself.',
  },
  {
    title: 'Your backup copy',
    body: 'While recording, a backup of your audio (and camera, if on) is saved in this browser tab and sent privately to the host only.',
  },
  {
    title: 'You can leave, and you can change your mind',
    body: 'You can leave at any time with the Leave button. After the recording you can still ask us to remove it.',
  },
]

/** Stored as podcast_consents.choices. All booleans; see getEpisodeConsents() docs for meaning. */
export type ConsentChoices = {
  /** Guest joins without camera. */
  audio_only: boolean
  /** Voice must be altered (pitch/formant) before publishing. */
  voice_altered: boolean
  /** Face must be blurred in any published video. */
  face_blurred: boolean
  /** Credit/refer to the guest by first name (or nickname) only. */
  first_name_only: boolean
  /**
   * true  = the episode may be published without the guest hearing it first.
   * false = the guest asked to hear the final cut before it is published (release must wait for sign-off).
   */
  may_publish: boolean
}

export const DEFAULT_CONSENT_CHOICES: ConsentChoices = {
  audio_only: true,
  voice_altered: false,
  face_blurred: false,
  first_name_only: true,
  may_publish: true,
}

export function normalizeConsentChoices(raw: unknown): ConsentChoices {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const b = (key: keyof ConsentChoices) =>
    typeof v[key] === 'boolean' ? (v[key] as boolean) : DEFAULT_CONSENT_CHOICES[key]
  return {
    audio_only: b('audio_only'),
    voice_altered: b('voice_altered'),
    face_blurred: b('face_blurred'),
    first_name_only: b('first_name_only'),
    may_publish: b('may_publish'),
  }
}

/** Canonical text that is hashed into podcast_consents.consent_text_hash. */
export function consentCanonicalText() {
  return [`version:${CONSENT_VERSION}`, ...CONSENT_POINTS.map((p) => `${p.title}\n${p.body}`)].join('\n\n')
}

/**
 * Short reference code for a booth visit (e.g. "FITF-7K2Q-9MXD"). Shown to the
 * guest after leaving and to the host in the panel, so a removal request by
 * email can be matched without the guest's name. Not a secret, not reversible.
 */
export function guestReferenceCode(inviteId: string) {
  let h1 = 2166136261
  let h2 = 5381
  for (let i = 0; i < inviteId.length; i++) {
    const c = inviteId.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = (Math.imul(h2, 33) + c) | 0
  }
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const part = (n: number) => {
    let x = n >>> 0
    let out = ''
    for (let i = 0; i < 4; i++) {
      out += alphabet[x % 32]
      x = Math.floor(x / 32)
    }
    return out
  }
  return `FITF-${part(h1)}-${part(h2)}`
}
