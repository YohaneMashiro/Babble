// Original Babble research program: MIT (LICENSE-CODE). External source data
// and its derived candidate output retain their own terms. No training adoption.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireExternalPath } from '../../scripts/official-ix-audit.mjs'

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOCK = JSON.parse(await readFile(new URL('./inputs.lock.json', import.meta.url), 'utf8'))
const POLICIES = ['modern-only', 'source-aliases']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const scalar = value => typeof value === 'string' && Array.from(value).length === 1 && !/[\uD800-\uDFFF]/u.test(value)
const within = (parent, child) => {
  const rel = relative(parent, child)
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

export function verifyPinned(bytes, expected, label) {
  const digest = typeof expected === 'string' ? expected : expected.sha256
  if (sha(bytes) !== digest || (expected.bytes !== undefined && bytes.length !== expected.bytes)) {
    throw new Error(`Pinned input changed: ${label}; research does not adopt or relock new data.`)
  }
  return bytes
}

export function parseRadical(source) {
  const rows = []
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line || line.startsWith('#')) continue
    const fields = line.split('\t')
    if (fields.length !== 2 || !scalar(fields[0]) || !fields[1].trim()) throw new Error(`Invalid radical TSV at line ${index + 1}`)
    rows.push({ char: fields[0], parts: fields[1].trim().split(/\s+/u), line: index + 1 })
  }
  if (!rows.length) throw new Error('Radical TSV is empty')
  return rows
}

// Parse only a literal AST value. Never import or execute the upstream program.
export function parseAliases(source) {
  const python = `import ast,json,sys
tree=ast.parse(sys.stdin.read())
nodes=[n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='custom_dict' for t in n.targets)]
if len(nodes)!=1: raise ValueError('Expected one custom_dict literal assignment')
print(json.dumps(ast.literal_eval(nodes[0]),ensure_ascii=False))`
  let aliases
  try { aliases = JSON.parse(execFileSync('python3', ['-c', python], { input: source, maxBuffer: 1024 * 1024, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })) }
  catch { throw new Error('Cannot parse upstream custom_dict as a Python literal (Python 3 required)') }
  if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object' || !Object.keys(aliases).length) throw new Error('Empty component aliases')
  for (const [char, value] of Object.entries(aliases)) {
    if (!scalar(char) || !Array.isArray(value) || value.length !== 1 || !Array.isArray(value[0]) || !value[0].length || value[0].some(p => typeof p !== 'string' || !/^[a-züv]+[1-5]?$/u.test(p))) throw new Error('Invalid literal component aliases')
  }
  return aliases
}

export function parseReference(source) {
  const pairs = new Set(), chars = new Set()
  let started = false
  for (const line of source.split(/\r?\n/)) {
    if (line === '...') { started = true; continue }
    if (!started || !line || line.startsWith('#')) continue
    const fields = line.split('\t')
    if (fields.length < 2 || !scalar(fields[0]) || !/^ok[a-z]{4}([a-z]{2})?$/.test(fields[1])) throw new Error('Invalid comparison-only OK table row')
    chars.add(fields[0]); pairs.add(`${fields[0]}\0${fields[1]}`)
  }
  if (!started || !pairs.size) throw new Error('Comparison-only OK table is empty or lacks YAML header delimiter')
  return { pairs, chars }
}

export function generateCandidates(rows, { policy, readings, aliases, explainSound, scheme }) {
  assert(POLICIES.includes(policy), 'Unknown component-reading policy')
  const candidates = [], missing = new Map(), seen = new Set()
  let rejectedLength = 0, rejectedPartScalar = 0, rejectedReading = 0
  const componentSound = part => {
    let choices = readings[part]?.readings ?? []
    let source = 'Unihan17.0.0 first encodable reading in locked order'
    if (policy === 'source-aliases' && Object.hasOwn(aliases, part)) {
      choices = aliases[part][0]; source = 'GPL upstream gen_dict.py custom_dict first encodable alias'
    }
    for (const pinyin of choices) {
      const sound = explainSound(pinyin, scheme)
      if (sound) return { part, pinyin, code: sound.code.toLowerCase(), source }
    }
    return null
  }
  for (const row of rows) {
    if (![2, 3].includes(row.parts.length)) { rejectedLength++; continue }
    if (row.parts.some(part => !scalar(part))) { rejectedPartScalar++; continue }
    const sounds = row.parts.map(componentSound)
    if (sounds.some(sound => !sound)) {
      rejectedReading++
      row.parts.forEach((part, index) => { if (!sounds[index]) missing.set(part, (missing.get(part) ?? 0) + 1) })
      continue
    }
    const code = `ok${sounds.map(sound => sound.code).join('')}`, key = `${row.char}\0${code}`
    if (seen.has(key)) continue
    seen.add(key); candidates.push({ ...row, code, sounds })
  }
  const chars = new Set(candidates.map(row => row.char))
  const ownModern = char => Object.hasOwn(readings, char)
  const summary = {
    generatedCharacters: chars.size, generatedPairs: candidates.length,
    charactersWithOwnModernReading: [...chars].filter(ownModern).length,
    charactersWithoutOwnModernReading: [...chars].filter(char => !ownModern(char)).length,
    astralCharacters: [...chars].filter(char => char.codePointAt(0) > 65535).length,
    rejectedLengthRows: rejectedLength, rejectedMultiScalarPartRows: rejectedPartScalar, rejectedMissingReadingRows: rejectedReading,
    missingParts: [...missing].sort((a, b) => b[1] - a[1]).slice(0, 25),
  }
  return { candidates, chars, summary }
}

/** The lazy comparator cannot influence either policy's generated candidates. */
export async function runStudy(rows, context, readReference) {
  const generated = Object.fromEntries(POLICIES.map(policy => [policy, generateCandidates(rows, { ...context, policy })]))
  let reference = null
  if (readReference) {
    reference = await readReference()
    for (const item of Object.values(generated)) {
      const exact = item.candidates.filter(row => reference.pairs.has(`${row.char}\0${row.code}`)), matched = new Set(exact.map(row => row.char))
      const overlap = [...item.chars].filter(char => reference.chars.has(char)).length
      item.summary.comparison = {
        referenceOverlapCharacters: overlap, exactMatchCharacters: matched.size, exactMatchPairs: exact.length,
        overlapCharactersWithoutExactMatch: overlap - matched.size,
        candidateCharactersOutsideReference: [...item.chars].filter(char => !reference.chars.has(char)).length,
        referenceCharsWithoutCandidate: [...reference.chars].filter(char => !item.chars.has(char)).length,
        matchedCharsWithOwnModernReading: [...matched].filter(char => Object.hasOwn(context.readings, char)).length,
      }
    }
  }
  return { generated, reference }
}

export async function validatePaths({ radicalRoot, reference, outputDirectory }, projectRoot = PROJECT_ROOT) {
  if (!radicalRoot || !outputDirectory) throw new Error('Required: --radical-root and --output-dir')
  // A dangling final symlink cannot be resolved by realpath. Reject it before
  // ancestor resolution, rather than treating its name as a new output path.
  for (const path of [radicalRoot, reference, outputDirectory].filter(Boolean)) {
    try { if ((await lstat(resolve(path))).isSymbolicLink()) throw new Error(`Symlink input/output is not allowed: ${path}`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const source = await requireExternalPath(radicalRoot, projectRoot), output = await requireExternalPath(outputDirectory, projectRoot)
  const comparator = reference ? await requireExternalPath(reference, projectRoot) : null
  if (within(source, output) || within(output, source) || (comparator && (within(output, comparator) || within(comparator, output)))) throw new Error('Output must not overlap a source checkout or comparison input')
  const files = {}
  for (const name of Object.keys(LOCK.radicalSource.files)) {
    const path = join(source, name)
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`Symlink input is not allowed: ${path}`) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    files[name] = await requireExternalPath(path, projectRoot)
  }
  return { source, output, comparator, files }
}

async function immutableOutput(path, bytes) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Output is a symlink: ${path}`)
    const previous = await readFile(path)
    if (!previous.equals(Buffer.from(bytes))) throw new Error(`Existing output differs; choose a fresh --output-dir: ${path}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--help') {
      console.log('Usage: node tools/coverage-research/run.mjs --radical-root /external/pinned-checkout --output-dir /external/new-results [--reference /external/pinned-xhup.ok.dict.yaml]\nOffline, pinned, research-only. Requires Python 3 for literal AST parsing; does not execute upstream code or update training data.')
      return
    }
    const key = { '--radical-root': 'radicalRoot', '--reference': 'reference', '--output-dir': 'outputDirectory' }[args[index]]
    if (!key || options[key] || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Unknown, repeated or incomplete argument: ${args[index]}`)
    options[key] = args[++index]
  }
  const paths = await validatePaths(options)
  const sourceBytes = {}
  for (const [name, pin] of Object.entries(LOCK.radicalSource.files)) sourceBytes[name] = verifyPinned(await readFile(paths.files[name]), pin, name)
  const localBytes = {}
  for (const [name, pin] of Object.entries(LOCK.localInputs)) localBytes[name] = verifyPinned(await readFile(join(PROJECT_ROOT, name)), pin, name)
  const rows = parseRadical(new TextDecoder('utf8', { fatal: true }).decode(sourceBytes['src/dict/radical.yaml']))
  const aliases = parseAliases(sourceBytes['src/script/gen_dict.py'].toString('utf8'))
  const readings = JSON.parse(localBytes['src/data/generated/readings.json']).characters
  const scheme = JSON.parse(localBytes['src/data/generated/sound-mapping.json'])
  const { createServer } = await import('vite')
  const server = await createServer({ root: PROJECT_ROOT, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { explainSound } = await server.ssrLoadModule('/src/domain/sound.ts')
    const result = await runStudy(rows, { readings, aliases, explainSound, scheme }, paths.comparator ? async () => parseReference(new TextDecoder('utf8', { fatal: true }).decode(verifyPinned(await readFile(paths.comparator), LOCK.comparisonOnly.sha256, 'comparison-only OK table'))) : null)
    const summary = {
      schemaVersion: 1, prototype: true,
      scope: 'Research-only component spelling, not ordinary four-key Xiaohe, official certification or adopted training data',
      method: 'Generate both policies from explicit two/three single-scalar components using one first encodable reading per component, then open the optional comparison table. No reading Cartesian product or oracle-directed selection.',
      generator: { path: 'tools/coverage-research/run.mjs', sha256: sha(await readFile(fileURLToPath(import.meta.url))) },
      inputsLockSha256: sha(await readFile(new URL('./inputs.lock.json', import.meta.url))),
      inputs: LOCK, sourceRows: rows.length, sourceCharacters: new Set(rows.map(row => row.char)).size,
      reference: result.reference ? { usedOnlyForComparison: true, characters: result.reference.chars.size, pairs: result.reference.pairs.size, sha256: LOCK.comparisonOnly.sha256 } : null,
      policies: Object.fromEntries(Object.entries(result.generated).map(([policy, item]) => [policy, item.summary])),
      limitation: 'Counts are source character keys, including possible non-Han/compatibility characters; intersect a pinned Unicode target repertoire before reporting Unicode coverage. Matching a community mirror is not independent official accuracy.',
      outputLicense: 'Derived component data retains GPL-3.0 and credited upstream terms; modern reading and layout notices remain separate. Program MIT does not relicense data.',
    }
    await mkdir(paths.output, { recursive: true })
    for (const [policy, item] of Object.entries(result.generated)) await immutableOutput(join(paths.output, `ok-like-${policy}-candidates.json`), JSON.stringify(item.candidates))
    await immutableOutput(join(paths.output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    await immutableOutput(join(paths.output, 'GPL-3.0.txt'), sourceBytes.LICENSE)
    await immutableOutput(join(paths.output, 'SOURCE-CREDITS.md'), sourceBytes['src/README.md'])
    await immutableOutput(join(paths.output, 'CC-BY-3.0.txt'), localBytes['tools/shape-expansion/inputs/CC-BY-3.0.txt'])
    await immutableOutput(join(paths.output, 'IDS-MIT-LICENSE.txt'), localBytes['tools/libre-flypy-audit/inputs/IDS-LICENSE'])
    for (const name of ['NOTICE-Unicode.txt', 'NOTICE-shuangpin-practice.txt']) await immutableOutput(join(paths.output, name), localBytes[`data/${name}`])
    await immutableOutput(join(paths.output, 'NOTICE.md'), `# Research candidates, not adopted training data\n\nThese files are original Babble transformations of the pinned mirtlecn/rime-radical-pinyin component rows and, for source-aliases, its explicit component reading aliases. They are not a copy of the comparison-only table.\n\nSource: ${LOCK.radicalSource.repository}/tree/${LOCK.radicalSource.commit}. Upstream declares GPLv3 and credits kfcd/chaizi (CC BY 3.0), CHISE/ids (GPLv2 or later), and yi-bai/ids (MIT). Preserve GPL-3.0.txt, SOURCE-CREDITS.md and CC-BY-3.0.txt with these derived component records. The CC BY 3.0 terms are also at https://creativecommons.org/licenses/by/3.0/.\n\nModern readings and layout facts retain the separate notices supplied here. The source-aliases policy prefers upstream mnemonic readings and must not be presented as standard modern pronunciation. Generation restricts explicit rows to two or three components, selects one first encodable reading per part and deduplicates character/code pairs. No ordinary four-key Xiaohe or official correctness is implied.\n\nThe Babble wrapper program is MIT; this does not relicense third-party data. Full input pins and modifications are recorded in summary.json and the distributable tool sources. The optional official-origin community mirror remains external and comparison-only; no redistribution rights for it are asserted.\n`)
    console.log(JSON.stringify({ outputDirectory: paths.output, sourceCharacters: summary.sourceCharacters, policies: summary.policies, reference: summary.reference }, null, 2))
    return summary
  } finally { await server.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
