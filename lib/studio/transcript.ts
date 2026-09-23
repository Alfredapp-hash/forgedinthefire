/** Transcript helpers: stored text may be WebVTT, SRT, or plain prose. Pure. */
import { transcriptKind } from '@/lib/studio/release'

export { transcriptKind }

export type TranscriptCue = { start: number; end: number; text: string }

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function toSeconds(stamp: string): number | null {
  const m = stamp.match(TIME)
  if (!m) return null
  const [, h, mm, ss, frac] = m
  return Number(h || 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, '0')) / 1000
}

/** Parse VTT or SRT into cues. Returns [] for plain text. */
export function parseCues(text: string): TranscriptCue[] {
  const kind = transcriptKind(text)
  if (kind === 'text') return []
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const cues: TranscriptCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIdx = lines.findIndex((l) => l.includes('-->'))
    if (timingIdx < 0) continue
    const [a, b] = lines[timingIdx].split('-->')
    const start = toSeconds(a)
    const end = toSeconds(b)
    if (start == null || end == null) continue
    const body = lines.slice(timingIdx + 1).join('\n').trim()
    if (body) cues.push({ start, end, text: body })
  }
  return cues
}

function stamp(sec: number, sep: '.' | ',') {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const f = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`
}

export function cuesToVtt(cues: TranscriptCue[]) {
  return ['WEBVTT', '', ...cues.flatMap((c) => [`${stamp(c.start, '.')} --> ${stamp(c.end, '.')}`, c.text, ''])].join('\n')
}

export function cuesToSrt(cues: TranscriptCue[]) {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n')
}

/** Plain text for display / text/plain transcripts (strips timings and <v Speaker> tags). */
export function transcriptPlainText(text: string) {
  const cues = parseCues(text)
  if (!cues.length) return text.trim()
  return cues.map((c) => stripVoiceTags(c.text)).join('\n')
}

export function stripVoiceTags(line: string) {
  return line.replace(/<v\s+([^>]+)>/g, '$1: ').replace(/<\/?[^>]+>/g, '').trim()
}
