'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MeterProps {
  /** Current level, 0..1. */
  level: number;
  /** Orientation. Horizontal is the default tactile 4px strip. */
  orientation?: 'horizontal' | 'vertical';
  /** Smooth the decay (peak-hold-like falloff). Off = follows level exactly. */
  smooth?: boolean;
  className?: string;
  'aria-label'?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * A tactile signal meter: inset well, cyan→ice gradient fill, smooth
 * decay. Purely presentational — the caller feeds a 0..1 level.
 *
 * Decay is animated via rAF and is intentionally NOT gated by
 * prefers-reduced-motion: it is data (a falling signal level), not
 * decorative motion.
 */
export function Meter({
  level,
  orientation = 'horizontal',
  smooth = true,
  className,
  ...rest
}: MeterProps) {
  const target = clamp01(level);
  const [smoothed, setSmoothed] = useState(target);
  const raf = useRef<number | null>(null);
  const shownRef = useRef(target);

  useEffect(() => {
    if (!smooth) return;
    const tick = () => {
      const cur = shownRef.current;
      // Snap up (attack), ease down (decay).
      const next = target > cur ? target : cur + (target - cur) * 0.18;
      shownRef.current = Math.abs(next - target) < 0.001 ? target : next;
      setSmoothed(shownRef.current);
      if (shownRef.current !== target) {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, smooth]);

  const vertical = orientation === 'vertical';
  // Non-smooth follows the level exactly; smooth uses the rAF-decayed value.
  const shown = smooth ? smoothed : target;
  const pct = `${(shown * 100).toFixed(2)}%`;

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(target.toFixed(2))}
      aria-label={rest['aria-label'] ?? 'level'}
      className={cn(
        'relative overflow-hidden rounded-full border border-divider bg-obsidian shadow-inset-well',
        vertical ? 'h-full w-meter' : 'h-meter w-full',
        className
      )}
    >
      <div
        className="rounded-full bg-gradient-to-r from-forged to-ice"
        style={
          vertical
            ? { position: 'absolute', bottom: 0, left: 0, right: 0, height: pct }
            : { height: '100%', width: pct }
        }
      />
    </div>
  );
}
