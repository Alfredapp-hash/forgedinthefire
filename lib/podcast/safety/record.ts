/**
 * Per-episode safety record: the protected-term list and every accept/reject decision staff
 * make in Clean-up & safety. Stored in `podcast_episode_safety` (admin-only, RLS, never read by
 * public routes or the feed) so nothing is lost on reload — and so the list of names never sits
 * on the public episode row. Pure: validation + shape helpers shared by the route and the UI.
 */
import type { Bleep, BleepMode, Cut } from './render'
import type { DisguisePresetId } from './voice-disguise'

/** A speaker label from `start` (seconds on the current audio) until the next label. */
export type Speaker = { start: number; name: string }

export type TermKind = 'name' | 'place' | 'employer' | 'street' | 'number' | 'other'

export type ProtectedTerm = { text: string; kind: TermKind }

export const TERM_KINDS: TermKind[] = ['name', 'place', 'employer', 'street', 'number', 'other']

export const TERM_KIND_LABEL: Record<TermKind, string> = {
  name: 'Name',
  place: 'Town / place',
  employer: 'Employer / school',
  street: 'Street / address',
  number: 'Number / date',
  other: 'Other detail',
}

/** What accepted hits become in the transcript. */
export const REDACTION_LABELS: Record<TermKind, string> = {
  name: '[name]',
  place: '[place]',
  employer: '[name]',
  street: '[address]',
  number: '[detail]',
  other: '[detail]',
}

export type Decision = 'accept' | 'reject'

export type DisguisePlanRegion = { start: number; end: number; preset: DisguisePresetId }

/** Everything on the working plan that is not a term or a decision. */
export type SafetyPlan = {
  mode: BleepMode
  pad: number
  manual: Bleep[]
  disguise: DisguisePlanRegion[]
  filler_words: string[]
  include_pauses: boolean
  /** Word deletions made in the text editor (times on the current audio). */
  text_cuts: Cut[]
  /** Paragraph speaker labels from the text editor. */
  speakers: Speaker[]
}

export type SafetyRecord = {
  episode_id: string
  protected_terms: ProtectedTerm[]
  /** Hit id (`term@startMs`) → decision. Ids are stable across reloads and small transcript edits. */
  term_decisions: Record<string, Decision>
  /** Suggestion id (`kind@startMs`) → decision. */
  filler_decisions: Record<string, Decision>
  plan: SafetyPlan
  updated_at?: string | null
  updated_by?: string | null
}

export const DEFAULT_PLAN: SafetyPlan = {
  mode: 'tone',
  pad: 0.08,
  manual: [],
  disguise: [],
  filler_words: [],
  include_pauses: true,
  text_cuts: [],
  speakers: [],
}

export function emptySafetyRecord(episodeId: string): SafetyRecord {
  return { episode_id: episodeId, protected_terms: [], term_decisions: {}, filler_decisions: {}, plan: { ...DEFAULT_PLAN } }
}

export const MAX_TERMS = 300
export const MAX_DECISIONS = 10000

const BLEEP_MODES = new Set<BleepMode>(['tone', 'silence', 'roomtone'])
const PRESETS = new Set<DisguisePresetId>(['lower', 'higher', 'masked', 'robot'])

export function cleanTerms(value: unknown): ProtectedTerm[] {
  if (!Array.isArray(value)) return []
  const out: ProtectedTerm[] = []
  const seen = new Set<string>()
  for (const raw of value.slice(0, MAX_TERMS)) {
    const t = typeof raw === 'string' ? { text: raw } : ((raw ?? {}) as Record<string, unknown>)
    const text = String(t.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const kind = String(t.kind ?? 'name') as TermKind
    out.push({ text, kind: TERM_KINDS.includes(kind) ? kind : 'other' })
  }
  return out
}

export function cleanDecisions(value: unknown): Record<string, Decision> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, Decision> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_DECISIONS)) {
    if (k.length <= 200 && (v === 'accept' || v === 'reject')) out[k] = v
  }
  return out
}

function cleanRanges<T extends { start: number; end: number }>(value: unknown, extra?: (raw: Record<string, unknown>) => Partial<T> | null): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const raw of value.slice(0, 2000)) {
    const r = (raw ?? {}) as Record<string, unknown>
    const start = Number(r.start)
    const end = Number(r.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue
    const more = extra ? extra(r) : {}
    if (more === null) continue
    out.push({ start: round3(start), end: round3(end), ...more } as T)
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Sorted, de-duplicated (the last label at a time wins), names trimmed, empty names dropped. */
export function cleanSpeakers(value: unknown): Speaker[] {
  if (!Array.isArray(value)) return []
  const byStart = new Map<number, string>()
  for (const raw of value.slice(0, 5000)) {
    const r = (raw ?? {}) as Record<string, unknown>
    const start = Number(r.start)
    const name = String(r.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!Number.isFinite(start) || start < 0) continue
    const key = round3(start)
    if (name) byStart.set(key, name)
    else byStart.delete(key)
  }
  return Array.from(byStart, ([start, name]) => ({ start, name })).sort((a, b) => a.start - b.start)
}

export function cleanPlan(value: unknown): SafetyPlan {
  const p = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>
  const mode = String(p.mode ?? DEFAULT_PLAN.mode) as BleepMode
  const pad = Number(p.pad)
  return {
    mode: BLEEP_MODES.has(mode) ? mode : DEFAULT_PLAN.mode,
    pad: Number.isFinite(pad) && pad >= 0 && pad <= 1 ? pad : DEFAULT_PLAN.pad,
    manual: cleanRanges<Bleep>(p.manual).filter((m) => m.end - m.start <= 30),
    disguise: cleanRanges<DisguisePlanRegion>(p.disguise, (r) => {
      const preset = String(r.preset ?? '') as DisguisePresetId
      return PRESETS.has(preset) ? { preset } : null
    }),
    filler_words: Array.isArray(p.filler_words)
      ? Array.from(new Set(p.filler_words.slice(0, 100).map((w) => String(w ?? '').trim().toLowerCase().slice(0, 40)).filter(Boolean)))
      : [],
    include_pauses: p.include_pauses === undefined ? DEFAULT_PLAN.include_pauses : Boolean(p.include_pauses),
    text_cuts: cleanRanges<Cut>(p.text_cuts),
    speakers: cleanSpeakers(p.speakers),
  }
}

/** Validate an untrusted row / body into a SafetyRecord. Unknown keys are dropped. */
export function cleanSafetyRecord(episodeId: string, raw: unknown): SafetyRecord {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    episode_id: episodeId,
    protected_terms: cleanTerms(r.protected_terms),
    term_decisions: cleanDecisions(r.term_decisions),
    filler_decisions: cleanDecisions(r.filler_decisions),
    plan: cleanPlan(r.plan),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
    updated_by: typeof r.updated_by === 'string' ? r.updated_by : null,
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

// ── Sign-offs ────────────────────────────────────────────────────────────────

export type ApprovalMethod = 'listened_in_person' | 'listened_remotely' | 'sent_file' | 'written' | 'other'

export const APPROVAL_METHODS: ApprovalMethod[] = ['listened_in_person', 'listened_remotely', 'sent_file', 'written', 'other']

export const APPROVAL_METHOD_LABEL: Record<ApprovalMethod, string> = {
  listened_in_person: 'Listened together in person',
  listened_remotely: 'Listened together on a call',
  sent_file: 'Sent them the file and they replied OK',
  written: 'Written / signed approval',
  other: 'Other (see note)',
}

export function isApprovalMethod(v: unknown): v is ApprovalMethod {
  return typeof v === 'string' && (APPROVAL_METHODS as string[]).includes(v)
}

/** FNV-1a (32-bit) of normalised text — cheap change detection for "transcript reviewed", not security. */
export function textHash(text: string | null | undefined) {
  const s = (text || '').replace(/\r\n?/g, '\n').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** YYYY-MM-DD in local time. */
export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && Date.parse(v) <= Date.now() + 86_400_000
}
