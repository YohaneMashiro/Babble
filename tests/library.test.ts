import { describe, expect, it } from 'vitest'
import shapeData from '../src/data/generated/shape-traces.json'
import expansionData from '../src/data/generated/shape-expansion.json'
import readingsData from '../src/data/generated/readings.json'
import soundMapping from '../src/data/generated/sound-mapping.json'
import {
  CHARACTER_INDEX,
  EXPLAINED_TRAINING_ENTRIES,
  LEARNING_KEY_DEFINITIONS,
  LIBRARY_SOURCES,
  LIBRARY_STATS,
  PRACTICE_ENTRIES,
  TRAINING_ENTRIES,
  TEACHING_PRACTICE_ENTRIES,
} from '../src/data/library'
import { getCodeSlots, validateCharacterEntry } from '../src/domain/encoding'
import { explainSound } from '../src/domain/sound'

describe('audited training library', () => {
  it('only trains source codes whose sound and traced shapes agree', () => {
    type Trace = { codes: readonly string[]; firstRoot: string; lastRoot: string; firstRootPath: readonly string[]; lastRootPath: readonly string[]; idsTree: string; sourceIds?: readonly string[] }
    const shapes: Readonly<Record<string, Trace>> = shapeData.characters
    const expanded: Readonly<Record<string, Trace>> = expansionData.characters
    const readings = readingsData.characters as Readonly<Record<string, { readings: readonly string[] }>>
    expect(TRAINING_ENTRIES.length).toBeGreaterThan(6500)
    for (const entry of EXPLAINED_TRAINING_ENTRIES) {
      const legacy = shapes[entry.char]?.codes.includes(entry.fullCode.toLowerCase())
      const trace = legacy ? shapes[entry.char] : expanded[entry.char]
      expect(trace, entry.char).toBeDefined()
      expect(trace.codes, entry.char).toContain(entry.fullCode.toLowerCase())
      expect(readings[entry.char].readings, entry.char).toContain(entry.pronunciation.pinyin)
      expect(explainSound(entry.pronunciation.pinyin, soundMapping)?.code, entry.char).toBe(entry.fullCode.slice(0, 2))
      expect(entry.shape.first.component).toBe(trace.firstRoot)
      expect(entry.shape.last.component).toBe(trace.lastRoot)
      expect(entry.shape.decomposition).toEqual([`${legacy ? '源 IDS' : '来源拆分'}：${trace.idsTree}`])
      expect(trace.firstRootPath[0]).toBe(entry.char)
      expect(trace.lastRootPath[0]).toBe(entry.char)
      expect(trace.firstRootPath.at(-1)).toBe(trace.firstRoot)
      expect(trace.lastRootPath.at(-1)).toBe(trace.lastRoot)
      expect(/[\p{Co}?\uFFFD]/u.test(trace.firstRoot + trace.lastRoot)).toBe(false)
      expect(validateCharacterEntry(entry), entry.char).toEqual([])
      expect(getCodeSlots(entry).map(slot => slot.key).join('')).toBe(entry.fullCode)
      expect(entry.provenance.status).toBe('audited')
      expect(entry.provenance.license).toContain('AGPL-3.0-only')
      expect(entry.provenance.id).toBe(legacy ? 'libre-flypy-trace-1.2.0' : 'babble-shape-expansion-v1')
      expect(entry.sources?.every(source => LIBRARY_SOURCES.includes(source))).toBe(true)
      if (!legacy) {
        expect(entry.sources?.some(source => source.id === 'libre-flypy-codes-1.2.0')).toBe(false)
        expect(trace.sourceIds?.every(id => entry.sources?.some(source => source.id === id))).toBe(true)
      }
    }
  })

  it('reports exact coverage while keeping missing or conflicting shapes out of training', () => {
    expect(LIBRARY_STATS).toEqual({
      trainableCharacters: 8302,
      trainableEntries: 8978,
      readingCharacters: 44348,
      frequencyCharacters: 3799,
      excludedShapesOrReadings: 23,
      explainedCharacters: 8144,
      codeOnlyCharacters: 158,
    })
    expect(CHARACTER_INDEX.characterCount).toBe(LIBRARY_STATS.trainableCharacters)
    for (const char of ['𠀀', '𠀁']) {
      expect(CHARACTER_INDEX.lookup(char).status).toBe('pronunciation-only')
      expect(CHARACTER_INDEX.lookup(char).readings.length).toBeGreaterThan(0)
      expect(CHARACTER_INDEX.lookup(char).entries).toEqual([])
    }
    // A source code for another reading must not override the modern source.
    expect(CHARACTER_INDEX.lookup('㮟').readings).toEqual(['niǎn'])
    expect(CHARACTER_INDEX.lookup('㮟').entries).toEqual([])
    const fallback = CHARACTER_INDEX.lookup('䏲').entries[0]
    expect(fallback.pronunciation.pinyin).toBe('dié')
    expect(fallback.notes?.some(note => note.includes('源首选读音「tī」未匹配已发布全码'))).toBe(true)
    expect(CHARACTER_INDEX.lookup(String.fromCodePoint(0x10ffff)).status).toBe('missing')
    expect(CHARACTER_INDEX.lookup('某某').status).toBe('missing')
  })

  it('retains every previously accepted character, reading and code with its original provenance', () => {
    const readings = readingsData.characters as Readonly<Record<string, { readings: readonly string[] }>>
    let retained = 0
    for (const [char, trace] of Object.entries(shapeData.characters)) {
      for (const pinyin of readings[char]?.readings ?? []) {
        const sound = explainSound(pinyin, soundMapping)
        for (const code of trace.codes) {
          if (!sound || !code.toUpperCase().startsWith(sound.code)) continue
          const entry = CHARACTER_INDEX.lookup(char).entries.find(item => item.fullCode === code.toUpperCase() && item.pronunciation.pinyin === pinyin)
          expect(entry, `${char}:${pinyin}:${code}`).toBeDefined()
          expect(entry!.provenance.id).toBe('libre-flypy-trace-1.2.0')
          retained++
        }
      }
    }
    expect(retained).toBe(7113)
  })

  it('covers common characters previously excluded by incorrect codes or root spellings', () => {
    for (const [char, code, first, last] of [
      ['我', 'WOPD', '丿', '丶'], ['中', 'VSLL', '丨', '丨'],
      ['木', 'MUUN', '十', 'ㄟ'], ['水', 'UVLN', '丨', 'ㄟ'],
      ['花', 'HXCB', '艹', '匕'], ['是', 'UIOR', '日', '人'],
      ['不', 'BUAD', '一', '丶'], ['书', 'UUVD', '乛', '丶'],
    ]) {
      const entry = CHARACTER_INDEX.lookup(char).entries.find(item => item.fullCode === code)
      expect(entry, char).toBeDefined()
      expect(entry!.shape!.first.component).toBe(first)
      expect(entry!.shape!.last.component).toBe(last)
      expect(entry!.provenance.id).toBe('babble-shape-expansion-v1')
    }
  })

  it('retains the reviewed MZGM behavior using independently audited sources', () => {
    const first = PRACTICE_ENTRIES[0]
    expect(first.char).toBe('某')
    expect(first.fullCode).toBe('MZGM')
    expect(first.pronunciation.pinyin).toBe('mǒu')
    expect(getCodeSlots(first).map(slot => slot.explanation)).toEqual(['m → M', 'ou → Z', '甘 → G', '木 → M'])
    expect(first.notes).toContain('首形查找路径：某 → 甘')
    expect(first.notes).toContain('末形查找路径：某 → 木')
    expect(first.provenance.id).toBe('libre-flypy-trace-1.2.0')
    expect(first.provenance.status).toBe('audited')
  })

  it('preserves explicit tone variants and every matched polyphonic choice', () => {
    expect(CHARACTER_INDEX.lookup('行').entries.map(entry => [entry.pronunciation.pinyin, entry.fullCode]))
      .toEqual([['xíng', 'XKII'], ['háng', 'HHII'], ['héng', 'HGII']])
    expect(CHARACTER_INDEX.lookup('重').entries.map(entry => [entry.pronunciation.pinyin, entry.fullCode]))
      .toEqual([['zhòng', 'VSPA'], ['chóng', 'ISPA']])
    const de = CHARACTER_INDEX.lookup('的').entries
    expect(de.map(entry => entry.pronunciation.pinyin)).toEqual(['de', 'dī', 'dí', 'dì'])
    expect(de.filter(entry => entry.fullCode === 'DIBU')).toHaveLength(3)
    expect(CHARACTER_INDEX.lookup('得').entries.map(entry => entry.pronunciation.pinyin)).toEqual(['dé', 'de', 'děi'])
    expect(de[0].alternatives?.map(entry => entry.pronunciation.pinyin)).toEqual(['dī', 'dí', 'dì'])
  })

  it('uses one default reading per character and source frequency after the opening case', () => {
    expect(new Set(PRACTICE_ENTRIES.map(entry => entry.char)).size).toBe(PRACTICE_ENTRIES.length)
    expect(PRACTICE_ENTRIES.length).toBe(LIBRARY_STATS.trainableCharacters)
    expect(PRACTICE_ENTRIES[1].char).toBe('的')
    expect(PRACTICE_ENTRIES[1].pronunciation.pinyin).toBe('de')
    const ranked = TEACHING_PRACTICE_ENTRIES.slice(1)
    expect(ranked.every((entry, index) => index === 0 || (ranked[index - 1].frequency ?? 0) >= (entry.frequency ?? 0))).toBe(true)
    expect(CHARACTER_INDEX.search('mou').some(result => result.char === '某')).toBe(true)
    expect(CHARACTER_INDEX.search('mzgm').map(result => result.char)).toContain('某')
  })

  it('includes complete sound associations and only source-backed partial roots', () => {
    expect(LEARNING_KEY_DEFINITIONS.map(item => item.key).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(LEARNING_KEY_DEFINITIONS.every(item => item.complete === false)).toBe(true)
    for (const [initial, key] of Object.entries(soundMapping.initials)) {
      expect(LEARNING_KEY_DEFINITIONS.find(item => item.key === key.toUpperCase())!.initials).toContain(initial)
    }
    for (const [final, key] of Object.entries(soundMapping.finals)) {
      expect(LEARNING_KEY_DEFINITIONS.find(item => item.key === key.toUpperCase())!.finals).toContain(final.replace(/v/g, 'ü'))
    }
    expect(LEARNING_KEY_DEFINITIONS.find(item => item.key === 'A')!.initials).toEqual([])
    expect(LEARNING_KEY_DEFINITIONS.find(item => item.key === 'G')!.shapeRoots.some(root => root.root === '甘')).toBe(true)
    expect(LEARNING_KEY_DEFINITIONS.find(item => item.key === 'M')!.shapeRoots.some(root => root.root === '木')).toBe(true)
    for (const item of LEARNING_KEY_DEFINITIONS) {
      for (const root of item.shapeRoots) {
        expect(EXPLAINED_TRAINING_ENTRIES.some(entry => [entry.shape.first, entry.shape.last].some(part => part.component === root.root && part.key === item.key))).toBe(true)
      }
    }
  })

  it('retains license, exact version and checksum provenance for every field source', () => {
    expect(LIBRARY_SOURCES.map(source => source.id)).toEqual([
      'libre-flypy-trace-1.2.0', 'libre-flypy-codes-1.2.0', 'yi-bai-ids-2023',
      'pinyin-data-2023', 'unicode-unihan-17.0.0', 'shuangpin-practice-xiaohe-4927919',
      'babble-shape-expansion-v1', 'libre-flypy-root-map-1.2.0', 'libre-flypy-ids-overrides-1.2.0',
      'kfcd-chaizi-e177ab5', 'unicode-equivalent-ideograph-17.0.0', 'tjy-strokes-f993e6d',
      'babble-published-code-coverage-v1', 'babble-curated-endpoints-v1',
    ])
    expect(LIBRARY_SOURCES.every(source => source.status === 'audited' && source.redistribution === 'permitted' && source.version && /^[a-f0-9]{64}$/.test(source.checksum ?? ''))).toBe(true)
  })
})
