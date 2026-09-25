'use client';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: 'compact' | 'dense';
  'aria-label'?: string;
  className?: string;
}

/**
 * An iOS-style segmented control: a graphite well with a sliding-feel
 * selected pill. Token-driven; state is owned by the caller.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = 'compact',
  className,
  ...rest
}: SegmentedControlProps<T>) {
  const h = size === 'dense' ? 'h-control-dense' : 'h-control-compact';
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex items-center gap-1 rounded-control border border-divider bg-obsidian p-1',
        'shadow-inset-well',
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              'studio-type-button rounded-[6px] px-3',
              h,
              'transition-[background-color,color,box-shadow] duration-150 ease-calm',
              selected
                ? 'bg-surface-raised text-white shadow-[inset_0_1px_0_rgba(246,250,252,0.06),0_0_12px_rgba(83,214,255,0.1)]'
                : 'text-silver hover:text-white'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
