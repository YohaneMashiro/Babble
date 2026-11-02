import sourceLock from '../../data/sources.lock.json'
import shapeSourceLock from '../../data/shape-sources.lock.json'
import expansionLock from '../../data/shape-expansion.lock.json'
import expansionInputs from '../../data/shape-expansion-inputs.lock.json'
import codeCoverageLock from '../../data/four-code-coverage.lock.json'
import curatedShapeInput from '../../data/curated-shape-supplement.json'
import codeCoverage from './generated/four-code-coverage.json'
import readingsData from './generated/runtime-readings.json'
import soundMapping from './generated/sound-mapping.json'
import shapeData from './generated/runtime-shape-traces.json'
import expansionData from './generated/runtime-shape-expansion.json'
import { decodeRuntimeReadings, decodeRuntimeShapes } from './runtime-codec'
import { createCharacterIndex, orderPracticeEntries } from '../domain/dictionary'
import type { ReadingRecord } from '../domain/dictionary'
import { explainSound } from '../domain/sound'
import { shapePresentation } from '../domain/shape-teaching'
import type { CharacterAlternative, CharacterEntry, CharacterShape, DataProvenance, KeyDefinition, ShapeRoot } from '../domain/types'

interface LockedSource {
  id: string
  name: string
  author: string
  version: string
  sourceUrl: string
  license: string
  licenseUrl: string
  modifications: readonly string[]
  generated: { sha256: string }
  notes: string
}

interface ShapeTrace {
  codes: readonly string[]
  firstRoot: string
  lastRoot: string
  firstRootPath: readonly string[]
  lastRootPath: readonly string[]
  idsTree: string
  sourceIds?: readonly string[]
  notes?: readonly string[]
}

const readings: Readonly<Record<string, ReadingRecord>> = decodeRuntimeReadings(readingsData).characters
/** Reuse the validated modern reading records for the independent two-key course. */
export { readings as READING_RECORDS }
const traces: Readonly<Record<string, ShapeTrace>> = decodeRuntimeShapes(shapeData, 'shape-traces').characters
const expandedTraces: Readonly<Record<string, ShapeTrace>> = decodeRuntimeShapes(expansionData, 'shape-expansion').characters

function lockedProvenance(id: string): DataProvenance {
  const source = (sourceLock.sources as readonly LockedSource[]).find(item => item.id === id)
  if (!source) throw new Error(`Missing audited data source: ${id}`)
  return {
    id: source.id,
    source: source.name,
    sourceUrl: source.sourceUrl,
    author: source.author,
    version: source.version,
    checksum: source.generated.sha256,
    license: source.license,
    licenseUrl: source.licenseUrl,
    retrievedAt: sourceLock.retrievedAt,
    modified: true,
    redistribution: 'permitted',
    status: 'audited',
    notes: [...source.modifications, source.notes].join(' '),
  }
}

const readingSource = lockedProvenance('unicode-unihan-17.0.0')
const soundSource = lockedProvenance('shuangpin-practice-xiaohe-4927919')
const traceSource: DataProvenance = {
  id: shapeSourceLock.generator.id,
  source: 'libre-flypy 1.2.0 实际取形轨迹的核验子集',
  sourceUrl: shapeSourceLock.generator.url,
  author: 'OverflowCat；本项目附带的取形轨迹修改与核验程序',
  version: shapeSourceLock.generator.commit,
  checksum: shapeSourceLock.generated.sha256,
  license: 'AGPL-3.0-only',
  licenseUrl: `${shapeSourceLock.generator.url}/blob/${shapeSourceLock.generator.commit}/LICENSE`,
  retrievedAt: shapeSourceLock.auditedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: '实际生成器记录首末根与递归查找路径；仅保留已发布全码与研究参考的全码、根一致的条目。轨迹材料保留 AGPL，不能套用全码表的 CC0 声明。路径不代表笔顺或完整教材拆分。',
}
const codeSource: DataProvenance = {
  id: shapeSourceLock.publishedCodes.id,
  source: 'libre-flypy 1.2.0 已发布全码表',
  sourceUrl: shapeSourceLock.publishedCodes.url,
  author: 'OverflowCat',
  version: shapeSourceLock.generator.tag,
  checksum: shapeSourceLock.publishedCodes.sha256,
  license: 'CC0-1.0',
  licenseUrl: shapeSourceLock.publishedCodes.licenseStatement,
  retrievedAt: shapeSourceLock.auditedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: '全码直接选自已发布码表；未生成补码。上游全码表的公有领域声明不替代生成器轨迹与输入文件的许可。',
}
const idsInput = shapeSourceLock.inputs[0]
const oldPinyinInput = shapeSourceLock.inputs[1]
const idsSource: DataProvenance = {
  id: idsInput.id,
  source: 'yi-bai/ids：生成器固定的 IDS 输入',
  sourceUrl: idsInput.sourceUrl,
  author: 'Yi Bai',
  version: idsInput.commit,
  checksum: shapeSourceLock.files['inputs/ids_lv2.txt'],
  license: 'MIT',
  licenseUrl: `https://github.com/yi-bai/ids/blob/${idsInput.commit}/LICENSE`,
  retrievedAt: shapeSourceLock.auditedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: '保留 MIT 署名。仅作为生成器树及递归路径的输入；普通 IDS 不直接被称作完整鹤形教学拆分。',
}
const oldPinyinSource: DataProvenance = {
  id: oldPinyinInput.id,
  source: 'pinyin-data：上游生成器固定的旧拼音输入',
  sourceUrl: oldPinyinInput.sourceUrl,
  author: 'mozillazg 与 Unicode Unihan 贡献者',
  version: oldPinyinInput.commit,
  checksum: shapeSourceLock.files['inputs/pinyin.txt'],
  license: 'MIT + Unicode data terms',
  licenseUrl: `https://github.com/mozillazg/pinyin-data/blob/${oldPinyinInput.commit}/LICENSE`,
  retrievedAt: shapeSourceLock.auditedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: '只说明已发布全码及轨迹的上游输入，不用旧拼音选择当前训练读音；现代训练读音由 Unicode 17.0.0 独立提供，并精确核对全码的声韵前缀。MIT 与 Unicode 通知同时保留。',
}

const expansionSource: DataProvenance = {
  id: 'babble-shape-expansion-v1',
  source: 'Babble 开源拆字与笔顺取形的核验扩展',
  author: 'Babble contributors；基于 OverflowCat 字根定义及分别署名的开放输入',
  version: '1.0.0',
  checksum: expansionLock.generated.sha256,
  license: 'AGPL-3.0-only；保留 CC-BY-3.0 输入署名',
  licenseUrl: 'https://www.gnu.org/licenses/agpl-3.0.html',
  retrievedAt: expansionInputs.auditedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: '候选根与查找路径来自许可拆字、笔顺及字形映射；编码按现代读音和实际取形生成，再独立核对。扩展工具、规则、锁定输入与完整通知随源码提供；新记录不套用旧发布全码表的 CC0。',
}
const rootMapSource: DataProvenance = {
  ...traceSource,
  id: 'libre-flypy-root-map-1.2.0',
  source: 'libre-flypy 1.2.0 字根键位定义',
  author: 'OverflowCat',
  sourceUrl: `${shapeSourceLock.generator.url}/blob/${shapeSourceLock.generator.commit}/src/roots.rs`,
  checksum: shapeSourceLock.files['src/roots.rs'],
  modified: false,
  notes: '扩展工具读取已锁定的 AGPL 字根定义；部件顺序及笔顺另由明确来源提供，不把该字根表当作逐字拆分。',
}
const idsOverrideSource: DataProvenance = {
  ...rootMapSource,
  id: 'libre-flypy-ids-overrides-1.2.0',
  source: 'libre-flypy 1.2.0 的 IDS 修订输入',
  sourceUrl: `${shapeSourceLock.generator.url}/blob/${shapeSourceLock.generator.commit}/my_ids.txt`,
  checksum: shapeSourceLock.files['my_ids.txt'],
  notes: 'OverflowCat 随编码器提供的拆分修订；与 Yi Bai 的原始 IDS 分别署名，不将修订内容归给原 IDS 作者。',
}
const expansionInputSources: readonly DataProvenance[] = expansionInputs.sources.map(source => ({
  id: source.id,
  source: source.name,
  sourceUrl: source.sourceUrl,
  author: source.author,
  version: source.version,
  checksum: source.files[0].sha256,
  license: source.license,
  licenseUrl: source.licenseUrl,
  retrievedAt: source.retrievedAt,
  modified: true,
  redistribution: 'permitted',
  status: 'audited',
  notes: `${source.modifications.join(' ')} 摘要对应 ${source.files[0].path}；全部输入摘要见 data/shape-expansion-inputs.lock.json。${source.notes}`,
}))
const legacySources: readonly DataProvenance[] = [traceSource, codeSource, idsSource, oldPinyinSource, readingSource, soundSource]

/** Each entry identifies its own input chain; the Inspector also exposes all notices. */
const comparedCodeSource: DataProvenance = {
  ...codeSource,
  id: 'babble-published-code-coverage-v1',
  source: 'libre-flypy 发布全码的逐字码核对补充',
  checksum: codeCoverageLock.generated.sha256,
  license: 'CC0-1.0 编码；Unicode-3.0 读音',
  retrievedAt: '2026-10-28',
  notes: '完整四码直接来自已持有的 CC0 发布物；以现代来源读音独立匹配声韵，最后逐字码对核对外部参照。未补造或反推字根，取形解释待补。新生成器及独立锁随源码提供。',
}
const curatedShapeSource: DataProvenance = {
  ...rootMapSource,
  id: 'babble-curated-endpoints-v1',
  source: 'Babble 明示笔画范围与规则的独立端点补充',
  checksum: codeCoverageLock.generated.sha256,
  retrievedAt: '2026-10-28',
  license: 'AGPL-3.0-only 派生端点；WTFPL 笔画事实；MIT 原创说明',
  notes: '从已许可明示笔画、原创逐字选择及位置字根映射独立生成，随后核对全码与端点。中间部分及完整教学未自动升格。来源、选择与规则定位见 curated-shape-supplement.json 和 NOTICE-four-code-coverage.md。',
}

export const LIBRARY_SOURCES: readonly DataProvenance[] = [...legacySources, expansionSource, rootMapSource, idsOverrideSource, ...expansionInputSources, comparedCodeSource, curatedShapeSource]

interface TraceVariant {
  trace: ShapeTrace
  expanded: boolean
}
const variantsByCharacter = new Map<string, TraceVariant[]>()
for (const [collection, expanded] of [[traces, false], [expandedTraces, true]] as const) {
  for (const [char, trace] of Object.entries(collection)) {
    const variants = variantsByCharacter.get(char) ?? []
    variants.push({ trace, expanded })
    variantsByCharacter.set(char, variants)
  }
}

function sourcesForTrace(trace: ShapeTrace, expanded: boolean): readonly DataProvenance[] {
  if (!expanded) return legacySources
  return [expansionSource,
    ...[rootMapSource, idsSource, idsOverrideSource, ...expansionInputSources].filter(source => trace.sourceIds?.includes(source.id!)),
    readingSource, soundSource]
}

function buildTrainingEntries(): readonly CharacterEntry[] {
  const result: CharacterEntry[] = []
  for (const [char, variants] of variantsByCharacter) {
    const record = readings[char]
    if (!record) continue
    const choices: CharacterEntry[] = []
    const sourcePreferredSound = explainSound(record.readings[0], soundMapping)
    const preferredReadingHasCode = sourcePreferredSound !== null && variants.some(({ trace }) => trace.codes.some(code => code.slice(0, 2).toUpperCase() === sourcePreferredSound.code))
    for (const pinyin of record.readings) {
      const sound = explainSound(pinyin, soundMapping)
      if (!sound) continue
      for (const { trace, expanded } of variants) {
        for (const sourceCode of trace.codes) {
          const fullCode = sourceCode.toUpperCase()
          // The source supplies all four keys. This condition validates sound; it
          // must never complete a missing shape or invent another source code.
          if (!/^[A-Z]{4}$/.test(fullCode) || !fullCode.startsWith(sound.code)) continue
          if (choices.some(entry => entry.pronunciation.pinyin === pinyin && entry.fullCode === fullCode)) continue
          choices.push({
            char,
            pronunciation: sound.pronunciation,
            shape: {
              first: { component: trace.firstRoot, key: fullCode[2] },
              last: { component: trace.lastRoot, key: fullCode[3] },
              decomposition: [`${expanded ? '来源拆分' : '源 IDS'}：${trace.idsTree}`],
            },
            fullCode,
            frequency: record.frequency,
            notes: [
              `首形查找路径：${trace.firstRootPath.join(' → ')}`,
              `末形查找路径：${trace.lastRootPath.join(' → ')}`,
              expanded ? '全码与首末形已经独立核对；本条目由开放拆字与笔顺资料按明确规则推导。' : '全码与首末根已与研究参考核对；本条目来自独立生成器的实际取形轨迹。',
              '查找路径和来源拆分记录推导依据，不代表完整笔顺或教学拆分。',
              ...(!preferredReadingHasCode ? [`源首选读音「${record.readings[0]}」未匹配${expanded ? '已核验' : '已发布'}全码；此处仅训练已明确匹配的现代来源备选读音。`] : []),
              ...(trace.notes ?? []),
              ...(sound.note ? [sound.note] : []),
            ],
            sources: sourcesForTrace(trace, expanded),
            provenance: expanded ? expansionSource : traceSource,
          })
        }
      }
    }
    for (const entry of choices) {
      const alternatives: CharacterAlternative[] = choices.filter(other => other !== entry).map(other => ({
        pronunciation: other.pronunciation,
        shape: other.shape,
        fullCode: other.fullCode,
        notes: other.notes,
        sources: other.sources,
        provenance: other.provenance,
      }))
      if (alternatives.length) entry.alternatives = alternatives
      result.push(entry)
    }
  }
  return result
}

/** The original explained entries stay byte-for-byte unchanged. */
export const EXPLAINED_TRAINING_ENTRIES = buildTrainingEntries().filter((entry): entry is CharacterEntry & { shape: CharacterShape } => entry.shape !== null)

function buildCodeSupplement(): readonly CharacterEntry[] {
  const result: CharacterEntry[] = []
  for (const record of codeCoverage.records) {
    const source = record.kind === 'independently-derived' ? curatedShapeSource : comparedCodeSource
    const authored = curatedShapeInput.records.find(item => item.char === record.char)
    const choices: CharacterEntry[] = record.entries.map(([pinyin, fullCode]) => {
      const sound = explainSound(pinyin, soundMapping)
      if (!sound || !fullCode.startsWith(sound.code)) throw new Error('Supplement code does not match its independently sourced reading')
      return {
        char: record.char,
        pronunciation: sound.pronunciation,
        fullCode,
        shape: record.shape ? {
          first: { component: record.shape.firstRoot, key: record.shape.firstKey },
          last: { component: record.shape.lastRoot, key: record.shape.lastKey },
          decomposition: [`原创端点选择：${record.shape.firstRoot}／${record.shape.lastRoot}；中间部分未展开`],
        } : null,
        codeEvidence: { kind: record.kind === 'independently-derived' ? 'independently-derived' : 'published-and-compared', sourceId: source.id!, referenceSha256: codeCoverage.referenceSha256, ...(record.ruleId ? { ruleEvidenceIds: [record.ruleId] } : {}) },
        shapeEvidence: { kind: record.shape ? 'verified-endpoints' : 'unreviewed' },
        frequency: readings[record.char]?.frequency,
        notes: authored ? [`规则依据：${authored.explanation}`, `笔画范围：${authored.strokeSource.path}:${authored.strokeSource.line}；首根索引 ${authored.first.strokeIndices.join(',')}，末根索引 ${authored.last.strokeIndices.join(',')}（从 0 起）。`] : ['发布全码与现代读音已核对；首末形及完整教学解释待补。'],
        sources: [source, ...(record.kind === 'published-and-compared' ? [codeSource] : []), readingSource, soundSource, ...(record.shape ? [rootMapSource, ...expansionInputSources.filter(item => item.id?.includes('strokes'))] : [])],
        provenance: source,
      }
    })
    for (const entry of choices) {
      const alternatives = choices.filter(other => other !== entry).map(other => ({ pronunciation: other.pronunciation, fullCode: other.fullCode, shape: other.shape, codeEvidence: other.codeEvidence, shapeEvidence: other.shapeEvidence, notes: other.notes, sources: other.sources, provenance: other.provenance }))
      if (alternatives.length) entry.alternatives = alternatives
      result.push(entry)
    }
  }
  return result
}

/** Distinct source tone readings stay distinct, even when they share all four keys. */
export const TRAINING_ENTRIES: readonly CharacterEntry[] = [...EXPLAINED_TRAINING_ENTRIES, ...buildCodeSupplement()]

const firstChoiceByCharacter = new Map<string, CharacterEntry>()
for (const entry of EXPLAINED_TRAINING_ENTRIES) {
  if (!firstChoiceByCharacter.has(entry.char)) firstChoiceByCharacter.set(entry.char, entry)
}
const orderedDefaults = orderPracticeEntries([...firstChoiceByCharacter.values()], readings)

/** First matched reading in source order per character; 某 opens the review. */
export const TEACHING_PRACTICE_ENTRIES = [
  ...orderedDefaults.filter(entry => entry.char === '某'),
  ...orderedDefaults.filter(entry => entry.char !== '某'),
].filter((entry): entry is CharacterEntry & { shape: CharacterShape } => entry.shape !== null)

const supplementDefaults = new Map<string, CharacterEntry>()
for (const entry of TRAINING_ENTRIES) if (!firstChoiceByCharacter.has(entry.char) && !supplementDefaults.has(entry.char)) supplementDefaults.set(entry.char, entry)

/** New code-only records append after the preserved original practice order. */
export const PRACTICE_ENTRIES: readonly CharacterEntry[] = [...TEACHING_PRACTICE_ENTRIES, ...orderPracticeEntries([...supplementDefaults.values()], readings)]

export const CHARACTER_INDEX = createCharacterIndex(TRAINING_ENTRIES, readings, readingSource)

export const LIBRARY_STATS = {
  trainableCharacters: firstChoiceByCharacter.size + supplementDefaults.size,
  trainableEntries: TRAINING_ENTRIES.length,
  readingCharacters: Object.keys(readings).length,
  frequencyCharacters: Object.values(readings).filter(record => record.frequency !== undefined).length,
  // Count trace characters for which no modern reading matches a verified code.
  excludedShapesOrReadings: variantsByCharacter.size - firstChoiceByCharacter.size,
  explainedCharacters: firstChoiceByCharacter.size + codeCoverage.statistics.curatedCharacters,
  codeOnlyCharacters: codeCoverage.statistics.publishedCharacters,
} as const

function buildLearningKeyDefinitions(): readonly KeyDefinition[] {
  type Usage = { sourceIds: Set<string>; exampleCharacters: string[] }
  type RootUsage = { root: ShapeRoot; usages: Map<'first' | 'last', Usage> }
  const definitions = Array.from({ length: 26 }, (_, index) => ({
    key: String.fromCharCode(65 + index),
    initials: [] as string[],
    finals: [] as string[],
    shapeRoots: [] as ShapeRoot[],
    provenance: [soundSource] as DataProvenance[],
    complete: false as const,
  }))
  const rootsByKey = definitions.map(() => new Map<string, RootUsage>())
  const sourcesByKey = definitions.map(definition => new Set(definition.provenance))
  for (const [initial, key] of Object.entries(soundMapping.initials)) {
    definitions[key.toUpperCase().charCodeAt(0) - 65].initials.push(initial)
  }
  for (const [final, key] of Object.entries(soundMapping.finals)) {
    definitions[key.toUpperCase().charCodeAt(0) - 65].finals.push(final.replace(/v/g, 'ü'))
  }
  // Zero-initial syllables are encoded by their dedicated table; the first
  // letter of such a syllable must not be advertised as a consonant initial.
  for (const entry of EXPLAINED_TRAINING_ENTRIES) {
    if (!entry.shape) continue
    for (const [position, part] of [['first', entry.shape.first], ['last', entry.shape.last]] as const) {
      const keyIndex = part.key.charCodeAt(0) - 65
      const definition = definitions[keyIndex]
      const roots = rootsByKey[keyIndex]
      let collected = roots.get(part.component)
      if (!collected) {
        const presentation = shapePresentation(part.component)
        const root: ShapeRoot = { root: part.component, label: presentation.label, kind: presentation.kind, usages: [], explanation: '只证明本库已核验条目中的对应首／末位置，不代表官方完整字根表。' }
        definition.shapeRoots.push(root)
        collected = { root, usages: new Map() }
        roots.set(part.component, collected)
      }
      const usage = collected.usages.get(position) ?? { sourceIds: new Set<string>(), exampleCharacters: [] }
      usage.sourceIds.add(entry.provenance.id ?? entry.provenance.source)
      if (usage.exampleCharacters.length < 3 && !usage.exampleCharacters.includes(entry.char)) usage.exampleCharacters.push(entry.char)
      // Preserve the existing last-observed position order without rebuilding
      // immutable arrays for every occurrence. Publish arrays only once below.
      collected.usages.delete(position)
      collected.usages.set(position, usage)
      for (const source of entry.sources ?? [entry.provenance]) {
        if (!sourcesByKey[keyIndex].has(source)) {
          sourcesByKey[keyIndex].add(source)
          definition.provenance.push(source)
        }
      }
    }
  }
  for (const roots of rootsByKey) {
    for (const { root, usages } of roots.values()) {
      root.usages = [...usages].map(([position, usage]) => ({ position, sourceIds: [...usage.sourceIds], verificationStatus: 'verified-entry-usage', exampleCharacters: usage.exampleCharacters }))
    }
  }
  return definitions
}

/** Complete audited sound mapping, with partial shape associations only. */
export const LEARNING_KEY_DEFINITIONS = buildLearningKeyDefinitions()
