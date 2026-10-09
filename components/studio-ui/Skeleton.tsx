'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SkeletonShape = 'line' | 'block' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** line = a text row, block = a card/area, circle = an avatar/dot. */
  shape?: SkeletonShape;
  /** For line/block: width (e.g. '60%', 120). For circle: diameter in px. */
  width?: number | string;
  /** For block/circle: height in px. Lines derive height from the type scale. */
  height?: number | string;
}

const SHAPE: Record<SkeletonShape, string> = {
  line: 'h-3 rounded-full',
  block: 'rounded-tile',
  circle: 'rounded-full',
};

/**
 * A single shimmer placeholder. The shimmer is motion-safe only — reduced-motion
 * users get a steady tint, so loading never pulses at them. Compose a few of
 * these for a content skeleton, or use <LoadingState> for a labelled wait.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { shape = 'line', width, height, className, style, ...props },
  ref
) {
  const circle = shape === 'circle';
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'bg-surface-raised/70 motion-safe:animate-pulse',
        SHAPE[shape],
        className
      )}
      style={{
        width: circle ? (width ?? 32) : width,
        height: circle ? (width ?? 32) : height,
        ...style,
      }}
      {...props}
    />
  );
});

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  /** What's being waited on, in the interface's voice: "Loading the waveform…". */
  label: string;
  size?: 'compact' | 'default';
}

/**
 * A labelled wait: a slow spinner and one line saying what's loading. Use it in
 * place of a bare "Loading…" so every wait reads the same and is announced to
 * screen readers (role=status). The spinner is stilled for reduced-motion users;
 * the label still tells them what's happening.
 */
export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(
  function LoadingState({ label, size = 'default', className, ...props }, ref) {
    const compact = size === 'compact';
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center justify-center gap-2 text-silver-label',
          compact ? 'py-3' : 'py-8',
          className
        )}
        {...props}
      >
        <Loader2
          size={compact ? 14 : 16}
          className="shrink-0 text-ice motion-safe:animate-spin"
          aria-hidden
        />
        <span className="studio-type-body">{label}</span>
      </div>
    );
  }
);
