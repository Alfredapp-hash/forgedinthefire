'use client'

import { useEffect, useRef, useState } from 'react'
import { Gauge, Minus, Pause, Play, Plus, RotateCcw, Type } from 'lucide-react'

type Props = {
  /** Full recording script (episode show notes). Plain text; blank lines split paragraphs. */
  text: string
  title?: string
}

/**
 * Built-in teleprompter for the Sound Booth. Large, high-contrast script that
 * auto-scrolls while the host records; speed and type size are adjustable. It is
 * a reading aid only — nothing here touches capture, takes or the mix.
 */
export function Teleprompter({ text, title }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number>(0)
  const [playing, setPlaying] = useState(false)
  /** Scroll speed in px/second. */
  const [speed, setSpeed] = useState(44)
  const [fontSize, setFontSize] = useState(34)

  useEffect(() => {
    if (!playing) return
    lastRef.current = performance.now()
    const tick = (now: number) => {
      const el = scrollRef.current
      if (el) {
        const dt = (now - lastRef.current) / 1000
        lastRef.current = now
        el.scrollTop += speed * dt
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setPlaying(false)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing, speed])

  const restart = () => {
    setPlaying(false)
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }

  const paragraphs = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)

  const ctrlBtn =
    'inline-flex items-center gap-1 rounded-control border border-divider bg-surface-raised px-2 py-1.5 text-xs text-silver-label hover:text-white'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-gunmetal px-3 py-2">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-control bg-forged px-3 py-1.5 text-sm font-semibold text-obsidian"
          aria-pressed={playing}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={restart} className={ctrlBtn} aria-label="Restart from the top">
          <RotateCcw size={14} /> Restart
        </button>
        <span className="mx-1 hidden h-5 w-px bg-divider sm:inline-block" aria-hidden="true" />
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-silver-label">
          <Gauge size={13} /> Speed
        </span>
        <button type="button" onClick={() => setSpeed((s) => Math.max(12, s - 8))} className={ctrlBtn} aria-label="Slower">
          Slower
        </button>
        <span className="w-9 text-center text-xs tabular-nums text-white">{speed}</span>
        <button type="button" onClick={() => setSpeed((s) => Math.min(220, s + 8))} className={ctrlBtn} aria-label="Faster">
          Faster
        </button>
        <span className="mx-1 hidden h-5 w-px bg-divider sm:inline-block" aria-hidden="true" />
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-silver-label">
          <Type size={13} /> Size
        </span>
        <button type="button" onClick={() => setFontSize((f) => Math.max(18, f - 4))} className={ctrlBtn} aria-label="Smaller text">
          <Minus size={13} />
        </button>
        <span className="w-8 text-center text-xs tabular-nums text-white">{fontSize}</span>
        <button type="button" onClick={() => setFontSize((f) => Math.min(76, f + 4))} className={ctrlBtn} aria-label="Larger text">
          <Plus size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        <div
          className="mx-auto max-w-3xl space-y-5 pb-[60vh] text-center font-medium leading-relaxed text-white"
          style={{ fontSize }}
        >
          {title ? (
            <p className="text-silver-label" style={{ fontSize: Math.max(13, Math.round(fontSize * 0.46)) }}>
              {title}
            </p>
          ) : null}
          {paragraphs.map((p, i) => {
            const direction = p.startsWith('[') && p.endsWith(']')
            return (
              <p key={i} className={direction ? 'italic text-silver-label' : ''}>
                {p}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}
