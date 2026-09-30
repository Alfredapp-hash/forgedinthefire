'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type RecordState = 'idle' | 'armed' | 'recording';

export interface RecordButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  state: RecordState;
  size?: number;
  /** Accessible label override; a sensible default is derived from state. */
  'aria-label'?: string;
}

const DEFAULT_LABEL: Record<RecordState, string> = {
  idle: 'Arm recording',
  armed: 'Start recording',
  recording: 'Stop recording',
};

/**
 * The signature studio control. A large, tactile circular record button:
 *
 *  - idle:      calm graphite well with a red dot, ready to arm.
 *  - armed:     a red rim that BREATHES (slow), signalling "ready to roll".
 *  - recording: the rim PULSES on a ~0.8s heartbeat and the glyph becomes
 *               a stop square.
 *
 * Reduced-motion users get strong static rims instead of the animations
 * (handled by .studio-rec-armed / .studio-rec-recording in globals.css),
 * so state is never conveyed by motion alone — the glyph and label change
 * too.
 */
export const RecordButton = forwardRef<HTMLButtonElement, RecordButtonProps>(
  function RecordButton(
    { state, size = 72, className, style, type = 'button', ...props },
    ref
  ) {
    const label = props['aria-label'] ?? DEFAULT_LABEL[state];
    const recording = state === 'recording';
    const armed = state === 'armed';

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={recording}
        className={cn(
          'group relative inline-flex items-center justify-center rounded-full',
          'border border-divider bg-gradient-to-b from-[#1c252f] to-[#10151b]',
          'transition-[box-shadow,transform,filter] duration-200 ease-calm',
          'shadow-inset-top',
          'hover:brightness-110 active:scale-[0.97]',
          'disabled:pointer-events-none disabled:opacity-40',
          armed && 'studio-rec-armed',
          recording && 'studio-rec-recording',
          className
        )}
        style={{ height: size, width: size, ...style }}
        {...props}
      >
        {/* The record glyph: a red disc that morphs to a stop square while
            recording. Colour + shape carry state independently of motion. */}
        <span
          aria-hidden
          className={cn(
            'block bg-heart transition-all duration-200 ease-calm',
            recording
              ? 'h-[38%] w-[38%] rounded-[4px]'
              : 'h-[46%] w-[46%] rounded-full',
            armed && 'shadow-[0_0_16px_rgba(255,91,115,0.6)]'
          )}
        />
      </button>
    );
  }
);
