'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'touch' | 'compact' | 'dense';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Forged-blue fill, ink text — the primary studio action.
  primary: cn(
    'bg-forged text-forged-on shadow-inset-top',
    'hover:bg-forged-hover',
    'active:brightness-95'
  ),
  // Graphite chip with a hairline rim — the default toolbar button.
  secondary: cn(
    'bg-surface-raised text-white border border-divider shadow-inset-top',
    'hover:border-forged/60 hover:shadow-glow-subtle',
    'active:bg-gunmetal'
  ),
  // No chrome until hover — for dense toolbars.
  ghost: cn(
    'bg-transparent text-silver',
    'hover:bg-white/5 hover:text-white',
    'active:bg-white/10'
  ),
  // Heart ink on a deep-red interior — record / destructive.
  danger: cn(
    'bg-heart-interior text-white border border-heart-interior-rim shadow-inset-top',
    'hover:bg-heart-interior-glow',
    'active:brightness-95'
  ),
};

const SIZES: Record<ButtonSize, string> = {
  touch: 'h-control-touch px-4 text-[14px]',
  compact: 'h-control-compact px-3 text-[14px]',
  dense: 'h-control-dense px-2.5 text-[12px]',
};

/**
 * The studio button. Token-driven, Apple-tactile: subtle inset highlight,
 * snappy transition, clear focus ring (inherited from the global
 * :focus-visible ice-blue outline).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'compact', className, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'studio-type-button inline-flex select-none items-center justify-center gap-2 rounded-control',
        'transition-[background-color,border-color,box-shadow,transform,filter] duration-150 ease-calm',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
});
