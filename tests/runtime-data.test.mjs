import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import canonicalReadings from '../src/data/generated/readings.json'
import canonicalTraces from '../src/data/generated/shape-traces.json'
import canonicalExpansion from '../src/data/generated/shape-expansion.json'
import runtimeReadings from '../src/data/generated/runtime-readings.json'
import runtimeTraces from '../src/data/generated/runtime-shape-traces.json'
import runtimeExpansion from '../src/data/generated/runtime-shape-expansion.json'
import runtimeLock from '../data/runtime-data.lock.json'
import { decodeRuntimeReadings, decodeRuntimeShapes } from '../src/data/runtime-codec'
import { createRuntimeArtifacts, PINNED_SOURCE_LOCKS, run } from '../scripts/pack-runtime-data.mjs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const header = kind => ({ schemaVersion: 1, generatorVersion: '1.0.0', kind, canonical: { path: `src/data/generated/${kind}.json`, sha256: 'a'.repeat(64) } })
const reading = () => ({ ...header('readings'), metadata: { characterCount: 1, frequencyCharacterCount: 0 }, pinyins: ['mù'], rows: [['木', [0], [1]]] })
const shape = (expanded = false) => ({
  ...header(expanded ? 'shape-expansion' : 'shape-traces'),
  metadata: { statistics: expanded ? { supplementalCharacters: 1 } : { acceptedCharacters: 1 } },
  ...(expanded ? { sourceIdSets: [['licensed-source-a', 'licensed-source-b']] } : {}),
  rows: [['木', ['muun'], '十', 'ㄟ', ['木', '十'], ['木', 'ㄟ'], '⿻(十丿ㄟ)', ...(expanded ? [0, ['literal source note']] : [])]],
})

describe('lossless runtime datasets', () => {
  it('reconstructs every canonical field, value and order, including provenance and metadata', () => {
    for (const [decoded, canonical] of [
      [decodeRuntimeReadings(runtimeReadings), canonicalReadings],
      [decodeRuntimeShapes(runtimeTraces, 'shape-traces'), canonicalTraces],
      [decodeRuntimeShapes(runtimeExpansion, 'shape-expansion'), canonicalExpansion],
    ]) {
      expect(decoded).toStrictEqual(canonical)
      // Stronger than object equality: row, reading, source, note and property order.
      expect(JSON.stringify(decoded)).toBe(JSON.stringify(canonical))
    }
  })

  it('distinguishes missing frequency from zero and preserves ordered reading sources', () => {
    const data = reading()
    data.pinyins.push('mǔ', 'mú')
    data.rows[0] = ['木', [0, 1, 2], [3, 2, 1]]
    data.rows.push(['目', [0], [1], 0])
    data.metadata = { characterCount: 2, frequencyCharacterCount: 1 }
    const decoded = decodeRuntimeReadings(data).characters
    expect(Object.hasOwn(decoded.木, 'frequency')).toBe(false)
    expect(Object.hasOwn(decoded.目, 'frequency')).toBe(true)
    expect(decoded.目.frequency).toBe(0)
    expect(decoded.木.readings).toEqual(['mù', 'mǔ', 'mú'])
    expect(Object.entries(decoded.木.readingSources)).toEqual([['mù', ['kMandarin', 'kTGHZ2013']], ['mǔ', ['kTGHZ2013']], ['mú', ['kMandarin']]])
  })

  it('reproduces exact artifact bytes and independently verifies all derived provenance hashes', () => {
    const first = createRuntimeArtifacts()
    const second = createRuntimeArtifacts()
    expect([...first.keys()]).toEqual([...second.keys()])
    for (const [path, bytes] of first) {
      expect(bytes.equals(second.get(path)), path).toBe(true)
      expect(bytes.equals(read(path)), path).toBe(true)
    }
    expect(runtimeLock.sourceLocks).toEqual(Object.entries(PINNED_SOURCE_LOCKS).map(([path, sha256]) => ({ path, sha256 })))
    for (const record of [...runtimeLock.canonical, ...runtimeLock.derived, ...runtimeLock.generator.files, ...runtimeLock.sourceLocks]) {
      const bytes = read(record.path)
      expect(digest(bytes), record.path).toBe(record.sha256)
      if (record.bytes !== undefined) expect(bytes.length, record.path).toBe(record.bytes)
      if (record.characters !== undefined) {
        const data = JSON.parse(bytes)
        const decoded = !record.path.includes('/runtime-') ? data
          : data.kind === 'readings' ? decodeRuntimeReadings(data) : decodeRuntimeShapes(data, data.kind)
        expect(Object.keys(decoded.characters).length, record.path).toBe(record.characters)
      }
    }
    expect(() => run({ check: true, writeBytes: () => { throw new Error('check attempted a write') } })).not.toThrow()
  })

  it('rejects stale or tampered derived files and lock, with the exact regeneration command', () => {
    for (const path of [...runtimeLock.derived.map(record => record.path), 'data/runtime-data.lock.json']) {
      const readChanged = candidate => candidate === path ? Buffer.concat([read(candidate), Buffer.from(' ')]) : read(candidate)
      expect(() => run({ check: true, readBytes: readChanged })).toThrow(/stale or modified: .*Run npm run generate:runtime, then npm run check:runtime/)
    }
    const readMissing = candidate => {
      if (candidate === runtimeLock.derived[0].path) throw new Error('missing')
      return read(candidate)
    }
    expect(() => run({ check: true, readBytes: readMissing })).toThrow(/npm run generate:runtime/)
  })

  it('rejects altered canonical, original tool/input, notice and source lock in generation mode before writes', () => {
    for (const path of [
      ...runtimeLock.canonical.map(record => record.path), ...Object.keys(PINNED_SOURCE_LOCKS),
      'tools/libre-flypy-audit/src/roots.rs', 'tools/shape-expansion/generate.py',
      'tools/shape-expansion/inputs/chaizi-jt.txt', 'data/NOTICE-Unicode.txt',
    ]) {
      let writes = 0
      const readChanged = candidate => candidate === path ? Buffer.concat([read(candidate), Buffer.from(' ')]) : read(candidate)
      expect(() => run({ readBytes: readChanged, writeBytes: () => writes++ }), path).toThrow(/Pinned source changed: .*cannot adopt or relock upstream data/)
      expect(writes).toBe(0)
    }
    // Editing an upstream lock to bless modified canonical bytes cannot bypass the frozen adoption boundary.
    const canonical = Buffer.concat([read('src/data/generated/readings.json'), Buffer.from(' ')])
    const sourceLock = JSON.parse(read('data/sources.lock.json'))
    sourceLock.sources[0].generated.sha256 = digest(canonical)
    sourceLock.sources[0].generated.bytes = canonical.length
    const readRelocked = path => path === 'data/sources.lock.json' ? Buffer.from(JSON.stringify(sourceLock)) : path === 'src/data/generated/readings.json' ? canonical : read(path)
    expect(() => run({ readBytes: readRelocked, writeBytes: () => { throw new Error('unexpected write') } })).toThrow(/Pinned source changed: data\/sources.lock.json/)
  })
})

describe('strict runtime schema validation', () => {
  it('rejects unsupported versions, mismatched packages, header drift and invalid metadata', () => {
    for (const change of [
      value => { value.schemaVersion = 2 }, value => { value.generatorVersion = '2.0.0' },
      value => { value.kind = 'shape-traces' }, value => { value.extra = true },
      value => { delete value.metadata }, value => { value.metadata = [] },
      value => { value.metadata.characterCount = 2 }, value => { value.metadata.frequencyCharacterCount = 1 },
      value => { value.metadata.bad = undefined }, value => { value.canonical.sha256 = 'invalid' },
      value => { value.canonical.path = 'other.json' }, value => { value.canonical.extra = true },
    ]) {
      const value = reading()
      change(value)
      expect(() => decodeRuntimeReadings(value)).toThrow(/Invalid runtime data/)
    }
  })

  it('rejects invalid dictionary IDs, masks, duplicates, codepoints, tuple lengths and frequencies', () => {
    for (const change of [
      value => { value.pinyins.push('mù') }, value => { value.pinyins = [] },
      value => { value.pinyins = ['__proto__'] }, value => { value.pinyins = ['mu\u0300'] },
      value => { delete value.rows[0][1][0] },
      ...[-1, 1, 0.5, '0', null].map(id => value => { value.rows[0][1] = [id] }),
      ...[0, 4, -1, 1.1, '1', null].map(mask => value => { value.rows[0][2] = [mask] }),
      value => { value.rows[0][1] = [0, 0]; value.rows[0][2] = [1, 1] },
      value => { value.rows[0][2] = [] }, value => { value.rows[0][1] = [] },
      value => { value.rows.push(value.rows[0]); value.metadata.characterCount = 2 },
      ...['木木', '\ud800', '\udfff', '\ufffd', '\uffff', ''].map(char => value => { value.rows[0][0] = char }),
      value => { value.rows[0].pop() }, value => { value.rows[0].push(1, 2) },
      ...[-1, null, undefined, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(frequency => value => { value.rows[0].push(frequency); value.metadata.frequencyCharacterCount = 1 }),
    ]) {
      const value = reading()
      change(value)
      expect(() => decodeRuntimeReadings(value)).toThrow(/Invalid runtime data/)
    }
  })

  it('preserves expansion paths, ordered sources and notes, and rejects malformed shape tuples', () => {
    const valid = shape(true)
    expect(decodeRuntimeShapes(valid, 'shape-expansion').characters.木).toEqual({
      firstRoot: '十', lastRoot: 'ㄟ', firstRootPath: ['木', '十'], lastRootPath: ['木', 'ㄟ'], idsTree: '⿻(十丿ㄟ)',
      sourceIds: ['licensed-source-a', 'licensed-source-b'], notes: ['literal source note'], codes: ['muun'],
    })
    for (const change of [
      value => { value.sourceIdSets.push(value.sourceIdSets[0]) },
      value => { value.sourceIdSets[0].push('licensed-source-a') },
      value => { value.rows[0][7] = -1 }, value => { value.rows[0][7] = 1 },
      value => { value.rows[0][8] = null }, value => { value.rows[0].pop() },
      value => { value.rows[0][1] = ['BAD'] }, value => { value.rows[0][1] = ['muun', 'muun'] },
      value => { value.rows[0][2] = '\ud800' }, value => { value.rows[0][4] = ['十'] },
      value => { value.rows[0][5] = ['木', '人'] }, value => { value.rows[0][6] = '' },
      value => { value.rows.push(value.rows[0]) }, value => { value.metadata.statistics.supplementalCharacters = 0 },
    ]) {
      const value = shape(true)
      change(value)
      expect(() => decodeRuntimeShapes(value, 'shape-expansion')).toThrow(/Invalid runtime data/)
    }
    expect(() => decodeRuntimeShapes(shape(), 'shape-traces')).not.toThrow()
    expect(() => decodeRuntimeShapes(shape(true), 'shape-traces')).toThrow(/Invalid runtime data/)
  })
})
