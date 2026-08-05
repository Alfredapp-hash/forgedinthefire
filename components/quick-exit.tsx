'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { quickEscape } from '@/lib/utils';
import { LogOut } from 'lucide-react';

/**
 * Quick Exit Component
 *
 * A trauma-informed safety feature that allows users to quickly leave the site
 * and navigate to a neutral external page. This is critical for survivor safety.
 *
 * Features:
 * - Keyboard shortcut (Ctrl/Cmd + Escape) for immediate exit
 * - Floating button always visible, never scrolls away
 * - Redirects to a neutral site
 *
 * Visual note: the button wears the dark red from the middle of the heart, sampled
 * from the hero footage rather than picked (see the --heart-interior tokens). It is
 * not alarm red, but it remains the single most distinct control on the page — it is
 * the only warm-filled element outside the hero, the only one with a persistent
 * breathing rim, it sits above everything at z-50, it is oversized relative to
 * surrounding controls, and it brightens 2.5x on hover/focus.
 *
 * A deep red is inherently dark, so the fill alone reaches only 2.25:1 against the
 * page — under the 3:1 WCAG 1.4.11 wants of a control's boundary. The rim carries
 * that instead, at 5.39:1. Colour is never the only signal either: the button always
 * carries the literal words "Quick Exit" plus an exit icon.
 */
export function QuickExit() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Admin/auth routes don't need the quick exit feature.
  const isAdminRoute =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/unauthorized');

  useEffect(() => {
    setIsMounted(true);
    // Short delay so it isn't jarring on initial load.
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd guards against an accidental bare Escape press.
    if (event.key === 'Escape' && (event.ctrlKey || event.metaKey)) {
      quickEscape();
    }
  }, []);

  useEffect(() => {
    if (!isMounted || isAdminRoute) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, isMounted, isAdminRoute]);

  // Hooks must run unconditionally, so bail out only at render time.
  if (isAdminRoute) return null;
  if (!isMounted) return null;

  return (
    <div
      className={`group fixed bottom-4 right-4 z-50 transition-all duration-500 ease-out
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
      role="complementary"
      aria-label="Safety exit"
    >
      {/* Tooltip for the keyboard shortcut */}
      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="rounded bg-[#11161C] px-2 py-1 text-xs text-[#B8C4CF] opacity-0 shadow-forge-sm ring-1 ring-[rgba(83,214,255,0.2)] transition-opacity group-hover:opacity-100">
          Ctrl+Esc to exit
        </span>
      </div>

      <button
        type="button"
        onClick={quickEscape}
        className="quick-exit-alert inline-flex h-12 min-h-11 items-center justify-center gap-2 rounded-lg px-6 text-base font-bold tracking-wide transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8DEBFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070A]"
        aria-label="Quick Exit - Leave this site immediately"
      >
        <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        <span>Quick Exit</span>
        <span className="sr-only">
          Press to immediately leave this website and go to weather.com. You can
          also press Ctrl+Escape to exit quickly.
        </span>
      </button>
    </div>
  );
}
