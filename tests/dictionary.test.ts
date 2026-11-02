import { describe, expect, it } from 'vitest'
import { SAMPLE_CHARACTER, FIXTURE_PROVENANCE } from '../src/data/characters'
import { createCharacterIndex, orderPracticeEntries, plainPinyin } from '../src/domain/dictionary'
import { initialTrainingState, trainingReducer } from '../src/domain/training'
import { explainSound } from '../src/domain/sound'
import soundMapping from '../src/data/generated/sound-mapping.json'

describe('local character index', () => {
  const readings = { 某: { readings: ['mǒu'], frequency: 3 }, 木: { readings: ['mù'], frequency: 10 } }
  const index = createCharacterIndex([SAMPLE_CHARACTER], readings, FIXTURE_PROVENANCE)
  it('keeps missing shapes distinct from missing readings', () => {
    expect(index.lookup('某').status).toBe('trainable')
    expect(index.lookup('木')).toMatchObject({ status: 'pronunciation-only', entries: [], readings: ['mù'] })
    expect(index.lookup('🦩')).toMatchObject({ status: 'missing', entries: [], readings: [] })
    expect(index.lookup('某木').status).toBe('missing')
  })
  it('searches exact text, reading or code locally without duplicates', () => {
    expect(index.search('某某木').map(item => item.char)).toEqual(['某', '木'])
    expect(index.search('mou').map(item => item.char)).toEqual(['某'])
    expect(index.search('mǒu').map(item => item.char)).toEqual(['某'])
    expect(index.search('mzgm').map(item => item.char)).toEqual(['某'])
    expect(index.search('')).toEqual([])
  })
  it('matches tones without collapsing ü into u', () => {
    expect(plainPinyin('mǒu')).toBe('mou')
    expect(plainPinyin('nǚ')).toBe('nv')
    expect(plainPinyin('nu:')).toBe('nv')
    expect(plainPinyin('nǜ')).not.toBe(plainPinyin('nù'))
  })
  it('resets an attempt when loading another explicit entry', () => {
    const state = trainingReducer(initialTrainingState(SAMPLE_CHARACTER), { type: 'type-letter', letter: 'M' })
    expect(trainingReducer(state, { type: 'load-entry', entry: SAMPLE_CHARACTER })).toEqual(initialTrainingState(SAMPLE_CHARACTER))
  })
  it('orders supplied entries by documented frequency without inventing values', () => {
    const other = { ...SAMPLE_CHARACTER, char: '木' }
    expect(orderPracticeEntries([SAMPLE_CHARACTER, other], readings).map(item => item.char)).toEqual(['木', '某'])
  })
})

describe('audited Xiaohe sound mapping', () => {
  it('encodes supplied ordinary readings, digraph initials and ü', () => {
    expect(explainSound('mǒu', soundMapping)?.code).toBe('MZ')
    expect(explainSound('zhōng', soundMapping)?.code).toBe('VS')
    expect(explainSound('nǚ', soundMapping)?.code).toBe('NV')
    expect(explainSound('lüè', soundMapping)?.code).toBe('LT')
    expect(explainSound('jué', soundMapping)?.code).toBe('JT')
    expect(explainSound('qù', soundMapping)?.code).toBe('QU')
  })
  it('explains zero initials as a two-key exception, not a fictional consonant', () => {
    for (const [reading, code] of Object.entries(soundMapping.zeroInitials)) {
      const result = explainSound(reading, soundMapping)!
      expect(result.code).toBe(code.toUpperCase())
      expect(result.pronunciation.initial.label).toBe('零声母起始')
      expect(result.note).toContain('零声母')
    }
  })
  it('does not invent an encoding for invalid syllables', () => {
    for (const input of ['', '🙂', 'túnwǎ', 'abc!', 'ng', 'xyz']) expect(explainSound(input, soundMapping)).toBeNull()
  })
})
