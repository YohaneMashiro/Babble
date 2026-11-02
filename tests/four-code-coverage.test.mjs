import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import supplement from '../src/data/generated/four-code-coverage.json'
import curated from '../data/curated-shape-supplement.json'
import readings from '../src/data/generated/readings.json'
import scheme from '../src/data/generated/sound-mapping.json'
import { CHARACTER_INDEX, EXPLAINED_TRAINING_ENTRIES, PRACTICE_ENTRIES, TEACHING_PRACTICE_ENTRIES, TRAINING_ENTRIES } from '../src/data/library'
import { LESSONS } from '../src/data/lessons'
import { buildKeyDefinitions } from '../src/domain/mappings'
import { explainSound } from '../src/domain/sound'
import { getCodeSlots, validateCharacterEntry } from '../src/domain/encoding'
import { initialTrainingState, trainingReducer } from '../src/domain/training'
import { ShapeExplanation } from '../src/components/ShapeExplanation'
import { comparePublishedCandidates, curatedCandidates, modernCandidates, parsePublishedCodes } from '../tools/code-coverage/generate.mjs'

const bytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('separate code and endpoint evidence', () => {
  it('retains each supplementary published pair in its independent source and modern reading, without inventing roots', () => {
    const published = parsePublishedCodes(bytes('tools/libre-flypy-audit/inputs/release-output-1.2.0.txt'))
    const sourceReadings = readings.characters
    const records = supplement.records.filter(record => record.kind === 'published-and-compared')
    expect(records).toHaveLength(158)
    for (const record of records) for (const [pinyin, code] of record.entries) {
      expect(published.get(record.char)?.has(code)).toBe(true)
      expect(sourceReadings[record.char].readings).toContain(pinyin)
      expect(explainSound(pinyin, scheme)?.code).toBe(code.slice(0, 2))
      const entry = CHARACTER_INDEX.lookup(record.char).entries.find(entry => entry.fullCode === code && entry.pronunciation.pinyin === pinyin)
      expect(entry.shape).toBeNull()
      expect(entry.shapeEvidence?.kind).toBe('unreviewed')
      expect(entry.codeEvidence?.referenceSha256).toBe(supplement.referenceSha256)
      expect(validateCharacterEntry(entry)).toEqual([])
      expect(getCodeSlots(entry).slice(2).map(slot => slot.value)).toEqual(['形码解释待补', '形码解释待补'])
    }
  })

  it('does not admit an unexplained entry without explicit code evidence or add unknown root associations', () => {
    const entry = CHARACTER_INDEX.lookup('走').entries[0]
    expect(entry).toBeDefined()
    expect(validateCharacterEntry({ ...entry, codeEvidence: undefined })).toContain('An unexplained shape requires independently recorded code evidence')
    expect(buildKeyDefinitions([entry]).every(key => key.shapeRoots.length === 0)).toBe(true)
    const html = renderToStaticMarkup(createElement(ShapeExplanation, { entry }))
    expect(html).toContain('取形解释待补')
    expect(html).not.toContain('shape-endpoints')
    expect(html).not.toContain('shape-teaching-parts')
  })

  it('keeps four-code feedback, prefix and assistance semantics for code-only entries', () => {
    const entry = CHARACTER_INDEX.lookup('走').entries[0]
    let state = initialTrainingState(entry)
    for (const letter of entry.fullCode.slice(0, 2)) state = trainingReducer(state, { type: 'type-letter', letter })
    const wrong = entry.fullCode[2] === 'A' ? 'B' : 'A'
    state = trainingReducer(state, { type: 'type-letter', letter: wrong })
    expect(state.accepted).toBe(entry.fullCode.slice(0, 2))
    expect(state.error?.position).toBe(2)
    state = trainingReducer(state, { type: 'hint' })
    for (const letter of entry.fullCode.slice(2)) state = trainingReducer(state, { type: 'type-letter', letter })
    expect(state.completed).toBe(true)
    expect(state.assisted).toBe(true)
  })

  it('preserves the original explained deck and courses while appending new code availability', () => {
    expect(EXPLAINED_TRAINING_ENTRIES).toHaveLength(8806)
    expect(TEACHING_PRACTICE_ENTRIES).toHaveLength(8143)
    expect(PRACTICE_ENTRIES.slice(0, 8143)).toEqual(TEACHING_PRACTICE_ENTRIES)
    expect(TRAINING_ENTRIES.slice(0, 8806)).toEqual(EXPLAINED_TRAINING_ENTRIES)
    const original = new Set(TEACHING_PRACTICE_ENTRIES.map(entry => entry.char))
    for (const lesson of LESSONS) expect(lesson.entries.every(char => original.has(char))).toBe(true)
  })

  it('selects modern published candidates before reference comparison and retains only each matching code pair', () => {
    const published = parsePublishedCodes('木\tmuun\n木\tmuxx\n哼\th0kl\n')
    const generated = modernCandidates(published, { 木: { readings: ['mù'] } }, explainSound, scheme, new Set())
    expect(generated[0].entries).toEqual([['mù', 'MUUN'], ['mù', 'MUXX']])
    expect(published.has('哼')).toBe(false)
    const accepted = comparePublishedCandidates(generated, { records: { 木: { codes: ['MUUN'] } } })
    expect(accepted[0].entries).toEqual([['mù', 'MUUN']])
    expect(accepted[0].shape).toBeNull()
    expect(generated[0].entries).toHaveLength(2)
  })

  it('recreates the curated endpoint code from licensed strokes and positional keys, refusing altered ranges', () => {
    const context = { strokes: bytes('tools/shape-expansion/inputs/Strokes.txt'), roots: bytes('tools/libre-flypy-audit/src/roots.rs'), readings: readings.characters, explainSound, scheme }
    const generated = curatedCandidates(curated.records, context)
    expect(generated[0].entries).toEqual([['píng', 'PKAU']])
    const entry = CHARACTER_INDEX.lookup('平').entries[0]
    expect(entry.shape?.first.component).toBe('一')
    expect(entry.shape?.last.component).toBe('十')
    expect(entry.sources?.some(source => source.id === 'libre-flypy-codes-1.2.0')).toBe(false)
    expect(() => curatedCandidates([{ ...curated.records[0], first: { ...curated.records[0].first, strokeIndices: [0, 1] } }], context)).toThrow(/overlap|stroke selection/)
  })
})
