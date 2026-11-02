import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareAfterGeneration, generateCandidates, packRecords, shardForCharacter, validatePacked } from '../tools/component-spelling/generate.mjs'

const config = {
  policyId: 'test-policy', prefix: 'OK', componentCounts: [2, 3], maximumCombinationsPerSourceRow: 256,
  globalComponentRules: { 辶: { pinyin: 'zhi', code: 'VI' } },
  globalRuleEvidence: { url: 'https://flypy.cc/help/#/pc', locator: '公开部件拼读约定', scope: 'test facts' },
}
const readings = {
  木: { readings: ['mù', 'mú', 'lín'], readingSources: { mù: ['kMandarin'], mú: ['kMandarin'], lín: ['kTGHZ2013'] } },
  又: { readings: ['yòu'], readingSources: { yòu: ['kMandarin', 'kTGHZ2013'] } },
}
const explainSound = value => ({ mù: 'MU', mú: 'MU', lín: 'LB', yòu: 'YZ', lin2: 'LB' }[value] ? { code: { mù: 'MU', mú: 'MU', lín: 'LB', yòu: 'YZ', lin2: 'LB' }[value] } : null)
const context = { config, readings, aliases: {}, scheme: {}, explainSound }
const inputLock = { source: { url: 'https://example.test/source', commit: 'pinned', license: 'GPL-3.0' }, comparisonOnly: { sha256: 'a'.repeat(64) } }
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture() {
  const rows = [{ char: '𡿪', parts: ['木', '又'], line: 2 }, { char: '林', parts: ['木', '木', '又'], line: 3 }]
  const generation = generateCandidates(rows, context)
  generation.records = generation.records.map((record, index) => ({ ...record, comparisonFlag: index === 0 ? 1 : 0 }))
  return { ...packRecords(generation.records, { config, inputLock, generation }), generation }
}

describe('production component spelling evidence', () => {
  it('generates distinct sound-code combinations and preserves first ordered reading/source witness', () => {
    const rows = [{ char: '𡿪', parts: ['木', '又'], line: 2 }, { char: '𡿪', parts: ['木', '又'], line: 3 }]
    const first = generateCandidates(rows, context), second = generateCandidates(rows, context)
    expect(first).toEqual(second)
    expect(first.records.map(record => record.code)).toEqual(['OKMUYZ', 'OKLBYZ'])
    expect(first.records.map(record => record.sourceLine)).toEqual([2, 2])
    expect(first.records[0].components[0]).toEqual({ part: '木', pinyin: 'mù', code: 'MU', sourceId: 'unihan:kMandarin' })
    expect(first.records[1].components[0].sourceId).toBe('unihan:kTGHZ2013')
    expect(first.records[0].components[1].sourceId).toBe('unihan:kMandarin+kTGHZ2013')
    expect(Object.hasOwn(readings, '𡿪')).toBe(false)
  })

  it('keeps explicit mnemonic and global-rule facts separate from whole-character modern readings', () => {
    const rows = [{ char: '迹', parts: ['辶', '木'], line: 1 }]
    const generated = generateCandidates(rows, { ...context, aliases: { 木: [['lin2']] } })
    expect(generated.records).toHaveLength(1)
    expect(generated.records[0].code).toBe('OKVILB')
    expect(generated.records[0].components.map(part => part.sourceId)).toEqual(['flypy:component-spelling-rule', 'radical:component-mnemonic'])
    expect(generated.records[0].components[0].pinyin).toBe('zhi')
    expect(Object.hasOwn(readings, '迹')).toBe(false)
  })

  it('rejects unavailable component readings and bounds combinations before expanding them', () => {
    const rows = [
      { char: '林', parts: ['木', '木', '木'], line: 1 },
      { char: '森', parts: ['木', '木', '木', '木'], line: 2 },
      { char: '树', parts: ['未知', '又'], line: 3 },
      { char: '未', parts: ['火', '又'], line: 4 },
    ]
    const generated = generateCandidates(rows, { ...context, config: { ...config, maximumCombinationsPerSourceRow: 2 } })
    expect(generated.records).toEqual([])
    expect(generated.rejected).toEqual({ length: 2, missingReading: 1, combinationLimit: 1 })
    expect(generated.maximumCombinations).toBe(8)
  })

  it('reads comparison only after all candidate witnesses exist and marks each pair independently', async () => {
    let soundCalls = 0
    const rows = [{ char: '林', parts: ['木', '又'], line: 1 }]
    const result = await compareAfterGeneration(rows, { ...context, explainSound: (...args) => { soundCalls++; return explainSound(...args) } }, async () => {
      expect(soundCalls).toBe(4)
      return { pairs: new Set(['林\0okmuyz']), chars: new Set(['林']) }
    })
    expect(result.records.map(record => [record.code, record.comparisonFlag])).toEqual([['OKMUYZ', 1], ['OKLBYZ', 0]])
    const untouched = generateCandidates(rows, context).records
    expect(result.records.map(({ comparisonFlag, ...record }) => record)).toEqual(untouched)
  })

  it('packs and validates astral shards, all explanations and candidate/confirmed counts without dropping candidates', () => {
    const { manifest, artifacts, generation } = fixture()
    const shards = new Map(manifest.shards.map(shard => [shard.file, artifacts.get(`src/data/generated/${shard.file}`)]))
    expect(validatePacked(manifest, shards)).toEqual({ characters: 2, pairs: generation.records.length, confirmedCharacters: 1, confirmedPairs: 1 })
    expect(shardForCharacter('𡿪')).toBe((0x21fea >>> 10).toString(16).padStart(3, '0'))
    expect(manifest.statistics.unconfirmedPairs).toBe(generation.records.length - 1)
    const repeat = packRecords(generation.records, { config, inputLock, generation })
    for (const [path, bytes] of artifacts) expect(repeat.artifacts.get(path).equals(bytes)).toBe(true)
  })

  it('rejects bad component references, missing explanations and false status even when artifact checksum is updated', () => {
    for (const mutate of [row => { row[2][0] = 999999 }, row => { row[1] = 'OKZZZZ' }, row => { row[4] = 2 }, row => { row[3] = 0 }, row => { row[0] = '木木' }]) {
      const { manifest, artifacts } = fixture()
      const descriptor = manifest.shards[0], original = JSON.parse(artifacts.get(`src/data/generated/${descriptor.file}`))
      mutate(original.rows[0])
      const changed = encode(original)
      descriptor.sha256 = sha(changed); descriptor.bytes = changed.length
      const payloads = new Map(manifest.shards.map(shard => [shard.file, shard === descriptor ? changed : artifacts.get(`src/data/generated/${shard.file}`)]))
      expect(() => validatePacked(manifest, payloads)).toThrow()
    }
  })

  it('verifies every shipped tuple and source line against fixed licensed inputs, with exact per-pair status counts', () => {
    const read = path => readFileSync(new URL(`../${path}`, import.meta.url))
    const manifest = JSON.parse(read('src/data/generated/component-spelling-manifest.json'))
    const shards = new Map(manifest.shards.map(shard => [shard.file, read(`src/data/generated/${shard.file}`)]))
    const lines = read('tools/component-spelling/inputs/radical.yaml').toString('utf8').split(/\r?\n/)
    const counts = validatePacked(manifest, shards)
    expect(counts).toEqual({ characters: 89189, pairs: 112553, confirmedCharacters: 59926, confirmedPairs: 59930 })
    for (const bytes of shards.values()) for (const row of JSON.parse(bytes).rows) {
      const [sourceChar, parts] = lines[row[3] - 1].split('\t')
      expect(sourceChar).toBe(row[0])
      expect(parts.trim().split(/\s+/)).toEqual(row[2].map(id => manifest.components[id][0]))
    }
  })
})
