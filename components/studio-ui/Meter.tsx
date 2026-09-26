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
  /**
   * Draw a thin held peak line at the highest recent level. It holds for
   * ~1.2s, then decays. Default true. Updated imperatively (no per-frame
   * React render), matching the meter's zero-render design.
   */
  peakHold?: boolean;
  className?: string;
  'aria-label'?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const PEAK_HOLD_MS = 1200;
const PEAK_DECAY = 0.06; // fraction of the gap closed per frame after hold

/**
 * A tactile signal meter: inset well, cyan→ice gradient fill, smooth
 * decay. Purely presentational — the caller feeds a 0..1 level.
 *
 * Decay is animated via rAF and is intentionally NOT gated by
 * prefers-reduced-motion: it is data (a falling signal level), not
 * decorative motion. The held peak line is likewise data, not decoration.
 */
export function Meter({
  level,
  orientation = 'horizontal',
  smooth = true,
  peakHold = true,
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

  // ---- Peak-hold: imperative, no per-frame React render ----
  const peakLineRef = useRef<HTMLDivElement | null>(null);
  const peakValueRef = useRef(0); // held peak level, 0..1
  const peakSetAtRef = useRef(0); // timestamp the current peak was set
  const peakRaf = useRef<number | null>(null);

  useEffect(() => {
    if (!peakHold) return;
    const el = peakLineRef.current;
    if (!el) return;

    // Bump the held peak if the incoming level exceeds it.
    if (target >= peakValueRef.current) {
      peakValueRef.current = target;
      peakSetAtRef.current = performance.now();
    }

    const apply = (p: number) => {
      const posPct = `${(p * 100).toFixed(2)}%`;
      el.style.opacity = p > 0.001 ? '1' : '0';
      if (vertical) {
        el.style.bottom = posPct;
      } else {
        el.style.left = posPct;
      }
    };

    apply(peakValueRef.current);

    const tick = () => {
      const elapsed = performance.now() - peakSetAtRef.current;
      let cont = false;
      if (elapsed > PEAK_HOLD_MS && peakValueRef.current > target) {
        // Decay toward the current level after the hold window.
        const gap = peakValueRef.current - target;
        peakValueRef.current =
          gap < 0.002 ? target : peakValueRef.current - gap * PEAK_DECAY;
        cont = peakValueRef.current > target + 0.002;
      } else {
        cont = elapsed <= PEAK_HOLD_MS && peakValueRef.current > target;
      }
      apply(peakValueRef.current);
      if (cont) {
        peakRaf.current = requestAnimationFrame(tick);
      }
    };
    peakRaf.current = requestAnimationFrame(tick);
    return () => {
      if (peakRaf.current) cancelAnimationFrame(peakRaf.current);
    };
  }, [target, peakHold, vertical]);

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
      {peakHold && (
        <div
          ref={peakLineRef}
          aria-hidden
          className={cn(
            'pointer-events-none absolute bg-ice shadow-glow-subtle',
            vertical ? 'left-0 right-0 h-px' : 'top-0 bottom-0 w-px'
          )}
          style={{ opacity: 0 }}
        />
      )}
    </div>
  );
}
