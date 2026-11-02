// Babble original generator program: MIT (LICENSE-CODE). Its input data and
// derived component records retain the separately documented data licenses.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAliases, parseRadical, parseReference, verifyPinned } from '../coverage-research/run.mjs'
import { requireExternalPath } from '../../scripts/official-ix-audit.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const INPUT_LOCK_PATH = 'tools/component-spelling/inputs.lock.json'
const CONFIG_PATH = 'tools/component-spelling/config.json'
const LOCK_PATH = 'data/component-spelling.lock.json'
const MANIFEST_PATH = 'src/data/generated/component-spelling-manifest.json'
const GENERATOR_FILES = [
  'tools/component-spelling/generate.mjs', 'tools/coverage-research/run.mjs',
  'src/domain/sound.ts', 'src/domain/dictionary.ts', 'src/domain/encoding.ts',
]
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const scalar = value => typeof value === 'string' && Array.from(value).length === 1 && !/[\uD800-\uDFFF]/u.test(value)
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`)
const ordered = (a, b) => a < b ? -1 : a > b ? 1 : 0
export const shardForCharacter = char => (char.codePointAt(0) >>> 10).toString(16).padStart(3, '0')

/** Generates all evidence-bearing witnesses without access to a comparator. */
export function generateCandidates(rows, { readings, aliases, scheme, explainSound, config }) {
  const records = [], seen = new Set(), cache = new Map()
  const rejected = { length: 0, missingReading: 0, combinationLimit: 0 }
  let maximumCombinations = 0
  const choicesFor = part => {
    if (cache.has(part)) return cache.get(part)
    const special = config.globalComponentRules[part]
    let choices
    if (special) choices = [{ part, pinyin: special.pinyin, code: special.code, sourceId: 'flypy:component-spelling-rule' }]
    else {
      const mnemonic = Object.hasOwn(aliases, part)
      const values = mnemonic ? aliases[part][0] : readings[part]?.readings ?? []
      const codes = new Set()
      choices = []
      for (const pinyin of values) {
        const sound = explainSound(pinyin, scheme)
        if (!sound || codes.has(sound.code)) continue
        codes.add(sound.code)
        const fields = readings[part]?.readingSources?.[pinyin] ?? []
        const sourceId = mnemonic ? 'radical:component-mnemonic' : `unihan:${fields.join('+')}`
        if (!mnemonic && (!fields.length || fields.some(field => !['kMandarin', 'kTGHZ2013'].includes(field)))) throw new Error(`Missing modern reading provenance: ${part}`)
        choices.push({ part, pinyin, code: sound.code, sourceId })
      }
    }
    cache.set(part, choices)
    return choices
  }
  for (const row of rows) {
    if (!config.componentCounts.includes(row.parts.length) || row.parts.some(part => !scalar(part))) { rejected.length++; continue }
    const choices = row.parts.map(choicesFor)
    if (choices.some(list => !list.length)) { rejected.missingReading++; continue }
    const combinations = choices.reduce((count, list) => count * list.length, 1)
    maximumCombinations = Math.max(maximumCombinations, combinations)
    if (combinations > config.maximumCombinationsPerSourceRow) { rejected.combinationLimit++; continue }
    let witnesses = [[]]
    for (const part of choices) witnesses = witnesses.flatMap(prefix => part.map(sound => [...prefix, sound]))
    for (const components of witnesses) {
      const code = `${config.prefix}${components.map(sound => sound.code).join('')}`
      const key = `${row.char}\0${code}`
      if (seen.has(key)) continue
      seen.add(key)
      records.push({ char: row.char, code, components, sourceLine: row.line })
    }
  }
  return { records, rejected, maximumCombinations }
}

/** Candidate witnesses are complete before the optional external data is read. */
export async function compareAfterGeneration(rows, context, readComparison) {
  const generated = generateCandidates(rows, context)
  const reference = await readComparison()
  const records = generated.records.map(record => ({ ...record, comparisonFlag: reference.pairs.has(`${record.char}\0${record.code.toLowerCase()}`) ? 1 : 0 }))
  return { ...generated, records, reference }
}

export function packRecords(records, { config, inputLock, generation }) {
  const components = [], componentIds = new Map(), groups = new Map(), allChars = new Set(), confirmedChars = new Set()
  let confirmedPairs = 0
  for (const record of records) {
    const ids = record.components.map(component => {
      const tuple = [component.part, component.pinyin, component.code, component.sourceId]
      const key = JSON.stringify(tuple)
      if (!componentIds.has(key)) { componentIds.set(key, components.length); components.push(tuple) }
      return componentIds.get(key)
    })
    const id = shardForCharacter(record.char)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push([record.char, record.code, ids, record.sourceLine, record.comparisonFlag])
    allChars.add(record.char)
    if (record.comparisonFlag === 1) { confirmedChars.add(record.char); confirmedPairs++ }
  }
  const artifacts = new Map(), shards = []
  for (const [id, rows] of [...groups].sort(([a], [b]) => ordered(a, b))) {
    rows.sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0) || ordered(a[1], b[1]))
    const filename = `component-spelling-${id}.json`
    const bytes = encode({ schemaVersion: 1, policyId: config.policyId, shardId: id, rows })
    artifacts.set(`src/data/generated/${filename}`, bytes)
    shards.push({ id, file: filename, rowCount: rows.length, characterCount: new Set(rows.map(row => row[0])).size,
      comparedPairs: rows.filter(row => row[4] === 1).length,
      comparedCharacters: new Set(rows.filter(row => row[4] === 1).map(row => row[0])).size,
      bytes: bytes.length, sha256: digest(bytes) })
  }
  const statistics = { candidateCharacters: allChars.size, candidatePairs: records.length,
    confirmedCharacters: confirmedChars.size, confirmedPairs, unconfirmedPairs: records.length - confirmedPairs,
    componentReadings: components.length, shardCount: shards.length,
    rejectedRows: generation.rejected, maximumCombinationsPerSourceRowObserved: generation.maximumCombinations }
  const sourceDefinitions = {
    'unihan:kMandarin': { label: 'Unicode 17 kMandarin', sourceUrl: 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip', license: 'Unicode-3.0' },
    'unihan:kTGHZ2013': { label: 'Unicode 17 kTGHZ2013', sourceUrl: 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip', license: 'Unicode-3.0' },
    'unihan:kMandarin+kTGHZ2013': { label: 'Unicode 17 kMandarin / kTGHZ2013', sourceUrl: 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip', license: 'Unicode-3.0' },
    'radical:component-mnemonic': { label: '上游部件助记读音，不代表本字标准读音', sourceUrl: `${inputLock.source.url}/blob/${inputLock.source.commit}/src/script/gen_dict.py`, license: 'GPL-3.0' },
    'flypy:component-spelling-rule': { label: '公开部件拼读约定，不代表本字读音', sourceUrl: config.globalRuleEvidence.url, locator: config.globalRuleEvidence.locator, scope: config.globalRuleEvidence.scope },
  }
  const manifest = { schemaVersion: 1, sourceId: 'babble-component-spelling-v1', policyId: config.policyId,
    scope: 'Component spelling (OK + two/three component shuangpin), not ordinary four-key Xiaohe or complete shape teaching',
    shardCodepointShift: 10, componentFields: ['part', 'pinyin', 'soundCode', 'readingSourceId'],
    rowFields: ['char', 'fullCode', 'componentIds', 'sourceLine', 'comparisonFlag'],
    comparisonFlags: { 0: 'not-reference-confirmed: either absent from comparison or a different spelling; candidate only', 1: 'exact character/code agreement with the pinned official-origin community comparison table' },
    reference: inputLock.comparisonOnly, source: inputLock.source, sourceDefinitions,
    globalRuleEvidence: config.globalRuleEvidence, statistics, components, shards }
  artifacts.set(MANIFEST_PATH, encode(manifest))
  return { artifacts, manifest }
}

export function validatePacked(manifest, shardPayloads) {
  assert.equal(manifest.schemaVersion, 1, 'Unsupported component spelling schema')
  assert.equal(manifest.shardCodepointShift, 10, 'Unexpected shard partition')
  assert.equal(manifest.components.length, manifest.statistics.componentReadings)
  const componentKeys = new Set()
  for (const tuple of manifest.components) {
    assert(Array.isArray(tuple) && tuple.length === 4 && scalar(tuple[0]) && typeof tuple[1] === 'string' && tuple[1].length && /^[A-Z]{2}$/.test(tuple[2]) && Object.hasOwn(manifest.sourceDefinitions, tuple[3]), 'Invalid component reading tuple')
    const key = JSON.stringify(tuple); assert(!componentKeys.has(key), 'Duplicate component reading'); componentKeys.add(key)
  }
  const chars = new Set(), confirmed = new Set(), pairs = new Set()
  let count = 0, confirmedPairs = 0
  assert.equal(shardPayloads.size, manifest.shards.length)
  for (const descriptor of manifest.shards) {
    const bytes = shardPayloads.get(descriptor.file)
    assert(bytes, `Missing component shard ${descriptor.file}`)
    assert.equal(bytes.length, descriptor.bytes)
    assert.equal(digest(bytes), descriptor.sha256)
    const shard = JSON.parse(bytes)
    assert.equal(shard.schemaVersion, 1); assert.equal(shard.policyId, manifest.policyId); assert.equal(shard.shardId, descriptor.id)
    assert.equal(shard.rows.length, descriptor.rowCount)
    const localChars = new Set(), localConfirmed = new Set(); let localConfirmedPairs = 0
    for (const row of shard.rows) {
      assert(Array.isArray(row) && row.length === 5 && scalar(row[0]) && /^OK[A-Z]{4}([A-Z]{2})?$/.test(row[1]), 'Invalid component spelling row')
      assert.equal(shardForCharacter(row[0]), descriptor.id)
      assert(Array.isArray(row[2]) && [2, 3].includes(row[2].length) && row[2].every(id => Number.isInteger(id) && id >= 0 && id < manifest.components.length), 'Invalid component IDs')
      assert.equal(`OK${row[2].map(id => manifest.components[id][2]).join('')}`, row[1], 'Full code is not explained by supplied components')
      assert(Number.isSafeInteger(row[3]) && row[3] > 0 && [0, 1].includes(row[4]), 'Invalid evidence row')
      const key = `${row[0]}\0${row[1]}`; assert(!pairs.has(key), 'Duplicate spelling pair'); pairs.add(key)
      count++; chars.add(row[0]); localChars.add(row[0])
      if (row[4]) { confirmedPairs++; localConfirmedPairs++; confirmed.add(row[0]); localConfirmed.add(row[0]) }
    }
    assert.equal(localChars.size, descriptor.characterCount); assert.equal(localConfirmed.size, descriptor.comparedCharacters); assert.equal(localConfirmedPairs, descriptor.comparedPairs)
  }
  assert.equal(count, manifest.statistics.candidatePairs); assert.equal(chars.size, manifest.statistics.candidateCharacters)
  assert.equal(confirmedPairs, manifest.statistics.confirmedPairs); assert.equal(confirmed.size, manifest.statistics.confirmedCharacters)
  assert.equal(count - confirmedPairs, manifest.statistics.unconfirmedPairs)
  return { characters: chars.size, pairs: count, confirmedCharacters: confirmed.size, confirmedPairs }
}

async function inputs() {
  const inputBytes = await readFile(join(ROOT, INPUT_LOCK_PATH)), configBytes = await readFile(join(ROOT, CONFIG_PATH))
  const inputLock = JSON.parse(inputBytes), config = JSON.parse(configBytes)
  const loaded = {}
  for (const [path, pin] of Object.entries({ ...inputLock.files, ...inputLock.canonicalInputs })) loaded[path] = verifyPinned(await readFile(join(ROOT, path)), pin, path)
  return { inputLock, config, inputBytes, configBytes, loaded }
}

export async function check() {
  const context = await inputs(), lock = JSON.parse(await readFile(join(ROOT, LOCK_PATH)))
  assert.equal(lock.schemaVersion, 1)
  assert.equal(digest(context.inputBytes), lock.inputsLockSha256, 'Component input lock changed')
  assert.equal(digest(context.configBytes), lock.configSha256, 'Component spelling policy changed')
  for (const record of [...lock.generatorFiles, ...lock.generated]) verifyPinned(await readFile(join(ROOT, record.path)), record, record.path)
  const manifest = JSON.parse(await readFile(join(ROOT, MANIFEST_PATH)))
  assert.deepEqual(manifest.statistics, lock.statistics)
  const expectedNames = new Set(['component-spelling-manifest.json', ...manifest.shards.map(shard => shard.file)])
  const actualNames = (await readdir(join(ROOT, 'src/data/generated'))).filter(name => /^component-spelling-.*\.json$/.test(name))
  assert.equal(actualNames.length, expectedNames.size, 'Unexpected or stale component spelling shard')
  assert(actualNames.every(name => expectedNames.has(name)), 'Unexpected component spelling shard')
  const payloads = new Map(await Promise.all(manifest.shards.map(async shard => [shard.file, await readFile(join(ROOT, 'src/data/generated', shard.file))])))
  const counts = validatePacked(manifest, payloads)
  console.log(`Component spelling verified: ${counts.confirmedCharacters.toLocaleString('en')} compared characters / ${counts.confirmedPairs.toLocaleString('en')} pairs; ${counts.pairs.toLocaleString('en')} total independently generated candidate pairs.`)
  return counts
}

export async function generate(referencePath) {
  const context = await inputs()
  const { createServer } = await import('vite')
  const server = await createServer({ root: ROOT, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { explainSound } = await server.ssrLoadModule('/src/domain/sound.ts')
    const rows = parseRadical(new TextDecoder('utf8', { fatal: true }).decode(context.loaded['tools/component-spelling/inputs/radical.yaml']))
    const aliases = parseAliases(context.loaded['tools/component-spelling/inputs/gen_dict.py'].toString('utf8'))
    const generated = await compareAfterGeneration(rows, { config: context.config, aliases, explainSound,
      readings: JSON.parse(context.loaded['src/data/generated/readings.json']).characters,
      scheme: JSON.parse(context.loaded['src/data/generated/sound-mapping.json']) }, async () => {
      const path = await requireExternalPath(referencePath, ROOT)
      return parseReference(new TextDecoder('utf8', { fatal: true }).decode(verifyPinned(await readFile(path), context.inputLock.comparisonOnly.sha256, 'comparison-only table')))
    })
    const { artifacts, manifest } = packRecords(generated.records, { ...context, generation: generated })
    for (const [key, value] of Object.entries(context.config.expectedFixedBaseline)) assert.equal(manifest.statistics[key], value, `Fixed policy baseline differs: ${key}`)
    validatePacked(manifest, new Map(manifest.shards.map(shard => [shard.file, artifacts.get(`src/data/generated/${shard.file}`)])))
    const generatorFiles = await Promise.all(GENERATOR_FILES.map(async path => { const bytes = await readFile(join(ROOT, path)); return { path, bytes: bytes.length, sha256: digest(bytes) } }))
    const lock = { schemaVersion: 1, policyId: context.config.policyId, inputsLockSha256: digest(context.inputBytes), configSha256: digest(context.configBytes), generatorFiles,
      comparisonOnly: context.inputLock.comparisonOnly, statistics: manifest.statistics,
      generated: [...artifacts].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) })) }
    // No output is written until every source, comparison and packed invariant passes.
    for (const [path, bytes] of artifacts) await writeFile(join(ROOT, path), bytes)
    await writeFile(join(ROOT, LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`)
    console.log(JSON.stringify({ statistics: manifest.statistics, runtimeBytes: [...artifacts.values()].reduce((n, bytes) => n + bytes.length, 0) }, null, 2))
    return manifest
  } finally { await server.close() }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--check') return check()
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('node tools/component-spelling/generate.mjs --reference /external/pinned-xhup.ok.dict.yaml\nnode tools/component-spelling/generate.mjs --check\nRebuild uses the external pinned comparison only after candidate generation; normal check is offline.')
    return
  }
  if (args.length !== 2 || args[0] !== '--reference' || !args[1] || args[1].startsWith('--')) throw new Error('Expected --reference /external/pinned-table or --check')
  return generate(args[1])
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
