import type { G2PWMetadata } from './g2pw-types'

function isChinese(char: string): boolean {
  const point = char.codePointAt(0)!
  return point >= 0x4e00 && point <= 0x9fff || point >= 0x3400 && point <= 0x4dbf
    || point >= 0x20000 && point <= 0x2a6df || point >= 0x2a700 && point <= 0x2b73f
    || point >= 0x2b740 && point <= 0x2b81f || point >= 0x2b820 && point <= 0x2ceaf
    || point >= 0xf900 && point <= 0xfaff || point >= 0x2f800 && point <= 0x2fa1f
}

function isWhitespace(char: string): boolean { return /[ \t\r\n]/u.test(char) || /^\p{Zs}$/u.test(char) }
function isControl(char: string): boolean { return !/[\t\r\n]/u.test(char) && /^[\p{Cc}\p{Cf}]$/u.test(char) }
function isPunctuation(char: string): boolean {
  const point = char.codePointAt(0)!
  return point >= 33 && point <= 47 || point >= 58 && point <= 64 || point >= 91 && point <= 96
    || point >= 123 && point <= 126 || /^\p{P}$/u.test(char)
}

/** The tokenizer settings come from the pinned bert-base-chinese snapshot. */
export class G2PWTokenizer {
  private readonly vocabulary: ReadonlyMap<string, number>
  constructor(private readonly metadata: G2PWMetadata) {
    this.vocabulary = new Map(metadata.vocab.map((token, index) => [token, index]))
    if (this.vocabulary.size !== metadata.vocab.length || this.vocabulary.has('')) {
      throw new Error('注音词表包含空白项或重复项，无法保持模型词位。')
    }
    for (const token of ['[UNK]', '[CLS]', '[SEP]', '[PAD]']) {
      if (!this.vocabulary.has(token)) throw new Error('注音词表缺少必要的 BERT 标记。')
    }
  }

  id(token: string): number { return this.vocabulary.get(token) ?? this.vocabulary.get('[UNK]')! }

  tokenize(word: string): readonly string[] {
    const settings = this.metadata.tokenizer ?? { doLowerCase: false, stripAccents: false, tokenizeChineseChars: true, cleanText: true }
    let text = ''
    for (const char of word) {
      if (settings.cleanText && (char === '\0' || char === '\ufffd' || isControl(char))) continue
      if (isWhitespace(char)) text += ' '
      else if (settings.tokenizeChineseChars && isChinese(char)) text += ` ${char} `
      else text += char
    }
    const basics: string[] = []
    for (let token of text.normalize('NFC').trim().split(/\s+/u).filter(Boolean)) {
      if (settings.doLowerCase) token = token.toLowerCase()
      if (settings.stripAccents) token = token.normalize('NFD').replace(/\p{Mn}/gu, '')
      let piece = ''
      for (const char of token) {
        if (isPunctuation(char)) { if (piece) basics.push(piece); piece = ''; basics.push(char) }
        else piece += char
      }
      if (piece) basics.push(piece)
    }
    const tokens: string[] = []
    for (const basic of basics) {
      const chars = Array.from(basic)
      if (chars.length > 100) { tokens.push('[UNK]'); continue }
      const subwords: string[] = []
      let start = 0, invalid = false
      while (start < chars.length) {
        let end = chars.length, found: string | undefined
        while (start < end) {
          const candidate = `${start ? '##' : ''}${chars.slice(start, end).join('')}`
          if (this.vocabulary.has(candidate)) { found = candidate; break }
          end--
        }
        if (!found) { invalid = true; break }
        subwords.push(found); start = end
      }
      tokens.push(...(invalid ? ['[UNK]'] : subwords))
    }
    return tokens
  }
}

export interface G2PWPreparedInput {
  inputIds: readonly number[]
  phonemeMask: readonly number[]
  charId: number
  positionId: number
  tokens: readonly string[]
  windowText: string
}

/** Mirrors the upstream 32-codepoint window and tokenize_and_map pipeline. */
export function prepareG2PWInput(translated: readonly string[], queryIndex: number, metadata: G2PWMetadata, tokenizer: G2PWTokenizer): G2PWPreparedInput {
  const radius = metadata.config.windowSize === null ? null : Math.floor(metadata.config.windowSize / 2)
  const start = radius === null ? 0 : Math.max(0, queryIndex - radius)
  const end = radius === null ? translated.length : Math.min(translated.length, queryIndex + radius)
  const rawWindow = translated.slice(start, end)
  // Upstream lowercases before tokenization. Preserve a source-index mapping
  // when lowercasing expands a scalar (for example Turkish capital dotted I).
  const queryOffset = Array.from(rawWindow.slice(0, queryIndex - start).join('').toLowerCase()).length
  const chars = Array.from(rawWindow.join('').toLowerCase())
  const textToToken: (number | null)[] = []
  const tokens: string[] = []
  let cursor = 0
  while (cursor < chars.length) {
    if (chars[cursor] === ' ') { textToToken.push(null); cursor++; continue }
    const wordStart = cursor
    if (/^[a-zA-Z0-9]$/.test(chars[cursor])) {
      while (cursor < chars.length && /^[a-zA-Z0-9]$/.test(chars[cursor])) cursor++
    } else cursor++
    const word = chars.slice(wordStart, cursor).join('')
    const wordTokens = tokenizer.tokenize(word)
    if (!wordTokens.length || wordTokens.length === 1 && wordTokens[0] === '[UNK]') {
      for (let index = wordStart; index < cursor; index++) textToToken.push(tokens.length)
      tokens.push('[UNK]')
    } else {
      let offset = wordStart
      for (const token of wordTokens) {
        const length = Array.from(token.replace(/^##/, '')).length
        for (let index = 0; index < length; index++) textToToken[offset + index] = tokens.length
        offset += length
        tokens.push(token)
      }
      if (offset !== cursor) throw new Error('注音分词结果无法对齐原文字位。')
    }
  }
  let position = textToToken[queryOffset]
  if (position === null || position === undefined) throw new Error('注音目标没有对应的模型字位。')
  let selectedTokens: readonly string[] = tokens
  const maximum = metadata.config.maxLength - 2
  if (tokens.length > maximum) {
    const tokenStart = Math.max(0, Math.min(position - Math.floor(maximum / 2), tokens.length - maximum))
    selectedTokens = tokens.slice(tokenStart, tokenStart + maximum)
    position -= tokenStart
  }
  const queryChar = translated[queryIndex]
  const charId = metadata.chars.indexOf(queryChar)
  const phonemes = metadata.char2phonemes[queryChar]
  if (charId < 0 || !phonemes?.length) throw new Error('注音目标不在本模型的多音字表内。')
  const allowed = new Set(phonemes)
  const processed = ['[CLS]', ...selectedTokens, '[SEP]']
  return {
    inputIds: processed.map(token => tokenizer.id(token)),
    phonemeMask: metadata.labels.map((_, index) => !metadata.config.useMask || allowed.has(index) ? 1 : 0),
    charId, positionId: position + 1, tokens: processed, windowText: chars.join(''),
  }
}

export function g2pwPinyin(value: string | undefined, metadata: G2PWMetadata): string | null {
  if (!value) return null
  if (/^[a-zvü:]+[1-5]$/iu.test(value)) return value.toLowerCase()
  const tone = value.slice(-1)
  const base = metadata.bopomofoToPinyin[value.slice(0, -1)]
  return base && /^[1-5]$/.test(tone) ? `${base}${tone}` : null
}
