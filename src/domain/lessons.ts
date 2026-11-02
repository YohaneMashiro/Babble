import type { CharacterEntry, CodeSlotType } from './types'

export type LessonGroup = 'start' | 'sound' | 'shape' | 'practice'

export interface Lesson {
  id: string
  title: string
  description: string
  group: LessonGroup
  entries: readonly string[]
  recommended?: boolean
  /** Recommendations only. A prerequisite never prevents entering a lesson. */
  prerequisites?: readonly string[]
  teaching: {
    title: string
    body: string
    examples?: readonly string[]
  }
  focus?: readonly CodeSlotType[]
}

export interface LessonGroupDefinition {
  id: LessonGroup
  title: string
  description: string
}

/** Keep ordering in the data layer; the training engine knows no stage sizes. */
export function rankLessonEntries(entries: readonly CharacterEntry[]): readonly CharacterEntry[] {
  const unique = new Map<string, CharacterEntry>()
  for (const entry of entries) if (!unique.has(entry.char)) unique.set(entry.char, entry)
  return [...unique.values()].sort((a, b) =>
    (b.frequency ?? -1) - (a.frequency ?? -1) || a.char.codePointAt(0)! - b.char.codePointAt(0)!,
  )
}

export function resolveLessonEntries(lesson: Lesson, availableEntries: readonly CharacterEntry[]): readonly CharacterEntry[] {
  const available = new Map<string, CharacterEntry>()
  for (const entry of availableEntries) if (!available.has(entry.char)) available.set(entry.char, entry)
  return lesson.entries.map(char => {
    const entry = available.get(char)
    if (!entry) throw new Error(`Lesson ${lesson.id} references unavailable character ${char}`)
    return entry
  })
}

export function validateLessons(lessons: readonly Lesson[], availableEntries: readonly CharacterEntry[]): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  const allIds = new Set(lessons.map(lesson => lesson.id))
  const available = new Set(availableEntries.map(entry => entry.char))
  for (const lesson of lessons) {
    if (!lesson.id.trim()) issues.push('Lesson id is required')
    if (ids.has(lesson.id)) issues.push(`Duplicate lesson id: ${lesson.id}`)
    ids.add(lesson.id)
    if (!lesson.title.trim()) issues.push(`${lesson.id}: title is required`)
    if (!lesson.description.trim()) issues.push(`${lesson.id}: description is required`)
    if (!lesson.teaching.title.trim() || !lesson.teaching.body.trim()) issues.push(`${lesson.id}: teaching content is required`)
    if (!lesson.entries.length) issues.push(`${lesson.id}: entries must not be empty`)
    if (new Set(lesson.entries).size !== lesson.entries.length) issues.push(`${lesson.id}: duplicate characters`)
    for (const char of lesson.entries) {
      if (!available.has(char)) issues.push(`${lesson.id}: unavailable character ${char}`)
    }
    for (const prerequisite of lesson.prerequisites ?? []) {
      if (!allIds.has(prerequisite)) issues.push(`${lesson.id}: unknown recommendation ${prerequisite}`)
      if (prerequisite === lesson.id) issues.push(`${lesson.id}: cannot recommend itself as a prerequisite`)
    }
  }
  return issues
}
