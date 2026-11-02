import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SAMPLE_CHARACTER, FIXTURE_PROVENANCE } from '../src/data/characters'
import { getPreprocessedPinyin } from '../src/data/default-pinyin'
import annotation from '../src/data/generated/default-pinyin.json'
import { DEFAULT_PRACTICE_TEXT } from '../src/data/practice-text'
import { SHUANGPIN_INDEX } from '../src/data/shuangpin'
import { automaticTextChoices, type ReadingAnnotation } from '../src/domain/automatic-reading'
import { analyzeText, getTextEntry, readingOptions } from '../src/domain/text'
import type { CharacterEntry } from '../src/domain/types'
import type { CharacterLookup } from '../src/domain/dictionary'

function entry(pinyin: string, fullCode: string, char = '行'): CharacterEntry {
  return { ...SAMPLE_CHARACTER, char, fullCode, pronunciation: { ...SAMPLE_CHARACTER.pronunciation, pinyin } }
}
function document(text: string, entries: CharacterEntry[], readings = entries.map(e => e.pronunciation.pinyin)) {
  const lookup: CharacterLookup = { char: '行', status: 'trainable', entries, readings, sources: [FIXTURE_PROVENANCE] }
  const result = analyzeText(text, char => char === '行' ? lookup : { char, status: 'missing', entries: [], readings: [], sources: [] })
  if (result.status !== 'valid') throw new Error('Invalid fixture')
  return result.document
}
function predict(text: string, readings: (string | null)[]): ReadingAnnotation {
  return { text, modelVersion: 'test-only', items: Array.from(text, (char, index) => ({ index, char, pinyin: readings[index] ?? null, source: 'model' })) }
}

describe('contextual suggestions select only existing source options', () => {
  it('handles repeated polyphonic characters separately across literals and astral positions', () => {
    const text = '行🙂A行', doc = document(text, [entry('háng', 'HHII'), entry('xíng', 'XKII')])
    const choices = automaticTextChoices(doc, predict(text, ['hang2', null, null, 'xing2']))
    expect(doc.targets.map((index, target) => getTextEntry(doc.tokens[index], choices[target])?.fullCode)).toEqual(['HHII', 'XKII'])
    expect(doc.tokens.map(t => t.value).join('')).toBe(text)
  })
  it('rejects stale text or mismatched position arrays rather than applying an unrelated sound', () => {
    const doc = document('行', [entry('háng', 'HHII'), entry('xíng', 'XKII')])
    const malformed = predict('行', ['hang2'])
    malformed.items[0].char = '重'
    expect(automaticTextChoices(doc, malformed)).toEqual({})
    expect(automaticTextChoices(doc, predict('行行', ['hang2', 'xing2']))).toEqual({})
  })
  it('matches tone marks to numbered tones, including ü, without confusing u', () => {
    const doc = document('行', [entry('nǚ', 'NVII'), entry('nù', 'NUII')])
    const choices = automaticTextChoices(doc, predict('行', ['nv3']))
    expect(getTextEntry(doc.tokens[0], choices[0])?.pronunciation.pinyin).toBe('nǚ')
  })
  it('retains a predicted reading-only option instead of practicing a different available sound', () => {
    const doc = document('行', [entry('háng', 'HHII')], ['háng', 'xíng'])
    const choices = automaticTextChoices(doc, predict('行', ['xing2']))
    expect(choices[0]).toBe(readingOptions(doc.tokens[0].lookup!)[1].key)
    expect(getTextEntry(doc.tokens[0], choices[0])).toBeNull()
  })
  it('does not choose between different source codes for the same pronunciation', () => {
    const doc = document('行', [entry('háng', 'HHII'), entry('háng', 'HHUU'), entry('xíng', 'XKII')])
    expect(automaticTextChoices(doc, predict('行', ['hang2']))).toEqual({})
  })
  it('avoids unnecessary questions when every tone has the same keyboard code', () => {
    const entries = [entry('xíng', 'XKII'), entry('xìng', 'XKII')]
    const original = JSON.stringify(entries), doc = document('行', entries)
    const choices = automaticTextChoices(doc, predict('行', [null]))
    expect(getTextEntry(doc.tokens[0], choices[0])?.fullCode).toBe('XKII')
    expect(JSON.stringify(entries)).toBe(original)
  })
})

describe('built-in article uses locally generated annotations', () => {
  it('binds preprocessed readings to the exact original file and all codepoint positions', () => {
    const bytes = readFileSync(new URL('../the_Tower_of_Babel.txt', import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(annotation.sourceSha256)
    const result = getPreprocessedPinyin(DEFAULT_PRACTICE_TEXT.text)!
    expect(result.items.length).toBe(Array.from(DEFAULT_PRACTICE_TEXT.text).length)
    expect(result.items.filter(item => item.source === 'model').length).toBe(annotation.modelIndices.length)
    expect(result.items.filter(item => item.pinyin).length).toBe(1840)
    expect(getPreprocessedPinyin(DEFAULT_PRACTICE_TEXT.text + ' ')).toBeNull()
  })
  it('resolves contextual article choices while preserving source-mismatched readings for correction', () => {
    const source = DEFAULT_PRACTICE_TEXT.text
    const result = analyzeText(source, SHUANGPIN_INDEX.lookup)
    if (result.status !== 'valid') throw new Error('Invalid built-in article')
    const doc = result.document, choices = automaticTextChoices(doc, getPreprocessedPinyin(source))
    const ambiguous = doc.targets.filter(index => readingOptions(doc.tokens[index].lookup!).length > 1)
    const unresolved = doc.targets.filter((index, target) => !getTextEntry(doc.tokens[index], choices[target]))
    expect(ambiguous.length).toBe(503)
    expect(Object.keys(choices).length).toBe(500)
    expect(unresolved.map(index => doc.tokens[index].value)).toEqual(['和', '和', '和'])
  })
})
