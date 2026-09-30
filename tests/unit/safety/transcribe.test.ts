import { describe, expect, it } from 'vitest'
import { WHISPER_MODELS, WHISPER_RATE, chunkBoundaries } from '@/lib/podcast/ai/whisper'
import { transcriptDownload } from '@/components/podcast/post/TranscribeSection'
import { cuesToSrt, cuesToVtt, episodeCues, parseCues, transcriptKind, wordsToCues } from '@/lib/studio/transcript'
import { words } from './helpers'

describe('whisper chunking (long audio)', () => {
  it('cuts long audio into ≤30 s windows at the quietest point near each boundary', () => {
    const rate = WHISPER_RATE
    const audio = new Float32Array(rate * 70)
    for (let i = 0; i < audio.length; i++) audio[i] = 0.3 * Math.sin(i / 5)
    // A dip in level at 27 s should attract the first boundary.
    for (let i = Math.round(26.9 * rate); i < Math.round(27.1 * rate); i++) audio[i] = 0
    const b = chunkBoundaries(audio, rate)
    expect(b[0]).toBe(0)
    expect(b[b.length - 1]).toBe(audio.length)
    for (let i = 1; i < b.length; i++) expect(b[i] - b[i - 1]).toBeLessThanOrEqual(30 * rate)
    expect(b[1] / rate).toBeGreaterThan(26.9)
    expect(b[1] / rate).toBeLessThan(27.1)
  })

  it('short audio is one window; every window is at least 10 s unless it is the tail', () => {
    expect(chunkBoundaries(new Float32Array(WHISPER_RATE * 10))).toEqual([0, WHISPER_RATE * 10])
    const b = chunkBoundaries(new Float32Array(WHISPER_RATE * 65))
    for (let i = 1; i < b.length - 1; i++) expect(b[i] - b[i - 1]).toBeGreaterThanOrEqual(10 * WHISPER_RATE)
  })

  it('exposes model size so the UI can show the one-time download', () => {
    for (const m of Object.values(WHISPER_MODELS)) {
      expect(m.repo).toMatch(/_timestamped$/) // word-level timestamps need the cross-attention export
      expect(m.downloadMb.webgpu).toBeGreaterThan(0)
      expect(m.downloadMb.wasm).toBeGreaterThan(0)
    }
  })
})

describe('caption writers match the public transcript routes', () => {
  const ws = [...words('Welcome to the show.'), ...words('Thanks for having me.', 3661.042)]

  it('VTT: WEBVTT header, HH:MM:SS.mmm stamps, blank line between cues, parseable', () => {
    const { body, type } = transcriptDownload(ws, 'vtt')
    expect(type).toBe('text/vtt')
    expect(body.startsWith('WEBVTT\n\n')).toBe(true)
    expect(body).toContain('00:00:00.000 --> 00:00:01.500\nWelcome to the show.\n')
    expect(body).toContain('01:01:01.042 --> ')
    expect(transcriptKind(body)).toBe('vtt')
    expect(parseCues(body)).toHaveLength(2)
  })

  it('SRT: numbered cues with comma stamps, detected as SRT', () => {
    const { body, type } = transcriptDownload(ws, 'srt')
    expect(type).toBe('application/x-subrip')
    expect(body).toMatch(/^1\n00:00:00,000 --> 00:00:01,500\nWelcome to the show\.\n/)
    expect(body).toContain('\n2\n01:01:01,042 --> ')
    expect(transcriptKind(body)).toBe('srt')
    expect(parseCues(body)).toHaveLength(2)
  })

  it('TXT: prose with a paragraph break at long pauses', () => {
    expect(transcriptDownload(ws, 'txt').body).toBe('Welcome to the show.\n\nThanks for having me.')
  })

  it('is the same output the routes build from transcript_words', () => {
    // Stored words are rounded to 10 ms (cleanWords), as Whisper output is before saving.
    const stored = ws.map((w) => ({ w: w.w, s: Math.round(w.s * 100) / 100, e: Math.round(w.e * 100) / 100 }))
    const cues = episodeCues({ transcript: 'plain prose', transcript_words: stored })
    expect(cuesToVtt(cues)).toBe(transcriptDownload(stored, 'vtt').body)
    expect(cuesToSrt(cues)).toBe(transcriptDownload(stored, 'srt').body)
    expect(cues).toEqual(wordsToCues(stored))
  })
})
