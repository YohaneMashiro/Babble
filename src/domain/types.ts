export interface DataProvenance {
  source: string
  sourceUrl?: string
  id?: string
  version?: string
  checksum?: string
  licenseUrl?: string
  author: string
  license: string
  retrievedAt: string
  modified: boolean
  redistribution: 'unconfirmed' | 'permitted' | 'prohibited'
  status: 'test-fixture' | 'audited'
  notes: string
}

export interface SoundPart {
  value: string
  key: string
  label?: string
  explanation?: string
}

export interface ShapePart {
  component: string
  key: string
}

export interface CharacterPronunciation {
  pinyin: string
  initial: SoundPart
  final: SoundPart
}

export interface CharacterShape {
  first: ShapePart
  last: ShapePart
  decomposition?: readonly string[]
}

/** Availability of a code is independent of a reviewed root explanation. */
export interface CodeEvidence {
  kind: 'published-and-compared' | 'independently-derived'
  sourceId: string
  referenceSha256: string
  ruleEvidenceIds?: readonly string[]
}

export type ShapeEvidence = { kind: 'verified-endpoints' } | { kind: 'unreviewed' }

export interface CharacterAlternative {
  pronunciation: CharacterPronunciation
  shape: CharacterShape | null
  codeEvidence?: CodeEvidence
  shapeEvidence?: ShapeEvidence
  fullCode: string
  notes?: readonly string[]
  sources?: readonly DataProvenance[]
  provenance: DataProvenance
}

export interface CharacterEntry {
  /** Omitted for the original four-key phonetic-shape entries. */
  encoding?: 'shuangpin'
  char: string
  pronunciation: CharacterPronunciation
  shape: CharacterShape | null
  codeEvidence?: CodeEvidence
  shapeEvidence?: ShapeEvidence
  fullCode: string
  alternatives?: readonly CharacterAlternative[]
  frequency?: number
  notes?: readonly string[]
  sources?: readonly DataProvenance[]
  provenance: DataProvenance
}

/** Positions are zero-based internally; the UI displays position + 1. */
export type CodePosition = 0 | 1 | 2 | 3

export type CodeSlotType = 'initial' | 'final' | 'first-shape' | 'last-shape'

export interface CodeSlot {
  position: CodePosition
  type: CodeSlotType
  label: string
  value: string
  key: string
  explanation: string
}

export type CodeSlots = readonly [CodeSlot, CodeSlot, CodeSlot, CodeSlot]

export type CodeSlotState =
  | 'hidden'
  | 'hinted'
  | 'correct'
  | 'incorrect'
  | 'revealed'

export type ErrorType =
  | 'initial-key'
  | 'final-key'
  | 'first-shape-identification'
  | 'first-shape-key'
  | 'last-shape-identification'
  | 'last-shape-key'
  | 'typing-slip'
  | 'unknown'

export interface TrainingError {
  position: CodePosition
  input: string
  expected: string
  errorType: ErrorType
}

export type HintLevel = 0 | 1 | 2 | 3 | 4

export interface TrainingState {
  entry: CharacterEntry
  /** Ordered positions practiced; sound-only entries may use only 0 and 1. */
  positions: readonly CodePosition[]
  accepted: string
  /** All valid letter keys, including mistakes; unused context slots are absent. */
  typed: string
  error: TrainingError | null
  hintLevel: HintLevel
  hintLevelUsed: HintLevel
  assisted: boolean
  completed: boolean
}

export type TrainingAction =
  | { type: 'type-letter'; letter: string }
  | { type: 'hint' }
  | { type: 'reset' }
  | { type: 'load-entry'; entry: CharacterEntry; positions?: readonly CodePosition[] }
  | { type: 'mark-assisted'; hintLevel?: HintLevel }

export interface ShapeRoot {
  root: string
  aliases?: readonly string[]
  explanation?: string
  label?: string
  kind?: 'root' | 'stroke'
  /** A reviewed use proves this position, not every position of a root. */
  usages?: readonly {
    position: 'first' | 'last'
    sourceIds: readonly string[]
    verificationStatus: 'verified-entry-usage'
    exampleCharacters: readonly string[]
  }[]
}

export interface KeyDefinition {
  key: string
  initials: readonly string[]
  finals: readonly string[]
  shapeRoots: readonly ShapeRoot[]
  /** An empty list means no verified association is available in this dataset. */
  provenance: readonly DataProvenance[]
  complete: false
}
