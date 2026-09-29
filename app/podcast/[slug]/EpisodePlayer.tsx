'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Link2, ListOrdered, Pause, Play, RotateCcw, RotateCw, Share2, FileText } from 'lucide-react'

export type PlayerChapter = { start: number; title: string; url?: string | null; img?: string | null }
export type PlayerTranscript =
  | { kind: 'cues'; cues: { start: number; text: string }[] }
  | { kind: 'text'; text: string }
  | null

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const t = Math.floor(seconds)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function parseHashTime(hash: string) {
  const m = hash.match(/t=(\d+(?::\d{1,2}){0,2})/)
  if (!m) return null
  return m[1].split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0)
}

const RATES = [1, 1.25, 1.5, 2]

export function EpisodePlayer({
  episodeId,
  showId,
  title,
  audioUrl,
  downloadUrl,
  shareUrl,
  durationSeconds,
  chapters,
  transcript,
}: {
  episodeId: string
  showId: string | null
  title: string
  audioUrl: string
  downloadUrl: string
  shareUrl: string
  durationSeconds: number | null
  chapters: PlayerChapter[]
  transcript: PlayerTranscript
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const tracked = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(durationSeconds || 0)
  const [rate, setRate] = useState(1)
  const [copied, setCopied] = useState(false)

  const track = useCallback(() => {
    if (tracked.current) return
    tracked.current = true
    void fetch('/api/podcast/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode_id: episodeId, show_id: showId, event_type: 'play' }),
      keepalive: true,
    }).catch(() => {})
  }, [episodeId, showId])

  const seek = useCallback((seconds: number, autoplay = true) => {
    const el = audio.current
    if (!el) return
    el.currentTime = Math.max(0, seconds)
    setTime(el.currentTime)
    if (autoplay) void el.play().catch(() => {})
  }, [])

  useEffect(() => {
    const t = parseHashTime(window.location.hash)
    if (t != null) seek(t, false)
  }, [seek])

  const activeChapter = chapters.reduce((idx, ch, i) => (time >= ch.start ? i : idx), -1)
  const activeCue = transcript?.kind === 'cues'
    ? transcript.cues.reduce((idx, c, i) => (time >= c.start ? i : idx), -1)
    : -1

  async function share() {
    const url = time > 5 ? `${shareUrl}#t=${clock(time)}` : shareUrl
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
    } catch {
      return // user cancelled the share sheet
    }
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const btn = 'inline-flex items-center gap-2 rounded-lg border border-[#27313B] px-3 py-2 text-sm text-[#B8C4CF] hover:border-[#53D6FF] hover:text-[#F6FAFC] transition-colors'
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="space-y-8 mb-10">
      <div className="rounded-2xl border border-[#27313B] bg-[#11161C] p-5 md:p-6">
        <audio
          ref={audio}
          src={audioUrl}
          preload="metadata"
          onPlay={() => { setPlaying(true); track() }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
          onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
          className="hidden"
        />
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => { const el = audio.current; if (!el) return; if (el.paused) void el.play().catch(() => {}); else el.pause() }}
            aria-label={playing ? 'Pause episode' : 'Play episode'}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#53D6FF] text-[#061016] hover:bg-[#8DEBFF] transition-colors"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              step={1}
              value={Math.floor(time)}
              onChange={(e) => seek(Number(e.target.value), false)}
              aria-label="Seek"
              className="w-full accent-[#53D6FF]"
              style={{ background: `linear-gradient(to right, #53D6FF ${progress}%, #27313B ${progress}%)` }}
            />
            <div className="mt-1 flex justify-between text-xs tabular-nums text-[#A9B8C6]">
              <span>{clock(time)}</span>
              {activeChapter >= 0 && <span className="truncate px-2 text-[#8DEBFF]">{chapters[activeChapter].title}</span>}
              <span>{clock(duration)}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => seek(time - 15)} aria-label="Back 15 seconds">
            <RotateCcw className="h-4 w-4" /> 15s
          </button>
          <button type="button" className={btn} onClick={() => seek(time + 30)} aria-label="Forward 30 seconds">
            <RotateCw className="h-4 w-4" /> 30s
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
              if (audio.current) audio.current.playbackRate = next
            }}
            aria-label="Playback speed"
          >
            {rate}×
          </button>
          <span className="flex-1" />
          <button type="button" className={btn} onClick={() => void share()}>
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {copied ? 'Link copied' : 'Share'}
          </button>
          <a className={btn} href={downloadUrl} download>
            <Download className="h-4 w-4" /> Download
          </a>
        </div>
      </div>

      {chapters.length > 0 && (
        <section className="rounded-2xl border border-[#27313B] bg-[#11161C] p-6 md:p-8">
          <h2 className="font-serif text-2xl text-[#F6FAFC] mb-4 flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-[#53D6FF]" /> Chapters
          </h2>
          <ol className="space-y-1">
            {chapters.map((ch, i) => (
              <li key={`${ch.start}-${i}`} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => seek(ch.start)}
                  className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    i === activeChapter ? 'bg-[#1A232C] text-[#F6FAFC]' : 'text-[#B8C4CF] hover:bg-[#151B22]'
                  }`}
                >
                  <span className="w-16 shrink-0 tabular-nums text-sm text-[#53D6FF]">{clock(ch.start)}</span>
                  <span>{ch.title}</span>
                </button>
                {ch.url && (
                  <a href={ch.url} target="_blank" rel="noopener noreferrer" className="text-[#8DEBFF] hover:text-[#53D6FF]" aria-label={`Link for ${ch.title}`}>
                    <Link2 className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {transcript && (
        <details id="transcript" className="group rounded-2xl border border-[#27313B] bg-[#11161C] p-6 md:p-8">
          <summary className="cursor-pointer list-none font-serif text-2xl text-[#F6FAFC] flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#53D6FF]" /> Transcript
            <span className="ml-auto font-sans text-sm text-[#8DEBFF] group-open:hidden">Show</span>
            <span className="ml-auto hidden font-sans text-sm text-[#8DEBFF] group-open:inline">Hide</span>
          </summary>
          <div className="mt-5 max-h-[32rem] overflow-y-auto pr-2">
            {transcript.kind === 'cues' ? (
              <ol className="space-y-2">
                {transcript.cues.map((cue, i) => (
                  <li key={`${cue.start}-${i}`} className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => seek(cue.start)}
                      className="w-16 shrink-0 text-left text-xs tabular-nums text-[#53D6FF] hover:text-[#8DEBFF] pt-1"
                    >
                      {clock(cue.start)}
                    </button>
                    <p className={`leading-relaxed ${i === activeCue ? 'text-[#F6FAFC]' : 'text-[#B8C4CF]'}`}>{cue.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="whitespace-pre-wrap text-[#B8C4CF] leading-relaxed">{transcript.text}</p>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
