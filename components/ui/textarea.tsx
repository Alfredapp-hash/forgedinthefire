import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-steel-700 bg-surface-card',
          'px-3 py-2 text-sm text-cream-100 placeholder:text-steel-400',
          'focus:outline-none focus:ring-2 focus:ring-ice-300 focus:border-forged',
          'aria-[invalid=true]:border-ice aria-[invalid=true]:ring-ice/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-all duration-200 resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
