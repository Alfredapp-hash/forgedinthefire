import { describe, expect, it } from 'vitest'
import { HotkeyMatcher, isTypingTarget } from '@/lib/podcast/live/hotkeys'

const input = { tagName: 'INPUT', type: 'text' }
const checkbox = { tagName: 'INPUT', type: 'checkbox' }
const button = { tagName: 'BUTTON' }

describe('isTypingTarget', () => {
  it('detects text fields but not buttons/checkboxes', () => {
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', getAttribute: (n) => (n === 'role' ? 'textbox' : null) })).toBe(true)
    expect(isTypingTarget(checkbox)).toBe(false)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(isTypingTarget(button)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('HotkeyMatcher', () => {
  it('D dumps and S engages the safe slate outside fields', () => {
    const m = new HotkeyMatcher()
    expect(m.match({ key: 's', target: button }, 0)).toBe('safe-slate')
    expect(m.match({ key: 'D', target: checkbox }, 0)).toBe('dump')
    expect(m.match({ key: 'd', shiftKey: true, target: button }, 0)).toBe('dump')
    expect(m.match({ key: 'x', target: button }, 0)).toBeNull()
  })

  it('does not hijack typing or browser shortcuts', () => {
    const m = new HotkeyMatcher()
    expect(m.match({ key: 's', target: input }, 0)).toBeNull()
    expect(m.match({ key: 'd', target: { tagName: 'TEXTAREA' } }, 0)).toBeNull()
    expect(m.match({ key: 's', ctrlKey: true, target: button }, 0)).toBeNull()
    expect(m.match({ key: 'd', metaKey: true, target: button }, 0)).toBeNull()
    expect(m.match({ key: 'd', altKey: true, target: button }, 0)).toBeNull()
    expect(m.match({ key: 's', repeat: true, target: button }, 0)).toBeNull()
    expect(m.match({ key: 'd', defaultPrevented: true, target: button }, 0)).toBeNull()
  })

  it('Esc Esc within 600 ms dumps, even in a field', () => {
    const m = new HotkeyMatcher(600)
    expect(m.match({ key: 'Escape', target: input }, 1000)).toBeNull()
    expect(m.match({ key: 'Escape', target: input }, 1400)).toBe('dump')
    // A third press starts a new pair.
    expect(m.match({ key: 'Escape' }, 1500)).toBeNull()
  })

  it('slow or interrupted Esc presses do not dump', () => {
    const m = new HotkeyMatcher(600)
    m.match({ key: 'Escape' }, 0)
    expect(m.match({ key: 'Escape' }, 700)).toBeNull()
    m.match({ key: 'Escape' }, 1000)
    m.match({ key: 'a' }, 1100)
    expect(m.match({ key: 'Escape' }, 1200)).toBeNull()
    expect(m.match({ key: 'Escape', shiftKey: true }, 1300)).toBeNull()
    expect(m.match({ key: 'Escape' }, 1400)).toBeNull()
  })
})
