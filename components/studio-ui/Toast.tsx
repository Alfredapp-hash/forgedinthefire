'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'neutral' | 'success' | 'error' | 'record';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Override auto-dismiss in ms. Set to 0 / Infinity to stick until closed. */
  duration?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  duration: number;
}

/* ---------------------------------------------------------------- Store -- */
/**
 * A tiny module-level store. No provider needed — call `toast()` from
 * anywhere; `<Toaster/>` subscribes. Calls made before <Toaster/> mounts
 * are held in `queue` and flushed on first subscribe, so early callers are
 * never dropped.
 */

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  neutral: 5000,
  success: 4000,
  error: 6000,
  record: 5000,
};

let nextId = 1;
let items: ToastItem[] = [];
let queue: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();
let hasSubscriber = false;

function emit() {
  for (const l of listeners) l(items);
}

function push(item: ToastItem) {
  if (!hasSubscriber) {
    queue.push(item);
    return;
  }
  items = [...items, item];
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: (items: ToastItem[]) => void) {
  listeners.add(listener);
  hasSubscriber = true;
  // Flush anything queued before the first Toaster mounted.
  if (queue.length) {
    items = [...items, ...queue];
    queue = [];
  }
  listener(items);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) hasSubscriber = false;
  };
}

/**
 * Show a toast. Safe to call before <Toaster/> mounts (it queues) and from
 * outside React. Returns the toast id so callers can dismiss it early.
 */
export function toast(opts: ToastOptions): number {
  const tone = opts.tone ?? 'neutral';
  const id = nextId++;
  push({
    ...opts,
    id,
    tone,
    duration: opts.duration ?? DEFAULT_DURATIONS[tone],
  });
  return id;
}

/** Imperatively dismiss a toast by id. */
toast.dismiss = dismiss;

/* -------------------------------------------------------------- Toaster -- */

const TONE_STYLES: Record<ToastTone, { border: string; dot: string }> = {
  neutral: { border: 'border-divider', dot: 'bg-silver' },
  success: { border: 'border-lane-cohost-2/50', dot: 'bg-lane-cohost-2' },
  error: { border: 'border-ice/50', dot: 'bg-ice' },
  record: { border: 'border-heart/60', dot: 'bg-heart' },
};

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (id: number) => void;
}) {
  const [entered, setEntered] = useState(false);
  const s = TONE_STYLES[item.tone];

  useEffect(() => {
    // Trigger the enter transition after mount.
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!item.duration || !Number.isFinite(item.duration)) return;
    const t = setTimeout(() => onClose(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration, onClose]);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-[320px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-panel border bg-surface-card p-3.5',
        'shadow-depth-lg shadow-glow-subtle',
        s.border,
        // Reduced-motion-safe enter/exit: only animate for motion-safe users.
        'transition duration-200 ease-calm motion-reduce:transition-none',
        entered
          ? 'motion-safe:translate-x-0 motion-safe:opacity-100'
          : 'motion-safe:translate-x-4 motion-safe:opacity-0'
      )}
    >
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', s.dot)} />
      <div className="min-w-0 flex-1">
        <p className="studio-type-body font-medium text-white">{item.title}</p>
        {item.description && (
          <p className="studio-type-body mt-0.5 text-[13px] leading-snug text-silver">
            {item.description}
          </p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onClose(item.id);
            }}
            className="studio-type-button mt-2 rounded-[6px] px-2 py-1 text-forged transition-colors hover:bg-forged/10"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onClose(item.id)}
        className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-silver transition-colors hover:bg-white/5 hover:text-white"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden
        >
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Mount once (in the app shell). Renders the top-right toast stack.
 * Region is aria-live="polite" so screen readers announce new toasts
 * without stealing focus.
 */
export function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);

  useEffect(() => subscribe(setList), []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col items-end gap-2"
    >
      {list.map((item) => (
        <ToastCard key={item.id} item={item} onClose={dismiss} />
      ))}
    </div>
  );
}
