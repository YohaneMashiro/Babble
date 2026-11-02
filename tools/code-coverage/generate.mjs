// Babble original program: MIT. Published codes CC0; curated root derivation
// retains the AGPL root-map and separately credited stroke-source terms.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSnapshot, requireExternalPath, normalizedReferenceRoot } from '../../scripts/official-ix-audit.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT = 'src/data/generated/four-code-coverage.json'
const LOCK = 'data/four-code-coverage.lock.json'
const SELF = 'tools/code-coverage/generate.mjs'
const CURATED = 'data/curated-shape-supplement.json'
const REFERENCE_SHA = '252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17'
const PINS = {
  'src/data/generated/readings.json': 'f8347fc97e9ecbb593e770dd72e7c4814c3ea488aea179a2089367f6ada260fb',
  'src/data/generated/sound-mapping.json': '71b8e6850c77d28b0e4e271c3d7a808a569e1eaecfee553dc31e58b1514c77a9',
  'src/data/generated/shape-traces.json': '0fa139ecc338c6ce6991749f93c1ba9356254c1cc4ede42b0f7a79359dbf6c17',
  'src/data/generated/shape-expansion.json': '5c232ab043b15c3631db40b4b32996d401674e433147a8afa9ed40d89c974fe6',
  'tools/libre-flypy-audit/inputs/release-output-1.2.0.txt': 'bde3928b0193c9fc462f974e81c10181feaf533fe7fd038a81cb4a60ec6e0cb7',
  'tools/libre-flypy-audit/src/roots.rs': 'a225c7d6bf881df18d58f85dafed280b31746f68812dd10ba503323d59ab5604',
  'tools/shape-expansion/inputs/Strokes.txt': '314bb2f74362eda6ba504a345fd12ad2b743010e9ea0a9cfd1cd0743903f2f1e',
}
const PROGRAM_INPUTS = [SELF, CURATED, 'src/domain/sound.ts', 'src/domain/dictionary.ts', 'src/domain/encoding.ts', 'scripts/official-ix-audit.mjs', 'data/NOTICE-four-code-coverage.md']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => readFile(join(ROOT, path))
const serialized = value => Buffer.from(`${JSON.stringify(value)}\n`)

export function parsePublishedCodes(source) {
  const result = new Map()
  for (const line of source.split(/\r?\n/)) {
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length !== 2 || Array.from(fields[0]).length !== 1) throw new Error('Invalid fixed published-code row')
    // The fixed old release includes non-letter placeholders such as 00kk.
    // They are source anomalies, never repaired into an alphabetic full code.
    if (!/^[a-z]{4}$/.test(fields[1])) continue
    const codes = result.get(fields[0]) ?? new Set()
    codes.add(fields[1].toUpperCase()); result.set(fields[0], codes)
  }
  return result
}

export function modernCandidates(published, readings, explainSound, scheme, excluded) {
  const result = []
  for (const [char, codes] of published) {
    if (excluded.has(char)) continue
    const entries = []
    for (const pinyin of readings[char]?.readings ?? []) {
      const sound = explainSound(pinyin, scheme)
      if (!sound) continue
      for (const code of codes) if (code.startsWith(sound.code) && !entries.some(row => row[0] === pinyin && row[1] === code)) entries.push([pinyin, code])
    }
    if (entries.length) result.push({ char, entries })
  }
  return result
}

export function comparePublishedCandidates(candidates, reference) {
  return candidates.flatMap(record => {
    const accepted = new Set(reference.records[record.char]?.codes ?? [])
    const entries = record.entries.filter(([, code]) => accepted.has(code))
    return entries.length ? [{ char: record.char, entries, kind: 'published-and-compared', shape: null }] : []
  })
}

export function curatedCandidates(records, { strokes, roots, readings, explainSound, scheme }) {
  const group = name => {
    const body = new RegExp(`let ${name} = \\[([\\s\\S]*?)\\];`).exec(roots)?.[1]
    if (!body) throw new Error(`Missing fixed root section ${name}`)
    return [...body.matchAll(/\('([^']+)', '([a-z])'\)/gu)].map(match => [match[1], match[2].toUpperCase()])
  }
  const common = group('common'), firstKeys = new Map([...common, ...group('only_in_firsts')]), lastKeys = new Map([...common, ...group('only_in_lasts')])
  return records.map(record => {
    const row = strokes.split(/\r?\n/)[record.strokeSource.line - 1]?.split(',')
    if (row?.[1] !== record.char || row?.[2] !== record.strokeSource.pattern) throw new Error('Curated stroke source locator changed')
    const sequence = Array.from(record.strokeSource.pattern.slice(1, -1))
    const used = [...record.first.strokeIndices, ...record.last.strokeIndices, ...record.unexpandedStrokeIndices]
    if (new Set(used).size !== used.length || used.length !== sequence.length || used.some(index => !Number.isInteger(index) || index < 0 || index >= sequence.length)) throw new Error('Curated stroke ranges overlap or omit source strokes')
    for (const part of [record.first, record.last]) if (part.strokeIndices.map(index => sequence[index]).join('') !== part.expectedStrokes) throw new Error('Curated root stroke selection changed')
    const first = firstKeys.get(record.first.root), last = lastKeys.get(record.last.root)
    if (!first || !last) throw new Error('Curated root has no positional source mapping')
    const entries = (readings[record.char]?.readings ?? []).flatMap(pinyin => {
      const sound = explainSound(pinyin, scheme)
      return sound ? [[pinyin, `${sound.code}${first}${last}`]] : []
    })
    if (!entries.length) throw new Error('Curated shape has no supported source reading')
    return { char: record.char, entries, kind: 'independently-derived', shape: { firstRoot: record.first.root, firstKey: first, lastRoot: record.last.root, lastKey: last }, ruleId: record.ruleId }
  })
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes('--check'), refIndex = args.indexOf('--reference')
  if (args.includes('--help')) { console.log('Usage: node tools/code-coverage/generate.mjs --reference /external/fixed-ixdata.json\n       node tools/code-coverage/generate.mjs --check\nGeneration requires the exact fixed comparison input; check verifies distributable artifacts offline.'); return }
  if (check ? args.length !== 1 : args.length !== 2 || refIndex !== 0 || !args[1] || args[1].startsWith('--')) throw new Error('Use --check alone, or --reference PATH for generation')
  const inputs = {}
  for (const [path, expected] of Object.entries(PINS)) {
    const bytes = await read(path)
    if (sha(bytes) !== expected) throw new Error(`Frozen input changed: ${path}`)
    inputs[path] = { sha256: expected, bytes: bytes.length }
  }
  for (const path of PROGRAM_INPUTS) { const bytes = await read(path); inputs[path] = { sha256: sha(bytes), bytes: bytes.length } }
  if (check) {
    const lock = JSON.parse(await read(LOCK)), bytes = await read(OUTPUT)
    if (JSON.stringify(lock.inputs) !== JSON.stringify(inputs) || lock.generated.sha256 !== sha(bytes) || lock.generated.bytes !== bytes.length || lock.reference.sha256 !== REFERENCE_SHA) throw new Error('Four-code supplement is stale or modified; regenerate with the fixed external reference')
    console.log(`Four-code supplement verified: ${lock.statistics.publishedCharacters} published-code characters, ${lock.statistics.curatedCharacters} curated character.`)
    return
  }
  const readings = JSON.parse(await read('src/data/generated/readings.json')).characters, scheme = JSON.parse(await read('src/data/generated/sound-mapping.json'))
  const { createServer } = await import('vite')
  const server = await createServer({ root: ROOT, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { explainSound } = await server.ssrLoadModule('/src/domain/sound.ts')
    const baseline = new Set()
    for (const file of ['shape-traces', 'shape-expansion']) for (const [char, trace] of Object.entries(JSON.parse(await read(`src/data/generated/${file}.json`)).characters)) {
      if ((readings[char]?.readings ?? []).some(pinyin => { const sound = explainSound(pinyin, scheme); return sound && trace.codes.some(code => code.toUpperCase().startsWith(sound.code)) })) baseline.add(char)
    }
    const published = modernCandidates(parsePublishedCodes((await read('tools/libre-flypy-audit/inputs/release-output-1.2.0.txt')).toString('utf8')), readings, explainSound, scheme, baseline)
    const curatedInput = JSON.parse(await read(CURATED))
    const curated = curatedCandidates(curatedInput.records, { strokes: (await read('tools/shape-expansion/inputs/Strokes.txt')).toString('utf8'), roots: (await read('tools/libre-flypy-audit/src/roots.rs')).toString('utf8'), readings, explainSound, scheme })
    // Both source-derived pools are complete before opening comparison answers.
    const referenceBytes = await readFile(await requireExternalPath(args[refIndex + 1]))
    if (sha(referenceBytes) !== REFERENCE_SHA) throw new Error('Comparison snapshot changed; do not replace the fixed validator or relock it implicitly')
    const reference = parseSnapshot(referenceBytes)
    const accepted = comparePublishedCandidates(published, reference)
    for (const record of curated) {
      const check = reference.records[record.char]
      if (!check || record.entries.some(([, code]) => !check.codes.includes(code)) || normalizedReferenceRoot(check.roots[0]) !== record.shape.firstRoot || normalizedReferenceRoot(check.roots[1]) !== record.shape.lastRoot) throw new Error('Curated endpoint/full-code comparison did not pass')
      if (baseline.has(record.char) || accepted.some(item => item.char === record.char)) throw new Error('Curated record collides with an existing accepted layer')
    }
    const records = [...accepted, ...curated]
    const statistics = { baselineCharacters: baseline.size, publishedCharacters: accepted.length, publishedToneEntries: accepted.reduce((total, row) => total + row.entries.length, 0), curatedCharacters: curated.length, totalSupplementCharacters: records.length, totalSupplementToneEntries: records.reduce((total, row) => total + row.entries.length, 0) }
    const data = { schemaVersion: 1, sourceId: 'babble-four-code-coverage-v1', referenceSha256: REFERENCE_SHA, statistics, records }
    const bytes = serialized(data), lock = { schemaVersion: 1, inputs, reference: { url: 'https://flypy.cc/ix/ixdata.json', sha256: REFERENCE_SHA, comparisonOnly: true }, generated: { path: OUTPUT, sha256: sha(bytes), bytes: bytes.length }, statistics }
    await mkdir(dirname(join(ROOT, OUTPUT)), { recursive: true })
    await writeFile(join(ROOT, OUTPUT), bytes)
    await writeFile(join(ROOT, LOCK), `${JSON.stringify(lock, null, 2)}\n`)
    console.log(JSON.stringify(statistics, null, 2))
  } finally { await server.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
