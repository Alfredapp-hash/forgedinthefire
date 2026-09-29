'use client'

/**
 * Shared chrome for the Clean-up & safety flow, built on the studio-ui kit so it reads as
 * one surface with the rest of the production room. No business logic.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, Circle, Lock } from 'lucide-react'
import { Button, Chip, Panel, type ButtonVariant } from '@/components/studio-ui'
import { cn } from '@/lib/utils'

export const inputCls = cn(
  'studio-type-body w-full rounded-control border border-divider bg-obsidian px-3 py-2 text-white',
  'placeholder:text-silver/60 shadow-inset-top focus:border-forged/60 focus:shadow-glow-subtle focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-40',
)
export const labelCls = 'studio-type-label mb-1 block'
export const cardCls = 'space-y-3 rounded-panel border border-divider bg-surface-sunken p-4'

export type BtnTone = 'default' | 'primary' | 'accent' | 'danger' | 'good'

const TONE_VARIANT: Record<BtnTone, ButtonVariant> = {
  default: 'secondary',
  primary: 'primary',
  accent: 'secondary',
  danger: 'danger',
  good: 'secondary',
}

const TONE_EXTRA: Record<BtnTone, string> = {
  default: '',
  primary: '',
  accent: 'border-forged/60 text-ice',
  danger: '',
  good: 'border-lane-cohost-2/50 text-lane-cohost-2',
}

/** Compact studio button with the flow's tones (accent = outlined blue, good = outlined green). */
export function Btn({
  children,
  onClick,
  disabled,
  tone = 'default',
  pressed,
  title,
  type = 'button',
  loading,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: BtnTone
  pressed?: boolean
  title?: string
  type?: 'button' | 'submit'
  loading?: boolean
  className?: string
}) {
  return (
    <Button
      type={type}
      size="dense"
      variant={TONE_VARIANT[tone]}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      aria-pressed={pressed}
      title={title}
      className={cn(
        'whitespace-nowrap',
        TONE_EXTRA[tone],
        pressed && 'bg-forged/15 shadow-glow-subtle ring-1 ring-forged/60',
        className,
      )}
    >
      {children}
    </Button>
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
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised shadow-inset-well"
      >
        <div
          className={cn('h-full bg-forged transition-[width] duration-200 ease-calm', pct == null && 'w-1/3 motion-safe:animate-pulse')}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="studio-type-body text-[12px] text-silver" aria-live="polite">
        {label}
        {pct != null ? ` — ${pct}%` : ''}
      </p>
    </div>
  )
}

/** A soft callout. `tone="block"` is for things that stop release (heart red); "note" is neutral. */
export function Note({ children, tone = 'note', role }: { children: ReactNode; tone?: 'note' | 'block' | 'good'; role?: string }) {
  return (
    <p
      role={role}
      className={cn(
        'studio-type-body rounded-control border px-3 py-2 text-[13px] leading-snug',
        tone === 'block' && 'border-heart/40 bg-heart/5 text-white',
        tone === 'good' && 'border-lane-cohost-2/40 bg-lane-cohost-2/5 text-white',
        tone === 'note' && 'border-forged/30 bg-forged/5 text-silver-body',
      )}
    >
      {children}
    </p>
  )
}

export type StepStatus = 'done' | 'next' | 'todo' | 'optional' | 'locked'

const STATUS_CHIP: Record<StepStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'record' }> = {
  done: { label: 'Done', tone: 'success' },
  next: { label: 'Next', tone: 'accent' },
  todo: { label: 'To do', tone: 'neutral' },
  optional: { label: 'Optional', tone: 'neutral' },
  locked: { label: 'Later', tone: 'neutral' },
}

/**
 * One step of the guided flow: a numbered, collapsible panel with a status chip. The parent
 * decides which step is open (the recommended next action); hosts can open any step.
 */
export function StepCard({
  id,
  n,
  title,
  hint,
  status,
  open,
  onToggle,
  summary,
  children,
}: {
  id: string
  n: number
  title: string
  hint?: string
  status: StepStatus
  open: boolean
  onToggle: () => void
  /** One line shown while collapsed (e.g. "3 names · 2 to check"). */
  summary?: ReactNode
  children: ReactNode
}) {
  const chip = STATUS_CHIP[status]
  const icon =
    status === 'done' ? (
      <CheckCircle2 size={18} className="shrink-0 text-lane-cohost-2" aria-hidden />
    ) : status === 'locked' ? (
      <Lock size={16} className="shrink-0 text-silver" aria-hidden />
    ) : (
      <Circle size={18} className={cn('shrink-0', status === 'next' ? 'text-forged' : 'text-divider')} aria-hidden />
    )
  return (
    <Panel
      id={id}
      elevation={open ? 'raised' : 'flat'}
      className={cn('overflow-hidden transition-[border-color,box-shadow] duration-150 ease-calm', status === 'next' && 'border-forged/50 shadow-glow-subtle')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] focus-visible:outline-none"
      >
        {icon}
        <span className="studio-type-timecode w-5 shrink-0 text-center text-silver">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="studio-type-body block text-[14px] font-semibold text-white">{title}</span>
          {!open && summary && <span className="studio-type-body block truncate text-[12px] text-silver">{summary}</span>}
        </span>
        <Chip tone={chip.tone} dot={status === 'next'}>
          {chip.label}
        </Chip>
        <ChevronDown size={16} className={cn('shrink-0 text-silver transition-transform duration-150 ease-calm', open && 'rotate-180')} aria-hidden />
      </button>
      <div id={`${id}-body`} hidden={!open} className="space-y-3 border-t border-divider px-4 pb-4 pt-3">
        {hint && <p className="studio-type-body max-w-3xl text-[13px] text-silver">{hint}</p>}
        {children}
      </div>
    </Panel>
  )
}

/** Heading for a sub-section inside a step. */
export function StepHeading({ n, title, hint }: { n?: number; title: string; hint?: string }) {
  return (
    <div>
      <h3 className="studio-type-body text-[14px] font-semibold text-white">
        {n != null && (
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised text-[11px] text-ice" aria-hidden>
            {n}
          </span>
        )}
        {title}
      </h3>
      {hint && <p className="studio-type-body mt-1 max-w-3xl text-[12px] text-silver">{hint}</p>}
    </div>
  )
}

/** Collapsed "power options" block: advanced settings out of the main path. */
export function Advanced({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <details className="group rounded-control border border-divider bg-obsidian/60">
      <summary className="studio-type-body flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[13px] text-silver hover:text-white">
        <ChevronDown size={14} className="transition-transform duration-150 ease-calm group-open:rotate-180" aria-hidden />
        {title}
        {count != null && count > 0 && <Chip tone="neutral">{count}</Chip>}
      </summary>
      <div className="space-y-3 border-t border-divider px-3 py-3">{children}</div>
    </details>
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
  acceptLabel = 'Accept',
  rejectLabel = 'Reject',
}: {
  value: Decision | undefined
  onChange: (d: Decision | undefined) => void
  label: string
  acceptLabel?: string
  rejectLabel?: string
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={`Decision for ${label}`}>
      <Btn tone="good" pressed={value === 'accept'} onClick={() => onChange(value === 'accept' ? undefined : 'accept')}>
        {value === 'accept' ? `✓ ${acceptLabel}ed` : acceptLabel}
      </Btn>
      <Btn tone="default" pressed={value === 'reject'} onClick={() => onChange(value === 'reject' ? undefined : 'reject')}>
        {value === 'reject' ? `${rejectLabel}ed` : rejectLabel}
      </Btn>
    </div>
  )
}

/** Small play/stop pill with a timecode, used in hit and suggestion lists. */
export function PlayAt({ id, start, end, play, playing }: { id: string; start: number; end: number; play: (id: string, s: number, e: number) => void; playing: string | null }) {
  const on = playing === id
  return (
    <button
      type="button"
      onClick={() => play(id, start, end)}
      aria-label={`${on ? 'Stop' : 'Play'} ${clock(start)} in context`}
      className={cn(
        'studio-type-timecode inline-flex h-control-dense items-center gap-1 rounded-control border border-divider bg-surface-raised px-2 text-ice',
        'hover:border-forged/60 focus-visible:outline-none',
        on && 'border-forged/60 shadow-glow-subtle',
      )}
    >
      <span aria-hidden>{on ? '■' : '▶'}</span> {clock(start)}
    </button>
  )
}
