import { describe, expect, it, vi } from 'vitest'
import { FIXTURE_PROVENANCE, SAMPLE_CHARACTER } from '../src/data/characters'
import type { CharacterLookup } from '../src/domain/dictionary'
import { analyzeText, getTextEntry, needsTextChoice, readingOptions, TEXT_HARD_CAP, TEXT_PAGE_TARGETS, textPageIndex, textTargetIndex, type TextDocument, type TextToken } from '../src/domain/text'

const entry = SAMPLE_CHARACTER
const missing = (char: string): CharacterLookup => ({ char, status: 'missing', entries: [], readings: [], sources: [] })
const known: CharacterLookup = { char: '某', status: 'trainable', entries: [entry], readings: ['mou'], sources: [FIXTURE_PROVENANCE] }
const readingOnly: CharacterLookup = { ...missing('木'), status: 'pronunciation-only', readings: ['mù'] }
const lookup = (char: string): CharacterLookup => char === '某' ? known : char === '木' ? readingOnly : missing(char)
const tokenFor = (value: CharacterLookup): TextToken => ({ index: 0, value: value.char, kind: value.entries.length ? 'trainable' : 'unavailable', lookup: value })
function analyze(input: string): TextDocument {
  const result = analyzeText(input, lookup)
  if (result.status !== 'valid') throw new Error('Fixture text exceeds cap')
  return result.document
}

describe('custom text source and boundaries', () => {
  it('preserves punctuation, line endings, Latin, digits, combining text and astral characters exactly', () => {
    const input = 'Hi 42！\r\n某，🦩𠀀e\u0301\t某。'
    const document = analyze(input)
    expect(document.tokens.map(token => token.value).join('')).toBe(input)
    expect(document.counts.characters).toBe(Array.from(input).length)
    expect(document.tokens.map(token => token.index)).toEqual(Array.from(input, (_, index) => index))
    expect(document.tokens.find(token => token.value === '🦩')?.kind).toBe('literal')
    expect(document.tokens.find(token => token.value === '𠀀')?.kind).toBe('unavailable')
    expect(document.targets.map(index => document.tokens[index].value)).toEqual(['某', '某'])
  })

  it('marks missing Han and pronunciation-only Han unavailable and never generates a target for them', () => {
    const document = analyze('木𠀀某!')
    expect(document.counts).toEqual({ characters: 4, han: 3, trainable: 1, unavailable: 2, literals: 1 })
    expect(document.tokens[0].lookup?.readings).toEqual(['mù'])
    expect(document.tokens[1].lookup?.status).toBe('missing')
    expect(document.targets).toEqual([2])
  })

  it('keeps repeated occurrences independently addressable while caching dictionary lookup', () => {
    const find = vi.fn(lookup)
    const result = analyzeText('某某木木某ABC', find)
    expect(find.mock.calls).toEqual([['某'], ['木']])
    expect(result.status === 'valid' && result.document.targets).toEqual([0, 1, 4])
  })

  it('accepts the exact Unicode-codepoint cap and rejects overlong input without lookup or silent truncation', () => {
    const input = '🦩'.repeat(TEXT_HARD_CAP)
    expect(analyzeText(input, lookup).status).toBe('valid')
    const find = vi.fn(lookup)
    expect(analyzeText(input + '某', find)).toEqual({ status: 'too-long', characters: TEXT_HARD_CAP + 1, limit: TEXT_HARD_CAP })
    expect(find).not.toHaveBeenCalled()
  })

  it('treats 2000 Han as a recommendation rather than a hard limit', () => {
    expect(analyze('某'.repeat(2000)).exceedsRecommendation).toBe(false)
    const document = analyze('某'.repeat(2001))
    expect(document.exceedsRecommendation).toBe(true)
    expect(document.targets.length).toBe(2001)
  })

  it('represents empty, literal-only and all-unavailable text without fabricated targets', () => {
    for (const input of ['', '\nABC 42🦩\t', '木𠀀']) {
      const document = analyze(input)
      expect(document.targets).toEqual([])
      expect(document.pages).toEqual([{ startToken: 0, endToken: Array.from(input).length, targetStart: 0, targetEnd: 0 }])
      expect(document.tokens.map(token => token.value).join('')).toBe(input)
      expect(textPageIndex(document, 0)).toBe(-1)
    }
  })
})

describe('custom text pagination and navigation', () => {
  it('limits pages to 400 target occurrences and preserves every source token exactly once', () => {
    const input = 'begin\n' + '某，木🦩 '.repeat(801) + '\nend!'
    const document = analyze(input)
    expect(document.pages.map(page => page.targetEnd - page.targetStart)).toEqual([400, 400, 1])
    const reconstructed = document.pages.map(page => document.tokens.slice(page.startToken, page.endToken).map(token => token.value).join('')).join('')
    expect(reconstructed).toBe(input)
    for (let index = 0; index < document.pages.length - 1; index++) expect(document.pages[index].endToken).toBe(document.pages[index + 1].startToken)
    expect(document.pages[0].startToken).toBe(0)
    expect(document.pages.at(-1)?.endToken).toBe(document.tokens.length)
  })

  it('creates no extra blank page at an exact multiple and navigates by target rather than raw character offset', () => {
    const document = analyze('某木，'.repeat(TEXT_PAGE_TARGETS * 2))
    expect(document.pages.length).toBe(2)
    expect(textPageIndex(document, 399)).toBe(0)
    expect(textPageIndex(document, 400)).toBe(1)
    expect(textPageIndex(document, 799)).toBe(1)
    expect(textTargetIndex(document, 1200)).toBe(400)
    expect(textTargetIndex(document, 1201)).toBeNull()
    for (const index of [-1, 800, NaN, 1.5]) expect(textPageIndex(document, index)).toBe(-1)
  })
})

describe('explicit source pronunciation choices', () => {
  it('automatically resolves only a single unambiguous source option', () => {
    expect(needsTextChoice(tokenFor(known))).toBe(false)
    expect(getTextEntry(tokenFor(known))).toBe(entry)
    expect(getTextEntry(tokenFor(readingOnly))).toBeNull()
    expect(getTextEntry({ index: 0, value: 'A', kind: 'literal' })).toBeNull()
  })

  it('requires an explicit per-occurrence choice for different source readings', () => {
    const alternative = { ...entry, pronunciation: { ...entry.pronunciation, pinyin: 'mǒu' } }
    const polyphonic = { ...known, readings: ['mou', 'mǒu'], entries: [entry, alternative] }
    const token = tokenFor(polyphonic)
    const options = readingOptions(polyphonic)
    expect(needsTextChoice(token)).toBe(true)
    expect(getTextEntry(token)).toBeNull()
    expect(getTextEntry(token, options[1].key)).toBe(alternative)
    expect(getTextEntry(tokenFor(polyphonic))).toBeNull()
    expect(options.map(option => option.disclosesCode)).toEqual([false, false])
  })

  it('keeps an unsupported reading visible even when the character has a valid code for another reading', () => {
    const polyphonic = { ...known, readings: ['mou', 'mòu'] }
    const token = tokenFor(polyphonic)
    const options = readingOptions(polyphonic)
    expect(options.map(option => [option.pinyin, option.entry !== null])).toEqual([['mou', true], ['mòu', false]])
    expect(needsTextChoice(token)).toBe(true)
    expect(getTextEntry(token)).toBeNull()
    expect(getTextEntry(token, options[1].key)).toBeNull()
    expect(getTextEntry(token, 'invented-choice')).toBeNull()
  })

  it('does not collapse tonal alternatives or ü and u when comparing readings', () => {
    const accented = { ...entry, pronunciation: { ...entry.pronunciation, pinyin: 'nǚ' } }
    const value = { ...known, entries: [accented], readings: ['nǚ', 'nù', 'nǜ'] }
    expect(readingOptions(value).map(option => option.pinyin)).toEqual(['nǚ', 'nù', 'nǜ'])
    const decomposed = { ...known, entries: [{ ...entry, pronunciation: { ...entry.pronunciation, pinyin: 'mǒu' } }], readings: ['mo\u030cu'] }
    expect(readingOptions(decomposed)).toHaveLength(1)
  })

  it('deduplicates source-equivalent options and flags same-reading code alternatives for answer disclosure', () => {
    const anotherCode = { ...entry, fullCode: 'MZXX' }
    const value = { ...known, entries: [entry, entry, anotherCode], readings: ['mou', 'mou'] }
    const options = readingOptions(value)
    expect(options).toHaveLength(2)
    expect(options.map(option => option.disclosesCode)).toEqual([true, true])
    expect(new Set(options.map(option => option.key)).size).toBe(2)
    expect(getTextEntry(tokenFor(value))).toBeNull()
    expect(readingOptions({ ...known, entries: [entry], readings: ['mou', 'mòu', 'mòu'] })).toHaveLength(2)
  })
})
