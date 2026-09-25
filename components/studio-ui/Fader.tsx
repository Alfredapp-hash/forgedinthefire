'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface FaderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  'aria-label': string;
  /**
   * Position of the 0 dB reference notch as a fraction of the track from
   * the bottom (0..1). Defaults to 0.75, the usual unity-gain spot on a
   * fader whose top is +6 and bottom is -inf.
   */
  unity?: number;
}

/**
 * A vertical channel fader. Native <input type=range> rotated via
 * writing-mode, styled to a tactile hardware cap, with a 0 dB reference
 * line drawn on the track.
 */
export const Fader = forwardRef<HTMLInputElement, FaderProps>(function Fader(
  { className, value, defaultValue, min = 0, max = 100, unity = 0.75, style, ...props },
  ref
) {
  const v = Number(value ?? defaultValue ?? min);
  const pct = ((v - Number(min)) / (Number(max) - Number(min))) * 100;
  return (
    <div className="relative inline-flex h-full flex-col items-center">
      {/* 0 dB reference notch */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 z-10 h-px bg-forged/50"
        style={{ bottom: `${unity * 100}%` }}
      />
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        className={cn('studio-fader h-full', className)}
        style={
          { '--studio-slider-fill': `${pct}%`, ...style } as React.CSSProperties
        }
        {...props}
      />
    </div>
  );
});
