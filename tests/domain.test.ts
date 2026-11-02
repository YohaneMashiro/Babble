import { describe, expect, it } from 'vitest'
import { KEY_DEFINITIONS, SAMPLE_CHARACTER, SAMPLE_CHARACTERS } from '../src/data'
import {
  getCodeSlots,
  getSlotState,
  initialTrainingState,
  normalizeLetter,
  trainingReducer,
  validateCharacterEntry,
} from '../src/domain'
import type { CharacterEntry, CodePosition, TrainingState } from '../src/domain'

function typeLetters(state: TrainingState, letters: string): TrainingState {
  return Array.from(letters).reduce(
    (current, letter) => trainingReducer(current, { type: 'type-letter', letter }),
    state,
  )
}

describe('explicit fixture encoding', () => {
  it('retains all four supplied explanations and their ordered keys', () => {
    expect(SAMPLE_CHARACTERS).toHaveLength(1)
    expect(SAMPLE_CHARACTER.char).toBe('某')
    expect(SAMPLE_CHARACTER.pronunciation.pinyin).toBe('mou')
    expect(getCodeSlots(SAMPLE_CHARACTER).map((slot) => slot.explanation)).toEqual([
      'm → M', 'ou → Z', '甘 → G', '木 → M',
    ])
    expect(getCodeSlots(SAMPLE_CHARACTER).map((slot) => slot.key).join('')).toBe('MZGM')
    expect(validateCharacterEntry(SAMPLE_CHARACTER)).toEqual([])
    expect(SAMPLE_CHARACTER.provenance.status).toBe('test-fixture')
    expect(SAMPLE_CHARACTER.provenance.redistribution).toBe('unconfirmed')
  })

  it('rejects a code that contradicts its explained positions', () => {
    const inconsistent: CharacterEntry = { ...SAMPLE_CHARACTER, fullCode: 'MZJM' }
    expect(validateCharacterEntry(inconsistent)).toContain('fullCode does not match the four explained keys')
    expect(() => initialTrainingState(inconsistent)).toThrow('Invalid character entry')
  })

  it('does not silently repair invalid keys or missing explanations', () => {
    const invalid: CharacterEntry = {
      ...SAMPLE_CHARACTER,
      shape: { ...SAMPLE_CHARACTER.shape, first: { component: '', key: 'gg' } },
    }
    expect(validateCharacterEntry(invalid)).toEqual(expect.arrayContaining([
      'first-shape must have an explanation value',
      'first-shape key must be one uppercase A–Z letter',
    ]))
  })
})

describe('single-character training', () => {
  it('accepts M Z G M one position at a time and completes only at four', () => {
    let state = initialTrainingState(SAMPLE_CHARACTER)
    expect([0, 1, 2, 3].map((position) => getSlotState(state, position as CodePosition)))
      .toEqual(['hidden', 'hidden', 'hidden', 'hidden'])

    for (const [index, letter] of Array.from('MZGM').entries()) {
      state = trainingReducer(state, { type: 'type-letter', letter })
      expect(state.accepted).toBe('MZGM'.slice(0, index + 1))
      expect(state.completed).toBe(index === 3)
      expect(getSlotState(state, index as CodePosition)).toBe('correct')
      expect(state.error).toBeNull()
    }
    expect(trainingReducer(state, { type: 'type-letter', letter: 'A' })).toBe(state)
  })

  it('keeps a wrong third key at the same position and accepts its correction', () => {
    const before = typeLetters(initialTrainingState(SAMPLE_CHARACTER), 'MZ')
    const wrong = trainingReducer(before, { type: 'type-letter', letter: 'J' })
    expect(wrong.accepted).toBe('MZ')
    expect(wrong.completed).toBe(false)
    expect(wrong.error).toEqual({ position: 2, input: 'J', expected: 'G', errorType: 'unknown' })
    expect(getSlotState(wrong, 2)).toBe('incorrect')
    expect(getSlotState(wrong, 3)).toBe('hidden')

    const corrected = trainingReducer(wrong, { type: 'type-letter', letter: 'g' })
    expect(corrected.accepted).toBe('MZG')
    expect(corrected.error).toBeNull()
    expect(corrected.completed).toBe(false)
  })

  it('reports the sound slot type without inferring a shape mistake cause', () => {
    const initial = initialTrainingState(SAMPLE_CHARACTER)
    expect(typeLetters(initial, 'A').error?.errorType).toBe('initial-key')
    expect(typeLetters(initial, 'MA').error?.errorType).toBe('final-key')
    expect(typeLetters(initial, 'MZGA').error?.errorType).toBe('unknown')
  })

  it('normalizes ASCII letters and ignores all other input', () => {
    expect(typeLetters(initialTrainingState(SAMPLE_CHARACTER), 'mZgM').accepted).toBe('MZGM')
    expect(normalizeLetter('z')).toBe('Z')
    const initial = initialTrainingState(SAMPLE_CHARACTER)
    for (const letter of ['', ' ', '1', '某', 'ｍ', 'MZGM', 'Enter', 'ß']) {
      expect(trainingReducer(initial, { type: 'type-letter', letter })).toBe(initial)
    }
  })

  it('reveals the current slot progressively, caps hints, and resets hints after success', () => {
    let state = initialTrainingState(SAMPLE_CHARACTER)
    state = trainingReducer(state, { type: 'hint' })
    expect(state.hintLevel).toBe(1)
    expect(getSlotState(state, 0)).toBe('hinted')
    expect(getSlotState(state, 1)).toBe('hidden')
    state = trainingReducer(state, { type: 'hint' })
    expect(state.hintLevel).toBe(2)
    state = trainingReducer(state, { type: 'hint' })
    expect(state.hintLevel).toBe(3)
    expect(getSlotState(state, 0)).toBe('revealed')
    state = trainingReducer(state, { type: 'hint' })
    expect(state.hintLevel).toBe(4)
    expect(getSlotState(state, 3)).toBe('revealed')
    expect(trainingReducer(state, { type: 'hint' })).toBe(state)
    state = trainingReducer(state, { type: 'type-letter', letter: 'M' })
    expect(state.hintLevel).toBe(0)
    expect(getSlotState(state, 0)).toBe('correct')
    expect(getSlotState(state, 1)).toBe('hidden')
  })

  it('resets a partial attempt and a completed attempt while retaining the entry', () => {
    const initial = initialTrainingState(SAMPLE_CHARACTER)
    const partial = trainingReducer(typeLetters(initial, 'MZJ'), { type: 'hint' })
    expect(trainingReducer(partial, { type: 'reset' })).toEqual(initial)
    expect(trainingReducer(typeLetters(initial, 'MZGM'), { type: 'reset' })).toEqual(initial)
  })
})

describe('partial keyboard mapping', () => {
  it('contains A–Z and only associations present in the explicit fixture', () => {
    expect(KEY_DEFINITIONS.map((definition) => definition.key).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(KEY_DEFINITIONS.every((definition) => !definition.complete)).toBe(true)
    const m = KEY_DEFINITIONS.find((definition) => definition.key === 'M')!
    expect(m.initials).toEqual(['m'])
    expect(m.finals).toEqual([])
    expect(m.shapeRoots).toEqual([{ root: '木' }])
    const z = KEY_DEFINITIONS.find((definition) => definition.key === 'Z')!
    expect(z.finals).toEqual(['ou'])
    const g = KEY_DEFINITIONS.find((definition) => definition.key === 'G')!
    expect(g.shapeRoots).toEqual([{ root: '甘' }])

    for (const definition of KEY_DEFINITIONS.filter((key) => !['M', 'Z', 'G'].includes(key.key))) {
      expect(definition.initials).toEqual([])
      expect(definition.finals).toEqual([])
      expect(definition.shapeRoots).toEqual([])
      expect(definition.provenance).toEqual([])
    }
  })
})
