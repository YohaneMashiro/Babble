import { describe, expect, it } from 'vitest'
import { LESSONS, LESSON_GROUPS, getLesson } from '../src/data/lessons'
import { PRACTICE_ENTRIES, TEACHING_PRACTICE_ENTRIES } from '../src/data/library'
import { rankLessonEntries, resolveLessonEntries, validateLessons, type Lesson } from '../src/domain/lessons'
import { getCodeSlots } from '../src/domain/encoding'

describe('data-driven lesson definitions', () => {
  it('only references available audited characters and known recommendation metadata', () => {
    expect(validateLessons(LESSONS, PRACTICE_ENTRIES)).toEqual([])
    expect(new Set(LESSONS.map(lesson => lesson.id)).size).toBe(LESSONS.length)
    expect(LESSONS.every(lesson => lesson.entries.length > 0)).toBe(true)
    for (const lesson of LESSONS) {
      expect(LESSON_GROUPS.some(group => group.id === lesson.group)).toBe(true)
      expect(resolveLessonEntries(lesson, PRACTICE_ENTRIES)).toHaveLength(lesson.entries.length)
      expect(resolveLessonEntries(lesson, PRACTICE_ENTRIES).every(entry => entry.provenance.status === 'audited')).toBe(true)
    }
  })

  it('keeps entry available regardless of prerequisite recommendations', () => {
    const advanced = getLesson('practice-3000')!
    expect(advanced.prerequisites).toEqual(['practice-1000'])
    expect(resolveLessonEntries(advanced, PRACTICE_ENTRIES)).toHaveLength(3000)
    expect(getLesson('shape-intro')?.recommended).toBe(true)
    expect(getLesson('missing')).toBeUndefined()
    expect(LESSONS.some(lesson => Object.hasOwn(lesson, 'locked'))).toBe(false)
  })

  it('builds progressive practice decks from ranked source entries rather than fixed character strings', () => {
    const ranked = rankLessonEntries(TEACHING_PRACTICE_ENTRIES)
    for (const count of [100, 300, 500, 1000, 3000]) {
      const lesson = getLesson(`practice-${count}`)!
      expect(lesson.entries).toHaveLength(count)
      expect(lesson.entries).toEqual(ranked.slice(0, count).map(entry => entry.char))
      expect(new Set(lesson.entries).size).toBe(count)
    }
    expect(getLesson('practice-100')!.entries[0]).toBe('的')
    expect(getLesson('practice-3000')!.title).toBe('扩展 3000 字')
    expect(getLesson('practice-3000')!.description).toContain('字序')
  })

  it('separates regular initial practice from zero-initial exceptions', () => {
    const initials = resolveLessonEntries(getLesson('initial-keys')!, PRACTICE_ENTRIES)
    expect(initials.every(entry => entry.pronunciation.initial.label === undefined)).toBe(true)
    expect(new Set(initials.map(entry => entry.pronunciation.initial.value)).size).toBe(initials.length)
    const zeros = resolveLessonEntries(getLesson('zero-initials')!, PRACTICE_ENTRIES)
    expect(zeros.length).toBeGreaterThan(0)
    expect(zeros.every(entry => getCodeSlots(entry)[0].label === '零声母起始')).toBe(true)
  })

  it('uses different source-backed examples to cover sound and shape learning goals', () => {
    const finals = resolveLessonEntries(getLesson('final-keys')!, PRACTICE_ENTRIES)
    expect(new Set(finals.map(entry => `${entry.pronunciation.final.value}:${entry.pronunciation.final.key}`)).size).toBe(finals.length)
    const first = resolveLessonEntries(getLesson('first-shape')!, PRACTICE_ENTRIES)
    const last = resolveLessonEntries(getLesson('last-shape')!, PRACTICE_ENTRIES)
    expect(first.every(entry => entry.shape !== null)).toBe(true)
    expect(last.every(entry => entry.shape !== null)).toBe(true)
    expect(new Set(first.map(entry => entry.shape!.first.key)).size).toBeGreaterThan(15)
    expect(new Set(last.map(entry => entry.shape!.last.key)).size).toBeGreaterThan(15)
    expect(getLesson('last-shape')!.entries).toContain('你')
    expect(getLesson('intro')!.teaching.examples?.[0]).toContain('某（mǒu）')
    expect(getLesson('intro')!.teaching.examples?.[0]).toContain('甘 → G')
    expect(getLesson('intro')!.teaching.examples?.[0]).toContain('木 → M')
  })
})

describe('lesson validation and ranking boundaries', () => {
  const original = getLesson('intro')!
  it('reports duplicates, empty decks and missing characters before training', () => {
    const invalid: Lesson = { ...original, entries: ['某', '某', '🦩'], prerequisites: ['missing', original.id] }
    const issues = validateLessons([invalid, { ...original, entries: [] }], PRACTICE_ENTRIES)
    expect(issues).toEqual(expect.arrayContaining([
      'Duplicate lesson id: intro',
      'intro: duplicate characters',
      'intro: unavailable character 🦩',
      'intro: entries must not be empty',
      'intro: unknown recommendation missing',
      'intro: cannot recommend itself as a prerequisite',
    ]))
    expect(() => resolveLessonEntries(invalid, PRACTICE_ENTRIES)).toThrow('unavailable character 🦩')
  })

  it('does not mutate or duplicate source entries and ranks absent counts last', () => {
    const sample = PRACTICE_ENTRIES[0]
    const source = [
      { ...sample, char: '乙', frequency: undefined },
      { ...sample, char: '丁', frequency: 0 },
      { ...sample, char: '丙', frequency: 10 },
    ]
    const before = source.map(entry => entry.char)
    expect(rankLessonEntries([...source, source[2]]).map(entry => entry.char)).toEqual(['丙', '丁', '乙'])
    expect(source.map(entry => entry.char)).toEqual(before)
  })
})
