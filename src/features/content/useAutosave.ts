'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { ContentItem } from './types'

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved'

const LS_KEY = (id: string) => `forged_blog_draft_${id}`

export function saveLocalDraft(item: ContentItem) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY(item.id), JSON.stringify({ item, savedAt: Date.now() }))
  } catch { /* quota */ }
}

export function loadLocalDraft(id: string): { item: ContentItem; savedAt: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY(id))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearLocalDraft(id: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(LS_KEY(id))
  } catch { /* noop */ }
}

export function useAutosave(
  item: ContentItem | null,
  onSave: (item: ContentItem) => Promise<void>,
  setSaveState: (s: SaveState) => void,
  delayMs = 30000
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(item)
  useEffect(() => {
    latest.current = item
  }, [item])

  const flush = useCallback(async () => {
    if (!latest.current) return
    setSaveState('saving')
    saveLocalDraft(latest.current)
    await onSave(latest.current)
    setSaveState('saved')
    clearLocalDraft(latest.current.id)
    setTimeout(() => setSaveState('idle'), 2500)
  }, [onSave, setSaveState])

  useEffect(() => {
    if (!item) return
    setSaveState('unsaved')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flush()
    }, delayMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item, delayMs, flush, setSaveState])

  return { flush }
}
