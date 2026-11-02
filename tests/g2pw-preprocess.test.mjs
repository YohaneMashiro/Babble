import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { G2PWTokenizer, g2pwPinyin, prepareG2PWInput } from '../src/lib/g2pw-preprocess'

const base = new URL('../public/models/g2pw/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'))
const metadata = JSON.parse(readFileSync(new URL(manifest.metadata.file, base), 'utf8'))
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/g2pw-tokenization.json', import.meta.url), 'utf8'))
const tokenizer = new G2PWTokenizer(metadata)

describe('g2pW preprocessing against pinned upstream Python/BERT results', () => {
  for (const [number, sample] of fixtures.samples.entries()) {
    it(`preserves source positions, token IDs and allowed readings for mixed-text fixture ${number + 1}`, () => {
      const translated = Array.from(sample.text, char => metadata.simplifiedToTraditional[char] ?? char)
      const input = prepareG2PWInput(translated, sample.index, metadata, tokenizer)
      expect(input.tokens).toEqual(sample.tokens)
      expect(input.inputIds).toEqual(sample.inputIds)
      expect(input.positionId).toBe(sample.positionId)
      expect(input.charId).toBe(sample.charId)
      expect(input.windowText).toBe(sample.windowText)
      expect(input.phonemeMask.flatMap((value, index) => value ? [index] : [])).toEqual([...new Set(sample.allowed)].sort((a, b) => a - b))
    })
  }
  for (const [number, sample] of fixtures.words.entries()) {
    it(`matches BertTokenizer basic normalization and WordPiece fixture ${number + 1}`, () => {
      expect(tokenizer.tokenize(sample.word)).toEqual(sample.tokens)
    })
  }
  it('leaves unavailable phonemes unavailable rather than manufacturing a reading', () => {
    expect(g2pwPinyin('not-a-reading', metadata)).toBeNull()
    expect(g2pwPinyin(undefined, metadata)).toBeNull()
    expect(g2pwPinyin('ㄏㄤ2', metadata)).toBe('hang2')
    expect(g2pwPinyin('ㄒㄧㄥ2', metadata)).toBe('xing2')
    expect(() => prepareG2PWInput(['🙂'], 0, metadata, tokenizer)).toThrow('多音字表')
  })
})
