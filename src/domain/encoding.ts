import type { CharacterEntry, CodeSlots } from './types'

export function normalizeLetter(input: string): string | null {
  return /^[a-z]$/i.test(input) ? input.toUpperCase() : null
}

export function getCodeSlots(entry: CharacterEntry): CodeSlots {
  const { initial, final } = entry.pronunciation
  const first = entry.shape?.first
  const last = entry.shape?.last

  return [
    {
      position: 0,
      type: 'initial',
      label: initial.label ?? '声母',
      value: initial.value,
      key: initial.key,
      explanation: initial.explanation ?? `${initial.value} → ${initial.key}`,
    },
    {
      position: 1,
      type: 'final',
      label: final.label ?? '韵母',
      value: final.value,
      key: final.key,
      explanation: final.explanation ?? `${final.value} → ${final.key}`,
    },
    {
      position: 2,
      type: 'first-shape',
      label: '首形',
      value: first?.component ?? '形码解释待补',
      key: first?.key ?? entry.fullCode[2] ?? '',
      explanation: first ? `${first.component} → ${first.key}` : `编码已核对，第三位 ${entry.fullCode[2]}；首形解释待补。`,
    },
    {
      position: 3,
      type: 'last-shape',
      label: '末形',
      value: last?.component ?? '形码解释待补',
      key: last?.key ?? entry.fullCode[3] ?? '',
      explanation: last ? `${last.component} → ${last.key}` : `编码已核对，第四位 ${entry.fullCode[3]}；末形解释待补。`,
    },
  ]
}

/** Checks consistency of supplied data; it never derives a missing encoding. */
export function validateCharacterEntry(entry: CharacterEntry): string[] {
  const issues: string[] = []
  if (Array.from(entry.char).length !== 1) issues.push('char must contain one character')
  if (!entry.pronunciation.pinyin.trim()) issues.push('pinyin is required')
  if (entry.shape === null && (!entry.codeEvidence || !['published-and-compared', 'independently-derived'].includes(entry.codeEvidence.kind) || !entry.codeEvidence.sourceId || !/^[a-f0-9]{64}$/.test(entry.codeEvidence.referenceSha256))) issues.push('An unexplained shape requires independently recorded code evidence')
  if (entry.shape === null && entry.shapeEvidence?.kind !== 'unreviewed') issues.push('An unexplained shape must remain unreviewed')

  const slots = getCodeSlots(entry)
  for (const slot of slots) {
    if (!slot.value.trim()) issues.push(`${slot.type} must have an explanation value`)
    if (!/^[A-Z]$/.test(slot.key)) issues.push(`${slot.type} key must be one uppercase A–Z letter`)
  }

  if (!/^[A-Z]{4}$/.test(entry.fullCode)) issues.push('fullCode must contain four uppercase A–Z letters')
  if (slots.map((slot) => slot.key).join('') !== entry.fullCode) {
    issues.push('fullCode does not match the four explained keys')
  }
  if (!entry.provenance.source.trim()) issues.push('provenance source is required')
  if (!entry.provenance.license.trim()) issues.push('provenance license status is required')
  return issues
}
