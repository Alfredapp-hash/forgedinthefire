'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** A lucide icon element, e.g. <Mic size={20} />. Rendered in a calm well. */
  icon?: ReactNode;
  /** The headline — name the gap, in sentence case. */
  title: string;
  /** One line of direction: what to do next, in the interface's voice. */
  description?: ReactNode;
  /** The primary move out of the empty state (a Button), plus optional secondary. */
  action?: ReactNode;
  /** compact trims the padding for inline wells (lane bodies, lists). */
  size?: 'compact' | 'default';
}

/**
 * The studio's one empty state. An empty screen is an invitation to act, so
 * every surface that can be empty uses this: a quiet icon well, a plain-spoken
 * headline, one line of direction, and — where there's a clear next move — a
 * single action. Replaces the hand-rolled "No takes yet" / "Nothing here"
 * paragraphs so emptiness reads the same everywhere.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    { icon, title, description, action, size = 'default', className, ...props },
    ref
  ) {
    const compact = size === 'compact';
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10',
          className
        )}
        {...props}
      >
        {icon && (
          <span
            aria-hidden
            className={cn(
              'grid shrink-0 place-items-center rounded-full border border-divider bg-surface-raised text-ice shadow-inset-top',
              compact ? 'h-9 w-9' : 'h-12 w-12'
            )}
          >
            {icon}
          </span>
        )}
        <div className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
          <p className={cn('studio-type-body font-medium text-white', !compact && 'text-[15px]')}>
            {title}
          </p>
          {description && (
            <p className="studio-type-body mx-auto max-w-[42ch] text-silver-label">
              {description}
            </p>
          )}
        </div>
        {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
      </div>
    );
  }
);
