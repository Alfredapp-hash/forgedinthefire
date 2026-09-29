/**
 * Server-side content filter for live chat / Q&A.
 *
 * Survivor safety first: the audience may include a survivor's abuser, and a guest may be a
 * survivor. Anything that could locate or identify a person is BLOCKED before it is stored:
 * phone numbers, email addresses, street addresses, URLs, social handles, and phrases that
 * try to attach a real identity to someone ("her real name is …", "she lives at …").
 * Profanity is blocked too. A second, softer list only FLAGS a message for the host
 * (self-harm language, shouting) so they can respond with care.
 *
 * Pure functions, no I/O — see tests/unit/live-chat/moderation.test.ts.
 */

export const CHAT_MAX_BODY = 280
export const CHAT_MAX_NAME = 24
export const CHAT_MIN_NAME = 2

export type BlockReason = 'phone' | 'email' | 'url' | 'address' | 'identity' | 'handle' | 'profanity' | 'empty'

export type ModerationResult =
  | { ok: true; body: string; flagged: boolean; flagReason: string | null }
  | { ok: false; reason: BlockReason; message: string }

const BLOCK_MESSAGES: Record<BlockReason, string> = {
  phone: 'Please do not share phone numbers in the chat.',
  email: 'Please do not share email addresses in the chat.',
  url: 'Links and website addresses are not allowed in the chat.',
  address: 'Please do not share street addresses or locations in the chat.',
  identity: 'Please do not share anyone’s name, location, workplace or other identifying details.',
  handle: 'Social media handles are not allowed in the chat.',
  profanity: 'Let’s keep the chat respectful.',
  empty: 'Write a message first.',
}

/** Collapse look-alikes so "j0hn@g mail . com" and "p h o n e" style evasions are still caught. */
export function normalizeForMatch(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Digits-only view for phone detection ("(614) 555-0100", "614.555.0100", "614 555 0100", "+1 614…"). */
const PHONE_CANDIDATE = /(?:\+?\d[\d\s().-]{7,}\d)/g
/** Spelled-out digits: "six one four five five five …" (7+ number words in a row). */
const PHONE_WORDS =
  /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s-]*){7,}\b/i

/** The National Human Trafficking Hotline (call / text) may always be shared. */
const SAFE_NUMBERS = ['18883737888', '8883737888', '233733']

export function looksLikePhone(text: string) {
  const t = normalizeForMatch(text)
    // Dates and times are not phone numbers.
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, ' ')
  for (const m of t.match(PHONE_CANDIDATE) || []) {
    const digits = m.replace(/\D/g, '')
    if (SAFE_NUMBERS.includes(digits)) continue
    if (digits.length >= 10 && digits.length <= 15) return true
  }
  return PHONE_WORDS.test(t)
}

const EMAIL = /[\w.+-]+\s?(?:@|\(at\)|\[at\])\s?[\w-]+\s?(?:\.|\(dot\)|\[dot\])\s?[a-z]{2,}/i

export function looksLikeEmail(text: string) {
  return EMAIL.test(normalizeForMatch(text))
}

const URL_SCHEME = /\b(?:https?:\/\/|ftp:\/\/|www\.)/i
const URL_TLD =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|us|uk|me|gov|edu|info|biz|ly|app|tv|live|xyz|site|online|link|gg|to|fm|social)\b(?:\/\S*)?/i

export function looksLikeUrl(text: string) {
  const t = normalizeForMatch(text)
  if (URL_SCHEME.test(t)) return true
  // "forgedinthefireohio.org" style bare domains, but not "e.g." / "a.m." / ellipses "wait... com".
  return URL_TLD.test(t.replace(/\.{2,}/g, ' '))
}

const STREET_SUFFIX =
  '(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|circle|cir|highway|hwy|route|rte|trail|trl|parkway|pkwy|terrace|ter|square|sq|loop|alley|aly|pike|turnpike|expressway|expy)'
const STREET = new RegExp(`\\b\\d{1,6}[a-z]?\\s+(?:[a-z0-9.'-]+\\s){0,4}?${STREET_SUFFIX}\\b\\.?`, 'i')
const PO_BOX = /\bp\.?\s?o\.?\s?box\s*#?\s*\d+/i
const UNIT = /\b(?:apt|apartment|suite|ste|unit|room|rm)\s*#?\s*\d+[a-z]?\b/i
/** "Columbus, OH 43215" / "OH 43215-1234". A bare 5-digit number alone is not enough. */
const STATE_ZIP = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/
const CROSS_STREETS = new RegExp(`\\b${STREET_SUFFIX}\\s+(?:and|&)\\s+(?:[a-z0-9.'-]+\\s){1,3}?${STREET_SUFFIX}\\b`, 'i')

export function looksLikeAddress(text: string) {
  const t = normalizeForMatch(text)
  return STREET.test(t) || PO_BOX.test(t) || UNIT.test(t) || STATE_ZIP.test(t) || CROSS_STREETS.test(t)
}

/** Attempts to attach a real identity or location to a person. */
const IDENTITY_PHRASES = [
  /\b(?:real|actual|legal|birth|maiden|full|true)\s+name\b/i,
  /\b(?:his|her|their|your|the (?:guest|host)'?s?|(?:guest|host)'?s)\s+(?:name|address|number|phone|email|employer|workplace|school|car|plate|license|licence|apartment|house|street|neighbou?rhood|town|city|kids?|children|daughter|son|husband|wife|partner|boyfriend|girlfriend)\s+(?:is|was|=|:)\b/i,
  /\bname(?:'s| is|:)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/,
  /\bi know (?:who|where) (?:she|he|they|you|the guest|the host) (?:is|are|live|lives|work|works|go|goes)\b/i,
  /\b(?:she|he|they|you|the guest|the host)\s+(?:lives?|stays?|works?|studies|studys|teaches|goes to (?:school|college|church))\s+(?:at|in|on|near|by|off)\b/i,
  /\blicen[cs]e plate\b/i,
  /\b(?:social security|ssn|passport|driver'?s? licen[cs]e|date of birth|dob)\b/i,
  /\bdox+(?:ed|ing|x)?\b/i,
  /\b(?:this|that) is (?:really|actually)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/,
]

export function looksLikeIdentityLeak(text: string) {
  const t = normalizeForMatch(text)
  return IDENTITY_PHRASES.some((re) => re.test(t))
}

/** "@someone" style handles (an @ at word start followed by 3+ handle chars); "e-mail" is caught earlier. */
const HANDLE = /(?:^|[\s(])@[a-z0-9_.]{3,}/i
const HANDLE_WORDS = /\b(?:my|her|his|their|the)\s+(?:insta|instagram|ig|snap|snapchat|tiktok|twitter|x|facebook|fb|telegram|discord|venmo|cashapp|cash app|onlyfans)\s*(?:is|:|handle|username|@)/i

export function looksLikeHandle(text: string) {
  const t = normalizeForMatch(text)
  return HANDLE.test(t) || HANDLE_WORDS.test(t)
}

/**
 * Short, word-boundary profanity + slur list. Intentionally conservative: the point is to keep
 * a survivor-centred room civil, not to catch every rude word. Leet/spacing variants are
 * normalised first. Extend via CHAT_EXTRA_BLOCKLIST (comma separated) on the server.
 */
const PROFANITY_BASE = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'asshole', 'bitch', 'bitches',
  'cunt', 'dick', 'dickhead', 'pussy', 'slut', 'whore', 'skank', 'twat', 'wanker', 'bastard', 'cock',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny', 'kike', 'spic', 'chink', 'wetback',
  'rape', 'raped', 'rapist',
]

function leetNormalize(text: string) {
  return normalizeForMatch(text)
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z\s]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')
}

function compileList(words: string[]) {
  const escaped = words.map((w) => w.trim().toLowerCase()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!escaped.length) return null
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i')
}

export function containsProfanity(text: string, extra: string[] = []) {
  const re = compileList([...PROFANITY_BASE, ...extra])
  if (!re) return false
  const norm = leetNormalize(text)
  // Check with and without spaces removed inside words ("f u c k").
  return re.test(norm) || re.test(norm.replace(/\b(\w)\s(?=\w\b)/g, '$1'))
}

/** Softer list: never blocked, but the host sees a flag so they can respond with care. */
const FLAG_SENSITIVE = /\b(?:suicid\w*|kill (?:my|him|her|them)self|self[- ]?harm|end (?:it all|my life)|want to die|overdose)\b/i

export function flagReasonFor(text: string): string | null {
  const t = normalizeForMatch(text)
  if (FLAG_SENSITIVE.test(t)) return 'mentions self-harm — consider replying with the hotline'
  const letters = t.replace(/[^a-z]/gi, '')
  if (letters.length >= 12 && letters === letters.toUpperCase()) return 'shouting (all caps)'
  return null
}

export type ModerationOptions = { extraBlocklist?: string[] }

/** Run every check in priority order. Returns the trimmed body when it may be stored. */
export function moderateChatBody(raw: string, opts: ModerationOptions = {}): ModerationResult {
  const body = normalizeForMatch(String(raw ?? '')).slice(0, CHAT_MAX_BODY)
  if (!body) return { ok: false, reason: 'empty', message: BLOCK_MESSAGES.empty }
  const reason = blockReasonFor(body, opts)
  if (reason) return { ok: false, reason, message: BLOCK_MESSAGES[reason] }
  const flagReason = flagReasonFor(body)
  return { ok: true, body, flagged: Boolean(flagReason), flagReason }
}

export function blockReasonFor(text: string, opts: ModerationOptions = {}): BlockReason | null {
  if (looksLikeEmail(text)) return 'email'
  if (looksLikePhone(text)) return 'phone'
  if (looksLikeUrl(text)) return 'url'
  if (looksLikeAddress(text)) return 'address'
  if (looksLikeIdentityLeak(text)) return 'identity'
  if (looksLikeHandle(text)) return 'handle'
  if (containsProfanity(text, opts.extraBlocklist)) return 'profanity'
  return null
}

const RESERVED_NAMES = /^(?:host|admin|administrator|mod|moderator|staff|forged in the fire|fitf|official|support|system)$/i

/** Display names: short, plain characters, not impersonating staff, and pass the same filters. */
export function validateDisplayName(raw: string, opts: ModerationOptions = {}): { ok: true; name: string } | { ok: false; message: string } {
  const name = normalizeForMatch(String(raw ?? '')).replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim()
  if (name.length < CHAT_MIN_NAME) return { ok: false, message: `Pick a display name (${CHAT_MIN_NAME}–${CHAT_MAX_NAME} characters).` }
  if (name.length > CHAT_MAX_NAME) return { ok: false, message: `Display names are at most ${CHAT_MAX_NAME} characters.` }
  if (RESERVED_NAMES.test(name)) return { ok: false, message: 'That name is reserved for the show team.' }
  const reason = blockReasonFor(name, opts)
  if (reason) return { ok: false, message: 'Please choose a different display name (no links, numbers or contact details).' }
  return { ok: true, name }
}

/** The retry-after for a fixed-window limiter: seconds left in the current window. */
export function secondsUntilWindowEnds(windowSeconds: number, nowMs = Date.now()) {
  const w = Math.max(1, Math.floor(windowSeconds))
  const elapsed = Math.floor(nowMs / 1000) % w
  return w - elapsed
}

/** Base send rate: one message per 5 s per viewer; slow mode raises the window. */
export const CHAT_BASE_WINDOW_SEC = 5

export function chatRateRule(slowModeSec: number) {
  const slow = Number.isFinite(slowModeSec) ? Math.max(0, Math.min(600, Math.floor(slowModeSec))) : 0
  return { windowSec: Math.max(CHAT_BASE_WINDOW_SEC, slow), max: 1 }
}
