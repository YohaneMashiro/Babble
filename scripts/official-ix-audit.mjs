// Read-only reference audit. Official payloads and detailed reports stay outside
// the distributable project. No record is imported into the teaching library.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_URL = 'https://flypy.cc/ix/ixdata.json'
export const PARSER_VERSION = '1.0.0'
export const MAX_BYTES = 4 * 1024 * 1024
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sorted = values => [...new Set(values)].sort()
const words = value => value.trim().split(/\s+/u).filter(Boolean)
const hasPrivateUse = value => /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(value)
const isWithin = (directory, path) => {
  const child = relative(directory, path)
  return !child || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino

async function isWithinExistingDirectory(directory, path) {
  if (isWithin(directory, path)) return true
  let identity
  try { identity = await stat(directory) } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  let ancestor = path
  while (true) {
    try {
      if (sameIdentity(identity, await stat(ancestor))) return true
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

async function aliasesFile(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  try { return sameIdentity(await stat(a), await stat(b)) } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/** Same narrow annotation removal used by the locked shape validator. */
export function normalizedReferenceRoot(label) {
  return /^[\u3400-\u9fff][A-Za-z\u00C0-\u024F]+$/u.test(label) ? label[0] : label
}

/** Resolve existing ancestors too, so a symlink cannot place private data in the project. */
export async function requireExternalPath(path, projectRoot = PROJECT_ROOT) {
  const absolute = resolve(path)
  let ancestor = absolute
  const tail = []
  while (true) {
    try {
      ancestor = await realpath(ancestor)
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      tail.unshift(basename(ancestor))
      ancestor = parent
    }
  }
  const actual = resolve(ancestor, ...tail)
  const root = await realpath(projectRoot)
  // Identity walking also handles differently-cased aliases on Windows drives
  // mounted in WSL, where lexical Linux path comparisons alone are insufficient.
  if (await isWithinExistingDirectory(root, actual)) {
    throw new Error('Official references, caches and detailed reports must be outside the project.')
  }
  return actual
}

export function parseSnapshot(bytes) {
  if (bytes.byteLength > MAX_BYTES) throw new Error(`Snapshot exceeds ${MAX_BYTES} bytes.`)
  let raw
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Snapshot must contain valid UTF-8 JSON.')
  }
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' || !Object.keys(raw).length) throw new Error('Snapshot must be a nonempty character dictionary.')
  const records = {}
  for (const [char, fields] of Object.entries(raw)) {
    if (!/^\p{Script=Han}$/u.test(char)) throw new Error(`Invalid dictionary character: ${JSON.stringify(char)}`)
    if (!fields || Array.isArray(fields) || typeof fields !== 'object' || Object.keys(fields).sort().join(',') !== '1,2,3,4' || Object.values(fields).some(value => typeof value !== 'string' || !value.trim() || value.length > 4096)) {
      throw new Error(`Unexpected fields for ${char}; expected four nonempty strings keyed 1–4.`)
    }
    const anomalies = []
    const codeTokens = words(fields['1']).map(token => {
      const match = /^([a-z]+)([-+*]*)$/i.exec(token)
      if (!match) {
        anomalies.push({ kind: 'invalid-code-token', token })
        return { raw: token, code: null, flags: [] }
      }
      const code = match[1].toUpperCase()
      if (code.length !== 4) anomalies.push({ kind: 'non-four-key-code', token })
      return { raw: token, code, flags: sorted(match[2]) }
    })
    const roots = words(fields['2'])
    const readings = words(fields['4'])
    if (roots.length !== 2) anomalies.push({ kind: 'root-count', expected: 2, actual: roots.length })
    if (Object.values(fields).some(hasPrivateUse)) anomalies.push({ kind: 'private-use-character' })
    records[char] = {
      codes: sorted(codeTokens.filter(token => token.code?.length === 4).map(token => token.code)),
      roots,
      decomposition: words(fields['3']),
      readings: sorted(readings),
      flags: codeTokens.map(({ code, flags, raw }) => ({ code, flags, ...(code === null ? { raw } : {}) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      anomalies,
    }
  }
  return { records, sha256: sha256(bytes), bytes: bytes.byteLength, characterCount: Object.keys(records).length }
}

/** Order of codes/readings is not a code-to-reading association. Roots remain ordered. */
export function diffSnapshots(before, after) {
  if (!before) return { baselineAvailable: false, added: [], removed: [], changed: [], counts: { added: 0, removed: 0, changed: 0, codes: 0, roots: 0, decomposition: 0, readings: 0, flags: 0, anomalies: 0 } }
  const added = Object.keys(after.records).filter(char => !Object.hasOwn(before.records, char)).sort()
  const removed = Object.keys(before.records).filter(char => !Object.hasOwn(after.records, char)).sort()
  const counts = { added: added.length, removed: removed.length, changed: 0, codes: 0, roots: 0, decomposition: 0, readings: 0, flags: 0, anomalies: 0 }
  const changed = []
  for (const char of Object.keys(after.records).sort()) {
    if (!Object.hasOwn(before.records, char)) continue
    const changes = {}
    for (const field of ['codes', 'roots', 'decomposition', 'readings', 'flags', 'anomalies']) {
      if (JSON.stringify(before.records[char][field]) !== JSON.stringify(after.records[char][field])) {
        changes[field] = { before: before.records[char][field], after: after.records[char][field] }
        counts[field]++
      }
    }
    if (Object.keys(changes).length) changed.push({ char, changes })
  }
  counts.changed = changed.length
  return { baselineAvailable: true, added, removed, changed, counts }
}

async function atomicWrite(path, bytes) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function readBoundedFile(path) {
  if ((await stat(path)).size > MAX_BYTES) throw new Error(`Snapshot exceeds ${MAX_BYTES} bytes.`)
  const bytes = await readFile(path)
  if (bytes.byteLength > MAX_BYTES) throw new Error(`Snapshot exceeds ${MAX_BYTES} bytes.`)
  return bytes
}

export async function readReference(path) {
  const external = await requireExternalPath(path)
  return { ...parseSnapshot(await readBoundedFile(external)), location: external }
}

async function readCache(directory) {
  let manifest
  try {
    const manifestPath = await requireExternalPath(join(directory, 'current.json'))
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(manifestPath)))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`Cannot read cached manifest: ${error.message}`)
  }
  if (manifest.sourceUrl !== SOURCE_URL || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes > MAX_BYTES || typeof manifest.fetchedAt !== 'string' || (manifest.etag !== null && typeof manifest.etag !== 'string') || (manifest.lastModified !== null && typeof manifest.lastModified !== 'string')) throw new Error('Invalid cached manifest.')
  const snapshotPath = await requireExternalPath(join(directory, `${manifest.sha256}.json`))
  const snapshot = parseSnapshot(await readBoundedFile(snapshotPath))
  if (snapshot.sha256 !== manifest.sha256 || snapshot.bytes !== manifest.bytes) throw new Error('Cached snapshot checksum/size mismatch; previous cache was not changed.')
  return { snapshot, metadata: manifest }
}

async function responseBytes(response) {
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error('Invalid or oversized Content-Length.')
  const contentType = response.headers.get('content-type')
  if (contentType && !/^(application\/(?:json|[^;]+\+json)|text\/(?:plain|json))(?:\s*;|$)/i.test(contentType)) throw new Error(`Unexpected Content-Type: ${contentType}`)
  if (!response.body) throw new Error('Snapshot response has no body.')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error(`Snapshot exceeds ${MAX_BYTES} bytes.`)
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

/** Exactly one conditional public GET; validation completes before current.json changes. */
export async function updateSnapshot({ cacheDirectory, offline = false, fetchImpl = globalThis.fetch, now = () => new Date().toISOString() }) {
  const directory = await requireExternalPath(cacheDirectory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  // Recheck after creating directories in case an ancestor was replaced by a symlink.
  await requireExternalPath(directory)
  const lockPath = join(directory, '.update.lock')
  let lock
  try {
    lock = await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('An audit is already updating this cache (.update.lock). Remove a stale lock only after confirming no audit is running.')
    throw error
  }
  try {
    const before = await readCache(directory)
    if (offline) {
      if (!before) throw new Error('No cached snapshot is available for --offline.')
      return { ...before, before: before.snapshot, status: 'offline' }
    }
    const headers = { Accept: 'application/json' }
    if (before?.metadata.etag) headers['If-None-Match'] = before.metadata.etag
    if (before?.metadata.lastModified) headers['If-Modified-Since'] = before.metadata.lastModified
    const response = await fetchImpl(SOURCE_URL, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) })
    const checkedAt = now()
    if (response.status === 304) {
      if (!before) throw new Error('Server returned 304 without a cached snapshot.')
      const metadata = { ...before.metadata, checkedAt, parserVersion: PARSER_VERSION }
      await atomicWrite(join(directory, 'current.json'), JSON.stringify(metadata, null, 2) + '\n')
      return { snapshot: before.snapshot, before: before.snapshot, metadata, status: 'not-modified' }
    }
    if (response.status !== 200) throw new Error(`Official snapshot request failed with HTTP ${response.status}.`)
    const bytes = await responseBytes(response)
    const snapshot = parseSnapshot(bytes)
    const metadata = {
      sourceUrl: SOURCE_URL, fetchedAt: checkedAt, checkedAt,
      sha256: snapshot.sha256, bytes: snapshot.bytes, characterCount: snapshot.characterCount,
      etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'),
      parserVersion: PARSER_VERSION,
      previousSha256: before?.snapshot.sha256 ?? null,
    }
    const snapshotPath = await requireExternalPath(join(directory, `${snapshot.sha256}.json`))
    await atomicWrite(snapshotPath, bytes)
    await atomicWrite(join(directory, 'current.json'), JSON.stringify(metadata, null, 2) + '\n')
    return { snapshot, before: before?.snapshot ?? null, metadata, status: before?.snapshot.sha256 === snapshot.sha256 ? 'unchanged-content' : 'downloaded' }
  } finally {
    await lock.close()
    await rm(lockPath, { force: true })
  }
}

/** Comparisons never generate roots/codes or select a reading by array position. */
export function compareRuntime(snapshot, { entries, readings, explainReading, shapeCharacters = [] }) {
  const byCharacter = new Map()
  for (const entry of entries) {
    const group = byCharacter.get(entry.char) ?? []
    group.push(entry)
    byCharacter.set(entry.char, group)
  }
  const shapeSet = new Set(shapeCharacters)
  const details = { missingCharacters: [], localCharactersAbsentFromReference: [], codeConflicts: [], rootConflicts: [], additionalReferenceCodes: [], anomalies: [] }
  const categoryCounts = { 'missing-source-derivation': 0, 'named-component-mapping': 0, 'reading-policy-difference': 0, 'reference-anomaly': 0 }
  const soundCodes = record => new Set((record?.readings ?? []).map(explainReading).filter(Boolean).map(sound => sound.code.toUpperCase()))
  for (const [char, reference] of Object.entries(snapshot.records)) {
    const comparableRoots = reference.roots.map(normalizedReferenceRoot)
    const choices = byCharacter.get(char) ?? []
    const modernPrefixes = soundCodes(readings[char])
    const prefixMatches = reference.codes.filter(code => modernPrefixes.has(code.slice(0, 2)))
    if (reference.anomalies.length) details.anomalies.push({ char, issues: reference.anomalies })
    if (!choices.length) {
      const category = reference.anomalies.some(issue => issue.kind === 'root-count') ? 'reference-anomaly'
        : !prefixMatches.length ? 'reading-policy-difference'
          : comparableRoots.some(root => [...root].length !== 1) ? 'named-component-mapping' : 'missing-source-derivation'
      categoryCounts[category]++
      details.missingCharacters.push({ char, category, hasLocalShapeTrace: shapeSet.has(char), modernReadings: readings[char]?.readings ?? [], matchedModernCodes: prefixMatches, reference })
    }
    const localCodes = new Set(choices.map(entry => entry.fullCode.toUpperCase()))
    for (const code of reference.codes) {
      if (!localCodes.has(code)) details.additionalReferenceCodes.push({ char, code, category: modernPrefixes.has(code.slice(0, 2)) ? 'missing-source-derivation' : 'reading-policy-difference', hasLocalCharacter: choices.length > 0 })
    }
    const seen = new Set()
    for (const entry of choices) {
      const code = entry.fullCode.toUpperCase()
      const localRoots = [entry.shape.first.component, entry.shape.last.component]
      const key = JSON.stringify([code, localRoots])
      if (seen.has(key)) continue
      seen.add(key)
      if (!reference.codes.includes(code)) details.codeConflicts.push({ char, localCode: code, referenceCodes: reference.codes })
      if (comparableRoots.length !== 2 || JSON.stringify(localRoots) !== JSON.stringify(comparableRoots)) details.rootConflicts.push({ char, code, localRoots, referenceRoots: reference.roots })
    }
  }
  for (const char of byCharacter.keys()) if (!Object.hasOwn(snapshot.records, char)) details.localCharactersAbsentFromReference.push(char)
  return {
    counts: {
      referenceCharacters: snapshot.characterCount,
      referenceFourKeyPairs: Object.values(snapshot.records).reduce((sum, item) => sum + item.codes.length, 0),
      localTrainableCharacters: byCharacter.size,
      localToneEntries: entries.length,
      localFourKeyPairs: new Set(entries.map(entry => `${entry.char}:${entry.fullCode.toUpperCase()}`)).size,
      ...Object.fromEntries(Object.entries(details).map(([key, values]) => [key, values.length])),
      missingByCategory: categoryCounts,
      missingReadingPolicyWithLocalShapeTrace: details.missingCharacters.filter(item => item.category === 'reading-policy-difference' && item.hasLocalShapeTrace).length,
      missingReadingPolicyWithoutLocalShapeTrace: details.missingCharacters.filter(item => item.category === 'reading-policy-difference' && !item.hasLocalShapeTrace).length,
      extraCodesOnKnownCharacters: details.additionalReferenceCodes.filter(item => item.hasLocalCharacter).length,
      extraCodesOnKnownCharactersWithoutModernReading: details.additionalReferenceCodes.filter(item => item.hasLocalCharacter && item.category === 'reading-policy-difference').length,
    },
    details,
    note: 'Reference agreement is a comparison with this snapshot, not independent proof of teaching accuracy. Missing or alternative official codes are never imported automatically.',
  }
}

async function loadRuntime() {
  const { createServer } = await import('vite')
  const server = await createServer({ root: PROJECT_ROOT, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const [library, readings, sound, mapping, legacy, expansion] = await Promise.all([
      server.ssrLoadModule('/src/data/library.ts'), server.ssrLoadModule('/src/data/generated/readings.json'),
      server.ssrLoadModule('/src/domain/sound.ts'), server.ssrLoadModule('/src/data/generated/sound-mapping.json'),
      server.ssrLoadModule('/src/data/generated/shape-traces.json'), server.ssrLoadModule('/src/data/generated/shape-expansion.json'),
    ])
    return { entries: library.TRAINING_ENTRIES, readings: readings.default.characters, explainReading: reading => sound.explainSound(reading, mapping.default), shapeCharacters: [...Object.keys(legacy.default.characters), ...Object.keys(expansion.default.characters)] }
  } finally {
    await server.close()
  }
}

export function parseArguments(args) {
  const options = { offline: false, help: false }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--offline') options.offline = true
    else if (arg === '--help') options.help = true
    else if (['--reference', '--baseline', '--cache-dir', '--report'].includes(arg)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`)
      const key = { '--reference': 'reference', '--baseline': 'baseline', '--cache-dir': 'cacheDirectory', '--report': 'report' }[arg]
      if (options[key]) throw new Error(`Duplicate option ${arg}.`)
      options[key] = value
    } else throw new Error(`Unknown option ${arg}. Use --help.`)
  }
  if (options.reference && options.offline) throw new Error('--reference is already offline; do not combine it with --offline.')
  return options
}

/** A report may replace an earlier report, but never a reference or cache file. */
export async function validateDestinations(options) {
  const referencePath = options.reference ? await requireExternalPath(options.reference) : null
  const baselinePath = options.baseline ? await requireExternalPath(options.baseline) : null
  const cacheDirectory = options.reference ? null : await requireExternalPath(options.cacheDirectory ?? join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'babble', 'official-ix'))
  const reportPath = options.report ? await requireExternalPath(options.report) : null
  if (reportPath && (await aliasesFile(reportPath, referencePath) || await aliasesFile(reportPath, baselinePath) || (cacheDirectory && await isWithinExistingDirectory(cacheDirectory, reportPath)))) {
    throw new Error('Detailed report must not overwrite a reference/baseline or be stored inside the snapshot cache.')
  }
  return { referencePath, baselinePath, cacheDirectory, reportPath }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args)
  if (options.help) {
    console.log('Usage: node scripts/official-ix-audit.mjs [--offline | --reference /outside/ixdata.json] [--baseline /outside/older.json] [--cache-dir /outside/cache] [--report /outside/report.json]\nDefault: one conditional public GET, then local runtime comparison. Stdout contains metadata/counts; detailed official fields require an external --report. No library or lock is modified.')
    return
  }
  // Reject invalid destinations before fetching; do not partially do a requested run.
  const { referencePath, baselinePath, cacheDirectory, reportPath } = await validateDestinations(options)
  const baseline = baselinePath ? await readReference(baselinePath) : null
  let result
  if (referencePath) {
    const snapshot = await readReference(referencePath)
    result = { snapshot, before: null, status: 'external-reference', metadata: { sourceUrl: SOURCE_URL, referenceFile: snapshot.location, sha256: snapshot.sha256, bytes: snapshot.bytes, characterCount: snapshot.characterCount, parserVersion: PARSER_VERSION, checkedAt: new Date().toISOString(), fetchedAt: null, etag: null, lastModified: null } }
  } else {
    result = await updateSnapshot({ cacheDirectory, offline: options.offline })
  }
  const changes = diffSnapshots(baseline ?? result.before, result.snapshot)
  const comparison = compareRuntime(result.snapshot, await loadRuntime())
  const report = { status: result.status, source: result.metadata, baselineSha256: (baseline ?? result.before)?.sha256 ?? null, changes, comparison }
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true, mode: 0o700 })
    await requireExternalPath(reportPath)
    await atomicWrite(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(JSON.stringify({ status: report.status, source: report.source, baselineSha256: report.baselineSha256, changes: { baselineAvailable: changes.baselineAvailable, ...changes.counts }, comparison: comparison.counts, detailedReport: reportPath, note: comparison.note }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Official reference audit failed: ${error.message}`); process.exitCode = 1 })
}
