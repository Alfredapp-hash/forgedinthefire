'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type KbdProps = HTMLAttributes<HTMLElement>;

/** A keycap: mono glyph on a raised graphite chip with a hardware inset. */
export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[20px] items-center justify-center rounded-[6px] border border-divider bg-surface-raised px-1.5 py-0.5',
        'font-mono text-[11px] leading-none text-silver shadow-inset-top',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
