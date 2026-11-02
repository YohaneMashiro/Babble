#!/usr/bin/env node
/** MIT program code; dataset licensing: data/NOTICE-runtime-data.md. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const GENERATOR_VERSION = '1.0.0'
// Frozen adoption boundary, deliberately independent of the mutable derived lock.
// Updating these pins is a separate reviewed canonical-data adoption, never regeneration.
export const PINNED_SOURCE_LOCKS = Object.freeze({
  'data/sources.lock.json': 'a2f8f387d7c179b741ad5d3e8e99a3937dd53b7bbcfa4952646df0c038808692',
  'data/shape-sources.lock.json': '104fc74e4d76c1bc636c7f411c2109ac8db12899dc1f42557b736cb4b713af65',
  'data/shape-expansion.lock.json': '9128b16303b6d833dbf4fe333a070167572a49031b04934a59e14480e32f5a26',
  'data/shape-expansion-inputs.lock.json': 'ca78cf145f6a502f1ded276589551b628761fad0cdb2ae7502b56d497b4a5d70',
})

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const readProject = path => readFileSync(join(PROJECT_ROOT, path))
const compact = value => Buffer.from(`${JSON.stringify(value)}\n`)
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function keys(value, fields, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`)
  assert(Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), `${label}: unsupported fields; refusing a lossy encoding`)
}

function validatePinnedSources(readBytes) {
  const lockValues = {}
  const verified = new Map()
  const verify = (path, sha256, bytes) => {
    const actual = readBytes(path)
    assert(digest(actual) === sha256 && (bytes === undefined || actual.length === bytes), `Pinned source changed: ${path}. Restore the audited bytes; runtime regeneration cannot adopt or relock upstream data.`)
    verified.set(path, { sha256, bytes: actual.length })
    return actual
  }
  for (const [path, sha256] of Object.entries(PINNED_SOURCE_LOCKS)) lockValues[path] = JSON.parse(verify(path, sha256))
  const sources = lockValues['data/sources.lock.json']
  const traces = lockValues['data/shape-sources.lock.json']
  const expansion = lockValues['data/shape-expansion.lock.json']
  const inputs = lockValues['data/shape-expansion-inputs.lock.json']
  for (const source of sources.sources) {
    verify(source.generated.path, source.generated.sha256, source.generated.bytes)
    verify(source.noticeFile, source.noticeSha256)
  }
  verify(traces.generated.path, traces.generated.sha256)
  for (const [path, sha256] of Object.entries(traces.files)) verify(`tools/libre-flypy-audit/${path}`, sha256)
  verify(expansion.generator.path, expansion.generator.sha256)
  verify(expansion.generated.path, expansion.generated.sha256)
  for (const [path, sha256] of Object.entries(expansion.files)) verify(path, sha256)
  for (const source of inputs.sources) for (const file of source.files) verify(file.path, file.sha256, file.bytes)
  for (const file of inputs.licenseTexts) verify(file.path, file.sha256, file.bytes)
  return verified
}

function packReadings(canonical) {
  const pinyins = []
  const pinyinIds = new Map()
  const rows = []
  for (const [char, record] of Object.entries(canonical.characters)) {
    keys(record, ['readings', 'readingSources', ...(Object.hasOwn(record, 'frequency') ? ['frequency'] : [])], `Reading ${char}`)
    assert(Array.isArray(record.readings) && record.readings.length > 0 && new Set(record.readings).size === record.readings.length, `Invalid readings for ${char}`)
    assert(Object.keys(record.readingSources).join('\0') === record.readings.join('\0'), `Reading source keys/order mismatch for ${char}`)
    const ids = []
    const masks = []
    for (const pinyin of record.readings) {
      assert(typeof pinyin === 'string' && pinyin.length > 0, `Invalid pinyin for ${char}`)
      if (!pinyinIds.has(pinyin)) {
        pinyinIds.set(pinyin, pinyins.length)
        pinyins.push(pinyin)
      }
      ids.push(pinyinIds.get(pinyin))
      const source = JSON.stringify(record.readingSources[pinyin])
      const mask = source === '["kMandarin"]' ? 1 : source === '["kTGHZ2013"]' ? 2 : source === '["kMandarin","kTGHZ2013"]' ? 3 : 0
      assert(mask !== 0, `Unsupported reading provenance/order for ${char}/${pinyin}; refusing a lossy encoding`)
      masks.push(mask)
    }
    const row = [char, ids, masks]
    if (Object.hasOwn(record, 'frequency')) {
      assert(Number.isSafeInteger(record.frequency) && record.frequency >= 0, `Invalid frequency for ${char}`)
      row.push(record.frequency)
    }
    rows.push(row)
  }
  return { pinyins, rows }
}

function packShapes(canonical, expanded) {
  const rows = []
  const sourceIdSets = []
  const sourceSetIds = new Map()
  for (const [char, trace] of Object.entries(canonical.characters)) {
    keys(trace, ['codes', 'firstRoot', 'lastRoot', 'firstRootPath', 'lastRootPath', 'idsTree', ...(expanded ? ['sourceIds', 'notes'] : [])], `Shape ${char}`)
    const row = [char, trace.codes, trace.firstRoot, trace.lastRoot, trace.firstRootPath, trace.lastRootPath, trace.idsTree]
    if (expanded) {
      assert(Array.isArray(trace.sourceIds) && trace.sourceIds.length > 0 && trace.sourceIds.every(id => typeof id === 'string' && id.length > 0) && new Set(trace.sourceIds).size === trace.sourceIds.length, `Invalid source IDs for ${char}`)
      const key = JSON.stringify(trace.sourceIds)
      if (!sourceSetIds.has(key)) {
        sourceSetIds.set(key, sourceIdSets.length)
        sourceIdSets.push(trace.sourceIds)
      }
      row.push(sourceSetIds.get(key), trace.notes)
    }
    rows.push(row)
  }
  return expanded ? { sourceIdSets, rows } : { rows }
}

/** Pure preparation: all source validation completes before any output is written. */
export function createRuntimeArtifacts(readBytes = readProject) {
  const verified = validatePinnedSources(readBytes)
  const artifacts = new Map()
  const canonicalRecords = []
  const derivedRecords = []
  for (const kind of ['readings', 'shape-traces', 'shape-expansion']) {
    const path = `src/data/generated/${kind}.json`
    const source = readBytes(path)
    assert(digest(source) === verified.get(path).sha256, `Pinned source changed during generation: ${path}; no output was written.`)
    const canonical = JSON.parse(source)
    keys(canonical, ['metadata', 'characters'], path)
    const encoded = {
      schemaVersion: 1,
      generatorVersion: GENERATOR_VERSION,
      kind,
      canonical: { path, sha256: verified.get(path).sha256 },
      metadata: canonical.metadata,
      ...(kind === 'readings' ? packReadings(canonical) : packShapes(canonical, kind === 'shape-expansion')),
    }
    const outputPath = `src/data/generated/runtime-${kind}.json`
    const output = compact(encoded)
    artifacts.set(outputPath, output)
    canonicalRecords.push({ path, sha256: digest(source), bytes: source.length, characters: encoded.rows.length })
    derivedRecords.push({ path: outputPath, sha256: digest(output), bytes: output.length, characters: encoded.rows.length })
  }
  const programFiles = ['scripts/pack-runtime-data.mjs', 'src/data/runtime-codec.ts', 'data/NOTICE-runtime-data.md'].map(path => {
    const bytes = readBytes(path)
    return { path, sha256: digest(bytes), bytes: bytes.length }
  })
  const lock = {
    schemaVersion: 1,
    generator: { id: 'babble-lossless-runtime', version: GENERATOR_VERSION, files: programFiles },
    sourceLocks: Object.entries(PINNED_SOURCE_LOCKS).map(([path, sha256]) => ({ path, sha256 })),
    canonical: canonicalRecords,
    derived: derivedRecords,
    encoding: {
      readings: '[character, ordered pinyin dictionary IDs, ordered provenance masks, optional frequency]; absent frequency differs from zero',
      readingMasks: { kMandarin: 1, kTGHZ2013: 2, order: ['kMandarin', 'kTGHZ2013'] },
      shapes: '[character, codes, firstRoot, lastRoot, firstRootPath, lastRootPath, idsTree]',
      expansion: 'shape tuple plus ordered source-ID-set dictionary ID and notes',
      metadata: 'All canonical metadata is retained verbatim; dictionaries use first occurrence order.',
    },
    reproduction: { generate: 'npm run generate:runtime', check: 'npm run check:runtime', policy: 'Derived outputs only. Frozen source locks and every locally pinned source/input are verified; no upstream relock or network access.' },
    notice: 'data/NOTICE-runtime-data.md',
  }
  artifacts.set('data/runtime-data.lock.json', Buffer.from(`${JSON.stringify(lock, null, 2)}\n`))
  return artifacts
}

export function run({ check = false, readBytes = readProject, writeBytes = (path, bytes) => writeFileSync(join(PROJECT_ROOT, path), bytes) } = {}) {
  const artifacts = createRuntimeArtifacts(readBytes)
  if (check) {
    for (const [path, bytes] of artifacts) {
      let actual
      try { actual = readBytes(path) } catch { /* reported as stale with the regeneration command */ }
      assert(actual?.equals(bytes), `Runtime artifacts are stale or modified: ${path}. Run npm run generate:runtime, then npm run check:runtime.`)
    }
  } else {
    for (const [path, bytes] of artifacts) writeBytes(path, bytes)
  }
  return artifacts
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.slice(2).every(argument => argument === '--check') && process.argv.length <= 3, 'Usage: node scripts/pack-runtime-data.mjs [--check]')
    const check = process.argv.includes('--check')
    run({ check })
    console.log(`Runtime data ${check ? 'verified' : 'generated'}: 44,348 reading characters; 6,596 legacy and 1,570 supplemental shape records.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
