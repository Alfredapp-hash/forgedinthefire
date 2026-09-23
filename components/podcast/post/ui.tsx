'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Shared look for the Clean-up & safety panel — matches the dark admin styles. */
export const inputCls = 'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]'
export const labelCls = 'block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1'
export const cardCls = 'rounded-xl border border-[#27313B] bg-[#05070A] p-4 space-y-3'

export function Btn({
  children,
  onClick,
  disabled,
  tone = 'default',
  pressed,
  title,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'primary' | 'accent' | 'danger' | 'good'
  pressed?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const tones: Record<string, string> = {
    default: 'border-[#27313B] text-[#B8C4CF]',
    primary: 'border-[#53D6FF] bg-[#53D6FF] text-[#061016] font-semibold',
    accent: 'border-[#53D6FF] text-[#53D6FF]',
    danger: 'border-red-400/50 text-red-200',
    good: 'border-emerald-400/50 text-emerald-200',
  }
  const on = pressed ? ' ring-2 ring-offset-1 ring-offset-[#05070A] ring-[#53D6FF] bg-[#1A232C]' : ''
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8DEBFF] disabled:opacity-40 ${tones[tone]}${on}`}
    >
      {children}
    </button>
  )
}

export function Progress({ value, label }: { value: number | null; label: string }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-[#1A232C]"
      >
        <div
          className={`h-full bg-[#53D6FF] transition-[width] ${pct == null ? 'w-1/3 animate-pulse' : ''}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-[#A9B8C6]" aria-live="polite">{label}{pct != null ? ` — ${pct}%` : ''}</p>
    </div>
  )
}

export function StepHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#F6FAFC]">
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1A232C] text-[11px] text-[#8DEBFF]" aria-hidden>{n}</span>
        {title}
      </h3>
      {hint && <p className="mt-1 text-xs text-[#A9B8C6] max-w-3xl">{hint}</p>}
    </div>
  )
}

export function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const t = Math.floor(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const tenth = Math.floor((sec - t) * 10)
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return `${base}.${tenth}`
}

export function parseClock(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (!value.trim() || parts.some((n) => Number.isNaN(n) || n < 0)) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/**
 * Play a short stretch of a URL with context before/after (for reviewing hits).
 * One shared <audio> element; starting a new clip stops the previous one.
 */
export function useClipPlayer(url: string | null, context = 1.5) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopAt = useRef<number>(Infinity)
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => {
    if (!url) return
    const el = new Audio()
    el.preload = 'none'
    el.src = url
    const onTime = () => {
      if (el.currentTime >= stopAt.current) {
        el.pause()
        setPlaying(null)
      }
    }
    const onEnd = () => setPlaying(null)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('pause', onEnd)
    audioRef.current = el
    return () => {
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('pause', onEnd)
      el.src = ''
      audioRef.current = null
    }
  }, [url])

  const play = useCallback(
    (id: string, start: number, end: number) => {
      const el = audioRef.current
      if (!el) return
      if (playing === id) {
        el.pause()
        return
      }
      stopAt.current = end + context
      el.currentTime = Math.max(0, start - context)
      void el.play().then(() => setPlaying(id)).catch(() => setPlaying(null))
    },
    [context, playing],
  )
  const stop = useCallback(() => audioRef.current?.pause(), [])
  return { play, stop, playing }
}

export type Decision = 'accept' | 'reject'

export function DecisionButtons({
  value,
  onChange,
  label,
}: {
  value: Decision | undefined
  onChange: (d: Decision | undefined) => void
  label: string
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={`Decision for ${label}`}>
      <Btn tone="good" pressed={value === 'accept'} onClick={() => onChange(value === 'accept' ? undefined : 'accept')}>
        {value === 'accept' ? '✓ Accepted' : 'Accept'}
      </Btn>
      <Btn tone="default" pressed={value === 'reject'} onClick={() => onChange(value === 'reject' ? undefined : 'reject')}>
        {value === 'reject' ? 'Rejected' : 'Reject'}
      </Btn>
    </div>
  )
}
