import { describe, expect, it } from 'vitest'
import { SAMPLE_CHARACTER } from '../src/data/characters'
import { currentCodePosition, getSlotState, initialTrainingState, trainingCode, trainingReducer } from '../src/domain/training'
import type { CodePosition, TrainingState } from '../src/domain/types'

function typeLetters(state: TrainingState, letters: string): TrainingState {
  return Array.from(letters).reduce((current, letter) => trainingReducer(current, { type: 'type-letter', letter }), state)
}

function slotStates(state: TrainingState) {
  return ([0, 1, 2, 3] as const).map(position => getSlotState(state, position))
}

describe('focused training positions', () => {
  it('keeps default four-code training and target code unchanged', () => {
    const state = initialTrainingState(SAMPLE_CHARACTER)
    expect(state.positions).toEqual([0, 1, 2, 3])
    expect(trainingCode(state)).toBe('MZGM')
    expect(currentCodePosition(state)).toBe(0)
    expect(slotStates(state)).toEqual(['hidden', 'hidden', 'hidden', 'hidden'])
    const finished = typeLetters(state, 'MZGM')
    expect(finished).toMatchObject({ accepted: 'MZGM', typed: 'MZGM', completed: true, assisted: false, hintLevelUsed: 0 })
    expect(currentCodePosition(finished)).toBeUndefined()
  })

  it('only requires the chosen initial or sound keys, with other slots provided', () => {
    const initial = initialTrainingState(SAMPLE_CHARACTER, [0])
    expect(trainingCode(initial)).toBe('M')
    expect(slotStates(initial)).toEqual(['hidden', 'revealed', 'revealed', 'revealed'])
    const initialFinished = typeLetters(initial, 'm')
    expect(initialFinished.completed).toBe(true)
    expect(slotStates(initialFinished)).toEqual(['correct', 'revealed', 'revealed', 'revealed'])
    expect(initialFinished.assisted).toBe(false)

    const sound = initialTrainingState(SAMPLE_CHARACTER, [0, 1])
    expect(trainingCode(sound)).toBe('MZ')
    const first = typeLetters(sound, 'm')
    expect(currentCodePosition(first)).toBe(1)
    expect(first.completed).toBe(false)
    expect(typeLetters(first, 'z').completed).toBe(true)
  })

  it('validates shape-only input at original third and fourth positions', () => {
    const shape = initialTrainingState(SAMPLE_CHARACTER, [2, 3])
    expect(trainingCode(shape)).toBe('GM')
    expect(currentCodePosition(shape)).toBe(2)
    expect(slotStates(shape)).toEqual(['revealed', 'revealed', 'hidden', 'hidden'])
    const wrong = typeLetters(shape, 'j')
    expect(wrong.error).toEqual({ position: 2, input: 'J', expected: 'G', errorType: 'unknown' })
    expect(wrong.accepted).toBe('')
    expect(wrong.typed).toBe('J')
    expect(currentCodePosition(wrong)).toBe(2)
    expect(slotStates(wrong)).toEqual(['revealed', 'revealed', 'incorrect', 'hidden'])
    const first = typeLetters(wrong, 'g')
    expect(first).toMatchObject({ accepted: 'G', typed: 'JG', error: null, completed: false })
    expect(currentCodePosition(first)).toBe(3)
    expect(typeLetters(first, 'm')).toMatchObject({ accepted: 'GM', typed: 'JGM', completed: true })
  })

  it('supports a final-only target and a single last-shape target', () => {
    const final = initialTrainingState(SAMPLE_CHARACTER, [1])
    expect(currentCodePosition(final)).toBe(1)
    expect(typeLetters(final, 'm').error).toMatchObject({ position: 1, errorType: 'final-key' })
    expect(typeLetters(final, 'z').completed).toBe(true)
    const last = initialTrainingState(SAMPLE_CHARACTER, [3])
    expect(currentCodePosition(last)).toBe(3)
    expect(trainingCode(last)).toBe('M')
    expect(typeLetters(last, 'g').error).toMatchObject({ position: 3, expected: 'M', errorType: 'unknown' })
    expect(slotStates(typeLetters(last, 'm'))).toEqual(['revealed', 'revealed', 'revealed', 'correct'])
  })

  it('keeps repeated keys in separate non-adjacent teaching positions', () => {
    const state = initialTrainingState(SAMPLE_CHARACTER, [0, 3])
    expect(trainingCode(state)).toBe('MM')
    const first = typeLetters(state, 'm')
    expect(first.completed).toBe(false)
    expect(currentCodePosition(first)).toBe(3)
    expect(slotStates(first)).toEqual(['correct', 'revealed', 'revealed', 'hidden'])
    const wrong = typeLetters(first, 'g')
    expect(wrong.error).toMatchObject({ position: 3, expected: 'M', errorType: 'unknown' })
    expect(slotStates(typeLetters(wrong, 'm'))).toEqual(['correct', 'revealed', 'revealed', 'correct'])
  })

  it('copies positions and rejects empty, duplicated, descending or out-of-range targets', () => {
    const positions: CodePosition[] = [2, 3]
    const state = initialTrainingState(SAMPLE_CHARACTER, positions)
    positions[0] = 0
    expect(state.positions).toEqual([2, 3])
    for (const invalid of [[], [0, 0], [3, 2], [-1], [4], [0, 1.5], [NaN]]) {
      expect(() => initialTrainingState(SAMPLE_CHARACTER, invalid as CodePosition[])).toThrow('Training positions')
    }
  })
})

describe('attempt assistance and exact typed history', () => {
  it('retains hint peak after success resets the visible hint level', () => {
    let state = initialTrainingState(SAMPLE_CHARACTER, [2, 3])
    for (let i = 0; i < 3; i++) state = trainingReducer(state, { type: 'hint' })
    expect(state).toMatchObject({ hintLevel: 3, hintLevelUsed: 3, assisted: true })
    expect(slotStates(state)).toEqual(['revealed', 'revealed', 'revealed', 'hidden'])
    state = typeLetters(state, 'g')
    expect(state).toMatchObject({ hintLevel: 0, hintLevelUsed: 3, assisted: true, typed: 'G', accepted: 'G' })
    expect(getSlotState(state, 3)).toBe('hidden')
    state = trainingReducer(state, { type: 'hint' })
    expect(state).toMatchObject({ hintLevel: 1, hintLevelUsed: 3, assisted: true })
    state = typeLetters(state, 'm')
    expect(state).toMatchObject({ completed: true, hintLevel: 0, hintLevelUsed: 3, assisted: true, typed: 'GM' })
  })

  it('marks viewing an explanation without advancing visible hints or input', () => {
    let state = initialTrainingState(SAMPLE_CHARACTER, [2])
    state = trainingReducer(state, { type: 'mark-assisted' })
    expect(state).toMatchObject({ assisted: true, hintLevelUsed: 0, hintLevel: 0, accepted: '', typed: '' })
    state = trainingReducer(state, { type: 'mark-assisted', hintLevel: 4 })
    expect(state).toMatchObject({ assisted: true, hintLevelUsed: 4, hintLevel: 0 })
    expect(getSlotState(state, 2)).toBe('hidden')
    expect(trainingReducer(state, { type: 'mark-assisted', hintLevel: 2 })).toBe(state)
    const completed = typeLetters(state, 'g')
    expect(completed).toMatchObject({ assisted: true, hintLevelUsed: 4, completed: true })
  })

  it('records all normalized mistakes and correct keys but ignores non-letter events', () => {
    const initial = initialTrainingState(SAMPLE_CHARACTER, [2, 3])
    const wrong = typeLetters(initial, 'jj')
    expect(wrong).toMatchObject({ accepted: '', typed: 'JJ', assisted: false, hintLevelUsed: 0 })
    expect(trainingReducer(wrong, { type: 'type-letter', letter: 'Enter' })).toBe(wrong)
    const completed = typeLetters(wrong, 'gxm')
    expect(completed).toMatchObject({ accepted: 'GM', typed: 'JJGXM', completed: true })
    expect(trainingReducer(completed, { type: 'type-letter', letter: 'A' })).toBe(completed)
    expect(trainingReducer(completed, { type: 'hint' })).toBe(completed)
    expect(trainingReducer(completed, { type: 'mark-assisted', hintLevel: 4 })).toBe(completed)
  })

  it('preserves targets but clears metadata on reset; load-entry can select new targets', () => {
    let state = typeLetters(initialTrainingState(SAMPLE_CHARACTER, [2, 3]), 'jg')
    state = trainingReducer(state, { type: 'hint' })
    expect(trainingReducer(state, { type: 'reset' })).toEqual(initialTrainingState(SAMPLE_CHARACTER, [2, 3]))
    const completed = typeLetters(initialTrainingState(SAMPLE_CHARACTER, [3]), 'm')
    expect(trainingReducer(completed, { type: 'reset' })).toEqual(initialTrainingState(SAMPLE_CHARACTER, [3]))
    expect(trainingReducer(state, { type: 'load-entry', entry: SAMPLE_CHARACTER, positions: [0, 1] })).toEqual(initialTrainingState(SAMPLE_CHARACTER, [0, 1]))
    expect(trainingReducer(state, { type: 'load-entry', entry: SAMPLE_CHARACTER })).toEqual(initialTrainingState(SAMPLE_CHARACTER))
  })
})
