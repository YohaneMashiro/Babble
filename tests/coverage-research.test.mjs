import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateCandidates, parseAliases, parseRadical, parseReference, runStudy, validatePaths, verifyPinned } from '../tools/coverage-research/run.mjs'

const temporary = []
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }) })
const explainSound = pinyin => ({ mu4: 'MU', you4: 'YZ', lin2: 'LB' }[pinyin] ? { code: { mu4: 'MU', you4: 'YZ', lin2: 'LB' }[pinyin] } : null)
const context = { readings: { 木: { readings: ['mu4', 'lin2'] }, 又: { readings: ['you4'] } }, aliases: {}, explainSound, scheme: {} }

describe('coverage research boundaries', () => {
  it('rejects changed input bytes and declared byte length without relocking', () => {
    const bytes = Buffer.from('independent input'), hash = createHash('sha256').update(bytes).digest('hex')
    expect(verifyPinned(bytes, { sha256: hash, bytes: bytes.length }, 'source')).toBe(bytes)
    expect(() => verifyPinned(Buffer.concat([bytes, Buffer.from(' ')]), hash, 'source')).toThrow(/Pinned input changed/)
    expect(() => verifyPinned(bytes, { sha256: hash, bytes: 1 }, 'source')).toThrow(/Pinned input changed/)
  })

  it('parses the actual flat TSV format and rejects malformed or non-scalar keys', () => {
    expect(parseRadical('# comment\n𡿪\t木 又\r\n林\t木 木\n')).toEqual([
      { char: '𡿪', parts: ['木', '又'], line: 2 }, { char: '林', parts: ['木', '木'], line: 3 },
    ])
    for (const source of ['', '木木\t木 木', '木\t木\textra', '\ud800\t木 又', '木\t ']) expect(() => parseRadical(source)).toThrow()
  })

  it('extracts only a literal alias dictionary without executing surrounding Python', () => {
    expect(parseAliases("raise RuntimeError('do not execute')\ncustom_dict = {'木': [['mu4', 'lin2']]}\n")).toEqual({ 木: [['mu4', 'lin2']] })
    expect(() => parseAliases("custom_dict = dict(wood='mu4')")).toThrow(/Python literal/)
    expect(() => parseAliases("custom_dict = {'木': [['mu4']]}\ncustom_dict = {}\n")).toThrow()
    expect(() => parseAliases("custom_dict = {'木木': [['mu4']]}\n")).toThrow(/Invalid literal/)
  })

  it('uses one reading per component, keeps policies separate and does not require a whole-character reading', () => {
    const rows = parseRadical('𡿪\t木 又\n𡿪\t木 又\n林\t木 木 木 木\n')
    const modern = generateCandidates(rows, { ...context, aliases: { 木: [['lin2']] }, policy: 'modern-only' })
    const aliases = generateCandidates(rows, { ...context, aliases: { 木: [['lin2']] }, policy: 'source-aliases' })
    expect(modern.candidates.map(row => row.code)).toEqual(['okmuyz'])
    expect(aliases.candidates.map(row => row.code)).toEqual(['oklbyz'])
    expect(modern.summary.charactersWithoutOwnModernReading).toBe(1)
    expect(modern.summary.rejectedLengthRows).toBe(1)
    expect(modern.summary.generatedPairs).toBe(1)
  })

  it('completes both candidate policies before reading the reference, which cannot change candidate selection', async () => {
    const rows = parseRadical('林\t木 木\n树\t木 又\n')
    let calls = 0
    const studyContext = { ...context, explainSound: (...args) => { calls++; return explainSound(...args) } }
    const compared = await runStudy(rows, studyContext, async () => {
      expect(calls).toBe(8)
      return parseReference('---\nname: fixture\n...\n林\tokmumu\n树\tokxxxx\n')
    })
    const independent = await runStudy(rows, context)
    for (const policy of ['modern-only', 'source-aliases']) {
      expect(compared.generated[policy].candidates).toEqual(independent.generated[policy].candidates)
      expect(compared.generated[policy].summary.comparison.exactMatchCharacters).toBe(1)
      expect(compared.generated[policy].summary.comparison.overlapCharactersWithoutExactMatch).toBe(1)
    }
    expect(() => parseReference('...\n林\tmumu\n')).toThrow(/Invalid comparison/)
  })

  it('rejects project-contained paths, symlink escapes and input/output overlap before writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'babble-coverage-paths-')); temporary.push(root)
    const project = join(root, 'project'), source = join(root, 'source'), output = join(root, 'results')
    await Promise.all([mkdir(project), mkdir(source)])
    await expect(validatePaths({ radicalRoot: source, outputDirectory: output }, project)).resolves.toMatchObject({ source, output })
    await expect(validatePaths({ radicalRoot: source, outputDirectory: join(project, 'results') }, project)).rejects.toThrow(/outside/)
    await expect(validatePaths({ radicalRoot: source, outputDirectory: join(source, 'results') }, project)).rejects.toThrow(/overlap/)
    await expect(validatePaths({ radicalRoot: source, outputDirectory: output, reference: join(output, 'reference.yaml') }, project)).rejects.toThrow(/overlap/)
    await symlink(project, join(root, 'project-alias'), 'dir')
    await expect(validatePaths({ radicalRoot: join(root, 'project-alias'), outputDirectory: output }, project)).rejects.toThrow(/outside|[Ss]ymlink/)
    await mkdir(join(source, 'src', 'dict'), { recursive: true })
    await symlink(join(project, 'private.yaml'), join(source, 'src', 'dict', 'radical.yaml'))
    await expect(validatePaths({ radicalRoot: source, outputDirectory: output }, project)).rejects.toThrow(/outside|[Ss]ymlink/)
  })
})
