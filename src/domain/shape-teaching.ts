import type { CharacterEntry } from './types'

export type ShapeRuleId = 'first-last' | 'no-cross' | 'no-isolation' | 'walk-radical' | 'small-derived'
export type ShapeTeachingScope = 'root-sequence' | 'endpoints'

export interface ShapeTeachingRule {
  id: ShapeRuleId
  title: string
  text: string
  sourceUrl: string
  locator: string
}

export interface ShapeTeachingSource {
  id: string
  title: string
  url: string
  license: string
}

export interface ShapeTeachingEvidence {
  id: string
  sourceId: string
  locator: string
  supports: string
}

export interface ShapeTeachingPart {
  id: string
  label: string
  /** Kept separately from the teaching label; never inferred from a key. */
  rawGlyph?: string
  kind: 'root' | 'stroke' | 'unexpanded'
}

export interface ShapeTeachingRecord {
  char: string
  verifiedCodes: readonly string[]
  coverage: 'reviewed-example'
  scope: ShapeTeachingScope
  sequenceType: 'root-selection' | 'stroke-categories' | 'endpoint-context'
  parts: readonly ShapeTeachingPart[]
  firstPartId: string
  lastPartId: string
  steps: readonly {
    ruleId: ShapeRuleId
    text: string
    partIds: readonly string[]
    evidenceIds: readonly string[]
  }[]
  evidence: readonly ShapeTeachingEvidence[]
  limitation?: string
}

/** Canonical six stroke categories already used by the locked expansion tool. */
const strokeLabels: Readonly<Record<string, string>> = {
  一: '横', 丨: '竖', 丿: '撇', 丶: '点', 乛: '折', ㄟ: '捺',
}

export function shapePresentation(rawGlyph: string): { label: string; kind: 'root' | 'stroke'; rawGlyph: string } {
  const stroke = strokeLabels[rawGlyph]
  return { label: stroke ?? rawGlyph, kind: stroke ? 'stroke' : 'root', rawGlyph }
}

export function shapeDisplayLabel(rawGlyph: string): string {
  const { label, kind } = shapePresentation(rawGlyph)
  return kind === 'stroke' ? `${label}（${rawGlyph}）` : label
}

/** A reviewed character does not authorize explanations for a different code/root pair. */
export function reviewedShapeTeaching(entry: CharacterEntry, records: readonly ShapeTeachingRecord[]): ShapeTeachingRecord | undefined {
  const shape = entry.shape
  if (!shape) return undefined
  return records.find(record => record.char === entry.char && record.verifiedCodes.includes(entry.fullCode)
    && record.parts.find(part => part.id === record.firstPartId)?.rawGlyph === shape.first.component
    && record.parts.find(part => part.id === record.lastPartId)?.rawGlyph === shape.last.component)
}

export function validateShapeTeaching(record: ShapeTeachingRecord, rules: readonly ShapeTeachingRule[], sources: readonly ShapeTeachingSource[]): string[] {
  const issues: string[] = []
  const partIds = record.parts.map(part => part.id)
  const evidenceIds = record.evidence.map(item => item.id)
  if (new Set(partIds).size !== partIds.length) issues.push('duplicate part ID')
  if (new Set(evidenceIds).size !== evidenceIds.length) issues.push('duplicate evidence ID')
  if (!record.verifiedCodes.length || record.verifiedCodes.some(code => !/^[A-Z]{4}$/.test(code))) issues.push('invalid verified code')
  for (const id of [record.firstPartId, record.lastPartId]) {
    const part = record.parts.find(item => item.id === id)
    if (!part?.rawGlyph || part.kind === 'unexpanded') issues.push('missing endpoint')
  }
  if (record.firstPartId === record.lastPartId) issues.push('endpoint IDs must retain distinct positions')
  if (record.scope === 'root-sequence' && record.parts.some(part => part.kind === 'unexpanded')) issues.push('sequence has an unexpanded region')
  if (record.scope === 'endpoints' && (!record.limitation || !record.parts.some(part => part.kind === 'unexpanded'))) issues.push('endpoint scope must expose its missing region')
  for (const item of record.evidence) {
    if (!sources.some(source => source.id === item.sourceId)) issues.push('unknown evidence source')
    if (!item.locator || !item.supports) issues.push('evidence requires a locator and claim')
  }
  for (const step of record.steps) {
    if (!rules.some(rule => rule.id === step.ruleId)) issues.push('unknown rule')
    if (step.partIds.some(id => !partIds.includes(id))) issues.push('unknown step part')
    if (!step.evidenceIds.length || step.evidenceIds.some(id => !evidenceIds.includes(id))) issues.push('unlinked step evidence')
  }
  return issues
}
