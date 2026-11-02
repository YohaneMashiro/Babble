import { plainPinyin } from './dictionary'
import { readingOptions, type TextDocument, type TextReadingOption } from './text'

/** Suggestions are scoped to one exact source, never a replacement dictionary. */
export interface ReadingAnnotation {
  text: string
  modelVersion: string
  items: readonly {
    index: number
    char: string
    pinyin: string | null
    probability?: number
    source: 'model' | 'dictionary' | 'unavailable'
  }[]
}

function toneKey(value: string): string {
  const normalized = value.trim().toLowerCase().normalize('NFD')
  const numbered = /([1-5])$/.exec(normalized)?.[1]
  const accents = ['\u0304', '\u0301', '\u030c', '\u0300']
  const accent = accents.findIndex(mark => normalized.includes(mark))
  return `${plainPinyin(value)}:${numbered ?? (accent >= 0 ? accent + 1 : 5)}`
}

function unambiguousCode(options: readonly TextReadingOption[], prediction?: string | null): TextReadingOption | undefined {
  if (!options.length || options.some(option => !option.entry)) return undefined
  if (new Set(options.map(option => option.entry!.fullCode)).size !== 1) return undefined
  return prediction ? options.find(option => toneKey(option.pinyin) === toneKey(prediction)) ?? options[0] : options[0]
}

/** Only existing choices may be selected; a model cannot supply a new code. */
export function automaticTextChoices(document: TextDocument, annotation?: ReadingAnnotation | null): Readonly<Record<number, string>> {
  const source = document.tokens.map(token => token.value).join('')
  const aligned = annotation?.text === source && annotation.items.length === document.tokens.length && annotation.items.every((item, index) => item.index === index && item.char === document.tokens[index].value)
  const choices: Record<number, string> = {}
  for (let targetIndex = 0; targetIndex < document.targets.length; targetIndex++) {
    const tokenIndex = document.targets[targetIndex], token = document.tokens[tokenIndex]
    if (!token.lookup) continue
    const options = readingOptions(token.lookup)
    if (options.length <= 1 || options.some(option => option.auxiliary)) continue
    const prediction = aligned ? annotation.items[tokenIndex].pinyin : null
    if (prediction) {
      const byBase = options.filter(option => plainPinyin(option.pinyin) === plainPinyin(prediction))
      const byTone = byBase.filter(option => toneKey(option.pinyin) === toneKey(prediction))
      const candidates = byTone.length ? byTone : byBase
      // A correctly predicted reading can still lack a sourced four-key code.
      // Keep it reading-only rather than silently selecting a different sound.
      if (candidates.length === 1 && !candidates[0].entry) { choices[targetIndex] = candidates[0].key; continue }
      const selected = unambiguousCode(candidates, prediction)
      if (selected) { choices[targetIndex] = selected.key; continue }
    }
    // The keyboard target is identical for every available reading; no tone
    // question is needed before practicing these same keys.
    const sameCode = unambiguousCode(options, prediction)
    if (sameCode) choices[targetIndex] = sameCode.key
  }
  return choices
}
