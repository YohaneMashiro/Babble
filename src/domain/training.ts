import { getCodeSlots, normalizeLetter } from './encoding'
import { validateTrainingEntry } from './training-entry'
import type {
  CharacterEntry,
  CodePosition,
  CodeSlotState,
  ErrorType,
  HintLevel,
  TrainingAction,
  TrainingState,
} from './types'

const ALL_POSITIONS: readonly CodePosition[] = [0, 1, 2, 3]

export function initialTrainingState(entry: CharacterEntry, positions: readonly CodePosition[] = entry.encoding === 'shuangpin' ? [0, 1] : ALL_POSITIONS): TrainingState {
  const issues = validateTrainingEntry(entry)
  if (issues.length) throw new Error(`Invalid character entry: ${issues.join('; ')}`)
  if (!positions.length || positions.some((position, index) =>
    !Number.isInteger(position) || position < 0 || position > 3 || (index > 0 && position <= positions[index - 1]),
  )) throw new Error('Training positions must be a non-empty, unique, ascending subset of 0–3')
  if (entry.encoding === 'shuangpin' && positions.some(position => position > 1)) throw new Error('Sound-only training can use only the two sound positions')

  return { entry, positions: [...positions], accepted: '', typed: '', error: null, hintLevel: 0, hintLevelUsed: 0, assisted: false, completed: false }
}

export function currentCodePosition(state: TrainingState): CodePosition | undefined {
  return state.completed ? undefined : state.positions[state.accepted.length]
}

export function trainingCode(state: TrainingState): string {
  const slots = getCodeSlots(state.entry)
  return state.positions.map(position => slots[position].key).join('')
}

function errorTypeAt(position: CodePosition): ErrorType {
  if (position === 0) return 'initial-key'
  if (position === 1) return 'final-key'
  // A wrong shape key alone cannot distinguish recognition, mapping, or a slip.
  return 'unknown'
}

export function trainingReducer(state: TrainingState, action: TrainingAction): TrainingState {
  if (action.type === 'load-entry') return initialTrainingState(action.entry, action.positions)
  if (action.type === 'reset') return initialTrainingState(state.entry, state.positions)
  if (state.completed) return state
  if (action.type === 'mark-assisted') {
    const hintLevelUsed = Math.max(state.hintLevelUsed, action.hintLevel ?? 0) as HintLevel
    return state.assisted && hintLevelUsed === state.hintLevelUsed ? state : { ...state, assisted: true, hintLevelUsed }
  }
  if (action.type === 'hint') {
    const hintLevel = Math.min(4, state.hintLevel + 1) as HintLevel
    return hintLevel === state.hintLevel ? state : {
      ...state,
      hintLevel,
      hintLevelUsed: Math.max(state.hintLevelUsed, hintLevel) as HintLevel,
      assisted: true,
    }
  }

  const letter = normalizeLetter(action.letter)
  if (!letter) return state

  const position = currentCodePosition(state)
  if (position === undefined) return state
  const typed = state.typed + letter
  const expected = getCodeSlots(state.entry)[position].key
  if (letter !== expected) {
    return {
      ...state,
      typed,
      error: { position, input: letter, expected, errorType: errorTypeAt(position) },
    }
  }

  const accepted = state.accepted + letter
  return {
    ...state,
    accepted,
    typed,
    error: null,
    hintLevel: 0,
    completed: accepted.length === state.positions.length,
  }
}

export function getSlotState(state: TrainingState, position: CodePosition): CodeSlotState {
  const practicedIndex = state.positions.indexOf(position)
  if (practicedIndex === -1) return 'revealed'
  if (practicedIndex < state.accepted.length) return 'correct'
  if (state.error?.position === position) return 'incorrect'
  if (state.hintLevel === 4) return 'revealed'
  if (position === currentCodePosition(state)) {
    if (state.hintLevel >= 3) return 'revealed'
    if (state.hintLevel > 0) return 'hinted'
  }
  return 'hidden'
}
