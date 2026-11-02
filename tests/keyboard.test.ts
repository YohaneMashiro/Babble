import { describe, expect, it } from 'vitest'
import { shouldHandleTrainingKey } from '../src/domain/keyboard'

const event = {
  key: 'm',
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  repeat: false,
}

describe('physical keyboard filtering', () => {
  it('allows ASCII letters and the three training shortcuts', () => {
    for (const key of ['a', 'M', 'z', ' ', 'Enter', 'Backspace']) {
      expect(shouldHandleTrainingKey({ ...event, key }, false, false)).toBe(true)
    }
  })

  it('preserves browser shortcuts even when their letter is a training answer', () => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(shouldHandleTrainingKey({ ...event, [modifier]: true }, false, false)).toBe(false)
      expect(shouldHandleTrainingKey({ ...event, key: 'Backspace', [modifier]: true }, false, false)).toBe(false)
    }
  })

  it('does not train while editing text or while an inspector blocks input', () => {
    for (const key of ['M', ' ', 'Enter', 'Backspace']) {
      expect(shouldHandleTrainingKey({ ...event, key }, true, false)).toBe(false)
      expect(shouldHandleTrainingKey({ ...event, key }, false, true)).toBe(false)
    }
  })

  it('ignores composing and held keys to avoid accidental progress', () => {
    expect(shouldHandleTrainingKey({ ...event, isComposing: true }, false, false)).toBe(false)
    expect(shouldHandleTrainingKey({ ...event, repeat: true }, false, false)).toBe(false)
    expect(shouldHandleTrainingKey({ ...event, key: ' ', repeat: true }, false, false)).toBe(false)
  })

  it('ignores IME values, nonletters, and unrelated navigation keys', () => {
    for (const key of ['某', 'Process', 'Dead', 'ｍ', 'ß', '1', '.', 'Tab', 'Escape', 'ArrowLeft']) {
      expect(shouldHandleTrainingKey({ ...event, key }, false, false)).toBe(false)
    }
  })
})
