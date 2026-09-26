'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  'aria-label': string;
}

/**
 * A horizontal slider. Native <input type=range> for accessibility +
 * keyboard, styled to the studio: inset track, forged-blue fill, tactile
 * thumb with a soft glow. Track fill is driven by a CSS var the caller
 * updates via value; here we compute it inline for zero-JS-per-frame.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className, value, defaultValue, min = 0, max = 100, style, ...props },
  ref
) {
  const v = Number(value ?? defaultValue ?? min);
  const pct = ((v - Number(min)) / (Number(max) - Number(min))) * 100;
  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      className={cn(
        // Comfortable touch target on small screens (~32px effective height),
        // relaxing to the compact control height from sm up. The visible track
        // is drawn thin in CSS; this only enlarges the pointer/hit area.
        'studio-slider h-8 w-full sm:h-control-compact',
        className
      )}
      style={
        { '--studio-slider-fill': `${pct}%`, ...style } as React.CSSProperties
      }
      {...props}
    />
  );
});
