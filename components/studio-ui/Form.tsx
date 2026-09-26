'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared field chrome. Kept as a drop-in for the inline strings the app
 * already uses (`rounded border bg-obsidian text-white`), upgraded to the
 * studio tokens: rounded-control, inset top highlight, forged-blue focus
 * border + glow, and the global ice-blue focus-visible ring. Adoption is a
 * one-for-one swap.
 */
const FIELD_BASE = cn(
  'studio-type-body w-full rounded-control border border-divider bg-obsidian text-white',
  'placeholder:text-silver/60 shadow-inset-top',
  'transition-[border-color,box-shadow] duration-150 ease-calm',
  'hover:border-divider',
  'focus:border-forged/60 focus:shadow-glow-subtle focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-40'
);

const FIELD_INVALID = 'border-heart/60 focus:border-heart/80';

/** Shared label/hint/wrapper for the form fields. */
interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  invalid?: boolean;
  hintId: string;
  children: ReactNode;
  className?: string;
}

function FieldShell({
  id,
  label,
  hint,
  invalid,
  hintId,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="studio-type-label">
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p
          id={hintId}
          className={cn(
            'studio-type-body text-[12px] leading-snug',
            invalid ? 'text-heart' : 'text-silver'
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Input -- */

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  /** Class on the outer wrapper (label + control + hint). */
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, invalid, id, className, wrapperClassName, ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      invalid={invalid}
      hintId={hintId}
      className={wrapperClassName}
    >
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          FIELD_BASE,
          'h-control-touch px-3',
          invalid && FIELD_INVALID,
          className
        )}
        {...props}
      />
    </FieldShell>
  );
});

/* ------------------------------------------------------------- Textarea -- */

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, invalid, id, className, wrapperClassName, rows = 4, ...props },
    ref
  ) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const hintId = `${fieldId}-hint`;
    return (
      <FieldShell
        id={fieldId}
        label={label}
        hint={hint}
        invalid={invalid}
        hintId={hintId}
        className={wrapperClassName}
      >
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            FIELD_BASE,
            'resize-y px-3 py-2',
            invalid && FIELD_INVALID,
            className
          )}
          {...props}
        />
      </FieldShell>
    );
  }
);

/* --------------------------------------------------------------- Select -- */

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, invalid, id, className, wrapperClassName, children, ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      invalid={invalid}
      hintId={hintId}
      className={wrapperClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            FIELD_BASE,
            'h-control-touch cursor-pointer appearance-none px-3 pr-9',
            invalid && FIELD_INVALID,
            className
          )}
          {...props}
        >
          {children}
        </select>
        {/* Chevron. */}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
});

/* ------------------------------------------------------------- Checkbox -- */

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  wrapperClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, hint, invalid, id, className, wrapperClassName, ...props },
    ref
  ) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const hintId = `${fieldId}-hint`;
    return (
      <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
        <div className="flex items-center gap-2.5">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? hintId : undefined}
            className={cn(
              'h-4 w-4 shrink-0 cursor-pointer rounded-[5px] border border-divider bg-obsidian shadow-inset-top',
              'accent-forged',
              'transition-[border-color,box-shadow] duration-150 ease-calm',
              'hover:border-forged/60',
              'disabled:cursor-not-allowed disabled:opacity-40',
              invalid && 'border-heart/60',
              className
            )}
            {...props}
          />
          {label && (
            <label
              htmlFor={fieldId}
              className="studio-type-body cursor-pointer select-none text-[13px] leading-none"
            >
              {label}
            </label>
          )}
        </div>
        {hint && (
          <p
            id={hintId}
            className={cn(
              'studio-type-body text-[12px] leading-snug',
              invalid ? 'text-heart' : 'text-silver'
            )}
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);
