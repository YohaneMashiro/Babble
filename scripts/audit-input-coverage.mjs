// Original audit program: MIT. Reads local data only; never uploads article text.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { parseSnapshot, requireExternalPath } from './official-ix-audit.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => readFile(resolve(root, path))
const parse = bytes => JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
const ref4Sha = '252025614bca2f44f1c8fbcad3a4ed80bef45d224ede40102781a438a20eca17'
const refOKSha = '510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a'

export function intersectCount(left, right) {
  let count = 0
  for (const value of left) if (right.has(value)) count++
  return count
}
export function targetSet(version) {
  const result = new Set()
  let previous = -1
  for (const [first, last] of version.ranges) {
    const start = Number.parseInt(first, 16), end = Number.parseInt(last, 16)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= previous || end < start || end > 0x10ffff) throw new Error('Invalid or overlapping Unicode target ranges')
    for (let point = start; point <= end; point++) result.add(String.fromCodePoint(point))
    previous = end
  }
  if (result.size !== version.count) throw new Error('Unicode target count does not match its ranges')
  return result
}

async function pinnedExternal(path, expected) {
  const bytes = await readFile(await requireExternalPath(path, root))
  if (sha(bytes) !== expected) throw new Error('External comparison version changed')
  return bytes
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/audit-input-coverage.mjs [--text FILE] [--official-four-code EXTERNAL_JSON --official-ok EXTERNAL_YAML] [--unicode-properties EXTERNAL_PROPLIST]\nDefaults to the_Tower_of_Babel.txt. Measures actual four-code + confirmed component-spelling unions. No upload; comparison inputs remain outside the project.')
    return
  }
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = { '--text': 'text', '--official-four-code': 'four', '--official-ok': 'ok', '--unicode-properties': 'unicode' }[args[index]]
    if (!key || options[key] || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Unknown, duplicate or incomplete coverage argument')
    options[key] = args[index + 1]
  }
  if (!!options.four !== !!options.ok) throw new Error('Provide both fixed comparison files to measure their complete union')
  const targetsBytes = await read('data/unicode-targets.json'), targets = parse(targetsBytes)
  if (options.unicode) {
    const bytes = await readFile(await requireExternalPath(options.unicode, root))
    const version = targets.versions.find(item => item.sourceSha256 === sha(bytes))
    if (!version) throw new Error('Unicode properties version is not pinned')
    const points = new Set()
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
      const match = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*Unified_Ideograph\b/.exec(line)
      if (!match) continue
      for (let point = parseInt(match[1], 16); point <= parseInt(match[2] ?? match[1], 16); point++) points.add(String.fromCodePoint(point))
    }
    const expected = targetSet(version)
    if (points.size !== expected.size || intersectCount(points, expected) !== expected.size) throw new Error('Extracted Unicode ranges differ from fixed source')
  }
  const lock = parse(await read('data/component-spelling.lock.json'))
  const checked = async path => {
    const bytes = await read(path), pin = lock.generated.find(item => item.path === path)
    if (!pin || pin.bytes !== bytes.length || pin.sha256 !== sha(bytes)) throw new Error(`Modified spelling artifact: ${path}`)
    return parse(bytes)
  }
  const manifest = await checked('src/data/generated/component-spelling-manifest.json')
  const confirmed = new Set(), candidates = new Set()
  let confirmedPairs = 0, candidatePairs = 0
  for (const shard of manifest.shards) {
    const data = await checked(`src/data/generated/${shard.file}`)
    for (const [char, , , , flag] of data.rows) {
      candidates.add(char); candidatePairs++
      if (flag === 1) { confirmed.add(char); confirmedPairs++ }
    }
  }
  const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const [{ TRAINING_ENTRIES }, { isHanCharacter }] = await Promise.all([
      server.ssrLoadModule('/src/data/library.ts'), server.ssrLoadModule('/src/domain/han.ts'),
    ])
    const four = new Set(TRAINING_ENTRIES.map(entry => entry.char)), available = new Set([...four, ...confirmed])
    const unicode = targets.versions.map(version => {
      const target = targetSet(version), covered = intersectCount(available, target)
      return { version: version.version, property: targets.property, targetCharacters: target.size,
        fourCodeCharacters: intersectCount(four, target), confirmedSpellingCharacters: intersectCount(confirmed, target),
        availableUnionCharacters: covered, availableOutsideTarget: available.size - covered,
        candidateSpellingCharacters: intersectCount(candidates, target), missingCharacters: target.size - covered,
        coverage: Number((covered / target.size).toFixed(6)), sourceSha256: version.sourceSha256 }
    })
    const text = new TextDecoder('utf8', { fatal: true }).decode(await readFile(options.text ? resolve(options.text) : resolve(root, 'the_Tower_of_Babel.txt')))
    const han = Array.from(text).filter(isHanCharacter), occurrences = new Map()
    for (const char of han) occurrences.set(char, (occurrences.get(char) ?? 0) + 1)
    const missing = [...occurrences].filter(([char]) => !available.has(char)).map(([char, count]) => ({ char, occurrences: count }))
    let comparison = null
    if (options.four) {
      const reference4 = parseSnapshot(await pinnedExternal(options.four, ref4Sha)), ordinary = new Set()
      for (const [char, record] of Object.entries(reference4.records)) if (record.codes.some(code => /^[A-Z]{4}$/.test(code))) ordinary.add(char)
      const ok = new Set()
      for (const line of (await pinnedExternal(options.ok, refOKSha)).toString('utf8').split(/\r?\n/)) {
        const fields = line.split('\t')
        if (Array.from(fields[0]).length === 1 && /^ok[a-z]{4}(?:[a-z]{2})?$/.test(fields[1])) ok.add(fields[0])
      }
      const reference = new Set([...ordinary, ...ok]), present = intersectCount(available, reference)
      comparison = { ordinaryCharacters: ordinary.size, okCharacters: ok.size, unionCharacters: reference.size,
        availableInsideReference: present, missingReferenceCharacters: reference.size - present,
        availableOutsideReference: available.size - present, comparisonOnly: true, fourSha256: ref4Sha, okSha256: refOKSha }
    }
    const result = { scope: 'Actual bundled four-code and flag-1 component-spelling capability; excludes local user libraries and flag-0 grading. Different codes and reading options are not different characters.',
      fourCodeCharacters: four.size, fourCodeReadingOptions: TRAINING_ENTRIES.length,
      confirmedSpellingCharacters: confirmed.size, confirmedSpellingPairs: confirmedPairs,
      availableUnionCharacters: available.size, candidateSpellingCharacters: candidates.size, candidateSpellingPairs: candidatePairs,
      unicodeTargetsSha256: sha(targetsBytes), unicode, comparison,
      text: { hanOccurrences: han.length, uniqueHan: occurrences.size,
        fourCodeOccurrences: han.filter(char => four.has(char)).length,
        availableOccurrences: han.filter(char => available.has(char)).length,
        missingOccurrences: missing.reduce((sum, row) => sum + row.occurrences, 0), missing },
      exclusions: ['User-imported libraries vary per browser and are excluded.', 'Other compatibility characters, IVS, PUA and unencoded glyphs are outside this Unicode property.', 'Input coverage does not certify fonts, all pronunciations or complete shape teaching.'] }
    console.log(JSON.stringify(result, null, 2))
    return result
  } finally { await server.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
