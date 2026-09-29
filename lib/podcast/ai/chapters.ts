/**
 * Auto chapters without any external AI: TextTiling-style lexical cohesion.
 *   - split the timed transcript into ~20-word pseudo-sentences
 *   - at each gap, cosine similarity of the k blocks before vs after
 *   - depth score (how far the similarity dips below the peaks either side)
 *   - boundaries at the deepest dips, respecting a minimum chapter length
 * Titles come from each segment's most distinctive keywords (tf-idf across segments).
 * Pure; staff approve everything before it is saved.
 */
import { HOTLINES } from '@/lib/constants'
import type { TranscriptWord } from '@/lib/studio/transcript'

export type ChapterSuggestion = { start_ms: number; title: string; keywords: string[] }

const STOP = new Set(
  ('a about above after again against all am an and any are aren as at be because been before being below between both but by ' +
    'can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has hasn have haven ' +
    'having he her here hers herself him himself his how i if in into is isn it its itself just let me more most mustn my myself ' +
    'no nor not now of off on once only or other ought our ours ourselves out over own same shan she should shouldn so some such ' +
    'than that the their theirs them themselves then there these they this those through to too under until up very was wasn we ' +
    'were weren what when where which while who whom why will with won would wouldn you your yours yourself yourselves ' +
    'yeah yes okay ok oh um uh like know really think going gonna get got go went thing things kind sort lot just actually ' +
    'mean said say says right well also something someone anything everything one two back even still way much many time ' +
    'people little bit want wanted make made see come came look good great first last take told tell'
  ).split(' '),
)

function stem(w: string) {
  return w
    .replace(/'s$/, '')
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|es|ly)$/, '')
    .replace(/s$/, '')
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 2 && !STOP.has(t) && !t.startsWith('['))
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0
  let na = 0
  let nb = 0
  a.forEach((v, k) => {
    na += v * v
    const o = b.get(k)
    if (o) dot += v * o
  })
  b.forEach((v) => (nb += v * v))
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

function bag(list: string[][]) {
  const m = new Map<string, number>()
  for (const toks of list) for (const t of toks) m.set(t, (m.get(t) || 0) + 1)
  return m
}

export type ChapterOptions = {
  /** Minimum chapter length (seconds). Default: max(90 s, duration / 14). */
  minSeconds?: number
  maxChapters?: number
  /** Words that must never appear in a title (protected names etc.). */
  exclude?: string[]
}

export function suggestChapters(words: TranscriptWord[], opts: ChapterOptions = {}): ChapterSuggestion[] {
  if (words.length < 120) return []
  const duration = words[words.length - 1].e
  const minSeconds = opts.minSeconds ?? Math.max(90, duration / 14)
  const maxChapters = opts.maxChapters ?? 12
  const exclude = new Set((opts.exclude || []).flatMap((t) => tokens(t)).map(stem))

  // Pseudo-sentences of 20 words.
  const W = 20
  const sents: { start: number; toks: string[]; raw: string[] }[] = []
  for (let i = 0; i < words.length; i += W) {
    const slice = words.slice(i, i + W)
    const raw = tokens(slice.map((w) => w.w).join(' ')).filter((t) => !exclude.has(stem(t)))
    sents.push({ start: slice[0].s, toks: raw.map(stem), raw })
  }
  const K = 6
  const gaps: number[] = []
  for (let g = 1; g < sents.length; g++) {
    const left = bag(sents.slice(Math.max(0, g - K), g).map((s) => s.toks))
    const right = bag(sents.slice(g, g + K).map((s) => s.toks))
    gaps.push(cosine(left, right))
  }
  // Light smoothing.
  const sm = gaps.map((_, i) => {
    const a = gaps[i - 1] ?? gaps[i]
    const b = gaps[i + 1] ?? gaps[i]
    return (a + gaps[i] + b) / 3
  })
  const depth = sm.map((v, i) => {
    let l = v
    for (let j = i - 1; j >= 0 && sm[j] >= l; j--) l = sm[j]
    let r = v
    for (let j = i + 1; j < sm.length && sm[j] >= r; j++) r = sm[j]
    return l - v + (r - v)
  })
  const mean = depth.reduce((a, b) => a + b, 0) / Math.max(1, depth.length)
  const sd = Math.sqrt(depth.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, depth.length))
  const cutoff = mean + sd / 2

  // Deepest dips first, respecting min length on both sides.
  const candidates = depth
    .map((d, i) => ({ d, sent: i + 1 }))
    .filter((c) => c.d > cutoff)
    .sort((a, b) => b.d - a.d)
  const chosen: number[] = []
  for (const c of candidates) {
    if (chosen.length >= maxChapters - 1) break
    const t = sents[c.sent].start
    if (t < minSeconds || duration - t < minSeconds) continue
    if (chosen.some((s) => Math.abs(sents[s].start - t) < minSeconds)) continue
    chosen.push(c.sent)
  }
  chosen.sort((a, b) => a - b)
  const bounds = [0, ...chosen, sents.length]

  // tf-idf keywords per segment.
  const segs = bounds.slice(0, -1).map((b, i) => sents.slice(b, bounds[i + 1]))
  const segBags = segs.map((s) => bag(s.map((x) => x.toks)))
  const df = new Map<string, number>()
  segBags.forEach((m) => m.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)))
  // Remember a readable surface form for each stem.
  const surface = new Map<string, Map<string, number>>()
  for (const s of sents) {
    s.raw.forEach((r, i) => {
      const k = s.toks[i]
      const forms = surface.get(k) || new Map<string, number>()
      forms.set(r, (forms.get(r) || 0) + 1)
      surface.set(k, forms)
    })
  }
  const readable = (k: string) => {
    const forms = surface.get(k)
    if (!forms) return k
    return Array.from(forms.entries()).sort((a, b) => b[1] - a[1])[0][0]
  }

  return segs.map((seg, i) => {
    const m = segBags[i]
    const scored = Array.from(m.entries())
      .filter(([, tf]) => tf >= 2)
      .map(([k, tf]) => ({ k, s: tf * Math.log(1 + segs.length / (df.get(k) || 1)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => readable(x.k))
    const title = scored.length
      ? scored.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' & ')
      : i === 0 ? 'Introduction' : `Part ${i + 1}`
    return {
      start_ms: i === 0 ? 0 : Math.round(seg[0].start * 1000),
      title: i === 0 && scored.length ? `Introduction: ${title}` : title,
      keywords: scored,
    }
  })
}

/** Plain show-notes draft from approved chapters. */
export function showNotesDraft(chapters: { start_ms: number; title: string }[], keywords: string[]) {
  const stamp = (ms: number) => {
    const t = Math.floor(ms / 1000)
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = t % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
  const lines = ['In this episode:', '']
  for (const c of chapters) lines.push(`${stamp(c.start_ms)} — ${c.title}`)
  if (keywords.length) lines.push('', `Topics: ${keywords.join(', ')}`)
  const h = HOTLINES[0]
  lines.push('', `If you or someone you know needs help, contact the ${h.name}: ${h.phone} (text ${h.text} to ${h.sms}), ${h.available}.`)
  return lines.join('\n')
}
