'use client'

/** Dev-harness event log. Playwright reads window.__e2e to assert on callbacks. */
export type E2ELog = {
  events: { type: string; at: number; data?: unknown }[]
  exports: { name: string; size: number; type: string; durationSeconds: number }[]
  chapters: number[]
}

declare global {
  interface Window {
    __e2e?: E2ELog
  }
}

export function e2eLog(): E2ELog {
  if (typeof window === 'undefined') return { events: [], exports: [], chapters: [] }
  if (!window.__e2e) window.__e2e = { events: [], exports: [], chapters: [] }
  return window.__e2e
}

export function e2eRecord(type: string, data?: unknown) {
  e2eLog().events.push({ type, at: Date.now(), data })
}
