import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-steel-700 bg-surface-card px-3 py-2',
          'text-sm text-cream-100 placeholder:text-steel-400',
          'focus:outline-none focus:ring-2 focus:ring-ice-300 focus:border-forged',
          'aria-[invalid=true]:border-ice aria-[invalid=true]:ring-ice/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-all duration-200',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
