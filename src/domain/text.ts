import type { CharacterLookup } from './dictionary'
import type { CharacterEntry } from './types'
import type { AuxiliaryTarget } from './auxiliary'
import { isHanCharacter } from './han'

export const TEXT_HARD_CAP = 20_000
export const TEXT_RECOMMENDED_HAN = 2_000
export const TEXT_PAGE_TARGETS = 400

export interface TextToken {
  /** Unicode codepoint index, independent of UTF-16 string offsets. */
  index: number
  value: string
  kind: 'trainable' | 'unavailable' | 'literal'
  lookup?: CharacterLookup
}

/** Every range is end-exclusive; concatenating pages reconstructs the input. */
export interface TextPage {
  startToken: number
  endToken: number
  targetStart: number
  targetEnd: number
}

export interface TextDocument {
  tokens: readonly TextToken[]
  /** Token indices of source-backed trainable occurrences, including repetitions. */
  targets: readonly number[]
  pages: readonly TextPage[]
  counts: {
    characters: number
    han: number
    trainable: number
    unavailable: number
    literals: number
  }
  exceedsRecommendation: boolean
}

export type TextAnalysis =
  | { status: 'too-long'; characters: number; limit: number }
  | { status: 'valid'; document: TextDocument }

export interface TextReadingOption {
  key: string
  pinyin: string
  entry: CharacterEntry | null
  auxiliary?: AuxiliaryTarget
  /** Choosing between codes for one reading requires showing the source codes. */
  disclosesCode: boolean
}

function normalizedReading(pinyin: string): string {
  return pinyin.trim().toLowerCase().normalize('NFC')
}

/** Options come only from the supplied lookup; this never infers context or codes. */
export function readingOptions(lookup: CharacterLookup): readonly TextReadingOption[] {
  // Four-code reading choices remain unchanged. A fallback has its own scheme,
  // and its component sounds must never be presented as this character's reading.
  const fallback = !lookup.entries.length ? lookup.auxiliary?.find(item => item.kind === 'user-code' || item.confirmed) : undefined
  if (fallback) return [{ key: `aux:${fallback.kind}:${fallback.sourceId}:${fallback.code}`, pinyin: fallback.kind === 'component-spelling' ? '部件拼字' : '用户库编码', entry: null, auxiliary: fallback, disclosesCode: false }]
  const options: TextReadingOption[] = []
  const seen = new Set<string>()
  const coveredReadings = new Set<string>()
  for (const entry of lookup.entries) {
    const reading = normalizedReading(entry.pronunciation.pinyin)
    const key = `entry:${reading}:${entry.fullCode}`
    coveredReadings.add(reading)
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ key, pinyin: entry.pronunciation.pinyin, entry, disclosesCode: false })
  }
  for (const pinyin of lookup.readings) {
    const reading = normalizedReading(pinyin)
    if (coveredReadings.has(reading)) continue
    const key = `reading:${reading}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ key, pinyin, entry: null, disclosesCode: false })
  }
  return options.map(option => ({
    ...option,
    disclosesCode: option.entry !== null && options.some(other =>
      other.key !== option.key && other.entry !== null && normalizedReading(other.pinyin) === normalizedReading(option.pinyin)),
  }))
}

export function needsTextChoice(token: TextToken): boolean {
  return token.kind === 'trainable' && token.lookup !== undefined && readingOptions(token.lookup).length > 1
}

/** Explicitly supplied invalid or reading-only choices never fall back to another code. */
export function getTextEntry(token: TextToken, choiceKey?: string): CharacterEntry | null {
  if (token.kind !== 'trainable' || !token.lookup) return null
  const options = readingOptions(token.lookup)
  if (choiceKey !== undefined) return options.find(option => option.key === choiceKey)?.entry ?? null
  return options.length === 1 ? options[0].entry : null
}

export function auxiliaryOptionKey(target: AuxiliaryTarget): string { return `aux:${target.kind}:${target.sourceId}:${target.code}` }

export function getTextAuxiliary(token: TextToken, choiceKey?: string): AuxiliaryTarget | null {
  if (!token?.lookup) return null
  if (choiceKey?.startsWith('aux:')) return token.lookup.auxiliary?.find(target => auxiliaryOptionKey(target) === choiceKey) ?? null
  const options = readingOptions(token.lookup)
  return options.length === 1 ? options[0].auxiliary ?? null : null
}

export function analyzeText(input: string, lookup: (char: string) => CharacterLookup): TextAnalysis {
  const characters = Array.from(input)
  if (characters.length > TEXT_HARD_CAP) return { status: 'too-long', characters: characters.length, limit: TEXT_HARD_CAP }

  const cached = new Map<string, CharacterLookup>()
  const targets: number[] = []
  let han = 0
  let unavailable = 0
  const tokens: TextToken[] = characters.map((value, index) => {
    if (!isHanCharacter(value)) return { index, value, kind: 'literal' }
    han++
    let result = cached.get(value)
    if (!result) {
      result = lookup(value)
      cached.set(value, result)
    }
    if (result.entries.length || readingOptions(result).some(option => option.auxiliary)) {
      targets.push(index)
      return { index, value, kind: 'trainable', lookup: result }
    }
    unavailable++
    return { index, value, kind: 'unavailable', lookup: result }
  })

  const pages: TextPage[] = []
  if (!targets.length) pages.push({ startToken: 0, endToken: tokens.length, targetStart: 0, targetEnd: 0 })
  for (let targetStart = 0; targetStart < targets.length; targetStart += TEXT_PAGE_TARGETS) {
    const targetEnd = Math.min(targetStart + TEXT_PAGE_TARGETS, targets.length)
    pages.push({
      startToken: targetStart === 0 ? 0 : targets[targetStart],
      endToken: targetEnd === targets.length ? tokens.length : targets[targetEnd],
      targetStart,
      targetEnd,
    })
  }

  return {
    status: 'valid',
    document: {
      tokens,
      targets,
      pages,
      counts: { characters: characters.length, han, trainable: targets.length, unavailable, literals: characters.length - han },
      exceedsRecommendation: han > TEXT_RECOMMENDED_HAN,
    },
  }
}

export function textPageIndex(document: TextDocument, targetIndex: number): number {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= document.targets.length) return -1
  return Math.floor(targetIndex / TEXT_PAGE_TARGETS)
}

export function textTargetIndex(document: TextDocument, tokenIndex: number): number | null {
  const index = document.targets.indexOf(tokenIndex)
  return index < 0 ? null : index
}
