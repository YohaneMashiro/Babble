import { getCodeSlots, validateCharacterEntry } from './encoding'
import type { CharacterEntry } from './types'

/** Sound-only targets have no shape evidence; the frozen four-code validator stays strict. */
export function validateTrainingEntry(entry: CharacterEntry): string[] {
  if (entry.encoding !== 'shuangpin') return validateCharacterEntry(entry)
  const issues: string[] = []
  if (Array.from(entry.char).length !== 1) issues.push('char must contain one character')
  if (!entry.pronunciation.pinyin.trim()) issues.push('pinyin is required')
  if (entry.shape !== null || entry.codeEvidence || entry.shapeEvidence) issues.push('A sound-only entry cannot carry shape or four-code evidence')
  const slots = getCodeSlots(entry).slice(0, 2)
  for (const slot of slots) {
    if (!slot.value.trim()) issues.push(`${slot.type} must have an explanation value`)
    if (!/^[A-Z]$/.test(slot.key)) issues.push(`${slot.type} key must be one uppercase A–Z letter`)
  }
  if (!/^[A-Z]{2}$/.test(entry.fullCode)) issues.push('A sound-only code must contain two uppercase A–Z letters')
  if (slots.map(slot => slot.key).join('') !== entry.fullCode) issues.push('Sound-only code does not match its two explained keys')
  if (!entry.provenance.source.trim()) issues.push('provenance source is required')
  if (!entry.provenance.license.trim()) issues.push('provenance license status is required')
  return issues
}
