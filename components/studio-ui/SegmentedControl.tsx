'use client';

import { useRef, type KeyboardEvent } from 'react';
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
 *
 * Keyboard: ArrowLeft/ArrowRight (and Up/Down) move a roving focus through
 * the radios and commit the value, wrapping at the ends — the standard
 * radiogroup pattern. Only the checked radio is in the tab order.
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
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (fromIndex: number, delta: number) => {
    const n = options.length;
    if (n === 0) return;
    const next = (fromIndex + delta + n) % n;
    const opt = options[next];
    onValueChange(opt.value);
    btnRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        e.preventDefault();
        move(-1, 1);
        break;
      case 'End':
        e.preventDefault();
        move(0, -1);
        break;
    }
  };

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
      {options.map((opt, index) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
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
