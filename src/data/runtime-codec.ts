/** Original codec code: MIT (LICENSE-CODE). Dataset terms remain in data/NOTICE-runtime-data.md. */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type Metadata = { [key: string]: JsonValue }

export interface RuntimeReading {
  readings: string[]
  readingSources: Record<string, string[]>
  frequency?: number
}

export interface RuntimeShapeTrace {
  codes: string[]
  firstRoot: string
  lastRoot: string
  firstRootPath: string[]
  lastRootPath: string[]
  idsTree: string
  sourceIds?: string[]
  notes?: string[]
}

type Kind = 'readings' | 'shape-traces' | 'shape-expansion'
const GENERATOR_VERSION = '1.0.0'

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid runtime data: ${message}`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, `${label} must be a plain object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string) {
  const keys = Object.keys(value)
  requireValue(keys.length === expected.length && expected.every(key => Object.hasOwn(value, key)), `${label} fields do not match the schema`)
}

function text(value: unknown, label: string): string {
  requireValue(typeof value === 'string' && value.length > 0, `${label} must be a nonempty string`)
  return value
}

function character(value: unknown, label: string): string {
  const result = text(value, label)
  const point = result.codePointAt(0)!
  requireValue(result.length === (point > 0xffff ? 2 : 1) && !(point >= 0xd800 && point <= 0xdfff) && point !== 0xfffd && (point & 0xffff) < 0xfffe, `${label} must be a Unicode scalar character`)
  return result
}

function array(value: unknown, label: string): unknown[] {
  requireValue(Array.isArray(value), `${label} must be an array`)
  for (let index = 0; index < value.length; index++) requireValue(Object.hasOwn(value, index), `${label} has a missing field`)
  return value
}

function strings(value: unknown, label: string, unique = false): string[] {
  const result = array(value, label).map(item => text(item, label))
  requireValue(result.length > 0, `${label} must not be empty`)
  if (unique && result.length > 1) requireValue(new Set(result).size === result.length, `${label} contains duplicates`)
  return result
}

function id(value: unknown, size: number, label: string): number {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < size, `${label} is outside its dictionary`)
  return value
}

function json(value: unknown): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), 'metadata contains a non-finite number')
    return
  }
  if (Array.isArray(value)) {
    value.forEach(json)
    return
  }
  for (const item of Object.values(object(value, 'metadata'))) json(item)
}

function header(value: unknown, kind: Kind) {
  const data = object(value, 'package')
  exactKeys(data, ['schemaVersion', 'generatorVersion', 'kind', 'canonical', 'metadata', ...(kind === 'readings' ? ['pinyins'] : kind === 'shape-expansion' ? ['sourceIdSets'] : []), 'rows'], 'package')
  requireValue(data.schemaVersion === 1, 'unsupported schemaVersion')
  requireValue(data.generatorVersion === GENERATOR_VERSION, 'unsupported generatorVersion')
  requireValue(data.kind === kind, `expected ${kind} package`)
  const canonical = object(data.canonical, 'canonical')
  exactKeys(canonical, ['path', 'sha256'], 'canonical')
  requireValue(canonical.path === `src/data/generated/${kind}.json`, 'unexpected canonical path')
  requireValue(typeof canonical.sha256 === 'string' && /^[a-f0-9]{64}$/.test(canonical.sha256), 'invalid canonical SHA256')
  const metadata = object(data.metadata, 'metadata')
  json(metadata)
  return { data, metadata: metadata as Metadata, rows: array(data.rows, 'rows') }
}

/** Synchronous and local: preserves every reading, provenance field and optional frequency. */
export function decodeRuntimeReadings(value: unknown): { metadata: Metadata; characters: Record<string, RuntimeReading> } {
  const { data, metadata, rows } = header(value, 'readings')
  const pinyins = strings(data.pinyins, 'pinyins', true)
  requireValue(pinyins.every(value => /^[\p{Ll}\p{M}]+$/u.test(value) && value.normalize('NFC') === value), 'invalid pinyin dictionary spelling')
  const characters: Record<string, RuntimeReading> = {}
  let frequencyCount = 0
  for (const item of rows) {
    const row = array(item, 'reading row')
    requireValue(row.length === 3 || row.length === 4, 'reading row must have 3 or 4 fields')
    const char = character(row[0], 'reading character')
    requireValue(!Object.hasOwn(characters, char), `duplicate character ${char}`)
    const ids = array(row[1], 'pinyin IDs')
    const masks = array(row[2], 'reading source masks')
    requireValue(ids.length > 0 && ids.length === masks.length, 'pinyin IDs and source masks must have equal nonzero length')
    if (ids.length > 1) requireValue(new Set(ids).size === ids.length, 'duplicate pinyin ID in reading row')
    const readings: string[] = []
    const readingSources: Record<string, string[]> = {}
    for (let index = 0; index < ids.length; index++) {
      const pinyin = pinyins[id(ids[index], pinyins.length, 'pinyin ID')]
      const mask = masks[index]
      requireValue(mask === 1 || mask === 2 || mask === 3, 'unknown or empty reading source mask')
      readings.push(pinyin)
      // Bit order is the canonical source order; encoder rejects any other order.
      readingSources[pinyin] = mask === 1 ? ['kMandarin'] : mask === 2 ? ['kTGHZ2013'] : ['kMandarin', 'kTGHZ2013']
    }
    const record: RuntimeReading = { readings, readingSources }
    if (row.length === 4) {
      requireValue(typeof row[3] === 'number' && Number.isSafeInteger(row[3]) && row[3] >= 0, 'frequency must be a nonnegative integer')
      record.frequency = row[3]
      frequencyCount++
    }
    characters[char] = record
  }
  requireValue(metadata.characterCount === rows.length, 'reading character count mismatch')
  requireValue(metadata.frequencyCharacterCount === frequencyCount, 'frequency character count mismatch')
  return { metadata, characters }
}

/** Tuple layout retains source paths, trees, notes and ordered source IDs verbatim. */
export function decodeRuntimeShapes(value: unknown, kind: 'shape-traces' | 'shape-expansion'): { metadata: Metadata; characters: Record<string, RuntimeShapeTrace> } {
  const { data, metadata, rows } = header(value, kind)
  const expanded = kind === 'shape-expansion'
  const sourceSets = expanded ? array(data.sourceIdSets, 'sourceIdSets').map(value => strings(value, 'source ID set', true)) : []
  requireValue(new Set(sourceSets.map(value => JSON.stringify(value))).size === sourceSets.length, 'duplicate source ID set')
  const characters: Record<string, RuntimeShapeTrace> = {}
  for (const item of rows) {
    const row = array(item, 'shape row')
    requireValue(row.length === (expanded ? 9 : 7), 'shape row field count mismatch')
    const char = character(row[0], 'shape character')
    requireValue(!Object.hasOwn(characters, char), `duplicate character ${char}`)
    const codes = strings(row[1], 'codes', true)
    requireValue(codes.every(code => /^[a-z]{4}$/.test(code)), 'invalid full code')
    const firstRoot = character(row[2], 'first root')
    const lastRoot = character(row[3], 'last root')
    const firstRootPath = strings(row[4], 'first root path')
    const lastRootPath = strings(row[5], 'last root path')
    firstRootPath.forEach(value => character(value, 'first root path character'))
    lastRootPath.forEach(value => character(value, 'last root path character'))
    requireValue(firstRootPath[0] === char && firstRootPath.at(-1) === firstRoot && lastRootPath[0] === char && lastRootPath.at(-1) === lastRoot, 'shape path endpoints mismatch')
    const idsTree = text(row[6], 'idsTree')
    characters[char] = expanded ? {
      firstRoot, lastRoot, firstRootPath, lastRootPath, idsTree,
      sourceIds: [...sourceSets[id(row[7], sourceSets.length, 'source set ID')]],
      notes: strings(row[8], 'notes'), codes,
    } : { codes, firstRoot, lastRoot, firstRootPath, lastRootPath, idsTree }
  }
  const statistics = object(metadata.statistics, 'shape statistics')
  requireValue(statistics[expanded ? 'supplementalCharacters' : 'acceptedCharacters'] === rows.length, 'shape character count mismatch')
  return { metadata, characters }
}
