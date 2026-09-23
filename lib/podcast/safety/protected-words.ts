/**
 * Protected identities: find every place a name, town, school or workplace may have been
 * said, from the timed transcript. Deliberately over-inclusive (partial, possessive,
 * misspelt and sound-alike forms) — staff accept or reject each hit; nothing is bleeped
 * automatically. Pure.
 */
import type { TranscriptWord } from '@/lib/studio/transcript'

export type ProtectedHit = {
  id: string
  term: string
  /** Index range [from, to] inclusive into the words array. */
  from: number
  to: number
  start: number
  end: number
  heard: string
  score: number
  reason: 'exact' | 'possessive' | 'partial' | 'spelling' | 'sound-alike'
}

export const REDACTION_LABEL = '[name]'

/** Lower-case letters/digits only; drops possessive 's / s' and plural s? no — see stem(). */
export function normalizeToken(raw: string) {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9']/g, '')
}

function stripPossessive(t: string) {
  return t.replace(/'s$/, '').replace(/s'$/, 's').replace(/'$/, '').replace(/'/g, '')
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

function similarity(a: string, b: string) {
  const len = Math.max(a.length, b.length)
  return len ? 1 - levenshtein(a, b) / len : 1
}

/** American Soundex — catches Whisper spelling a name the way it sounds (Katelyn/Caitlin). */
export function soundex(s: string) {
  const t = s.toLowerCase().replace(/[^a-z]/g, '')
  if (!t) return ''
  const codes: Record<string, string> = {
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3', l: '4', m: '5', n: '5', r: '6',
  }
  let out = t[0].toUpperCase()
  let last = codes[t[0]] || ''
  for (let i = 1; i < t.length && out.length < 4; i++) {
    const c = t[i]
    const code = codes[c] || ''
    if (code && code !== last) out += code
    if (c !== 'h' && c !== 'w') last = code
  }
  return out.padEnd(4, '0')
}

const COMMON = new Set(
  ('a an and are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its ' +
    'just like me more most my no not now of on one or our out over she so some than that the their them then there these they ' +
    'this those to too up us very was we were what when where which who why will with would you your yeah okay really know ' +
    'think said say going get got because about after again all also back been being come could down even ever every first good ' +
    'great into little long make many much never new only other people right same should still such take tell thing things time ' +
    'two way well went while work year years')
    .split(' '),
)

/** Rough English spelling → sound key (Caitlin/Kaitlyn, Stephen/Steven, Philips/Filips). */
export function phonetic(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/(?<=.)h/g, '')
    .replace(/ie|ee|ea/g, 'i')
    .replace(/(.)\1+/g, '$1')
}

type Scored = { score: number; reason: ProtectedHit['reason'] }

/** Compare a heard span (already joined, no spaces) to a term (joined). */
export function scoreMatch(heardRaw: string, termRaw: string): Scored | null {
  const heardFull = normalizeToken(heardRaw)
  const heard = stripPossessive(heardFull)
  const term = stripPossessive(normalizeToken(termRaw))
  if (!heard || !term) return null
  if (heard === term) return { score: 1, reason: heardFull !== heard ? 'possessive' : 'exact' }
  // Plural / possessive without apostrophe ("Marias", "Jacksons").
  if (heard === `${term}s` || heard === `${term}es`) return { score: 0.95, reason: 'possessive' }
  // Common words never match a longer name ("the" ≠ "Theresa", "will" ≠ "Willow").
  if (COMMON.has(heard)) return null
  // Partial: nickname or longer form ("Jess" ↔ "Jessica", "Tom" ↔ "Tommy").
  if (heard.length > term.length && term.length >= 3 && heard.startsWith(term)) {
    return { score: 0.85, reason: 'partial' }
  }
  if (heard.length < term.length && heard.length >= 4 && term.startsWith(heard) && heard.length / term.length >= 0.5) {
    return { score: 0.8, reason: 'partial' }
  }
  if (term.length >= 4) {
    const sim = similarity(heard, term)
    if (sim >= 0.75) return { score: sim * 0.95, reason: 'spelling' }
    const ph = phonetic(heard)
    const pt = phonetic(term)
    const psim = similarity(ph, pt)
    if (heard.length >= 3 && (psim >= 0.8 || (soundex(ph) === soundex(pt) && ph[0] === pt[0] && sim >= 0.45))) {
      return { score: Math.max(0.7, psim * 0.85), reason: 'sound-alike' }
    }
  }
  return null
}

/**
 * Every plausible occurrence of each term. Multi-word terms ("Lincoln High", "Main Street")
 * match spans of n-1..n+1 words so Whisper splitting or merging words still hits.
 */
export function findProtectedHits(words: TranscriptWord[], terms: string[], threshold = 0.68): ProtectedHit[] {
  const hits: ProtectedHit[] = []
  const clean = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)))
  for (const term of clean) {
    const n = term.split(/\s+/).length
    const termJoined = term.replace(/\s+/g, '')
    const spans = Array.from(new Set([n, Math.max(1, n - 1), n + 1]))
    const found: ProtectedHit[] = []
    for (let i = 0; i < words.length; i++) {
      let best: (Scored & { to: number }) | null = null
      for (const len of spans) {
        const to = i + len - 1
        if (to >= words.length) continue
        const heard = words.slice(i, to + 1).map((w) => w.w).join('')
        const s = scoreMatch(heard, termJoined)
        if (s && s.score >= threshold && (!best || s.score > best.score)) best = { ...s, to }
      }
      // Multi-word terms: any single word of the phrase that is itself distinctive also counts.
      if (!best && n > 1) {
        for (const part of term.split(/\s+/)) {
          if (part.length < 4) continue
          const s = scoreMatch(words[i].w, part)
          if (s && s.score >= 0.9) {
            best = { score: s.score * 0.8, reason: 'partial', to: i }
            break
          }
        }
      }
      if (best) {
        found.push({
          id: `${term}:${i}`,
          term,
          from: i,
          to: best.to,
          start: words[i].s,
          end: words[best.to].e,
          heard: words.slice(i, best.to + 1).map((w) => w.w).join(' '),
          score: Math.round(best.score * 100) / 100,
          reason: best.reason,
        })
      }
    }
    // Keep the best of overlapping spans for the same term.
    found.sort((a, b) => b.score - a.score)
    const taken = new Set<number>()
    for (const h of found) {
      let clash = false
      for (let k = h.from; k <= h.to; k++) if (taken.has(k)) clash = true
      if (clash) continue
      for (let k = h.from; k <= h.to; k++) taken.add(k)
      hits.push(h)
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

/** Replace accepted hits in the word list with a single "[name]" word spanning each hit. */
export function redactWords(words: TranscriptWord[], accepted: Pick<ProtectedHit, 'from' | 'to'>[]): TranscriptWord[] {
  const byStart = new Map<number, number>()
  for (const h of accepted) byStart.set(h.from, Math.max(h.to, byStart.get(h.from) ?? h.from))
  const out: TranscriptWord[] = []
  for (let i = 0; i < words.length; i++) {
    const to = byStart.get(i)
    if (to == null) {
      out.push(words[i])
      continue
    }
    // Keep trailing punctuation so sentences still read naturally.
    const punct = (words[to].w.match(/[.,!?;:]+$/) || [''])[0]
    out.push({ w: REDACTION_LABEL + punct, s: words[i].s, e: words[to].e })
    i = to
  }
  return out
}

/** Redact a plain-text transcript that has no word timings (belt and braces). */
export function redactText(text: string, terms: string[]) {
  let out = text
  for (const term of terms.map((t) => t.trim()).filter(Boolean)) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    out = out.replace(new RegExp(`\\b${esc}(?:['’]s|s)?\\b`, 'gi'), REDACTION_LABEL)
  }
  return out
}
