import { describe, expect, it } from 'vitest'
import { SAMPLE_CHARACTER } from '../src/data/characters'
import {
  applyAttempt,
  emptyLearningSnapshot,
  getLessonProgress,
  makeAttemptRecord,
  markEntrySeen,
  progressKey,
  restoreLearningSnapshot,
  setLessonPosition,
  type AttemptRecord,
  type LearningSnapshot,
} from '../src/domain/progress'
import { initialTrainingState, trainingReducer } from '../src/domain/training'
import type { Lesson } from '../src/domain/lessons'
import type { CodePosition, TrainingState } from '../src/domain/types'

const entry = SAMPLE_CHARACTER
const available = [entry]
const fullLesson: Lesson = {
  id: 'four-code-review', title: '四码回顾', description: '用已确认样例检验学习记录。', group: 'practice', entries: [entry.char],
  teaching: { title: '逐码输入', body: '保持四码解释。' },
}
const firstShapeLesson: Lesson = { ...fullLesson, id: 'first-shape-review', focus: ['first-shape'] }

function typeLetters(state: TrainingState, code: string): TrainingState {
  return Array.from(code).reduce((current, letter) => trainingReducer(current, { type: 'type-letter', letter }), state)
}

function record(state: TrainingState, timestamp = 1, lessonId?: string): AttemptRecord {
  const result = makeAttemptRecord(state, timestamp, lessonId)
  if (!result) throw new Error('Expected a real attempted or assisted state')
  return result
}

function completed(positions?: readonly CodePosition[]): TrainingState {
  return typeLetters(initialTrainingState(entry, positions), positions?.length === 1 && positions[0] === 2 ? 'G' : 'MZGM')
}

function twiceIndependent(): LearningSnapshot {
  const first = applyAttempt(emptyLearningSnapshot(), record(completed(), 100))
  return applyAttempt(first, record(completed(), 200))
}

describe('explainable learning progress', () => {
  it('requires two consecutive independent completions before mastery', () => {
    const initial = emptyLearningSnapshot()
    const once = applyAttempt(initial, record(completed(), 100))
    expect(getLessonProgress(fullLesson, available, initial)).toMatchObject({ seen: 0, attempted: 0, mastered: 0, total: 1 })
    expect(getLessonProgress(fullLesson, available, once)).toMatchObject({ seen: 1, attempted: 1, mastered: 0, total: 1 })
    const twice = applyAttempt(once, record(completed(), 200))
    expect(getLessonProgress(fullLesson, available, twice).mastered).toBe(1)
    expect(once.entries[progressKey(entry, [0, 1, 2, 3])].bestIndependentStreak).toBe(1)
  })

  it.each([
    ['hint', () => typeLetters(trainingReducer(initialTrainingState(entry), { type: 'hint' }), 'MZGM')],
    ['slot explanation', () => typeLetters(trainingReducer(initialTrainingState(entry), { type: 'mark-assisted', hintLevel: 3 }), 'MZGM')],
    ['mistake then correction', () => typeLetters(initialTrainingState(entry), 'MZJGM')],
    ['skip partial input', () => typeLetters(initialTrainingState(entry), 'MZ')],
    ['reset partial input', () => typeLetters(initialTrainingState(entry), 'MZG')],
  ] as const)('%s interrupts independent completion streaks', (_name, interruptedState) => {
    const first = applyAttempt(emptyLearningSnapshot(), record(completed(), 100))
    const interrupted = applyAttempt(first, record(interruptedState(), 200))
    const after = applyAttempt(interrupted, record(completed(), 300))
    const stats = after.entries[progressKey(entry, [0, 1, 2, 3])]
    expect(stats.consecutiveIndependent).toBe(1)
    expect(stats.bestIndependentStreak).toBe(1)
    expect(getLessonProgress(fullLesson, available, after).mastered).toBe(0)
  })

  it('keeps hint-only assistance separate from an attempted answer', () => {
    const hinted = trainingReducer(initialTrainingState(entry), { type: 'hint' })
    const snapshot = applyAttempt(emptyLearningSnapshot(), record(hinted))
    expect(getLessonProgress(fullLesson, available, snapshot)).toMatchObject({ seen: 1, attempted: 0, mastered: 0 })
    expect(makeAttemptRecord(initialTrainingState(entry), 1)).toBeNull()
    expect(makeAttemptRecord(trainingReducer(typeLetters(initialTrainingState(entry), 'MZ'), { type: 'reset' }), 2)).toBeNull()
  })

  it('does not expire demonstrated mastery by time or erase it after a later mistake', () => {
    const mastered = twiceIndependent()
    const later = applyAttempt(mastered, record(typeLetters(initialTrainingState(entry), 'MZJGM'), 9_000_000_000_000))
    const restored = restoreLearningSnapshot(JSON.parse(JSON.stringify(later)))
    expect(getLessonProgress(fullLesson, available, restored).mastered).toBe(1)
    const stats = restored.entries[progressKey(entry, [0, 1, 2, 3])]
    expect(stats.consecutiveIndependent).toBe(0)
    expect(stats.bestIndependentStreak).toBe(2)
  })

  it('never turns isolated first-shape practice into full four-code mastery', () => {
    const first = applyAttempt(emptyLearningSnapshot(), record(completed([2]), 1, firstShapeLesson.id))
    const twice = applyAttempt(first, record(completed([2]), 2, firstShapeLesson.id))
    expect(getLessonProgress(firstShapeLesson, available, twice)).toMatchObject({ attempted: 1, mastered: 1 })
    expect(getLessonProgress(fullLesson, available, twice)).toMatchObject({ attempted: 0, mastered: 0 })
  })

  it('records actual typed keys and original four-code error positions after correction', () => {
    const focused = typeLetters(initialTrainingState(entry, [3]), 'JM')
    const result = record(focused, 1234, 'last-shape-review')
    expect(result).toMatchObject({
      char: '某', fullCode: 'MZGM', code: 'JM', targetCode: 'M', positions: [3], correct: false,
      completed: true, wrongPosition: 3, timestamp: 1234, lessonId: 'last-shape-review',
    })
    expect(focused.error).toBeNull()
    const fourCode = record(typeLetters(initialTrainingState(entry), 'MZJGM'))
    expect(fourCode.code).toBe('MZJGM')
    expect(fourCode.wrongPosition).toBe(2)
  })

  it('marks a viewed character as seen without inventing an attempt', () => {
    const initial = emptyLearningSnapshot()
    const seen = markEntrySeen(initial, entry, [0, 1, 2, 3])
    expect(getLessonProgress(fullLesson, available, seen)).toMatchObject({ seen: 1, attempted: 0, mastered: 0 })
    expect(markEntrySeen(seen, entry, [0, 1, 2, 3])).toBe(seen)
    expect(initial.entries).toEqual({})
  })

  it('clamps a saved cursor while allowing entry without prerequisite progress', () => {
    const lesson = { ...fullLesson, prerequisites: ['earlier-course'] }
    const snapshot = setLessonPosition(emptyLearningSnapshot(), lesson.id, 999)
    expect(getLessonProgress(lesson, available, snapshot)).toEqual({ seen: 0, attempted: 0, mastered: 0, total: 1, lastEntryIndex: 0 })
    expect(() => setLessonPosition(snapshot, lesson.id, -1)).toThrow('Invalid lesson position')
    expect(() => setLessonPosition(snapshot, lesson.id, 0.5)).toThrow('Invalid lesson position')
  })
})

describe('learning snapshot integrity', () => {
  it('round-trips valid progress and retains unknown historical course cursors safely', () => {
    const snapshot = setLessonPosition(twiceIndependent(), 'course-from-an-older-version', 42)
    const restored = restoreLearningSnapshot(JSON.parse(JSON.stringify(snapshot)))
    expect(restored).toEqual(snapshot)
    expect(restored).not.toBe(snapshot)
    expect(restored.lessons['course-from-an-older-version'].lastEntryIndex).toBe(42)
    expect(getLessonProgress(fullLesson, available, restored).mastered).toBe(1)
  })

  it.each([null, [], {}, { ...emptyLearningSnapshot(), version: 2 }, { ...emptyLearningSnapshot(), experience: 'invalid' }])('rejects unsupported or malformed snapshot %j', raw => {
    expect(() => restoreLearningSnapshot(raw)).toThrow()
  })

  it.each([
    ['attempts', -1],
    ['completed', -1],
    ['independentCorrect', -1],
    ['consecutiveIndependent', -1],
    ['bestIndependentStreak', -1],
    ['lastAttemptAt', -1],
    ['attempts', 0.5],
    ['positions', []],
    ['positions', [0, 4]],
    ['positions', [0, 0]],
    ['positions', [2, 1]],
    ['positions', [-1]],
    ['seen', false],
    ['char', '某某'],
    ['fullCode', 'mzgm'],
  ])('rejects malformed entry field %s = %j', (field, value) => {
    const raw = structuredClone(twiceIndependent())
    const stats = raw.entries[progressKey(entry, [0, 1, 2, 3])] as unknown as Record<string, unknown>
    stats[field as string] = value
    expect(() => restoreLearningSnapshot(raw)).toThrow()
  })

  it.each([
    { attempts: 1, completed: 2 },
    { completed: 1, independentCorrect: 2 },
    { consecutiveIndependent: 3, bestIndependentStreak: 2 },
    { bestIndependentStreak: 3, independentCorrect: 2 },
  ])('rejects inconsistent aggregate counts %j', changed => {
    const raw = structuredClone(twiceIndependent())
    const key = progressKey(entry, [0, 1, 2, 3])
    Object.assign(raw.entries[key], changed)
    expect(() => restoreLearningSnapshot(raw)).toThrow('Inconsistent learning entry')
  })

  it('rejects mismatched entry keys and malformed saved course cursors', () => {
    const valid = twiceIndependent()
    const key = progressKey(entry, [0, 1, 2, 3])
    expect(() => restoreLearningSnapshot({ ...valid, entries: { 'mismatched-key': valid.entries[key] } })).toThrow('Inconsistent learning entry')
    for (const lessons of [{ course: { lastEntryIndex: -1 } }, { course: { lastEntryIndex: 0.5 } }, { '': { lastEntryIndex: 0 } }]) {
      expect(() => restoreLearningSnapshot({ ...valid, lessons })).toThrow('Invalid lesson record')
    }
  })
})
