import { getCodeSlots, validateCharacterEntry } from './encoding'
import type { CharacterEntry, DataProvenance, KeyDefinition, ShapeRoot } from './types'

/** Builds partial associations from supplied entries, never a complete key chart. */
export function buildKeyDefinitions(entries: readonly CharacterEntry[]): readonly KeyDefinition[] {
  const keys = Array.from({ length: 26 }, (_, index) => ({
    key: String.fromCharCode(65 + index),
    initials: [] as string[],
    finals: [] as string[],
    shapeRoots: [] as ShapeRoot[],
    provenance: [] as DataProvenance[],
    complete: false as const,
  }))

  for (const entry of entries) {
    const issues = validateCharacterEntry(entry)
    if (issues.length) throw new Error(`Invalid character entry: ${issues.join('; ')}`)

    for (const slot of getCodeSlots(entry)) {
      const definition = keys[slot.key.charCodeAt(0) - 65]
      if (slot.type === 'initial') {
        if (!definition.initials.includes(slot.value)) definition.initials.push(slot.value)
      } else if (slot.type === 'final') {
        if (!definition.finals.includes(slot.value)) definition.finals.push(slot.value)
      } else if (entry.shape && !definition.shapeRoots.some((shape) => shape.root === slot.value)) {
        definition.shapeRoots.push({ root: slot.value })
      }
      if (!definition.provenance.includes(entry.provenance)) {
        definition.provenance.push(entry.provenance)
      }
    }
  }
  return keys
}
