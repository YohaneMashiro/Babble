import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_BYTES, PROJECT_ROOT, SOURCE_URL, compareRuntime, diffSnapshots,
  parseArguments, parseSnapshot, requireExternalPath, updateSnapshot, validateDestinations,
} from '../scripts/official-ix-audit.mjs'
import { explainSound } from '../src/domain/sound'
import mapping from '../src/data/generated/sound-mapping.json'

const bytes = value => Buffer.from(JSON.stringify(value))
const record = (code = 'wopd', roots = '丿 丶', decomposition = '丿 一 丨 一 乛 丿 丶', readings = 'wǒ') => ({ 1: code, 2: roots, 3: decomposition, 4: readings })
const snapshot = value => parseSnapshot(bytes(value))
const directories = []
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), 'babble-ix-test-'))
  directories.push(directory)
  return directory
}
const response = (value, headers = {}) => new Response(bytes(value), { headers: { 'content-type': 'application/json', ...headers } })

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('official snapshot validation and semantic changes', () => {
  it('rejects structural drift, invalid UTF-8 and empty or oversized responses', () => {
    for (const value of [{}, [], { 我: { 1: 'wopd', 2: [], 3: '丿', 4: 'wǒ' } }, { 我: { ...record(), 5: 'unexpected' } }, { ab: record() }]) {
      expect(() => snapshot(value)).toThrow()
    }
    expect(() => parseSnapshot(Buffer.from([0xff]))).toThrow(/UTF-8 JSON/)
    expect(() => parseSnapshot(Buffer.alloc(MAX_BYTES + 1))).toThrow(/exceeds/)
  })

  it('reports known data anomalies without silently repairing or discarding the dictionary', () => {
    const parsed = snapshot({ 蚓: record('ybil-', '虫 弓 丨', '虫 丨', 'yǐn'), 呒: record('fukw omkw', '口 无', '口 无', 'fǔ \uE7C7'), 砦: record('vdv+', '此 石', '此 石', 'zhài'), 我: record('wopd?') })
    expect(parsed.records.蚓.roots).toEqual(['虫', '弓', '丨'])
    expect(parsed.records.蚓.anomalies).toContainEqual({ kind: 'root-count', expected: 2, actual: 3 })
    expect(parsed.records.呒.anomalies).toContainEqual({ kind: 'private-use-character' })
    expect(parsed.records.砦.codes).toEqual([])
    expect(parsed.records.砦.flags).toEqual([{ code: 'VDV', flags: ['+'] }])
    expect(parsed.records.我.anomalies).toContainEqual({ kind: 'invalid-code-token', token: 'wopd?' })
  })

  it('ignores code/reading order but detects flags moving between individual codes', () => {
    const before = snapshot({ 行: record('xkii- hhii+', '彳 亍', '彳 亍', 'xíng háng'), 我: record() })
    const reordered = snapshot({ 我: record(), 行: record('hhii+ xkii-', '彳 亍', '彳 亍', 'háng xíng') })
    expect(diffSnapshots(before, reordered).counts.changed).toBe(0)
    const changed = snapshot({ 行: record('xkii+ hhii-', '彳 亍', '彳 亍', 'xíng háng'), 中: record('vsll', '丨 丨', '丨 乛 一 丨', 'zhōng') })
    const diff = diffSnapshots(before, changed)
    expect(diff.added).toEqual(['中'])
    expect(diff.removed).toEqual(['我'])
    expect(diff.changed).toHaveLength(1)
    expect(Object.keys(diff.changed[0].changes)).toEqual(['flags'])
  })

  it('compares ordered roots/decomposition and independently reports reading/code changes', () => {
    const before = snapshot({ 我: record() })
    const after = snapshot({ 我: record('wopd wodd', '丶 丿', '丶 丿', 'wǒ wò') })
    const diff = diffSnapshots(before, after)
    expect(diff.counts).toMatchObject({ changed: 1, codes: 1, roots: 1, decomposition: 1, readings: 1 })
    expect(diffSnapshots(null, after).baselineAvailable).toBe(false)
  })
})

describe('external-only cache and conditional updates', () => {
  it('rejects project paths, including through symlinked ancestors', async () => {
    expect(await requireExternalPath(await temporary())).toMatch(/babble-ix-test/)
    await expect(requireExternalPath(join(PROJECT_ROOT, 'not-created', 'raw.json'))).rejects.toThrow(/outside/)
    const directory = await temporary()
    await symlink(PROJECT_ROOT, join(directory, 'project-link'), 'dir')
    await expect(requireExternalPath(join(directory, 'project-link', 'not-created', 'raw.json'))).rejects.toThrow(/outside/)
  })

  it('prevents report output from overwriting a reference/baseline or cache metadata/payload', async () => {
    const directory = await temporary()
    const reference = join(directory, 'reference.json')
    const baseline = join(directory, 'baseline.json')
    const cacheDirectory = join(directory, 'cache')
    await writeFile(reference, bytes({ 我: record() }))
    await writeFile(baseline, bytes({ 我: record() }))
    await symlink(reference, join(directory, 'alias.json'))
    await link(reference, join(directory, 'hardlink.json'))
    for (const options of [
      { reference, report: reference },
      { reference, report: join(directory, 'alias.json') },
      { reference, report: join(directory, 'hardlink.json') },
      { baseline, cacheDirectory, report: baseline },
      { cacheDirectory, report: join(cacheDirectory, 'current.json') },
      { cacheDirectory, report: join(cacheDirectory, 'nested', 'report.json') },
    ]) await expect(validateDestinations(options)).rejects.toThrow(/overwrite|inside the snapshot cache/)
    await expect(validateDestinations({ reference, report: join(directory, 'report.json') })).resolves.toMatchObject({ reportPath: join(directory, 'report.json') })
  })

  it('performs one 200 GET then one conditional 304 and reuses the original verified payload offline', async () => {
    const directory = await temporary()
    const calls = []
    const fetchImpl = async (url, options) => {
      calls.push({ url, options })
      return calls.length === 1 ? response({ 我: record() }, { etag: '"v1"', 'last-modified': 'Wed, 21 Oct 2026 02:46:12 GMT' }) : new Response(null, { status: 304 })
    }
    const first = await updateSnapshot({ cacheDirectory: directory, fetchImpl, now: () => '2026-10-27T00:00:00.000Z' })
    const second = await updateSnapshot({ cacheDirectory: directory, fetchImpl, now: () => '2026-10-27T01:00:00.000Z' })
    expect(first.status).toBe('downloaded')
    expect(second.status).toBe('not-modified')
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe(SOURCE_URL)
    expect(calls[0].options.redirect).toBe('error')
    expect(calls[1].options.headers).toMatchObject({ 'If-None-Match': '"v1"', 'If-Modified-Since': 'Wed, 21 Oct 2026 02:46:12 GMT' })
    expect(second.metadata.fetchedAt).toBe(first.metadata.fetchedAt)
    expect(second.metadata.checkedAt).not.toBe(first.metadata.checkedAt)
    expect(second.snapshot.sha256).toBe(first.snapshot.sha256)
    const offline = await updateSnapshot({ cacheDirectory: directory, offline: true, fetchImpl: () => { throw new Error('offline fetched') } })
    expect(offline.status).toBe('offline')
    expect(offline.snapshot.sha256).toBe(first.snapshot.sha256)
  })

  it('preserves current snapshot on HTTP, content-type, size, JSON, schema and network failures', async () => {
    const directory = await temporary()
    const first = await updateSnapshot({ cacheDirectory: directory, fetchImpl: async () => response({ 我: record() }) })
    const manifest = await readFile(join(directory, 'current.json'), 'utf8')
    const failures = [
      async () => new Response('failure', { status: 503 }),
      async () => new Response('<html>no</html>', { headers: { 'content-type': 'text/html' } }),
      async () => new Response('{}', { headers: { 'content-length': String(MAX_BYTES + 1) } }),
      async () => new Response(new Uint8Array(MAX_BYTES + 1)),
      async () => new Response('{'),
      async () => response({ 我: { 1: 'wopd' } }),
      async () => { throw new Error('network unavailable') },
    ]
    for (const fetchImpl of failures) {
      await expect(updateSnapshot({ cacheDirectory: directory, fetchImpl })).rejects.toThrow()
      expect(await readFile(join(directory, 'current.json'), 'utf8')).toBe(manifest)
      expect((await updateSnapshot({ cacheDirectory: directory, offline: true })).snapshot.sha256).toBe(first.snapshot.sha256)
    }
  })

  it('keeps both versions when a valid later snapshot changes and rejects corrupt cached bytes', async () => {
    const directory = await temporary()
    const first = await updateSnapshot({ cacheDirectory: directory, fetchImpl: async () => response({ 我: record() }) })
    const second = await updateSnapshot({ cacheDirectory: directory, fetchImpl: async () => response({ 我: record('wopd-'), 中: record('vsll', '丨 丨', '丨 一 丨', 'zhōng') }) })
    expect(second.before.sha256).toBe(first.snapshot.sha256)
    expect(second.metadata.previousSha256).toBe(first.snapshot.sha256)
    expect(parseSnapshot(await readFile(join(directory, `${first.snapshot.sha256}.json`))).sha256).toBe(first.snapshot.sha256)
    expect(diffSnapshots(second.before, second.snapshot).counts).toMatchObject({ added: 1, flags: 1 })
    await writeFile(join(directory, `${second.snapshot.sha256}.json`), bytes({ 我: record() }))
    await expect(updateSnapshot({ cacheDirectory: directory, offline: true })).rejects.toThrow(/checksum\/size mismatch/)
  })

  it('rejects an unsolicited 304 and missing offline cache', async () => {
    const directory = await temporary()
    await expect(updateSnapshot({ cacheDirectory: directory, fetchImpl: async () => new Response(null, { status: 304 }) })).rejects.toThrow(/without a cached/)
    await expect(updateSnapshot({ cacheDirectory: directory, offline: true })).rejects.toThrow(/No cached/)
  })
})

describe('runtime comparison and CLI inputs', () => {
  it('strips only the existing validator’s trailing reading annotation when comparing roots', () => {
    const parsed = snapshot({ 决: record('jtdg', '冫 夬guài', '冫 夬', 'jué'), 现: record('xmwe', '王 见下', '王 冂 见下', 'xiàn') })
    const comparison = compareRuntime(parsed, {
      entries: [
        { char: '决', fullCode: 'JTDG', shape: { first: { component: '冫' }, last: { component: '夬' } } },
        { char: '现', fullCode: 'XMWE', shape: { first: { component: '王' }, last: { component: '儿' } } },
      ], readings: {}, explainReading: reading => explainSound(reading, mapping),
    })
    expect(comparison.details.rootConflicts).toHaveLength(1)
    expect(comparison.details.rootConflicts[0]).toMatchObject({ char: '现', referenceRoots: ['王', '见下'] })
    expect(parsed.records.决.roots).toEqual(['冫', '夬guài'])
  })

  it('uses audited sound matching rather than pairing official code/readings by array position', () => {
    const parsed = snapshot({ 觉: record('jnxe jtxe', '⺍ 见下', '⺍ 冖 冂 见下', 'jué jiào'), 走: record('zztr', '土 人', '土 丨 一 人', 'zǒu'), 行: record('hgii xkii hhii-', '彳 亍', '彳 亍', 'háng xíng hàng héng'), 蚓: record('ybil-', '虫 弓 丨', '虫 丨', 'yǐn') })
    const comparison = compareRuntime(parsed, {
      entries: [{ char: '行', fullCode: 'XKII', shape: { first: { component: '彳' }, last: { component: '亍' } } }],
      readings: { 觉: { readings: ['jué', 'jiào'] }, 走: { readings: ['zǒu'] }, 行: { readings: ['xíng'] }, 蚓: { readings: ['yǐn'] } },
      explainReading: reading => explainSound(reading, mapping),
    })
    expect(comparison.details.missingCharacters.find(item => item.char === '觉')).toMatchObject({ category: 'named-component-mapping', matchedModernCodes: ['JNXE', 'JTXE'] })
    expect(comparison.details.missingCharacters.find(item => item.char === '走').category).toBe('missing-source-derivation')
    expect(comparison.details.missingCharacters.find(item => item.char === '蚓').category).toBe('reference-anomaly')
    expect(comparison.counts.extraCodesOnKnownCharactersWithoutModernReading).toBe(2)
    expect(comparison.counts.codeConflicts).toBe(0)
    expect(comparison.counts.rootConflicts).toBe(0)
  })

  it('reports actual local conflicts and classifies lack of a modern reading without inventing an answer', () => {
    const parsed = snapshot({ 我: record(), 行: record('hhii', '彳 亍', '彳 亍', 'háng') })
    const comparison = compareRuntime(parsed, {
      entries: [{ char: '我', fullCode: 'WODD', shape: { first: { component: '丶' }, last: { component: '丶' } } }, { char: '中', fullCode: 'VSLL', shape: { first: { component: '丨' }, last: { component: '丨' } } }],
      readings: { 我: { readings: ['wǒ'] }, 行: { readings: ['xíng'] } },
      shapeCharacters: ['行'], explainReading: reading => explainSound(reading, mapping),
    })
    expect(comparison.details.missingCharacters).toHaveLength(1)
    expect(comparison.details.missingCharacters[0]).toMatchObject({ char: '行', category: 'reading-policy-difference', hasLocalShapeTrace: true })
    expect(comparison.details.codeConflicts).toHaveLength(1)
    expect(comparison.details.rootConflicts).toHaveLength(1)
    expect(comparison.details.localCharactersAbsentFromReference).toEqual(['中'])
  })

  it('rejects ambiguous, missing or unknown arguments', () => {
    expect(parseArguments(['--reference', '/tmp/input.json', '--report', '/tmp/report.json'])).toMatchObject({ reference: '/tmp/input.json', report: '/tmp/report.json' })
    for (const args of [['--reference'], ['--report', '--offline'], ['--reference', 'a', '--reference', 'b'], ['--reference', 'a', '--offline'], ['--unknown']]) expect(() => parseArguments(args)).toThrow()
  })
})
