'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ChipTone = 'neutral' | 'accent' | 'record' | 'success';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  /** Show a leading status dot. */
  dot?: boolean;
}

const TONES: Record<ChipTone, { chip: string; dot: string }> = {
  neutral: {
    chip: 'border-divider bg-surface-raised text-silver',
    dot: 'bg-silver',
  },
  accent: {
    chip: 'border-forged/40 bg-forged/10 text-ice',
    dot: 'bg-forged',
  },
  record: {
    chip: 'border-heart/50 bg-heart/10 text-heart',
    dot: 'bg-heart',
  },
  success: {
    chip: 'border-lane-cohost-2/50 bg-lane-cohost-2/10 text-lane-cohost-2',
    dot: 'bg-lane-cohost-2',
  },
};

/**
 * A small status pill. `Chip` and `Badge` are the same primitive; `Badge`
 * is exported as an alias for call-site clarity.
 */
export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { tone = 'neutral', dot = false, className, children, ...props },
  ref
) {
  const t = TONES[tone];
  return (
    <span
      ref={ref}
      className={cn(
        'studio-type-label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 leading-none',
        t.chip,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
});

/** Alias — same primitive, clearer at count/label call sites. */
export const Badge = Chip;
