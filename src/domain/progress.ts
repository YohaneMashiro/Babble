import type { CharacterEntry, CodePosition, TrainingState } from './types'
import { trainingCode } from './training'
import type { Lesson } from './lessons'
import { resolveLessonEntries } from './lessons'

export type ExperienceLevel = 'new' | 'shuangpin' | 'some-shape' | 'yinxing'
export interface AttemptRecord {
  char: string
  fullCode: string
  code: string
  targetCode: string
  positions: readonly CodePosition[]
  correct: boolean
  completed: boolean
  wrongPosition?: CodePosition
  timestamp: number
  hintLevelUsed: number
  assisted: boolean
  lessonId?: string
}
export interface EntryProgress {
  char: string
  fullCode: string
  positions: readonly CodePosition[]
  seen: boolean
  attempts: number
  completed: number
  independentCorrect: number
  consecutiveIndependent: number
  bestIndependentStreak: number
  lastAttemptAt: number
}
export interface LearningSnapshot {
  version: 1
  experience: ExperienceLevel
  entries: Readonly<Record<string, EntryProgress>>
  lessons: Readonly<Record<string, { lastEntryIndex: number }>>
  lastLessonId: string | null
}
export interface LessonProgress {
  seen: number
  attempted: number
  mastered: number
  total: number
  lastEntryIndex: number
}

const allPositions: readonly CodePosition[] = [0, 1, 2, 3]
const slotTypes = ['initial', 'final', 'first-shape', 'last-shape'] as const
const experiences: readonly ExperienceLevel[] = ['new', 'shuangpin', 'some-shape', 'yinxing']

export function lessonPositions(lesson: Lesson): readonly CodePosition[] {
  if (!lesson.focus?.length) return allPositions
  return slotTypes.flatMap((type, index) => lesson.focus!.includes(type) ? [index as CodePosition] : [])
}

export function emptyLearningSnapshot(): LearningSnapshot {
  return { version: 1, experience: 'shuangpin', entries: {}, lessons: {}, lastLessonId: null }
}

export function progressKey(entry: Pick<CharacterEntry, 'char' | 'fullCode'>, positions: readonly CodePosition[]): string {
  return `${entry.char}:${entry.fullCode}:${positions.join('')}`
}

function emptyEntry(entry: Pick<CharacterEntry, 'char' | 'fullCode'>, positions: readonly CodePosition[]): EntryProgress {
  return { char: entry.char, fullCode: entry.fullCode, positions: [...positions], seen: true, attempts: 0, completed: 0, independentCorrect: 0, consecutiveIndependent: 0, bestIndependentStreak: 0, lastAttemptAt: 0 }
}

export function markEntrySeen(snapshot: LearningSnapshot, entry: CharacterEntry, positions: readonly CodePosition[]): LearningSnapshot {
  const key = progressKey(entry, positions)
  if (snapshot.entries[key]?.seen) return snapshot
  return { ...snapshot, entries: { ...snapshot.entries, [key]: emptyEntry(entry, positions) } }
}

export function setLessonPosition(snapshot: LearningSnapshot, id: string, index: number): LearningSnapshot {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid lesson position')
  if (snapshot.lastLessonId === id && snapshot.lessons[id]?.lastEntryIndex === index) return snapshot
  return { ...snapshot, lastLessonId: id, lessons: { ...snapshot.lessons, [id]: { lastEntryIndex: index } } }
}

export function makeAttemptRecord(state: TrainingState, timestamp: number, lessonId?: string): AttemptRecord | null {
  if (!state.typed.length && !state.assisted) return null
  const targetCode = trainingCode(state)
  let targetIndex = 0
  let wrongPosition: CodePosition | undefined
  for (const letter of state.typed) {
    if (letter === targetCode[targetIndex]) targetIndex++
    else if (wrongPosition === undefined) wrongPosition = state.positions[targetIndex]
  }
  return {
    char: state.entry.char,
    fullCode: state.entry.fullCode,
    code: state.typed,
    targetCode,
    positions: [...state.positions],
    correct: state.completed && wrongPosition === undefined,
    completed: state.completed,
    ...(wrongPosition !== undefined ? { wrongPosition } : {}),
    timestamp,
    hintLevelUsed: state.hintLevelUsed,
    assisted: state.assisted,
    ...(lessonId ? { lessonId } : {}),
  }
}

export function applyAttempt(snapshot: LearningSnapshot, attempt: AttemptRecord): LearningSnapshot {
  const key = progressKey(attempt, attempt.positions)
  const previous = snapshot.entries[key] ?? emptyEntry(attempt, attempt.positions)
  const independent = attempt.completed && attempt.correct && !attempt.assisted && attempt.hintLevelUsed === 0 && attempt.wrongPosition === undefined
  const streak = independent ? previous.consecutiveIndependent + 1 : 0
  return { ...snapshot, entries: { ...snapshot.entries, [key]: {
    ...previous,
    attempts: previous.attempts + (attempt.code.length ? 1 : 0),
    completed: previous.completed + (attempt.completed ? 1 : 0),
    independentCorrect: previous.independentCorrect + (independent ? 1 : 0),
    consecutiveIndependent: streak,
    bestIndependentStreak: Math.max(previous.bestIndependentStreak, streak),
    lastAttemptAt: attempt.timestamp,
  } } }
}

export function getLessonProgress(lesson: Lesson, available: readonly CharacterEntry[], snapshot: LearningSnapshot): LessonProgress {
  const entries = resolveLessonEntries(lesson, available)
  const positions = lessonPositions(lesson)
  const stats = entries.map(entry => snapshot.entries[progressKey(entry, positions)])
  return {
    total: entries.length,
    seen: stats.filter(stat => stat?.seen).length,
    attempted: stats.filter(stat => stat && stat.attempts > 0).length,
    mastered: stats.filter(stat => stat && stat.bestIndependentStreak >= 2).length,
    lastEntryIndex: Math.min(snapshot.lessons[lesson.id]?.lastEntryIndex ?? 0, Math.max(entries.length - 1, 0)),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isCount(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function validPositions(value: unknown): value is CodePosition[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 4 && value.every((item, index) => isCount(item) && item <= 3 && (index === 0 || item > value[index - 1]))
}

/** A corrupt or newer schema remains untouched on disk; callers can use memory. */
export function restoreLearningSnapshot(raw: unknown): LearningSnapshot {
  if (!isObject(raw) || raw.version !== 1 || !experiences.includes(raw.experience as ExperienceLevel) || !isObject(raw.entries) || !isObject(raw.lessons) || !(raw.lastLessonId === null || typeof raw.lastLessonId === 'string')) throw new Error('Unsupported learning record')
  const entries: Record<string, EntryProgress> = {}
  for (const [key, value] of Object.entries(raw.entries)) {
    if (!isObject(value) || typeof value.char !== 'string' || Array.from(value.char).length !== 1 || typeof value.fullCode !== 'string' || !/^(?:[A-Z]{2}|[A-Z]{4})$/.test(value.fullCode) || !validPositions(value.positions) || (value.fullCode.length === 2 && value.positions.some(position => position > 1)) || value.seen !== true || !['attempts', 'completed', 'independentCorrect', 'consecutiveIndependent', 'bestIndependentStreak', 'lastAttemptAt'].every(field => isCount(value[field]))) throw new Error('Invalid learning entry')
    const entry = value as unknown as EntryProgress
    if (progressKey(entry, entry.positions) !== key || entry.independentCorrect > entry.completed || entry.consecutiveIndependent > entry.bestIndependentStreak || entry.bestIndependentStreak > entry.independentCorrect || entry.completed > entry.attempts) throw new Error('Inconsistent learning entry')
    entries[key] = { ...entry, positions: [...entry.positions] }
  }
  const lessons: Record<string, { lastEntryIndex: number }> = {}
  for (const [id, value] of Object.entries(raw.lessons)) {
    if (!id || !isObject(value) || !isCount(value.lastEntryIndex)) throw new Error('Invalid lesson record')
    lessons[id] = { lastEntryIndex: value.lastEntryIndex }
  }
  return { version: 1, experience: raw.experience as ExperienceLevel, entries, lessons, lastLessonId: raw.lastLessonId }
}
