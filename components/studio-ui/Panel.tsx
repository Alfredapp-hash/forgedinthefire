'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type PanelElevation = 'flat' | 'raised' | 'floating';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Depth of the panel. flat = sunken card, raised = md shadow, floating = lg shadow + subtle glow. */
  elevation?: PanelElevation;
  /** Add a subtle inset top highlight so the surface reads as physical. */
  tactile?: boolean;
}

const ELEVATION: Record<PanelElevation, string> = {
  flat: 'shadow-depth-sm',
  raised: 'shadow-depth-md',
  floating: 'shadow-depth-lg shadow-glow-subtle',
};

/**
 * The base studio surface: graphite card with a hairline border and real
 * elevation. Token-driven, no business logic.
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { elevation = 'raised', tactile = false, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-panel border border-divider bg-surface-card',
        ELEVATION[elevation],
        tactile && 'shadow-inset-top',
        className
      )}
      {...props}
    />
  );
});
