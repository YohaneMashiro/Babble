import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_INDEX, PRACTICE_ENTRIES } from '../src/data/library'
import { SHUANGPIN_INDEX, SHUANGPIN_PRACTICE_ENTRIES, SHUANGPIN_STATS } from '../src/data/shuangpin'
import { SHUANGPIN_LESSONS, SHUANGPIN_LESSON_GROUPS, getShuangpinLesson } from '../src/data/shuangpin-lessons'
import { getCodeSlots, validateCharacterEntry } from '../src/domain/encoding'
import { validateTrainingEntry } from '../src/domain/training-entry'
import { initialTrainingState, trainingCode, trainingReducer } from '../src/domain/training'
import { applyAttempt, emptyLearningSnapshot, getLessonProgress, makeAttemptRecord, progressKey, restoreLearningSnapshot } from '../src/domain/progress'
import { lessonPositions } from '../src/domain/progress'
import { resolveLessonEntries, validateLessons } from '../src/domain/lessons'
import { loadLearningLevel, saveLearningLevel } from '../src/domain/learning-level'

afterEach(() => vi.unstubAllGlobals())

describe('independent two-key sound entries', () => {
  it('trains sourced modern readings even when the four-code library has no entry', () => {
    expect(CHARACTER_INDEX.lookup('无').entries).toHaveLength(0)
    const result = SHUANGPIN_INDEX.lookup('无')
    expect(result.status).toBe('trainable')
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries.every(entry => entry.encoding === 'shuangpin' && entry.shape === null && entry.fullCode.length === 2 && !entry.codeEvidence && !entry.shapeEvidence)).toBe(true)
    expect(result.entries.map(entry => validateTrainingEntry(entry))).toEqual(result.entries.map(() => []))
    expect(result.entries.flatMap(entry => entry.sources ?? []).every(source => ['unicode-unihan-17.0.0', 'shuangpin-practice-xiaohe-4927919'].includes(source.id ?? ''))).toBe(true)
    expect(SHUANGPIN_INDEX.lookup('无无').status).toBe('missing')
    expect(SHUANGPIN_INDEX.lookup('🙂')).toMatchObject({ status: 'missing', entries: [], readings: [] })
  })

  it('retains source reading order, tones and per-reading options without guessing context', () => {
    const result = SHUANGPIN_INDEX.lookup('重')
    expect(result.entries.map(entry => entry.pronunciation.pinyin)).toEqual(result.readings)
    expect(new Set(result.entries.map(entry => entry.pronunciation.pinyin)).size).toBe(result.entries.length)
    expect(result.entries.some(entry => entry.fullCode === 'VS')).toBe(true)
    expect(result.entries.some(entry => entry.fullCode === 'IS')).toBe(true)
  })

  it('searches source-only readings and two-key codes, without extending four-key lookup', () => {
    expect(SHUANGPIN_INDEX.search('无无某').map(result => result.char)).toEqual(['无', '某'])
    expect(SHUANGPIN_INDEX.search('wú', 100).some(result => result.char === '无')).toBe(true)
    expect(SHUANGPIN_INDEX.search('mz').length).toBeGreaterThan(0)
    expect(SHUANGPIN_INDEX.search('mz').every(result => result.entries.some(entry => entry.fullCode === 'MZ'))).toBe(true)
    expect(SHUANGPIN_INDEX.search('mzgm')).toEqual([])
    expect(SHUANGPIN_INDEX.search('')).toEqual([])
    expect(SHUANGPIN_INDEX.search('wu', 0)).toEqual([])
  })

  it('keeps the familiar practice order while creating no shape placeholders', () => {
    expect(SHUANGPIN_PRACTICE_ENTRIES[0].char).toBe('某')
    expect(SHUANGPIN_PRACTICE_ENTRIES.map(entry => entry.char)).toEqual(PRACTICE_ENTRIES.map(entry => entry.char))
    expect(SHUANGPIN_PRACTICE_ENTRIES.every(entry => entry.fullCode.length === 2 && entry.shape === null)).toBe(true)
    expect(SHUANGPIN_STATS.readingCharacters).toBe(44348)
    expect(SHUANGPIN_STATS.trainableCharacters).toBeGreaterThan(44000)
  })

  it('completes at two keys and rejects any request to practice shape positions', () => {
    const entry = SHUANGPIN_INDEX.lookup('某').entries[0]
    let state = initialTrainingState(entry)
    expect(state.positions).toEqual([0, 1])
    expect(trainingCode(state)).toBe('MZ')
    state = trainingReducer(state, { type: 'type-letter', letter: 'm' })
    expect(state.completed).toBe(false)
    state = trainingReducer(state, { type: 'type-letter', letter: 'z' })
    expect(state.completed).toBe(true)
    expect(trainingReducer(state, { type: 'type-letter', letter: 'g' })).toBe(state)
    expect(() => initialTrainingState(entry, [0, 1, 2, 3])).toThrow('Sound-only training')
    expect(() => initialTrainingState(entry, [2])).toThrow('Sound-only training')
    expect(validateCharacterEntry({ ...entry, encoding: undefined })).not.toEqual([])
    expect(validateCharacterEntry(entry)).not.toEqual([])
    expect(validateTrainingEntry({ ...entry, shape: PRACTICE_ENTRIES[0].shape })).not.toEqual([])
  })

  it('keeps two-key mastery separate from existing sound-focused and four-code mastery', () => {
    const sound = SHUANGPIN_INDEX.lookup('某').entries[0]
    const old = PRACTICE_ENTRIES[0]
    let state = initialTrainingState(sound)
    for (const letter of sound.fullCode) state = trainingReducer(state, { type: 'type-letter', letter })
    const attempt = makeAttemptRecord(state, 10)!
    const once = applyAttempt(emptyLearningSnapshot(), attempt)
    const snapshot = applyAttempt(once, { ...attempt, timestamp: 20 })
    expect(progressKey(sound, [0, 1])).toBe('某:MZ:01')
    expect(progressKey(old, [0, 1])).toBe('某:MZGM:01')
    expect(progressKey(old, [0, 1, 2, 3])).toBe('某:MZGM:0123')
    expect(snapshot.entries[progressKey(sound, [0, 1])].bestIndependentStreak).toBe(2)
    expect(snapshot.entries[progressKey(old, [0, 1])]).toBeUndefined()
    expect(snapshot.entries[progressKey(old, [0, 1, 2, 3])]).toBeUndefined()
    expect(restoreLearningSnapshot(structuredClone(snapshot))).toEqual(snapshot)
    const corrupted = structuredClone(snapshot)
    const stats = corrupted.entries['某:MZ:01']
    corrupted.entries = { '某:MZ:02': { ...stats, positions: [0, 2] } }
    expect(() => restoreLearningSnapshot(corrupted)).toThrow('Invalid learning entry')
  })
})

describe('sound-only learning path', () => {
  it('defines standalone sound courses with valid recommendations and no shape targets', () => {
    expect(validateLessons(SHUANGPIN_LESSONS, SHUANGPIN_PRACTICE_ENTRIES)).toEqual([])
    expect(SHUANGPIN_LESSONS.every(lesson => lesson.id.startsWith('shuangpin-') && lesson.group !== 'shape')).toBe(true)
    for (const lesson of SHUANGPIN_LESSONS) {
      expect(SHUANGPIN_LESSON_GROUPS.some(group => group.id === lesson.group)).toBe(true)
      expect(lessonPositions(lesson).every(position => position < 2)).toBe(true)
      expect(resolveLessonEntries(lesson, SHUANGPIN_PRACTICE_ENTRIES)).toHaveLength(lesson.entries.length)
      expect(lesson.teaching.body).not.toMatch(/形码|四码|字形|取形/)
      expect(getLessonProgress(lesson, SHUANGPIN_PRACTICE_ENTRIES, emptyLearningSnapshot()).total).toBe(lesson.entries.length)
    }
    expect(getShuangpinLesson('shuangpin-practice-3000')?.entries).toHaveLength(3000)
    expect(getShuangpinLesson('intro')).toBeUndefined()
  })

  it('covers ordinary sound keys and explicitly explains zero-initial exceptions', () => {
    const initials = resolveLessonEntries(getShuangpinLesson('shuangpin-initials')!, SHUANGPIN_PRACTICE_ENTRIES)
    expect(initials.every(entry => !entry.pronunciation.initial.label)).toBe(true)
    expect(new Set(initials.map(entry => entry.pronunciation.initial.value)).size).toBe(initials.length)
    const zeros = resolveLessonEntries(getShuangpinLesson('shuangpin-zero-initials')!, SHUANGPIN_PRACTICE_ENTRIES)
    expect(zeros.length).toBeGreaterThan(10)
    expect(zeros.every(entry => getCodeSlots(entry)[0].label === '零声母起始')).toBe(true)
  })
})

describe('remembered learning level', () => {
  it('defaults to shuangpin for absent, invalid or unavailable storage', () => {
    expect(loadLearningLevel()).toBe('shuangpin')
    for (const value of [null, '', 'unknown', 'SHUANGPIN']) {
      vi.stubGlobal('localStorage', { getItem: () => value })
      expect(loadLearningLevel()).toBe('shuangpin')
    }
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
    expect(loadLearningLevel()).toBe('shuangpin')
    expect(saveLearningLevel('yinxing')).toBe(false)
  })

  it('restores the last explicit choice without changing progress records', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    expect(saveLearningLevel('yinxing')).toBe(true)
    expect(loadLearningLevel()).toBe('yinxing')
    expect([...values]).toEqual([['babble:learning-level', 'yinxing']])
    expect(saveLearningLevel('shuangpin')).toBe(true)
    expect(loadLearningLevel()).toBe('shuangpin')
  })
})
