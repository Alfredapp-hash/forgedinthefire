'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { ButtonSize, ButtonVariant } from './Button';

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required for accessibility — icon-only controls need a name. */
  'aria-label': string;
  /** Render as a pressed / active toggle. */
  active?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-forged text-forged-on shadow-inset-top hover:bg-forged-hover',
  secondary:
    'bg-surface-raised text-silver border border-divider shadow-inset-top hover:text-white hover:border-forged/60',
  ghost: 'bg-transparent text-silver hover:bg-white/5 hover:text-white',
  danger:
    'bg-heart-interior text-white border border-heart-interior-rim hover:bg-heart-interior-glow',
};

const SIZES: Record<ButtonSize, string> = {
  touch: 'h-control-touch w-control-touch',
  compact: 'h-control-compact w-control-compact',
  dense: 'h-control-dense w-control-dense',
};

/** A square, icon-only pressable — same tactility as Button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { variant = 'ghost', size = 'compact', active = false, className, type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={active}
        className={cn(
          'inline-flex select-none items-center justify-center rounded-control',
          '[&_svg]:h-[18px] [&_svg]:w-[18px]',
          'transition-[background-color,border-color,box-shadow,color] duration-150 ease-calm',
          'disabled:pointer-events-none disabled:opacity-40',
          VARIANTS[variant],
          SIZES[size],
          active &&
            'bg-forged/15 text-forged shadow-glow-medium ring-1 ring-forged/60',
          className
        )}
        {...props}
      />
    );
  }
);
