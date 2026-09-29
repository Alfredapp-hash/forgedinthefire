/**
 * Control-room safety shortcuts (pure; the component wires them to window keydown).
 *
 *   D        → DUMP (discard the delay, cut to the safe slate, silence until Resume)
 *   S        → safe slate (Program cuts to "We'll be right back", guest muted)
 *   Esc Esc  → DUMP (two presses within 600 ms). Esc never types a character, so this
 *              one also works while the cursor is in a text field.
 *
 * The letter keys are ignored while typing (inputs, textareas, selects, contenteditable,
 * ARIA text roles) and whenever a modifier is held, so browser shortcuts keep working.
 */

export type HotkeyAction = 'dump' | 'safe-slate'

export const DOUBLE_ESC_MS = 600

export const HOTKEY_HELP: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: 'D', action: 'Dump (discard the delay, slate + silence)' },
  { keys: 'S', action: 'Safe slate' },
  { keys: 'Esc Esc', action: 'Dump — also works inside a text field' },
]

export type TargetLike = {
  tagName?: string
  isContentEditable?: boolean
  type?: string
  getAttribute?: (name: string) => string | null
} | null

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** True when a keystroke on this element would type (or navigate a select). */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = (target.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((target.type || 'text').toLowerCase())
  const role = target.getAttribute?.('role')
  return role === 'textbox' || role === 'combobox' || role === 'searchbox'
}

export type KeyLike = {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  repeat?: boolean
  defaultPrevented?: boolean
  target?: TargetLike
}

export class HotkeyMatcher {
  private lastEscAt: number | null = null

  constructor(private doubleEscMs = DOUBLE_ESC_MS) {}

  match(e: KeyLike, now: number): HotkeyAction | null {
    if (e.repeat || e.defaultPrevented) return null
    if (e.key === 'Escape') {
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
        this.lastEscAt = null
        return null
      }
      if (this.lastEscAt != null && now - this.lastEscAt <= this.doubleEscMs) {
        this.lastEscAt = null
        return 'dump'
      }
      this.lastEscAt = now
      return null
    }
    this.lastEscAt = null
    if (e.ctrlKey || e.metaKey || e.altKey) return null
    if (isTypingTarget(e.target ?? null)) return null
    const k = e.key.toLowerCase()
    if (k === 'd') return 'dump'
    if (k === 's') return 'safe-slate'
    return null
  }
}
