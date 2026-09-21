import { DEFAULT_HASHTAGS } from '@/lib/studio/types'

const SITE = 'https://forgedinthefireohio.org'

export function firstSentence(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] || clean
  if (sentence.length <= max) return sentence
  return `${sentence.slice(0, max - 1).trimEnd()}…`
}

export function clipCopyFromEpisode(input: {
  title: string
  showNotes?: string | null
  summary?: string | null
  talkingPoints?: string[]
  slug?: string | null
}) {
  const notes = (input.showNotes || '').trim()
  const summary = (input.summary || '').trim()
  const points = (input.talkingPoints || []).map((p) => p.trim()).filter(Boolean)
  const source = notes || summary || points.join('\n') || input.title
  const hook = firstSentence(source)
  const script = [
    input.title,
    summary,
    points.length ? points.map((p) => `• ${p}`).join('\n') : '',
    notes && notes !== summary ? notes.slice(0, 600) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const url = input.slug ? `${SITE}/podcast/${input.slug}` : `${SITE}/podcast`
  const caption = [
    hook,
    input.title,
    `${url}?utm_source=social&utm_medium=organic&utm_campaign=forged-podcast`,
    DEFAULT_HASHTAGS.join(' '),
  ].join('\n\n')
  return {
    hook,
    script,
    caption,
    cta: 'Listen now — link in bio',
  }
}

export function clipNeedsPrefill(clip: {
  hook?: string | null
  script?: string | null
  caption?: string | null
}) {
  return !String(clip.hook || '').trim() && !String(clip.script || '').trim() && !String(clip.caption || '').trim()
}
